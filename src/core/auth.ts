import { createHmac, timingSafeEqual } from 'node:crypto';

// 管理登入的 session 值（計劃 H 節第四批）。
// 舊版 cookie ＝ SHA-256(ADMIN_PASSWORD) 的固定值：外洩一次即長期有效、改密碼前無法撤銷。
// 改為 HMAC 簽章帶到期時間，比照 gs_liff 的作法，零新依賴。
const TTL = 30 * 86_400; // 秒

const secret = () => process.env.ADMIN_PASSWORD ?? '';
const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('hex');

export function adminSessionValue(): string {
  const exp = Math.floor(Date.now() / 1000) + TTL;
  return `${exp}.${sign(String(exp))}`;
}

export const ADMIN_TTL = TTL;

// middleware 與 LIFF session 端點共用。舊格式（純 SHA-256）一律不接受——改密碼即全面失效。
export function verifyAdminSession(raw: string | undefined): boolean {
  if (!raw || !secret()) return false;
  const i = raw.indexOf('.');
  if (i < 0) return false;
  const exp = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  const expect = sign(exp);
  if (sig.length !== expect.length) return false;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expect));
}

// 登入失敗節流：正式站在公開 HTTPS 上，沒有節流等於開放無限暴力嘗試。
// in-memory 即可（單容器；重啟清空的代價遠小於引入 Redis）。
const attempts = new Map<string, { n: number; until: number }>();
const MAX_FAILS = 8;
const LOCK_MS = 10 * 60_000;

export function loginBlocked(ip: string): boolean {
  const a = attempts.get(ip);
  return !!a && a.n >= MAX_FAILS && Date.now() < a.until;
}

export function recordLoginFail(ip: string): void {
  const a = attempts.get(ip) ?? { n: 0, until: 0 };
  a.n++;
  a.until = Date.now() + LOCK_MS;
  attempts.set(ip, a);
}

export function clearLoginFails(ip: string): void {
  attempts.delete(ip);
}
