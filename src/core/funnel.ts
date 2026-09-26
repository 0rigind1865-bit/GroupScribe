import { getDb } from '@/db';

// 漏斗（商業計劃 L1）：記成員從哪個觸點打開 LIFF。
// 觸點連結帶 ?src=，單群觸點再帶 ?g=<groupId> 直接進該群（見 ingest.ts 的 liffUrl）。

export const SOURCES = ['notice', 'answer', 'digest'] as const;
export type Source = (typeof SOURCES)[number];

type Sp = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// LIFF 帶 query 開啟時，第一次載入 query 會包在 liff.state 裡（liff.init 之後才會轉正）；
// 已有 session cookie 的人不會跑 liff.init，所以伺服端要自己拆 liff.state。
export function parseLiffEntry(sp: Sp): { g: string | null; src: Source | null } {
  const q = new URLSearchParams();
  const state = one(sp['liff.state']);
  if (state) {
    const i = state.indexOf('?');
    if (i >= 0) new URLSearchParams(state.slice(i + 1)).forEach((v, k) => q.set(k, v));
  }
  for (const k of ['g', 'src']) {
    const v = one(sp[k]);
    if (v) q.set(k, v);
  }
  const src = q.get('src');
  const g = q.get('g')?.trim();
  return { g: g || null, src: (SOURCES as readonly string[]).includes(src ?? '') ? (src as Source) : null };
}

type Row = { org_id?: string | null; group_id?: string | null; line_user_id: string; step: string; source: Source | null };
type Db = { from: (t: string) => { insert: (r: Row) => PromiseLike<{ error: { message: string } | null }> } };

// 記一筆；任何失敗（表還沒建、網路）都吞掉——漏斗是量測，不能擋住成員看內容
export async function logFunnel(row: Row, db: Db = getDb() as unknown as Db): Promise<boolean> {
  try {
    const { error } = await db.from('funnel_events').insert(row);
    if (error) console.warn('漏斗事件寫入失敗（migration 021 跑了嗎？）', error.message);
    return !error;
  } catch (e) {
    console.warn('漏斗事件寫入失敗', e);
    return false;
  }
}
