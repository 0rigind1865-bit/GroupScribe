import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, MEDIA_BUCKET } from '@/db';
import { redirectTo } from '@/http';
import { myExpenseEmployee, parseExpenseForm } from '@/expense/mine';
import { orgCategories } from '@/expense/categories';
import { withV2Fallback } from '@/expense/store';

// 員工網頁記一筆（X2-1）：身分從 LIFF session 反查（myExpenseEmployee），公司也跟著員工走，表單不帶人。
// 收據照（可選）存 Storage 私有 bucket；存完回到記帳頁，金額歸零、專案保留（Snaptab 的習慣）。
const MAX_PHOTO = 10 * 1024 * 1024;
const today = () => new Date().toLocaleDateString('sv', { timeZone: 'Asia/Taipei' });

export async function POST(req: NextRequest) {
  const emp = await myExpenseEmployee();
  if (!emp) return new Response('沒有權限', { status: 403 });
  const form = await req.formData();
  const input = parseExpenseForm(form, await orgCategories(emp.org_id), today());
  const keep = (flag: string) => redirectTo(`/a/expense?${flag}${input?.project ? `&project=${encodeURIComponent(input.project)}` : ''}`);
  if (!input) return keep('err=bad');

  const db = getDb();
  let photo_path: string | null = null;
  const file = form.get('photo');
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PHOTO || !file.type.startsWith('image/')) return keep('err=photo');
    photo_path = `expense/${emp.org_id}/${randomUUID()}.${file.type.split('/')[1]?.replace(/[^a-z0-9]/g, '') || 'jpg'}`;
    const up = await db.storage.from(MEDIA_BUCKET).upload(photo_path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
    if (up.error) {
      console.warn('報帳照片上傳失敗（照常記帳、不附照片）', up.error.message);
      photo_path = null;
    }
  }

  const { error } = await withV2Fallback(
    { org_id: emp.org_id, line_user_id: emp.line_user_id, person_name: emp.display_name, ...input, photo_path, source: 'web' },
    (row) => db.from('expenses').insert(row),
  );
  if (error) {
    console.warn('員工記帳失敗', error.message);
    return keep('err=failed');
  }
  return keep('ok=saved');
}
