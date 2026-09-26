import { NextRequest, NextResponse } from 'next/server';
import { orgAdminAccess } from '@/org/orgs';
import { saveCategoryItems } from '@/expense/categories';

// 後台的分類管理（名稱＋圖示，X2-4／Snaptab 全功能移植）：orgAdminAccess(body.org) → 只改自己公司的 org_settings
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const access = await orgAdminAccess(String(body?.org ?? ''));
  if (!access) return NextResponse.json({ ok: false, error: '沒有權限' }, { status: 403 });
  const res = await saveCategoryItems(access.org.id, body?.items);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
