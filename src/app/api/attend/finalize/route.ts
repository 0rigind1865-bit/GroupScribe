import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { redirectTo } from '@/http';
import { orgAdminAccess } from '@/attend/auth';
import { liffUser } from '@/core/liff';
import { monthData } from '@/attend/data';
import { dayInOut } from '@/attend/abnormal';
import { isYm } from '@/attend/util';
import { currentRuleSet, holidayKinds } from '@/attend/rules-store';
import { computeMonthHybrid } from '@/attend/sandbox';
import type { MonthDayInput } from '@/attend/salary';

// 月結（計畫定案）：把「輸入＋規則＋逐日結果」整包凍結進 payroll_snapshots。
// 歷史月份永遠讀快照不重算；解除結算＝刪快照（可逆性優先，留操作痕跡在 finalized_by/at）。
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const slug = String(form.get('org') ?? '');
  const empId = String(form.get('emp') ?? '');
  const month = String(form.get('month') ?? '');
  const action = String(form.get('action') ?? '');
  if (!slug || !empId || !isYm(month) || (action !== 'finalize' && action !== 'unfinalize')) {
    return NextResponse.json({ error: '參數不足' }, { status: 400 });
  }

  const access = await orgAdminAccess(slug);
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const back = `/o/${slug}/attend/calendar?emp=${empId}&month=${month}`;
  const db = getDb();

  if (action === 'unfinalize') {
    await db
      .from('payroll_snapshots')
      .delete()
      .eq('org_id', access.org.id)
      .eq('employee_id', empId)
      .eq('month', `${month}-01`);
    return redirectTo(`${back}&ok=unfinalized`);
  }

  const { data: emp } = await db
    .from('employees')
    .select('id, monthly_salary')
    .eq('id', empId)
    .eq('org_id', access.org.id)
    .maybeSingle();
  if (!emp) return NextResponse.json({ error: '找不到員工' }, { status: 404 });

  let ruleSet = await currentRuleSet(access.org.id);
  // 快照需要 rule_set_id FK：org 還在「虛擬第 0 版」時先把預設規則落地成第 1 版
  if (!ruleSet.id) {
    const { data: created, error } = await db
      .from('salary_rule_sets')
      .insert({ org_id: access.org.id, version: 1, rules: ruleSet.rules, created_by: (await liffUser()) ?? null })
      .select('id, version')
      .single();
    if (error || !created) return redirectTo(`${back}&err=ERR_FINALIZE`);
    ruleSet = { ...ruleSet, id: created.id, version: created.version };
  }

  const [{ days }, hk] = await Promise.all([monthData(access.org.id, empId, month), holidayKinds(access.org.id, month)]);
  const inputs: MonthDayInput[] = days.map((d) => {
    const { inTime, outTime } = dayInOut(d);
    return { date: d.date, inTime, outTime, holidayKind: hk.get(d.date) };
  });
  const result = await computeMonthHybrid(
    inputs,
    Number(emp.monthly_salary),
    ruleSet.rules,
    ruleSet.scriptEnabled ? ruleSet.script : null,
  );

  const { error } = await db.from('payroll_snapshots').upsert(
    {
      org_id: access.org.id,
      employee_id: empId,
      month: `${month}-01`,
      rule_set_id: ruleSet.id,
      monthly_salary: emp.monthly_salary,
      input: inputs,
      result,
      finalized_by: (await liffUser()) ?? null,
      finalized_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,employee_id,month' },
  );
  if (error) {
    console.error('finalize 失敗', error);
    return redirectTo(`${back}&err=ERR_FINALIZE`);
  }
  return redirectTo(`${back}&ok=finalized`);
}
