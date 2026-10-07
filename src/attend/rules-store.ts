import { getDb } from '@/db';
import { DEFAULT_RULES } from './rules-default';
import type { Frac, SalaryRules, Tier } from './salary';

// 規則版本的讀寫收口。salary_rule_sets 為 append-only：改規則＝插新版本。
// org 還沒有任何版本時回「虛擬第 0 版」＝預設勞基法規則（id=null；
// finalize 需要 FK 時才把預設規則落地成第 1 版）。

export type RuleSet = {
  id: string | null;
  version: number;
  rules: SalaryRules;
  script: string | null;
  scriptEnabled: boolean;
};

export async function currentRuleSet(orgId: string): Promise<RuleSet> {
  const { data } = await getDb()
    .from('salary_rule_sets')
    .select('id, version, rules, script, script_enabled')
    .eq('org_id', orgId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { id: null, version: 0, rules: DEFAULT_RULES, script: null, scriptEnabled: false };
  const rules = parseRules(data.rules) ?? DEFAULT_RULES; // DB 內容壞掉時回退預設（不靜默：版本頁看得到原文）
  return { id: data.id, version: data.version, rules, script: data.script, scriptEnabled: !!data.script_enabled };
}

/** 該月每日的假日種類（YYYY-MM-DD → kind） */
export async function holidayKinds(orgId: string, month: string): Promise<Map<string, 'national' | 'workday_override'>> {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const { data } = await getDb()
    .from('holidays')
    .select('day, kind')
    .eq('org_id', orgId)
    .gte('day', `${month}-01`)
    .lte('day', `${month}-${String(last).padStart(2, '0')}`);
  return new Map((data ?? []).map((h) => [h.day, h.kind as 'national' | 'workday_override']));
}

// ── 規則 JSON 驗證（管理端表單輸入不可信）──

const isFrac = (f: unknown): f is Frac =>
  typeof f === 'object' && f !== null &&
  Number.isFinite((f as Frac).num) && (f as Frac).num >= 0 &&
  Number.isFinite((f as Frac).den) && (f as Frac).den > 0;

const isTier = (t: unknown): t is Tier =>
  typeof t === 'object' && t !== null &&
  ((t as Tier).upToHours === null || (Number.isFinite((t as Tier).upToHours) && ((t as Tier).upToHours as number) > 0)) &&
  isFrac((t as Tier).rate);

const isHm = (s: unknown) => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);

/** 解析並驗證 SalaryRules；不合法回 null。 */
export function parseRules(raw: unknown): SalaryRules | null {
  const r = (typeof raw === 'string' ? safeJson(raw) : raw) as SalaryRules | null;
  if (!r || typeof r !== 'object') return null;
  if (r.version !== 1) return null;
  if (!Number.isFinite(r.baseDivisor) || r.baseDivisor <= 0) return null;
  if (!Number.isFinite(r.normalDailyHours) || r.normalDailyHours <= 0 || r.normalDailyHours > 24) return null;
  if (!Array.isArray(r.breaks) || !r.breaks.every((b) => b && isHm(b.start) && isHm(b.end))) return null;
  if (![0, 1, 2, 3, 4, 5, 6].includes(r.weeklyRestDay) || ![0, 1, 2, 3, 4, 5, 6].includes(r.weeklyRegularOff)) return null;
  if (!r.weekday?.tiers?.length || !r.weekday.tiers.every(isTier)) return null;
  if (!r.restDay?.tiers?.length || !r.restDay.tiers.every(isTier)) return null;
  if (!r.regularOff || !Number.isFinite(r.regularOff.guaranteedHours) || !isFrac(r.regularOff.over8Rate)) return null;
  if (!r.holiday || !Number.isFinite(r.holiday.guaranteedHours) || !r.holiday.otTiers?.every(isTier)) return null;
  if ((r.workStart != null && !isHm(r.workStart)) || (r.workEnd != null && !isHm(r.workEnd))) return null;
  return r;
}

// ── 白話表單（規則頁「上班時間」「加班費」的「改」）：表單欄位 → 規則 JSON ──
// 只改送來的那張卡，其他欄位與腳本沿用目前版本；加班分段的段數不增減（要加段走 JSON）。
// 空白或不是數字就變成 NaN，交給 parseRules 擋下——驗證只有一份。

/** 三種加班分段（欄位名前綴 → 分段陣列）；規則頁用同一份產生表單 */
export const tierLists = (r: SalaryRules) =>
  [
    ['weekday', r.weekday.tiers],
    ['restDay', r.restDay.tiers],
    ['holiday', r.holiday.otTiers],
  ] as const;

/** 倍率顯示成小數（4/3 → 1.33） */
export const rateText = (f: Frac) => String(+(f.num / f.den).toFixed(2));

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** 表單倍率 → 分數。沒改（跟原值顯示的一樣）就沿用原分數，免得 4/3 被存成 133/100；可填 1.5 或 4/3 */
function toFrac(s: string, orig: Frac): Frac {
  if (s === rateText(orig)) return orig;
  const m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) return { num: +m[1], den: +m[2] };
  const n = Math.round((s ? Number(s) : NaN) * 100);
  const g = gcd(n, 100);
  return { num: n / g, den: 100 / g };
}

export function plainRules(cur: SalaryRules, form: FormData): SalaryRules {
  const r = structuredClone(cur); // cur 可能就是 DEFAULT_RULES，不能原地改
  const s = (k: string) => String(form.get(k) ?? '').trim();
  const n = (k: string) => (s(k) ? Number(s(k)) : NaN);
  if (form.get('section') === 'time') {
    for (const k of ['workStart', 'workEnd'] as const) {
      if (s(k)) r[k] = s(k);
      else delete r[k];
    }
    r.normalDailyHours = n('normalDailyHours');
    const ends = form.getAll('breakEnd').map(String);
    // 兩格都空＝刪掉這段；只填一格會被 parseRules 擋
    r.breaks = form
      .getAll('breakStart')
      .map((b, i) => ({ start: String(b), end: ends[i] ?? '' }))
      .filter((b) => b.start || b.end);
    r.weeklyRestDay = n('weeklyRestDay');
    r.weeklyRegularOff = n('weeklyRegularOff');
  } else {
    r.baseDivisor = n('baseDivisor');
    for (const [k, tiers] of tierLists(r))
      tiers.forEach((t, i) => {
        if (t.upToHours != null) t.upToHours = n(`${k}H${i}`);
        t.rate = toFrac(s(`${k}R${i}`), t.rate);
      });
    r.holiday.guaranteedHours = n('holidayHours');
    r.regularOff.guaranteedHours = n('regularOffHours');
    r.regularOff.over8Rate = toFrac(s('over8Rate'), r.regularOff.over8Rate);
  }
  return r;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
