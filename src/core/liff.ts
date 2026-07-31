import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getDb } from '@/db';
import { ADMIN_TTL, adminSessionValue } from './auth';

// LIFF 成員身份（計劃 B.3 v1 唯讀）：
// 身份＝LINE ID token 伺服器端驗證（LIFF ID 的前段就是 Login channel ID）；
// 成員資格＝先由 messages(group_id, sender_id) 推導，查不到再問 LINE 群成員 API（見 isGroupMember）。
// 硬約束：Login channel 必須與 Messaging API 同一個 LINE Provider，userId 才一致。

const COOKIE = 'gs_liff';
const TTL = 7 * 86_400; // 秒；成員資格每次請求都重新推導，cookie 只承載身份

// 示範模式（只給本機截圖／展示用）：LIFF 的身份與成員資格都來自 LINE，
// 而示範群組不是真的 LINE 群，所以在正常路徑下永遠進不去——成員版因此截不到圖。
// DEMO_MODE=1 時只對示範群組放行；正式站不設這個變數就完全沒有作用，
// 即使誤設，能看到的也只有 seed-demo.ts 寫死的假資料。
const DEMO_GROUP = 'DEMO-GROUP';
const demoMode = () => process.env.DEMO_MODE === '1';
export const isDemoGroup = (groupId: string) => demoMode() && groupId === DEMO_GROUP;

export const liffId = () => process.env.LIFF_ID ?? '';

function secret(): string {
  // 簽章金鑰借用既有機密（零新 env）；LINE_CHANNEL_SECRET 不存在時退回 ADMIN_PASSWORD
  const s = process.env.LINE_CHANNEL_SECRET ?? process.env.ADMIN_PASSWORD;
  if (!s) throw new Error('缺少 LINE_CHANNEL_SECRET / ADMIN_PASSWORD，無法簽 LIFF session');
  return s;
}

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('hex');

// 驗 LINE ID token（https://developers.line.biz/en/reference/line-login/#verify-id-token）
export async function verifyIdToken(idToken: string): Promise<{ userId: string; name?: string } | null> {
  const channelId = liffId().split('-')[0];
  if (!channelId) return null;
  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });
  if (!res.ok) {
    console.warn('LIFF ID token 驗證失敗', res.status, await res.text());
    return null;
  }
  const json = await res.json();
  return json.sub ? { userId: json.sub, name: json.name } : null;
}

// 管理員身份綁 LINE 帳號（使用者 2026-07-26 選定）：LIFF 開啟即取得管理權，免密碼。
// 代價（已知並接受）：LINE 帳號等同後台鑰匙——帳號被盜或手機被借走即後台外洩。
export const isAdminLineUser = (userId: string) => {
  const admin = process.env.ADMIN_LINE_USER_ID?.trim();
  return !!admin && userId === admin;
};

// 與 /api/login、middleware 同一套 session 格式（HMAC 簽章＋到期時間，見 core/auth.ts）
export function adminCookieValue(): string | null {
  return process.env.ADMIN_PASSWORD ? adminSessionValue() : null;
}

export function sessionCookieValue(userId: string): { name: string; value: string; maxAge: number } {
  const exp = Math.floor(Date.now() / 1000) + TTL;
  const payload = `${userId}.${exp}`;
  return { name: COOKIE, value: `${payload}.${sign(payload)}`, maxAge: TTL };
}

// 目前請求的 LIFF 使用者（cookie 簽章有效且未過期）；無效回 null
export async function liffUser(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  // 示範模式沒有 LINE session 也給個假身份；能看到什麼仍由 isGroupMember 決定
  if (!raw) return demoMode() ? 'DEMO-USER' : null;
  const i = raw.lastIndexOf('.');
  if (i < 0) return null;
  const payload = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const expect = sign(payload);
  if (sig.length !== expect.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  const [userId, expStr] = [payload.slice(0, payload.lastIndexOf('.')), payload.slice(payload.lastIndexOf('.') + 1)];
  if (!userId || Number(expStr) < Date.now() / 1000) return null;
  return userId;
}

// 成員資格判定（計劃 B.3，v4 定案：LINE API 為權威）：
// 1) LINE 群成員 API——「現在是不是成員」的唯一權威。200＝在群內、404＝不在。
//    退群/被踢的人立刻失去讀寫權；bot 已離開的群組也自然關閉入口。
// 2) messages 推導——僅在 API 呼叫失敗（網路/服務異常）時的備援，避免 LINE 掛掉就全員鎖死。
//    注意順序不可對調：先查 messages 會讓「曾發過言」等於永久通行證（v4 修掉的安全缺陷）。
// 純匯入的自訂 group_id 一律 404＝非 LINE 群組，沒有成員，正確。
// 快取 10 分鐘：/g 要逐群判定，避免每次重整都打 N 次 API。
const memberCache = new Map<string, { ok: boolean; name?: string; at: number }>();
const MEMBER_TTL = 10 * 60_000;

export async function isGroupMember(groupId: string, userId: string): Promise<boolean> {
  if (isDemoGroup(groupId)) return true; // 只放行示範群組
  const key = `${groupId}|${userId}`;
  const hit = memberCache.get(key);
  if (hit && Date.now() - hit.at < MEMBER_TTL) return hit.ok;

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (token) {
    const res = await fetch(
      `https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/member/${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ).catch(() => null);
    // 2xx＝成員、4xx＝不是成員（權威答案，含 404）；5xx 或連不上＝LINE 故障，才走備援
    if (res && res.status < 500) {
      const ok = res.ok;
      // 同一個回應順手留下 displayName（給 memberName 用）——不另打一次 API
      const name = ok ? ((await res.json().catch(() => null))?.displayName as string | undefined) : undefined;
      memberCache.set(key, { ok, name, at: Date.now() });
      return ok;
    }
    console.warn('LINE 群成員 API 不可用，改用 messages 推導備援', groupId, res?.status ?? 'no-response');
  }

  const { data } = await getDb()
    .from('messages')
    .select('id')
    .eq('group_id', groupId)
    .eq('sender_id', userId)
    .limit(1);
  const ok = !!data?.length;
  memberCache.set(key, { ok, at: Date.now() });
  return ok;
}

// 成員的 LINE 顯示名稱，用來把「可能是你的」待辦置頂（tasks.assignee 是自由文字暱稱，
// 與 userId 沒有對應表——最小版就是拿 displayName 去寬鬆比對，不建表）。
// 值來自 isGroupMember 那次呼叫順手快取的回應；備援路徑（LINE 故障）拿不到名字，回 null。
export async function memberName(groupId: string, userId: string): Promise<string | null> {
  if (isDemoGroup(groupId)) return '雅婷'; // seed-demo 裡她有兩筆待辦，「我的待辦」才有東西展示
  const key = `${groupId}|${userId}`;
  const hit = memberCache.get(key);
  if (!hit || Date.now() - hit.at >= MEMBER_TTL) await isGroupMember(groupId, userId);
  return memberCache.get(key)?.name ?? null;
}
