import { AsyncLocalStorage } from 'node:async_hooks';
import { getDb } from '@/db';

// 每家 org 的 AI 額度（商業計劃 B5/B7）。
//
// 兩件事：
//   aiScope(groupId, fn)：六個 AI 入口進門先查「這個群所屬 org 本月呼叫數」，用完就丟 QuotaError；
//                         沒用完就把 orgId 放進 AsyncLocalStorage 執行 fn
//   bumpOrgUsage()：gemini.ts 的唯一收口 post() 在每次呼叫後讀 ALS 裡的 orgId 記帳
// 用 ALS 而不是把 orgId 一路傳進 provider：provider 介面（types.ts）不必為了記帳改簽名。
// migration 018 未跑（表或欄位不存在）時整段靜默停用，維持舊行為。

export class QuotaError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'QuotaError';
  }
}
export const isQuotaError = (e: unknown) => e instanceof QuotaError || /額度已用完/.test(String((e as Error)?.message ?? e));

const als = new AsyncLocalStorage<{ orgId: string }>();

/** 該月 1 號（Asia/Taipei），與 org_usage.month 對齊 */
export const monthKey = () => `${new Date().toLocaleDateString('sv', { timeZone: 'Asia/Taipei' }).slice(0, 7)}-01`;

// ponytail: in-memory 快取（單容器）；群→org 60 秒、額度 30 秒——超跑幾次呼叫可接受
const orgCache = new Map<string, { orgId: string | null; at: number }>();
const budgetCache = new Map<string, { used: number; cap: number | null; at: number }>();

export async function orgOfGroup(groupId: string): Promise<string | null> {
  const hit = orgCache.get(groupId);
  if (hit && Date.now() - hit.at < 60_000) return hit.orgId;
  const { data } = await getDb().from('groups').select('org_id').eq('group_id', groupId).maybeSingle();
  const orgId = (data?.org_id as string | undefined) ?? null;
  orgCache.set(groupId, { orgId, at: Date.now() });
  return orgId;
}

export async function orgAiBudget(orgId: string, force = false): Promise<{ used: number; cap: number | null }> {
  const hit = budgetCache.get(orgId);
  if (!force && hit && Date.now() - hit.at < 30_000) return hit;
  const db = getDb();
  const [{ data: st, error }, { data: u }] = await Promise.all([
    db.from('org_settings').select('monthly_ai_calls').eq('org_id', orgId).maybeSingle(),
    db.from('org_usage').select('calls').eq('org_id', orgId).eq('month', monthKey()).maybeSingle(),
  ]);
  // 欄位不存在（migration 018 未跑）→ cap null＝不限
  const cap = error ? null : Number.isFinite(Number(st?.monthly_ai_calls)) && st?.monthly_ai_calls != null ? Number(st.monthly_ai_calls) : null;
  const res = { used: Number(u?.calls ?? 0), cap, at: Date.now() };
  budgetCache.set(orgId, res);
  return res;
}

/** AI 入口的門：額度用完丟 QuotaError；否則在 org 脈絡裡執行（記帳靠這個脈絡） */
export async function aiScope<T>(groupId: string, fn: () => Promise<T>): Promise<T> {
  const orgId = await orgOfGroup(groupId).catch(() => null);
  if (!orgId) return fn();
  const { used, cap } = await orgAiBudget(orgId);
  if (cap !== null && used >= cap) throw new QuotaError(`本月 AI 額度已用完（${used} / ${cap} 次），請管理員到方案頁升級`);
  return als.run({ orgId }, fn);
}

/** gemini.ts 記帳用：目前脈絡的 org；不在任何 aiScope 內回 null（例如全站重建索引） */
export const currentOrg = () => als.getStore()?.orgId ?? null;

export function bumpOrgUsage(f: { calls?: number; input?: number; output?: number; embed?: number }) {
  const orgId = currentOrg();
  if (!orgId) return;
  const hit = budgetCache.get(orgId);
  if (hit) hit.used += f.calls ?? 0; // 讓連續呼叫在 30 秒快取內也逼近真值
  try {
    getDb()
      .rpc('bump_org_usage', {
        p_org: orgId,
        p_month: monthKey(),
        p_calls: f.calls ?? 0,
        p_in: f.input ?? 0,
        p_out: f.output ?? 0,
        p_embed: f.embed ?? 0,
      })
      .then(({ error }) => {
        if (error) console.warn('org 用量記帳失敗（migration 018 跑了嗎？）', error.message);
      });
  } catch {
    /* DB 未設定時不擋 */
  }
}
