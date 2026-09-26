import { NextRequest } from 'next/server';
import { getDb } from '@/db';
import { redirectTo } from '@/http';
import { orgAdminAccess } from '@/org/orgs';
import { oh } from '@/org/href';
import { PAY_METHODS, parseAmount, parseDate } from '@/expense/receipt';
import { withV2Fallback } from '@/expense/store';
import { orgCategories } from '@/expense/categories';

// 報帳寫入（X1）：改欄位、標已報帳／改回、刪除。
// 把關：orgAdminAccess(表單 org) → 每個查詢都 .eq('org_id')，拿到別家的 id 也改不到。
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const slug = String(form.get('org') ?? '');
  const access = await orgAdminAccess(slug);
  if (!access) return new Response('沒有權限', { status: 403 });
  const home = oh(slug, '/expense');
  const backRaw = String(form.get('back') ?? '');
  const back = backRaw.startsWith(home) ? backRaw : home; // 只回本 org 的報帳頁，不做任意跳轉
  const go = (flag: string) => redirectTo(`${back}${back.includes('?') ? '&' : '?'}${flag}`);

  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');
  const scoped = (q: any) => q.eq('id', id).eq('org_id', access.org.id);
  const db = getDb();
  const now = new Date().toISOString();

  if (action === 'reimburse' || action === 'unreimburse') {
    await scoped(db.from('expenses').update({ reimbursed_at: action === 'reimburse' ? now : null, updated_at: now }));
    return go('ok=saved');
  }
  if (action === 'delete') {
    await scoped(db.from('expenses').delete());
    return go('ok=deleted');
  }
  if (action === 'save') {
    const amount = parseAmount(String(form.get('amount') ?? ''));
    // 日期時間（datetime-local，台北時間）；舊表單只送日期也接受
    const dt = String(form.get('spent_at') ?? '');
    const atRaw = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dt) ? new Date(`${dt}:00+08:00`) : null;
    const at = atRaw && Number.isFinite(atRaw.getTime()) ? atRaw : null;
    const spent_on = at ? at.toLocaleDateString('sv', { timeZone: 'Asia/Taipei' }) : parseDate(String(form.get('spent_on') ?? ''));
    const category = String(form.get('category') ?? '');
    if (amount === null || !spent_on || !(await orgCategories(access.org.id)).includes(category)) return go('err=bad');
    const text = (k: string, max: number) => String(form.get(k) ?? '').trim().slice(0, max);
    const pay = String(form.get('pay_method') ?? '代墊');
    const inv = text('invoice_no', 20).replace(/[-\s]/g, '').toUpperCase();
    const patch = {
      amount,
      spent_on,
      category,
      vendor: text('vendor', 80),
      project: text('project', 60),
      note: text('note', 200),
      updated_at: now,
      pay_method: (PAY_METHODS as readonly string[]).includes(pay) ? pay : '代墊',
      place_name: text('place_name', 60),
      invoice_no: /^[A-Z]{2}\d{8}$/.test(inv) ? inv : '',
      ...(at ? { spent_at: at.toISOString() } : {}),
      ...(form.get('remove_photo') === '1' ? { photo_path: null, media_asset_id: null } : {}),
    };
    await withV2Fallback(patch, (p) => scoped(db.from('expenses').update(p)));
    return go('ok=saved');
  }
  return go('err=bad');
}
