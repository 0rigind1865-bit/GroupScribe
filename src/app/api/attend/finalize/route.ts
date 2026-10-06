import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { redirectTo } from '@/http';
import { moduleAccess } from '@/org/orgs';
import { liffUser } from '@/core/liff';
import { isYm, workDate } from '@/attend/util';
import { currentRuleSet, holidayKinds } from '@/attend/rules-store';
import { monthPay } from '@/attend/payroll';

// 月結（計畫定案）：把「輸入＋規則＋逐日結果」整包凍結進 payroll_snapshots。
// 歷史月份永遠讀快照不重算；解除結算＝刪快照（可逆性優先，留操作痕跡在 finalized_by/at）。
// emp=all（2026-10 設計畫布「薪資」）：一次結算全公司在職員工——那個月還有補卡沒審的人跳過，
// 審完才算得準；回到薪資總表帶 ?ok=finalized_all&n=結算人數&skip=跳過人數。
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const slug = String(form.get('org') ?? '');
  const empId = String(form.get('emp') ?? '');
  const month = String(form.get('month') ?? '');
  const action = String(form.get('action') ?? '');
  if (!slug || !empId || !isYm(month) || (action !== 'finalize' && action !== 'unfinalize')) {
    return NextResponse.json({ error: '參數不足' }, { status: 400 });
  }
  const all = empId === 'all';
  if (all && action !== 'finalize') return NextResponse.json({ error: '參數不足' }, { status: 400 });

  const access = await moduleAccess(slug, 'attend');
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const back = all ? `/o/${slug}/attend/report?month=${month}` : `/o/${slug}/attend/report?emp=${empId}&month=${month}`;
  const db = getDb();
  const orgId = access.org.id;

  if (action === 'unfinalize') {
    await db.from('payroll_snapshots').delete().eq('org_id', orgId).eq('employee_id', empId).eq('month', `${month}-01`);
    return redirectTo(`${back}&ok=unfinalized`);
  }

  let q = db.from('employees').select('id, monthly_salary').eq('org_id', orgId);
  q = all ? q.eq('status', 'active') : q.eq('id', empId);
  const { data: emps } = await q;
  if (!emps?.length) return all ? redirectTo(`${back}&ok=finalized_all&n=0`) : NextResponse.json({ error: '找不到員工' }, { status: 404 });

  let ruleSet = await currentRuleSet(orgId);
  // 快照需要 rule_set_id FK：org 還在「虛擬第 0 版」時先把預設規則落地成第 1 版
  if (!ruleSet.id) {
    const { data: created, error } = await db
      .from('salary_rule_sets')
      .insert({ org_id: orgId, version: 1, rules: ruleSet.rules, created_by: (await liffUser()) ?? null })
      .select('id, version')
      .single();
    if (error || !created) return redirectTo(`${back}&err=ERR_FINALIZE`);
    ruleSet = { ...ruleSet, id: created.id, version: created.version };
  }

  // 全公司結算：那個月有待審補卡的人先跳過（補卡核准會改變工時）
  let skip = new Set<string>();
  if (all) {
    const { data: pend } = await db.from('adjustment_requests').select('employee_id, requested_at').eq('org_id', orgId).eq('status', 'pending');
    skip = new Set((pend ?? []).filter((p) => workDate(new Date(p.requested_at)).startsWith(month)).map((p) => p.employee_id as string));
  }

  const hk = await holidayKinds(orgId, month);
  const who = (await liffUser()) ?? null;
  let n = 0;
  let skipped = 0;
  for (const emp of emps) {
    if (skip.has(emp.id)) {
      skipped++;
      continue;
    }
    const { inputs, result } = await monthPay(orgId, emp, month, ruleSet, { hk, fresh: true });
    const { error } = await db.from('payroll_snapshots').upsert(
      {
        org_id: orgId,
        employee_id: emp.id,
        month: `${month}-01`,
        rule_set_id: ruleSet.id,
        monthly_salary: emp.monthly_salary,
        input: inputs,
        result,
        finalized_by: who,
        finalized_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,employee_id,month' },
    );
    if (error) {
      console.error('finalize 失敗', emp.id, error);
      return redirectTo(`${back}&err=ERR_FINALIZE`);
    }
    n++;
  }
  return redirectTo(all ? `${back}&ok=finalized_all&n=${n}&skip=${skipped}` : `${back}&ok=finalized`);
}
