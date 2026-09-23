import { getDb, MEDIA_BUCKET } from '@/db';
import { getConnector, getVision } from './config';
import { indexText } from './indexer';
import { answer } from './query';
import { claimToken } from './liff';
import type { NormalizedEvent, NormalizedMessage } from './types';

// ── 未認領歸戶（商業計劃 A5）──
// 共用一個 bot：新群預設歸 'unclaimed' org（migration 016）。認領前不落地訊息、不抽取、不索引，
// 被 @ 只回認領連結。orgs 表沒有 'unclaimed'（migration 016 未跑）時整段停用，維持舊行為。
let unclaimedId: string | null | undefined; // undefined＝尚未查
async function unclaimedOrgId(): Promise<string | null> {
  if (unclaimedId !== undefined) return unclaimedId;
  const { data } = await getDb().from('orgs').select('id').eq('slug', 'unclaimed').maybeSingle();
  return (unclaimedId = data?.id ?? null);
}
// ponytail: in-memory 60 秒快取；認領端點會呼叫 forgetGroupOrg 立即失效（單容器前提）
const orgCache = new Map<string, { claimed: boolean; at: number }>();
const ORG_TTL = 60_000;
export async function isUnclaimed(groupId: string): Promise<boolean> {
  const uid = await unclaimedOrgId();
  if (!uid) return false;
  const hit = orgCache.get(groupId);
  if (hit && Date.now() - hit.at < ORG_TTL) return !hit.claimed;
  const { data } = await getDb().from('groups').select('org_id').eq('group_id', groupId).maybeSingle();
  const claimed = !!data && data.org_id !== uid; // 無列＝還沒 upsert 過＝未認領
  orgCache.set(groupId, { claimed, at: Date.now() });
  return !claimed;
}
export const forgetGroupOrg = (groupId: string) => orgCache.delete(groupId);

// 認領說明：reply 免費；連結需要公開網址（APP_BASE_URL）
export function claimNotice(groupId: string): string {
  const base = process.env.APP_BASE_URL?.replace(/\/$/, '');
  const link = base ? `${base}/claim/${encodeURIComponent(groupId)}?t=${claimToken(groupId)}` : null;
  return `我是 GroupScribe 群組工作助理 📋
這個群還沒有所屬的公司。在管理員認領之前，我不會記錄任何訊息。

請本群所屬公司的管理員點下面連結認領（需用 LINE 登入）：
${link ?? '（系統尚未設定公開網址，請聯絡平台管理者）'}

還沒有 GroupScribe 帳號？用 LINE 免費建立：${base ? `${base}/start` : '（請聯絡平台管理者）'}

7 天內沒有人認領，我會自動離開群組。`;
}

// 未認領超過 N 天自動退群（每日 cron 由 /api/digest 順手呼叫）：陌生群不燒費、不留資料
export async function leaveStaleUnclaimed(days = 7): Promise<number> {
  const uid = await unclaimedOrgId();
  const connector = getConnector();
  if (!uid || !connector.leaveGroup) return 0;
  const db = getDb();
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await db.from('groups').select('group_id').eq('org_id', uid).is('left_at', null).lt('updated_at', cutoff);
  let n = 0;
  for (const g of data ?? []) {
    if (!(await connector.leaveGroup(g.group_id))) continue;
    const now = new Date().toISOString();
    await db.from('groups').update({ left_at: now, updated_at: now }).eq('group_id', g.group_id);
    n++;
  }
  return n;
}

const NOTICE_VERSION = 'v1';
// LIFF 成員入口網址；未設定 LIFF_ID 時回 null，所有引用處自然省略該行
export const liffUrl = (): string | null =>
  process.env.LIFF_ID ? `https://liff.line.me/${process.env.LIFF_ID}` : null;

// 進群告知的內建預設；實際發送內容以 app_settings.join_notice_text 為準（可在 /settings 編輯）
export const DEFAULT_NOTICE = `大家好，我是群組工作助理 📋
我會在背景記錄本群組的訊息（文字、圖片、PDF），整理成可搜尋的工作紀錄。

【怎麼用】
・平常我不會說話，需要查資料時 @我 提問即可（例如「上次報價多少」）
・行程、待辦、公告我會自動整理好，隨時可以查看

【隱私】
・將我移出群組即停止收集；管理者可隨時刪除全部資料
・收回的訊息會同步刪除對應紀錄`;

// 告知文末附成員入口與訂閱引導。
// 這是唯一天然到達全體成員的觸點——入口不在這裡講，成員幾乎不會知道它存在（審查 P0）。
// 加好友的說明用「點頭像」而非搜尋 ID：在群組裡點 bot 頭像就有「加入好友」，不必知道帳號 ID。
const withLiffEntry = (text: string): string => {
  const url = liffUrl();
  if (!url) return text;
  return `${text}

【看整理結果】
👉 ${url}
（行程／待辦／公告都在裡面，也可以直接確認或修正 AI 整理錯的地方）

【想每天收到提醒的人】
・先點我的頭像 →「加入好友」（LINE 規定：沒加好友我不能私訊你）
・再從上面連結打開，把「每天早上私訊我這個群的摘要」打開
・只有你自己收得到，群組裡不會有任何訊息；沒事的日子也不會打擾`;
};

// 低資訊過濾（規劃書第 1 節推論 3）：只留原始紀錄，不進解析與向量化
// ponytail: 規則式全字匹配，誤放行只是多一點 embedding 費用，之後照實際數據調整
const LOW_INFO_RE =
  /^(好|好的|好喔|好哦|OK|ok|Ok|OKAY|okay|收到|了解|瞭解|嗯+|恩+|哦+|喔+|讚|辛苦了|謝謝|感謝|沒問題|\+1|👍|🙏|😂|❤️|\[貼圖\]|\[照片\]|\[影片\]|\[檔案\]|\[語音訊息\])[!！。.~～\s]*$/;

export function isLowInfo(text?: string | null): boolean {
  const t = (text ?? '').trim();
  if (!t) return true;
  return LOW_INFO_RE.test(t);
}

// 索引與問答脈絡用的來源標頭：[時間 人名] —— 答案附來源就靠它
export function label(at: Date, name?: string | null): string {
  const t = at.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `[${t} ${name ?? '未知成員'}] `;
}

// MVP 單一 channel：找不到就自動建一列（多 channel 地基已在 schema，見規劃書 6.3）
let cachedChannelId: string | null = null;
export async function getChannelId(): Promise<string> {
  if (cachedChannelId) return cachedChannelId;
  const db = getDb();
  const platform = process.env.CONNECTOR ?? 'line';
  const { data } = await db.from('channels').select('id').eq('platform', platform).limit(1).maybeSingle();
  if (data) return (cachedChannelId = data.id);
  const { data: created, error } = await db
    .from('channels')
    .insert({ platform, credentials_ref: 'env' })
    .select('id')
    .single();
  if (error) throw error;
  return (cachedChannelId = created.id);
}

export async function handleEvent(ev: NormalizedEvent, channelId: string): Promise<void> {
  if (ev.kind === 'join') return handleJoin(ev.groupId, ev.replyToken, channelId);
  if (ev.kind === 'leave') return handleLeave(ev.groupId);
  if (ev.kind === 'unsend') return handleUnsend(ev.groupId, ev.messageId);
  return handleMessage(ev.message, channelId);
}

// ── 群組身分（名稱/頭貼）lazy upsert ─────────────────────
// upsert 紀律：這裡只寫 name/picture_url/left_at/updated_at，絕不碰 category（人工設定），
// PostgREST upsert 只 SET payload 內欄位，兩邊不互踩。
const groupNamed = new Set<string>(); // 本程序已確認 groups.name 有值
const groupTriedAt = new Map<string, number>(); // ponytail: 拿不到名稱時每小時最多重試一次

export async function ensureGroupProfile(groupId: string): Promise<void> {
  if (groupNamed.has(groupId)) return;
  const now = Date.now();
  if (now - (groupTriedAt.get(groupId) ?? 0) < 3_600_000) return;
  groupTriedAt.set(groupId, now);

  const db = getDb();
  const { data } = await db.from('groups').select('name').eq('group_id', groupId).maybeSingle();
  if (data?.name) {
    groupNamed.add(groupId);
    return;
  }
  const summary = await getConnector().resolveGroupSummary?.(groupId).catch(() => undefined);
  const row: Record<string, unknown> = { group_id: groupId, updated_at: new Date().toISOString() };
  if (summary?.name) {
    row.name = summary.name;
    row.picture_url = summary.pictureUrl ?? null;
    groupNamed.add(groupId);
  }
  // 取不到也 upsert 空列標記「已嘗試」（回補據此跳過）
  const { error } = await db.from('groups').upsert(row);
  if (error) console.error('groups upsert 失敗', groupId, error);
}

// bot 被移出群組：標記 left_at（停止收集的證據；名稱回補跳過此群）
async function handleLeave(groupId: string) {
  const { error } = await getDb()
    .from('groups')
    .upsert({ group_id: groupId, left_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  if (error) console.error('標記群組離開失敗', groupId, error);
}

// 進群：發一次隱私告知（可在 /settings 編輯與開關）＋寫 consent log，之後保持沉默
async function handleJoin(groupId: string, replyToken: string | undefined, channelId: string) {
  const db = getDb();
  // 全域告知設定；表尚未建立或未設定時 fallback 為「開啟＋內建預設」，維持原行為
  const { data: cfg } = await db
    .from('app_settings')
    .select('join_notice_enabled, join_notice_text')
    .eq('id', 1)
    .maybeSingle();
  const enabled = cfg?.join_notice_enabled ?? true;
  const noticeText = (cfg?.join_notice_text ?? '').trim() || DEFAULT_NOTICE;

  // 不論告知開關都記錄群組（重新加入 → 清除離開標記、補名稱）。新列的 org_id 走欄位預設＝未認領
  await db.from('groups').upsert({ group_id: groupId, left_at: null, updated_at: new Date().toISOString() });
  groupNamed.delete(groupId);
  groupTriedAt.delete(groupId);
  forgetGroupOrg(groupId);
  await ensureGroupProfile(groupId);

  // 未認領：只回認領連結，不發告知、不記 consent（認領後由管理員決定何時開始）
  if (await isUnclaimed(groupId)) {
    if (replyToken) await getConnector().reply(replyToken, claimNotice(groupId));
    return;
  }

  // 只有開啟時才發告知＋記 consent（關閉＝沒告知，就不該留「已告知」記錄）
  if (enabled) {
    await db.from('consent_log').insert({ group_id: groupId, channel_id: channelId, notice_version: NOTICE_VERSION });
    if (replyToken) await getConnector().reply(replyToken, withLiffEntry(noticeText));
  }
}

// 收回訊息 → 對應刪除訊息、向量、媒體原檔（規劃書第 10 節）
async function handleUnsend(groupId: string, platformMessageId: string) {
  const db = getDb();
  const { data: msg } = await db
    .from('messages')
    .select('id, media_assets(id, storage_path)')
    .eq('group_id', groupId)
    .eq('message_id', platformMessageId)
    .maybeSingle();
  if (!msg) return;
  const assets: { id: string; storage_path: string }[] = (msg as any).media_assets ?? [];
  await db.from('embeddings').delete().in('source_id', [msg.id, ...assets.map((a) => a.id)]);
  if (assets.length) await db.storage.from(MEDIA_BUCKET).remove(assets.map((a) => a.storage_path));
  await db.from('messages').delete().eq('id', msg.id); // media_assets 由 FK cascade 帶走

  // 刪除邊界延伸到抽取產物：收回訊息的內容已固化在 events/tasks/notes 的 title/body 裡，
  // 只刪 messages 等於沒兌現告知裡的「收回的訊息會同步刪除對應紀錄」。
  // 刻意不自動刪項目——可能已被人工確認、含其他來源的知識；改為標回待確認由人裁決（浮進收件匣）。
  await unlinkFromItems(groupId, msg.id);
}

async function unlinkFromItems(groupId: string, messageId: string) {
  const db = getDb();
  const now = new Date().toISOString();
  for (const table of ['events', 'tasks', 'notes'] as const) {
    // 欄位分表選：events/tasks 有 note、notes 有 body（選錯欄位 PostgREST 直接 400，
    // 只解構 data 會讓整段變成靜默 no-op——本函式初版就是這樣壞掉的）
    const field = table === 'notes' ? 'body' : 'note';
    const { data: rows, error: selErr } = await db
      .from(table)
      .select(`id, ${field}, source_message_ids`)
      .eq('group_id', groupId)
      .contains('source_message_ids', [messageId]);
    if (selErr) {
      console.error('unsend 反查失敗', table, selErr);
      continue;
    }
    for (const r of rows ?? []) {
      const rest = ((r as any).source_message_ids ?? []).filter((x: string) => x !== messageId);
      const flag = '（來源訊息已被收回，請確認內容是否仍正確）';
      const cur = ((r as any)[field] ?? '') as string;
      const patch: Record<string, unknown> = {
        source_message_ids: rest,
        needs_confirmation: true,
        updated_at: now,
      };
      if (!cur.includes(flag)) patch[field] = cur ? `${cur}\n${flag}` : flag;
      const { error } = await db.from(table).update(patch).eq('id', r.id);
      if (error) console.error('unsend 連動標記失敗', table, r.id, error);
    }
  }
}

// 重試路徑沒有原始 Content-Type（只存了 kind），依 kind 還原。
// LINE 語音是 m4a 容器；Gemini 認 audio/mp4，不認 audio/x-m4a。
export const mimeOfKind = (kind: string) =>
  kind === 'pdf' ? 'application/pdf' : kind === 'audio' ? 'audio/mp4' : 'image/jpeg';

// 待解析媒體的自動重試（審查 P0：解析失敗只留一行 log，等人記得敲 curl＝知識默默流失）。
// 每次 webhook 順手清幾筆，遇 429（配額用完）立刻停手不燒錢。/api/process 降為手動保險閥。
const RETRY_PER_TICK = 3;
const MAX_ATTEMPTS = 3; // 同一個 asset 失敗這麼多次就不再自動重試，避免壞檔霸佔名額並無限燒錢
// in-memory 狀態（重啟即清空，等同「重啟後再給一次機會」）：
// attempts 記失敗次數避免餓死其他 pending；inFlight 防併發 webhook 重複解析同一筆。
const mediaAttempts = new Map<string, number>();
const mediaInFlight = new Set<string>();

export async function retryPendingMedia(groupId: string): Promise<number> {
  const db = getDb();
  // 多撈一些再於 JS 過濾：DB 層無法排除「已失敗多次」與「處理中」的 asset
  const { data: assets, error } = await db
    .from('media_assets')
    .select('id, kind, storage_path, messages!inner(group_id, sender_name, created_at)')
    .eq('messages.group_id', groupId)
    .eq('status', 'pending')
    .limit(RETRY_PER_TICK * 5);
  if (error) {
    console.error('查詢待解析媒體失敗', groupId, error);
    return 0;
  }
  const queue = (assets ?? [])
    .filter((a: any) => !mediaInFlight.has(a.id) && (mediaAttempts.get(a.id) ?? 0) < MAX_ATTEMPTS)
    .slice(0, RETRY_PER_TICK);

  let done = 0;
  for (const a of queue) {
    mediaInFlight.add(a.id);
    try {
      const { data: blob } = await db.storage.from(MEDIA_BUCKET).download(a.storage_path);
      if (!blob) {
        mediaAttempts.set(a.id, (mediaAttempts.get(a.id) ?? 0) + 1); // 原檔不見了也算一次，別無限重抓
        continue;
      }
      const msg = a.messages as unknown as { group_id: string; sender_name: string | null; created_at: string };
      await analyzeAsset(
        a.id,
        msg.group_id,
        Buffer.from(await blob.arrayBuffer()),
        mimeOfKind(a.kind),
        new Date(msg.created_at),
        msg.sender_name,
      );
      mediaAttempts.delete(a.id);
      done++;
    } catch (e) {
      const emsg = String((e as Error)?.message ?? e);
      const quota = /429|RESOURCE_EXHAUSTED|spending cap/i.test(emsg);
      // 配額用完不是這個檔的錯，不計入失敗次數，直接停手等下次
      if (!quota) mediaAttempts.set(a.id, (mediaAttempts.get(a.id) ?? 0) + 1);
      console.error('媒體解析重試失敗', a.id, quota ? '（配額用完，本輪停手）' : `（第 ${mediaAttempts.get(a.id)} 次）`, emsg);
      if (quota) break;
    } finally {
      mediaInFlight.delete(a.id);
    }
  }
  return done;
}

async function handleMessage(m: NormalizedMessage, channelId: string) {
  const db = getDb();
  const connector = getConnector();
  // 未認領的群：零落地（不存訊息、不抓媒體、不索引）；被 @ 才回認領連結
  if (await isUnclaimed(m.groupId)) {
    if (m.mentionsBot && m.replyToken) await connector.reply(m.replyToken, claimNotice(m.groupId));
    return;
  }
  await ensureGroupProfile(m.groupId).catch((e) => console.error('群組名稱更新失敗', e));
  const senderName = m.senderId ? await connector.resolveSenderName?.(m.groupId, m.senderId) : undefined;

  const lowInfo = m.type === 'text' ? isLowInfo(m.text) : m.type === 'other';
  const { data: row, error } = await db
    .from('messages')
    .insert({
      channel_id: channelId,
      group_id: m.groupId,
      sender_id: m.senderId,
      sender_name: senderName,
      type: m.type,
      text: m.text,
      message_id: m.messageId,
      is_low_info: lowInfo,
      source: m.source,
      created_at: m.timestamp.toISOString(),
    })
    .select('id')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') return; // webhook 重送：同一則訊息已處理過
    throw error;
  }

  // 被 @ 就先回答（replyToken 有時效，優先處理）
  if (m.mentionsBot && m.replyToken) {
    const q = (m.question ?? '').trim();
    const a = q
      ? await answer(m.groupId, q).catch((e) => {
          console.error('問答失敗', e);
          return '查詢時發生錯誤，請稍後再試。';
        })
      : '請在 @我 之後接著輸入問題。';
    // 尾端附成員入口：問答是唯一天然到達全體成員的觸點，順手把兩個入口接起來
    const url = liffUrl();
    await connector.reply(m.replyToken, url ? `${a}\n\n📋 完整行程／待辦 👉 ${url}` : a);
  }

  // 圖片 / PDF：抓原檔 → Storage → Vision 解析 → 索引
  if (m.mediaRef && (m.type === 'image' || m.type === 'pdf' || m.type === 'audio')) {
    await processMedia(row.id, m, senderName).catch((e) =>
      console.error('媒體處理失敗（asset 留 pending，可用 POST /api/process 重跑）', e),
    );
  }

  // 有資訊量的文字才進索引
  if (m.type === 'text' && !lowInfo && m.text) {
    await indexText(m.groupId, 'message', row.id, label(m.timestamp, senderName) + m.text, m.timestamp);
  }
}

async function processMedia(messageRowId: string, m: NormalizedMessage, senderName?: string) {
  const db = getDb();
  const { data, mime } = await getConnector().fetchMedia(m.mediaRef!);
  const path = `${m.groupId}/${m.messageId ?? messageRowId}`;
  const up = await db.storage.from(MEDIA_BUCKET).upload(path, data, { contentType: mime, upsert: true });
  if (up.error) throw up.error;
  const { data: asset, error } = await db
    .from('media_assets')
    .insert({ message_id: messageRowId, kind: m.type, storage_path: path })
    .select('id')
    .single();
  if (error) throw error;
  // 送 AI 用正規化的 mime：LINE 語音回 audio/x-m4a，Gemini 不認（Storage 仍存原始 Content-Type）
  await analyzeAsset(asset.id, m.groupId, data, m.type === 'audio' ? mimeOfKind('audio') : mime, m.timestamp, senderName);
}

// Vision 解析＋索引；/api/process 重跑 pending 時也走這裡
export async function analyzeAsset(
  assetId: string,
  groupId: string,
  data: Buffer,
  mime: string,
  at: Date,
  senderName?: string | null,
) {
  const r = await getVision().analyze(data, mime);
  // 先建索引再標 done：順序反過來的話，索引失敗（例如 embedding 撞配額）會留下
  // 「status=done 但查不到內容」的黑洞——不列入積壓數、也永遠不會被重試。
  const text = [r.summary, r.ocrText].filter(Boolean).join('\n');
  if (text) await indexText(groupId, 'media', assetId, `${label(at, senderName)}[${r.category}] ${text}`, at);
  await getDb()
    .from('media_assets')
    .update({
      ocr_text: r.ocrText,
      vision_summary: r.summary,
      category: r.category,
      status: 'done',
      processed_at: new Date().toISOString(),
    })
    .eq('id', assetId);
}
