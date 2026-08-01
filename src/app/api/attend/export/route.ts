import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { orgAdminAccess } from '@/attend/auth';
import { monthData } from '@/attend/data';
import { dayInOut } from '@/attend/abnormal';
import { isYm } from '@/attend/util';
import { currentRuleSet, holidayKinds } from '@/attend/rules-store';
import { computeMonthHybrid, type HybridResult } from '@/attend/sandbox';
import type { MonthDayInput } from '@/attend/salary';

// 薪資月報匯出（對等舊 XLSX 三工作表：月曆／計算過程／總結，合併為一份 CSV 三段）。
// 伺服端零依賴直出；UTF-8 BOM 讓 Excel 直接開啟不亂碼。已結算月份以快照為準（金額凍結）。
const DAY_TYPE_TEXT: Record<string, string> = {
  normal: '平日',
  rest_day: '休息日',
  regular_off: '例假日',
  holiday: '國定假日',
};

const esc = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (...cells: unknown[]) => cells.map(esc).join(',');

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('org') ?? '';
  const empId = req.nextUrl.searchParams.get('emp') ?? '';
  const month = req.nextUrl.searchParams.get('month') ?? '';
  if (!slug || !empId || !isYm(month)) return NextResponse.json({ error: '參數不足' }, { status: 400 });

  const access = await orgAdminAccess(slug);
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const db = getDb();

  const { data: emp } = await db
    .from('employees')
    .select('id, display_name, dept, monthly_salary')
    .eq('id', empId)
    .eq('org_id', access.org.id)
    .maybeSingle();
  if (!emp) return NextResponse.json({ error: '找不到員工' }, { status: 404 });

  // 快照優先（已結算＝凍結值）；否則即時計算
  const { data: snap } = await db
    .from('payroll_snapshots')
    .select('result, finalized_at')
    .eq('org_id', access.org.id)
    .eq('employee_id', empId)
    .eq('month', `${month}-01`)
    .maybeSingle();

  let result: HybridResult;
  if (snap) {
    result = snap.result as HybridResult;
  } else {
    const [{ days }, hk, ruleSet] = await Promise.all([
      monthData(access.org.id, empId, month),
      holidayKinds(access.org.id, month),
      currentRuleSet(access.org.id),
    ]);
    const inputs: MonthDayInput[] = days.map((d) => {
      const { inTime, outTime } = dayInOut(d);
      return { date: d.date, inTime, outTime, holidayKind: hk.get(d.date) };
    });
    result = await computeMonthHybrid(inputs, Number(emp.monthly_salary), ruleSet.rules, ruleSet.scriptEnabled ? ruleSet.script : null);
  }

  const lines: string[] = [];
  // ── 第一段：月曆（每日一列）──
  lines.push(row('日期', '日別', '上班', '下班', '淨工時(h)', '正常工時(h)', '加班工時(h)', '休息扣除(h)', '日加給(NTD)'));
  for (const d of result.days) {
    lines.push(row(d.date, DAY_TYPE_TEXT[d.dayType] ?? d.dayType, d.inTime, d.outTime, d.netHours, d.normalHours, d.overtimeHours, d.restHours, d.pay.toFixed(2)));
  }
  lines.push('');
  // ── 第二段：計算過程 ──
  lines.push(row('日期', '計算項目', '時數(h)', '金額(NTD)'));
  for (const d of result.days) {
    for (const l of d.breakdown) lines.push(row(d.date, l.label, l.hours, l.amount.toFixed(2)));
  }
  lines.push('');
  // ── 第三段：總結 ──
  lines.push(row('員工', emp.display_name));
  lines.push(row('部門', emp.dept ?? ''));
  lines.push(row('月份', month));
  lines.push(row('月薪(NTD)', result.base.toFixed(2)));
  lines.push(row('等效時薪(NTD/h)', result.hourlyRate.toFixed(2)));
  lines.push(row('總正常工時(h)', result.totals.normalHours));
  lines.push(row('總加班工時(h)', result.totals.overtimeHours));
  lines.push(row('總淨工時(h)', result.totals.netHours));
  lines.push(row('總休息時數(h)', result.totals.restHours));
  lines.push(row('總時數(h)', result.totals.grossHours));
  lines.push(row('加班/假日加給(NTD)', result.extra.toFixed(2)));
  lines.push(row('本月總薪資(NTD)', result.total.toFixed(2)));
  lines.push(row('結算狀態', snap ? `已結算（${snap.finalized_at}）` : '未結算（即時計算）'));
  if (result.scriptErrors?.length) {
    lines.push(row('⚠ 自訂腳本回退天數', result.scriptErrors.length));
  }

  const name = String(emp.display_name).replace(/[\\/:*?"<>|\s]/g, '_');
  return new NextResponse('﻿' + lines.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${name}-${month}.csv`)}`,
    },
  });
}
