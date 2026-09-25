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
