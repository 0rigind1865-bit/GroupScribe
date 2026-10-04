// 方案上限：群組數與每月 AI 呼叫數（商業計劃第 4 節）。null＝不限。
// 平台管理頁改方案（/api/platform/plan）與自助註冊（/api/org/create）都讀這裡，改一處就好。
export const PLAN_LIMITS = {
  free: { label: 'Free', groups: 1, aiCalls: 1500 },
  starter: { label: 'Starter', groups: 3, aiCalls: 6000 },
  team: { label: 'Team', groups: 10, aiCalls: 20000 },
  internal: { label: '內部', groups: 999, aiCalls: null },
} as const;

export type PlanId = keyof typeof PLAN_LIMITS;
export const isPlanId = (x: string): x is PlanId => x in PLAN_LIMITS;

/** 付費方案（推薦獎勵只在這些方案上折抵成到期日；internal 不算付費） */
export const isPaidPlan = (x: unknown): boolean => x === 'starter' || x === 'team';

// 推薦獎勵規則（src/org/referral.ts 的邏輯、推薦頁、平台頁、選單說明都讀這裡）。
// 放在這個純常數檔，前端元件（路由表）也能 import，不會把資料庫連線帶進瀏覽器。
export const REFERRAL = {
  rewardDays: 30, // 雙方各得
  maxRewards: 12, // 每家推薦人最多領 12 次（約一年），封住單一組織的成本
  cookie: 'gs_ref',
  cookieDays: 30, // 點過連結 30 天內建立組織都算
} as const;
