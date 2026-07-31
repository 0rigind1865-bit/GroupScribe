import crypto from 'node:crypto';
import type { MessagingConnector, NormalizedEvent } from '@/core/types';

// LINE Messaging API Connector（規劃書第 4 節）。REST 很單純，直接 fetch，不裝 SDK。
const API = 'https://api.line.me/v2/bot';
const DATA_API = 'https://api-data.line.me/v2/bot';
const token = () => process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';

// 群組成員顯示名稱快取。ponytail: in-memory、重啟即清，之後量大再落 DB
const nameCache = new Map<string, string>();
// 群組 summary（名稱/頭貼）快取，同上
const summaryCache = new Map<string, { name?: string; pictureUrl?: string }>();

export const lineConnector: MessagingConnector = {
  supportsBackfill: false, // LINE 拿不到加入前的歷史，冷啟動靠 txt 匯入（規劃書 4.2）

  verifyWebhook(rawBody, signature) {
    const secret = process.env.LINE_CHANNEL_SECRET;
    if (!secret) return false;
    const mac = crypto.createHmac('sha256', secret).update(rawBody).digest();
    const sig = Buffer.from(signature, 'base64');
    return sig.length === mac.length && crypto.timingSafeEqual(mac, sig);
  },

  parseEvents(body) {
    const out: NormalizedEvent[] = [];
    for (const ev of (body as any)?.events ?? []) {
      const groupId: string | undefined = ev.source?.groupId;
      if (!groupId) continue; // 只服務群組
      if (ev.type === 'join') {
        out.push({ kind: 'join', groupId, replyToken: ev.replyToken });
        continue;
      }
      if (ev.type === 'leave') {
        out.push({ kind: 'leave', groupId });
        continue;
      }
      if (ev.type === 'unsend') {
        if (ev.unsend?.messageId) out.push({ kind: 'unsend', groupId, messageId: ev.unsend.messageId });
        continue;
      }
      if (ev.type !== 'message') continue;

      const m = ev.message;
      const base = {
        groupId,
        senderId: ev.source.userId as string | undefined,
        messageId: m.id as string,
        replyToken: ev.replyToken as string | undefined,
        timestamp: new Date(ev.timestamp),
        source: 'webhook' as const,
        mentionsBot: false,
      };

      if (m.type === 'text') {
        const mentionees: { index: number; length: number; isSelf?: boolean }[] = m.mention?.mentionees ?? [];
        const mentionsBot = mentionees.some((x) => x.isSelf === true);
        let question: string | undefined;
        if (mentionsBot) {
          // 去掉所有 @提及字段，剩下的就是問題本文
          question = m.text as string;
          for (const x of [...mentionees].sort((a, b) => b.index - a.index)) {
            question = question.slice(0, x.index) + question.slice(x.index + x.length);
          }
          question = question.trim();
        }
        out.push({ kind: 'message', message: { ...base, mentionsBot, type: 'text', text: m.text, question } });
      } else if (m.type === 'image') {
        out.push({ kind: 'message', message: { ...base, type: 'image', mediaRef: m.id } });
      } else if (m.type === 'file') {
        const pdf = /\.pdf$/i.test(m.fileName ?? '');
        out.push({
          kind: 'message',
          message: { ...base, type: pdf ? 'pdf' : 'other', text: m.fileName, mediaRef: pdf ? m.id : undefined },
        });
      } else if (m.type === 'audio') {
        // 語音走既有媒體管線（Storage→轉寫→索引與抽取）。轉寫失敗時原檔仍在，
        // 至少「捕捉」成立——比整型排除好（D 表：語音訊息進捕捉）
        out.push({ kind: 'message', message: { ...base, type: 'audio', mediaRef: m.id } });
      } else if (m.type === 'sticker') {
        out.push({ kind: 'message', message: { ...base, type: 'other', text: '[貼圖]' } });
      }
      // 影片：維持排除（不是知識載體，且抓取與轉寫成本高）
    }
    return out;
  },

  async fetchMedia(ref) {
    const res = await fetch(`${DATA_API}/message/${ref}/content`, {
      headers: { authorization: `Bearer ${token()}` },
    });
    if (!res.ok) throw new Error(`LINE 抓取媒體失敗 ${res.status}`);
    return {
      data: Buffer.from(await res.arrayBuffer()),
      mime: res.headers.get('content-type') ?? 'application/octet-stream',
    };
  },

  async reply(replyToken, text) {
    const res = await fetch(`${API}/message/reply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token()}` },
      body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: text.slice(0, 4900) }] }), // LINE 上限 5000 字
    });
    if (!res.ok) console.error('LINE 回覆失敗', res.status, await res.text());
  },

  // 1:1 推送。LINE 硬約束：對方必須已加 bot 好友，只是群成員不行（計劃 B.8）。
  // 403＝封鎖或未加好友（永久性，呼叫端停用訂閱）；其餘非 2xx 視為暫時性失敗可重試。
  async push(userId, text) {
    const res = await fetch(`${API}/message/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token()}` },
      body: JSON.stringify({ to: userId, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
    });
    if (res.ok) return 'ok';
    const body = await res.text();
    console.error('LINE 推送失敗', res.status, body);
    return res.status === 403 ? 'blocked' : 'error';
  },

  async resolveGroupSummary(groupId) {
    const cached = summaryCache.get(groupId);
    if (cached) return cached;
    const res = await fetch(`${API}/group/${groupId}/summary`, {
      headers: { authorization: `Bearer ${token()}` },
    });
    if (!res.ok) return undefined; // 404 = bot 不在群（純匯入的自訂 group_id 等），呼叫端自行標記
    const { groupName, pictureUrl } = await res.json();
    const summary = { name: groupName as string | undefined, pictureUrl: pictureUrl as string | undefined };
    if (summary.name) summaryCache.set(groupId, summary);
    return summary;
  },

  async resolveSenderName(groupId, userId) {
    const key = `${groupId}:${userId}`;
    const cached = nameCache.get(key);
    if (cached) return cached;
    const res = await fetch(`${API}/group/${groupId}/member/${userId}`, {
      headers: { authorization: `Bearer ${token()}` },
    });
    if (!res.ok) return undefined; // 成員退群等情況拿不到，附來源時退回顯示 userId
    const { displayName } = await res.json();
    if (displayName) nameCache.set(key, displayName);
    return displayName;
  },
};
