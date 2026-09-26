import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { moduleAccess } from '@/org/orgs';
import { expenseQuery } from '@/expense/query';
import { rowToItem } from '@/expense/items';
import { toCsv } from '@/expense/csv';

// 報帳 CSV 匯出（X1／Snaptab 全功能移植）：欄位與員工 App 同一份（src/expense/csv.ts），後台多一欄「人」。
// 不用 xlsx 套件（使用者 2026-09-26 決定維持 CSV）。篩選條件與清單頁同一套（expenseQuery）。
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const access = await moduleAccess(sp.get('org') ?? '', 'expense');
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const f = {
    status: sp.get('status') ?? 'all',
    who: sp.get('who') ?? undefined,
    project: sp.get('project') ?? undefined,
    month: sp.get('month') ?? undefined,
  };
  const { data, error } = await expenseQuery(getDb(), access.org.id, f);
  if (error) return NextResponse.json({ error: '報帳資料表還沒建立（migration 022）' }, { status: 500 });
  const csv = toCsv(((data ?? []) as Record<string, unknown>[]).map((r) => rowToItem(r)), { includePerson: true });
  const name = `報帳${f.project ? `-${f.project}` : ''}${f.month ? `-${f.month}` : ''}.csv`;
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
