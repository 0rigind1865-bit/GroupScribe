import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { orgAdminAccess } from '@/org/orgs';
import { expenseQuery, type ExpenseRow } from '@/expense/query';

// 報帳 CSV 匯出（X1）：欄位照 Snaptab lib/export.ts；UTF-8 BOM 讓 Excel 直接開不亂碼。
// 不用 xlsx 套件（R7：不加依賴）。篩選條件與清單頁同一套（expenseQuery）。
const esc = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (...cells: unknown[]) => cells.map(esc).join(',');

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const access = await orgAdminAccess(sp.get('org') ?? '');
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const f = {
    status: sp.get('status') ?? 'all',
    who: sp.get('who') ?? undefined,
    project: sp.get('project') ?? undefined,
    month: sp.get('month') ?? undefined,
  };
  const { data, error } = await expenseQuery(getDb(), access.org.id, f);
  if (error) return NextResponse.json({ error: '報帳資料表還沒建立（migration 022）' }, { status: 500 });
  const rows = (data ?? []) as unknown as ExpenseRow[];

  const lines = [row('日期', '分類', '店家', '用途', '金額', '付款方式', '發票號碼', '專案', '地點', '報帳狀態', '人')];
  for (const r of [...rows].reverse())
    lines.push(row(r.spent_on, r.category, r.vendor, r.note, r.amount, r.pay_method ?? '代墊', r.invoice_no, r.project, r.place_name ?? '', r.reimbursed_at ? '已報帳' : '未報帳', r.person_name ?? ''));
  // 代墊（請款）與公司卡（核銷）分開小計，會計流程不同（照 Snaptab）
  const sum = (p?: string) => rows.filter((r) => !p || (r.pay_method ?? '代墊') === p).reduce((n, r) => n + r.amount, 0);
  lines.push('', row('合計', '', '', '', sum()), row('代墊請款', '', '', '', sum('代墊')), row('公司卡核銷', '', '', '', sum('公司卡')), row('現金', '', '', '', sum('現金')));

  const name = `報帳${f.project ? `-${f.project}` : ''}${f.month ? `-${f.month}` : ''}.csv`;
  return new NextResponse('﻿' + lines.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
