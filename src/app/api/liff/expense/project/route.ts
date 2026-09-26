import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { myExpenseIdentity } from '@/expense/mine';

// 案場／專案（Snaptab events）：新增（任何人）、改名（管理者；會連同全公司的紀錄一起改）
export async function POST(req: NextRequest) {
  const me = await myExpenseIdentity();
  if (!me) return NextResponse.json({ ok: false, error: '沒有權限' }, { status: 403 });
  const form = await req.formData();
  const name = String(form.get('name') ?? '').trim().slice(0, 60);
  if (!name) return NextResponse.json({ ok: false, error: '請輸入名稱' }, { status: 400 });
  const db = getDb();

  if (form.get('action') === 'rename') {
    if (!me.canManage) return NextResponse.json({ ok: false, error: '只有管理者能改案場名稱' }, { status: 403 });
    const from = String(form.get('from') ?? '').trim();
    if (!from || from === name) return NextResponse.json({ ok: false, error: '名稱沒有變' }, { status: 400 });
    const { error } = await db.from('expenses').update({ project: name }).eq('org_id', me.org_id).eq('project', from);
    if (error) return NextResponse.json({ ok: false, error: '更新失敗' }, { status: 500 });
    // 清單表：已有新名稱就刪舊的，否則改名（表還沒建就略過）
    const { data: dup } = await db.from('expense_projects').select('id').eq('org_id', me.org_id).eq('name', name).maybeSingle();
    if (dup) await db.from('expense_projects').delete().eq('org_id', me.org_id).eq('name', from);
    else await db.from('expense_projects').update({ name }).eq('org_id', me.org_id).eq('name', from);
    return NextResponse.json({ ok: true });
  }

  const { error } = await db
    .from('expense_projects')
    .upsert({ org_id: me.org_id, name, created_by: me.line_user_id }, { onConflict: 'org_id,name', ignoreDuplicates: true });
  // 表還沒建（migration 027）也算成功：名稱會在記第一筆時存進紀錄
  if (error) console.warn('案場清單寫入失敗（migration 027 跑了嗎？）', error.message);
  return NextResponse.json({ ok: true });
}
