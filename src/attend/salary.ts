// 薪資引擎第一層：結構化規則（純函式、無 IO、可單測）。
// 移植舊 Attendance-System js/admin.js 的勞基法計算（calculateEffectiveHours /
// calculateDailySalary / determineDayType），並修正其 dayType 缺陷：
// 舊制只在 isHoliday=true 時區分週六/週日，而後端從未填 isHoliday——週末實際上都被算成平日。
// 此引擎以 holidays 表＋週別規則為權威（national > workday_override > 週別）。
//
// 數值紀律：倍率一律 {num, den} 有理數（4/3 不進浮點常數）、以分鐘為單位計算，
// 只在「日」層級四捨五入到小數 2 位——與舊系統輸出對齊。

export type Frac = { num: number; den: number };
export type Tier = { upToHours: number | null; rate: Frac }; // upToHours = 累計時數門檻；null = 無上限

export type SalaryRules = {
  version: 1;
  baseDivisor: number; // 時薪 = 月薪 ÷ baseDivisor（舊制 240）
  normalDailyHours: number; // 平日法定正常工時（8）
  breaks: { start: string; end: string }[]; // 休息時段（HH:MM），重疊分鐘數自動扣除
  weeklyRestDay: number; // 休息日（週六 = 6）
  weeklyRegularOff: number; // 例假日（週日 = 0）
  weekday: { tiers: Tier[] }; // 平日加班倍率（作用於超過 normalDailyHours 的時數）
  restDay: { tiers: Tier[] }; // 休息日倍率（作用於全部時數）
  regularOff: { guaranteedHours: number; over8Rate: Frac; compDayCashOut: boolean };
  holiday: { guaranteedHours: number; otTiers: Tier[] };
};

export type DayType = 'normal' | 'rest_day' | 'regular_off' | 'holiday';

export type BreakdownLine = { label: string; hours: number; rate: Frac | null; amount: number };

export type DayPay = {
  pay: number; // 當日「額外」加給（平日前 8h 屬月薪，不在此數）
  normalHours: number;
  overtimeHours: number;
  restHours: number;
  netHours: number;
  breakdown: BreakdownLine[];
};

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** 日別類型判定。優先序：補班日（強制平日）> 國定假日（撞週日=例假、撞週六=休息日，對齊舊制）> 週別。 */
export function determineDayType(
  dateIso: string,
  holidayKind: 'national' | 'workday_override' | undefined,
  rules: SalaryRules,
): DayType {
  if (holidayKind === 'workday_override') return 'normal';
  const [y, m, d] = dateIso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (holidayKind === 'national') {
    if (dow === rules.weeklyRegularOff) return 'regular_off';
    if (dow === rules.weeklyRestDay) return 'rest_day';
    return 'holiday';
  }
  if (dow === rules.weeklyRegularOff) return 'regular_off';
  if (dow === rules.weeklyRestDay) return 'rest_day';
  return 'normal';
}

/** 淨工時：扣除與休息時段的重疊分鐘數。下班早於（含等於）上班 = 無效，回 0。 */
export function effectiveMinutes(
  inTime: string,
  outTime: string,
  breaks: SalaryRules['breaks'],
): { netMinutes: number; breakMinutes: number } {
  const start = toMin(inTime);
  const end = toMin(outTime);
  if (end <= start) return { netMinutes: 0, breakMinutes: 0 };
  let breakMinutes = 0;
  for (const b of breaks) {
    const overlap = Math.min(end, toMin(b.end)) - Math.max(start, toMin(b.start));
    if (overlap > 0) breakMinutes += overlap;
  }
  return { netMinutes: end - start - breakMinutes, breakMinutes };
}

// 分鐘 × 時薪 × 有理數倍率（單一入口，捨入只發生在呼叫端的日層級）
const seg = (minutes: number, hourlyRate: number, rate: Frac) =>
  (minutes * hourlyRate * rate.num) / (60 * rate.den);

const fr = (f: Frac) => (f.den === 1 ? `${f.num}` : `${f.num}/${f.den}`);
const hh = (min: number) => +(min / 60).toFixed(2);

/** 依累計門檻切分時數（分鐘），回每段 [分鐘, 倍率]。offset = 已在門檻外的前置時數（平日 OT 用 0 即可）。 */
function splitTiers(minutes: number, tiers: Tier[]): { minutes: number; rate: Frac }[] {
  const out: { minutes: number; rate: Frac }[] = [];
  let used = 0;
  for (const t of tiers) {
    if (minutes <= 0) break;
    const cap = t.upToHours == null ? Infinity : t.upToHours * 60 - used;
    if (cap <= 0) continue;
    const take = Math.min(minutes, cap);
    out.push({ minutes: take, rate: t.rate });
    minutes -= take;
    used += take;
  }
  return out;
}

/**
 * 單日加給計算。inTime/outTime 為 HH:MM；回傳的 pay 是「月薪之外」的加給
 * （平日前 normalDailyHours 小時屬月薪，不重複計）。
 */
export function computeDay(
  inTime: string,
  outTime: string,
  dayType: DayType,
  monthlySalary: number,
  rules: SalaryRules,
): DayPay {
  const hourlyRate = monthlySalary / rules.baseDivisor;
  const { netMinutes, breakMinutes } = effectiveMinutes(inTime, outTime, rules.breaks);
  const restHours = hh(breakMinutes);
  const empty: DayPay = { pay: 0, normalHours: 0, overtimeHours: 0, restHours, netHours: hh(netMinutes), breakdown: [] };
  if (netMinutes <= 0) return empty;

  const lines: BreakdownLine[] = [];
  let pay = 0;
  let normalMin = 0;
  let otMin = 0;

  if (dayType === 'normal') {
    normalMin = Math.min(netMinutes, rules.normalDailyHours * 60);
    otMin = netMinutes - normalMin;
    for (const s of splitTiers(otMin, rules.weekday.tiers)) {
      const amt = seg(s.minutes, hourlyRate, s.rate);
      pay += amt;
      lines.push({ label: `平日加班 ×${fr(s.rate)}`, hours: hh(s.minutes), rate: s.rate, amount: amt });
    }
  } else if (dayType === 'rest_day') {
    otMin = netMinutes;
    for (const s of splitTiers(netMinutes, rules.restDay.tiers)) {
      const amt = seg(s.minutes, hourlyRate, s.rate);
      pay += amt;
      lines.push({ label: `休息日 ×${fr(s.rate)}`, hours: hh(s.minutes), rate: s.rate, amount: amt });
    }
  } else if (dayType === 'regular_off') {
    // 例假日（對齊舊制）：不論長短給一日工資 + 超過 8h ×2 + 補休折現一日
    otMin = netMinutes;
    const g = rules.regularOff.guaranteedHours;
    const one: Frac = { num: 1, den: 1 };
    const dayPay = seg(g * 60, hourlyRate, one);
    pay += dayPay;
    lines.push({ label: `例假日出勤（至少一日工資 ${g}h）`, hours: g, rate: one, amount: dayPay });
    const over = Math.max(0, netMinutes - g * 60);
    if (over > 0) {
      const amt = seg(over, hourlyRate, rules.regularOff.over8Rate);
      pay += amt;
      lines.push({ label: `例假日 >${g}h ×${fr(rules.regularOff.over8Rate)}`, hours: hh(over), rate: rules.regularOff.over8Rate, amount: amt });
    }
    if (rules.regularOff.compDayCashOut) {
      pay += dayPay;
      lines.push({ label: `例假日補休一日折現（${g}h）`, hours: g, rate: one, amount: dayPay });
    }
  } else {
    // 國定假日：不論長短給一日工資；超過部分依 otTiers
    otMin = netMinutes;
    const g = rules.holiday.guaranteedHours;
    const one: Frac = { num: 1, den: 1 };
    const dayPay = seg(g * 60, hourlyRate, one);
    pay += dayPay;
    lines.push({ label: `國定假日出勤（至少一日工資 ${g}h）`, hours: g, rate: one, amount: dayPay });
    const over = Math.max(0, netMinutes - g * 60);
    for (const s of splitTiers(over, rules.holiday.otTiers)) {
      const amt = seg(s.minutes, hourlyRate, s.rate);
      pay += amt;
      lines.push({ label: `國定假日加班 ×${fr(s.rate)}`, hours: hh(s.minutes), rate: s.rate, amount: amt });
    }
  }

  return {
    pay: +pay.toFixed(2), // 捨入只在日層級
    normalHours: hh(normalMin),
    overtimeHours: hh(otMin),
    restHours,
    netHours: hh(netMinutes),
    breakdown: lines.map((l) => ({ ...l, amount: +l.amount.toFixed(2) })),
  };
}

export type MonthDayInput = {
  date: string; // YYYY-MM-DD
  inTime: string | null;
  outTime: string | null;
  holidayKind?: 'national' | 'workday_override';
};

export type MonthResult = {
  base: number; // 月薪
  extra: number; // Σ 每日加給
  total: number; // base + extra
  hourlyRate: number;
  totals: { normalHours: number; overtimeHours: number; restHours: number; netHours: number; grossHours: number };
  days: (DayPay & { date: string; dayType: DayType; inTime: string; outTime: string })[];
};

/** 整月彙總：只計「有成對上下班」的日子；月總薪資 = 月薪 + Σ加給（對齊舊制）。 */
export function computeMonth(days: MonthDayInput[], monthlySalary: number, rules: SalaryRules): MonthResult {
  const results: MonthResult['days'] = [];
  const totals = { normalHours: 0, overtimeHours: 0, restHours: 0, netHours: 0, grossHours: 0 };
  let extra = 0;
  for (const d of days) {
    if (!d.inTime || !d.outTime) continue;
    const dayType = determineDayType(d.date, d.holidayKind, rules);
    const r = computeDay(d.inTime, d.outTime, dayType, monthlySalary, rules);
    extra += r.pay;
    totals.normalHours += r.normalHours;
    totals.overtimeHours += r.overtimeHours;
    totals.restHours += r.restHours;
    totals.netHours += r.netHours;
    results.push({ ...r, date: d.date, dayType, inTime: d.inTime, outTime: d.outTime });
  }
  totals.grossHours = totals.netHours + totals.restHours;
  for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = +totals[k].toFixed(2);
  extra = +extra.toFixed(2);
  return {
    base: monthlySalary,
    extra,
    total: +(monthlySalary + extra).toFixed(2),
    hourlyRate: +(monthlySalary / rules.baseDivisor).toFixed(4),
    totals,
    days: results,
  };
}
