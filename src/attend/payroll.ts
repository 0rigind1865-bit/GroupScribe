import { getDb } from '@/db';
import { monthData } from './data';
import { dayInOut } from './abnormal';
import { holidayKinds, type RuleSet } from './rules-store';
import { computeMonthHybrid, type HybridResult } from './sandbox';
import type { MonthDayInput } from './salary';

// 一位員工一個月的薪資——報表頁、薪資總表、匯出、結算共用（原本三處各抄一份「打卡→成對→計算」）。
// 已結算＝讀快照（金額凍結）；fresh＝不看快照、用目前規則重算（結算時用）。
// hk 可由呼叫端先查好：算全公司時每個人共用同一份假日表，不必每人查一次。
export async function monthPay(
  orgId: string,
  emp: { id: string; monthly_salary: number | string | null },
  month: string, // YYYY-MM
  ruleSet: RuleSet,
  opts: { hk?: Map<string, 'national' | 'workday_override'>; fresh?: boolean } = {},
) {
  const [{ days }, hk, { data: snap }] = await Promise.all([
    monthData(orgId, emp.id, month),
    opts.hk ?? holidayKinds(orgId, month),
    opts.fresh
      ? Promise.resolve({ data: null })
      : getDb()
          .from('payroll_snapshots')
          .select('id, result, monthly_salary, finalized_at, rule_set_id')
          .eq('org_id', orgId)
          .eq('employee_id', emp.id)
          .eq('month', `${month}-01`)
          .maybeSingle(),
  ]);
  const inputs: MonthDayInput[] = days.map((d) => {
    const { inTime, outTime } = dayInOut(d);
    return { date: d.date, inTime, outTime, holidayKind: hk.get(d.date) };
  });
  const result: HybridResult = snap
    ? (snap.result as HybridResult)
    : await computeMonthHybrid(inputs, Number(emp.monthly_salary), ruleSet.rules, ruleSet.scriptEnabled ? ruleSet.script : null);
  return { days, inputs, hk, snap: snap as { finalized_at: string } | null, result };
}
