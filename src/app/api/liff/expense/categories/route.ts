import { NextRequest, NextResponse } from 'next/server';
import { myExpenseIdentity } from '@/expense/mine';
import { saveCategoryItems } from '@/expense/categories';

// 分類管理（Snaptab CategoryManager）：分類是全公司共用，只有管理者能改
export async function POST(req: NextRequest) {
  const me = await myExpenseIdentity();
  if (!me?.canManage) return NextResponse.json({ ok: false, error: '只有管理者能改分類' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const res = await saveCategoryItems(me.org_id, body?.items);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
