import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { myExpenseIdentity, parseExpenseForm } from '@/expense/mine';
import { orgCategories } from '@/expense/categories';
import { isMissingColumn, withV2Fallback } from '@/expense/store';

// 改／刪自己的報帳（Snaptab 編輯視窗）：只動「自己的、同公司的、還沒被公司核銷」那筆——
// 已核銷的鎖定，改了會讓會計對不上帳。另有 action=submit：勾好的幾筆一起「申請核銷」。回 JSON。
export async function POST(req: NextRequest) {
  const me = await myExpenseIdentity();
  if (!me) return NextResponse.json({ ok: false, error: '沒有權限' }, { status: 403 });
  const form = await req.formData();
  const id = String(form.get('id') ?? '');
  const db = getDb();
  const mine = (q: any) => q.eq('id', id).eq('org_id', me.org_id).eq('line_user_id', me.line_user_id).is('reimbursed_at', null);

  // 申請核銷（migration 030）：一次送多筆；只送自己的、還沒申請也還沒核銷的
  if (form.get('action') === 'submit') {
    const ids = form.getAll('id').map(String).filter(Boolean);
    if (!ids.length) return NextResponse.json({ ok: false, error: '沒有勾任何一筆' }, { status: 400 });
    // ponytail: 一次幾百筆以內；id 放在網址裡，上千筆再分批
    const { data, error } = await db
      .from('expenses')
      .update({ submitted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('org_id', me.org_id)
      .eq('line_user_id', me.line_user_id)
      .is('reimbursed_at', null)
      .is('submitted_at', null)
      .select('id');
    if (error) return NextResponse.json({ ok: false, error: isMissingColumn(error) ? '公司還沒開通申請核銷，請找管理者' : '送出失敗' });
    return NextResponse.json({ ok: true, n: data?.length ?? 0 });
  }
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
