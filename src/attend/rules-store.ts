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
  return r;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
