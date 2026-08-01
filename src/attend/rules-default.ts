import type { SalaryRules } from './salary';

// 預設薪資規則：台灣勞基法（舊 Attendance-System js/admin.js 邏輯的忠實移植）。
// 各租戶以此為起點，在規則頁調整後存成新版本（salary_rule_sets append-only）。
export const DEFAULT_RULES: SalaryRules = {
  version: 1,
  baseDivisor: 240, // 時薪 = 月薪 ÷ 240（舊制）
  normalDailyHours: 8,
  breaks: [
    { start: '06:00', end: '06:30' }, // 早餐
    { start: '12:00', end: '13:00' }, // 午餐
    { start: '19:00', end: '19:30' }, // 晚餐
  ],
  weeklyRestDay: 6, // 週六 = 休息日
  weeklyRegularOff: 0, // 週日 = 例假日
  // 平日加班（勞基法 §24 I）：前 2h ×4/3、之後 ×5/3
  weekday: { tiers: [{ upToHours: 2, rate: { num: 4, den: 3 } }, { upToHours: null, rate: { num: 5, den: 3 } }] },
  // 休息日（§24 II）：前 2h ×4/3、3-8h ×5/3、>8h ×8/3
  restDay: {
    tiers: [
      { upToHours: 2, rate: { num: 4, den: 3 } },
      { upToHours: 8, rate: { num: 5, den: 3 } },
      { upToHours: null, rate: { num: 8, den: 3 } },
    ],
  },
  // 例假日（§39/§40）：出勤給一日工資 + >8h ×2 + 補休一日折現（舊制的處理）
  regularOff: { guaranteedHours: 8, over8Rate: { num: 2, den: 1 }, compDayCashOut: true },
  // 國定假日：出勤給一日工資；加班前 2h ×4/3、之後 ×5/3
  holiday: {
    guaranteedHours: 8,
    otTiers: [{ upToHours: 2, rate: { num: 4, den: 3 } }, { upToHours: null, rate: { num: 5, den: 3 } }],
  },
};
