import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { myExpenseIdentity, parseExpenseForm } from '@/expense/mine';
import { orgCategories } from '@/expense/categories';
import { withV2Fallback } from '@/expense/store';

// 改／刪自己的報帳（Snaptab 編輯視窗）：只動「自己的、同公司的、還沒被標已報帳」那筆——
// 已報帳的鎖定，改了會讓會計對不上帳。回 JSON。
export async function POST(req: NextRequest) {
  const me = await myExpenseIdentity();
  if (!me) return NextResponse.json({ ok: false, error: '沒有權限' }, { status: 403 });
  const form = await req.formData();
  const id = String(form.get('id') ?? '');
  const db = getDb();
  const mine = (q: any) => q.eq('id', id).eq('org_id', me.org_id).eq('line_user_id', me.line_user_id).is('reimbursed_at', null);

  if (form.get('action') === 'delete') {
    const { error } = await mine(db.from('expenses').delete());
    return NextResponse.json({ ok: !error });
  }
  const today = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Taipei' });
  const input = parseExpenseForm(form, await orgCategories(me.org_id), today);
  if (!input) return NextResponse.json({ ok: false, error: '金額需大於 0，且要選分類' }, { status: 400 });
  // 座標只在新增時抓；編輯不能把原本的洗成 null
  const { lat: _lat, lng: _lng, ...patch } = input;
  const extra = form.get('remove_photo') === '1' ? { photo_path: null, media_asset_id: null } : {};
  const { error } = await withV2Fallback({ ...patch, ...extra, updated_at: new Date().toISOString() }, (p) =>
    mine(db.from('expenses').update(p)),
  );
  return NextResponse.json({ ok: !error, error: error ? '更新失敗' : undefined });
}
