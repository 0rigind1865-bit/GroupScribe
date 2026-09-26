import { NextRequest } from 'next/server';
import { getDb } from '@/db';
import { redirectTo } from '@/http';
import { myExpenseEmployee, parseExpenseForm } from '@/expense/mine';
import { orgCategories } from '@/expense/categories';
import { withV2Fallback } from '@/expense/store';

// 員工改／刪自己的報帳（X2-2）：只動「自己的、同公司的、還沒被標已報帳」那筆——
// 已報帳的鎖定，改了會讓會計對不上帳。
export async function POST(req: NextRequest) {
  const emp = await myExpenseEmployee();
  if (!emp) return new Response('沒有權限', { status: 403 });
  const form = await req.formData();
  const id = String(form.get('id') ?? '');
  const db = getDb();
  const mine = (q: any) =>
    q.eq('id', id).eq('org_id', emp.org_id).eq('line_user_id', emp.line_user_id).is('reimbursed_at', null);

  if (form.get('action') === 'delete') {
    await mine(db.from('expenses').delete());
    return redirectTo('/a/expense?ok=deleted');
  }
  const today = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Taipei' });
  const input = parseExpenseForm(form, await orgCategories(emp.org_id), today);
  if (!input) return redirectTo('/a/expense?err=bad');
  // 座標只在新增時抓；編輯表單沒有座標欄位，不能把原本的洗成 null
  const { lat: _lat, lng: _lng, ...patch } = input;
  await withV2Fallback({ ...patch, updated_at: new Date().toISOString() }, (p) => mine(db.from('expenses').update(p)));
  return redirectTo('/a/expense?ok=saved');
}
