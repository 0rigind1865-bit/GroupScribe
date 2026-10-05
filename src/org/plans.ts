import { addDays } from '@/core/date';

// 方案上限與價格（商業計劃第 4 節）。null＝不限。
// 平台管理頁改方案（/api/platform/plan）、自助註冊（/api/org/create）、方案頁、首頁介紹都讀這裡，改一處就好。
// subscribers：每日提醒的名額（人）。同一個人訂同一家公司的幾個群都只算一人（src/org/digest-seats.ts）。
export const PLAN_LIMITS = {
  free: { label: 'Free', price: 0, groups: 1, aiCalls: 1500, subscribers: 3 },
  starter: { label: 'Starter', price: 690, groups: 3, aiCalls: 6000, subscribers: 10 },
  team: { label: 'Team', price: 2190, groups: 10, aiCalls: 20000, subscribers: 30 },
  internal: { label: '內部', price: 0, groups: 999, aiCalls: null, subscribers: null },
} as const;

export type PlanId = keyof typeof PLAN_LIMITS;
export const isPlanId = (x: string): x is PlanId => x in PLAN_LIMITS;

/** 對外販售的方案（方案頁、首頁介紹的順序） */
export const PUBLIC_PLANS = ['free', 'starter', 'team'] as const satisfies readonly PlanId[];

/** 付費方案：有到期日要管、會被暫停；推薦獎勵也只在這些方案上折抵成到期日（internal 不算付費） */
export const isPaidPlan = (x: unknown): boolean => x === 'starter' || x === 'team';

export const planPrice = (id: PlanId) => (PLAN_LIMITS[id].price ? `NT$${PLAN_LIMITS[id].price.toLocaleString('en-US')} / 月` : '免費');

/** 方案內容（一行一項）：頁面只負責排版，數字一律從 PLAN_LIMITS 來，不會再跟實際上限對不起來 */
export function planLines(id: PlanId): string[] {
  const p = PLAN_LIMITS[id];
  return [
    `${p.groups} 個群`,
    p.aiCalls === null ? 'AI 呼叫不限' : `每月 ${p.aiCalls.toLocaleString('en-US')} 次 AI 呼叫`,
    p.subscribers === null ? '每日提醒不限人數' : `每日提醒 ${p.subscribers} 人`,
    ...(id === 'team' ? ['優先支援'] : []),
  ];
}

// ── 付費到期 ──
// 服務條款第三節：「逾期未付款超過 14 天，我們可暫停服務」。paid_until 是最後一個已付費的日子（含當天）。
// 用算的、不用排程：到期與否每次讀取時依今天判斷，續約（改 paid_until）立刻恢復，不會有狀態沒同步的問題。
export const GRACE_DAYS = 14;

export type PaidStatus =
  | { state: 'none' } // 非付費方案、或付費但沒填到期日：不管
  | { state: 'active'; paidUntil: string }
  | { state: 'grace' | 'expired'; paidUntil: string; lastDay: string }; // lastDay＝寬限期最後一天

export function paidStatus(plan: unknown, paidUntil: unknown, today: string): PaidStatus {
  if (!isPaidPlan(plan) || typeof paidUntil !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(paidUntil)) return { state: 'none' };
  if (today <= paidUntil) return { state: 'active', paidUntil };
  const lastDay = addDays(paidUntil, GRACE_DAYS);
  return { state: today <= lastDay ? 'grace' : 'expired', paidUntil, lastDay };
}

// 推薦獎勵規則（src/org/referral.ts 的邏輯、推薦頁、平台頁、選單說明都讀這裡）。
// 放在這個純常數檔，前端元件（路由表）也能 import，不會把資料庫連線帶進瀏覽器。
export const REFERRAL = {
  rewardDays: 30, // 雙方各得
  maxRewards: 12, // 每家推薦人最多領 12 次（約一年），封住單一組織的成本
  cookie: 'gs_ref',
  cookieDays: 30, // 點過連結 30 天內建立組織都算
} as const;
