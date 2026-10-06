import { NextRequest } from 'next/server';
import { getDb } from '@/db';
import { redirectTo } from '@/http';
import { moduleAccess } from '@/org/orgs';
import { oh } from '@/org/href';
import { PAY_METHODS, parseAmount, parseDate } from '@/expense/receipt';
import { withV2Fallback } from '@/expense/store';
import { orgCategories } from '@/expense/categories';

// 報帳寫入（X1）：改欄位、標已報帳／改回、刪除。
// 把關：moduleAccess(表單 org) → 每個查詢都 .eq('org_id')，拿到別家的 id 也改不到。
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const slug = String(form.get('org') ?? '');
  const access = await moduleAccess(slug, 'expense');
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

  // 標已報帳／改回可一次多筆（2026-10 設計畫布「收據」：月底勾一批一次標，不用一筆一筆按）
  if (action === 'reimburse' || action === 'unreimburse') {
    const ids = form.getAll('id').map(String).filter(Boolean);
    if (!ids.length) return go('err=bad');
    await db
      .from('expenses')
      .update({ reimbursed_at: action === 'reimburse' ? now : null, updated_at: now })
      .in('id', ids)
      .eq('org_id', access.org.id);
    return go(ids.length > 1 ? `ok=reimbursed&n=${ids.length}` : 'ok=saved');
  }
  // 刪了救不回來：表單要勾「刪了救不回來」才送得出來（globals.css 的 data-ack），沒勾硬送的這裡擋
  if (action === 'delete') {
    if (form.get('confirm_delete') !== 'on') return go('err=confirm');
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
