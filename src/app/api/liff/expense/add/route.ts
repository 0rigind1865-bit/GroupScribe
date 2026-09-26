import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, MEDIA_BUCKET } from '@/db';
import { myExpenseIdentity, parseExpenseForm } from '@/expense/mine';
import { orgCategories } from '@/expense/categories';
import { withV2Fallback } from '@/expense/store';

// 記一筆（Snaptab 全功能移植）：前端用 fetch 送 FormData，回 JSON。
// 身分從 LIFF session 反查，公司跟著身分走，表單不帶人。收據照由前端先壓縮（1600px JPEG），這裡只收圖片。
// 離線時前端會先存在手機、恢復網路再補送——client_id 讓補送不會重複記（同一筆送兩次只記一次）。
const MAX_PHOTO = 10 * 1024 * 1024;
const today = () => new Date().toLocaleDateString('sv', { timeZone: 'Asia/Taipei' });
const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

// ponytail: 離線補送的去重在記憶體（同容器、10 分鐘）；多容器或重啟後重送仍可能重複一筆
const recent = new Map<string, number>();

export async function POST(req: NextRequest) {
  const me = await myExpenseIdentity();
  if (!me) return fail('沒有權限', 403);
  const form = await req.formData();
  const cid = String(form.get('client_id') ?? '');
  const now = Date.now();
  for (const [k, t] of recent) if (now - t > 600_000) recent.delete(k);
  if (cid && recent.has(`${me.line_user_id}:${cid}`)) return NextResponse.json({ ok: true, duplicate: true });

  const input = parseExpenseForm(form, await orgCategories(me.org_id), today());
  if (!input) return fail('金額或分類不對');

  const db = getDb();
  let photo_path: string | null = null;
  const file = form.get('photo');
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PHOTO || !file.type.startsWith('image/')) return fail('照片要是圖片、10MB 以內');
    photo_path = `expense/${me.org_id}/${randomUUID()}.${file.type.split('/')[1]?.replace(/[^a-z0-9]/g, '') || 'jpg'}`;
    const up = await db.storage.from(MEDIA_BUCKET).upload(photo_path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
    if (up.error) {
      console.warn('報帳照片上傳失敗（照常記帳、不附照片）', up.error.message);
      photo_path = null;
    }
  }

  const { error } = await withV2Fallback(
    { org_id: me.org_id, line_user_id: me.line_user_id, person_name: me.display_name, ...input, photo_path, source: 'web' },
    (row) => db.from('expenses').insert(row),
  );
  if (error) {
    console.warn('員工記帳失敗', error.message);
    return fail('沒有記成功，請稍後再試', 500);
  }
  if (cid) recent.set(`${me.line_user_id}:${cid}`, now);
  // 案場清單：用過的名稱順手登記（表還沒建就略過）
  if (input.project)
    await db.from('expense_projects').upsert({ org_id: me.org_id, name: input.project, created_by: me.line_user_id }, { onConflict: 'org_id,name', ignoreDuplicates: true }).then(() => {});
  return NextResponse.json({ ok: true, photo: !!photo_path || !(file instanceof File && file.size > 0) });
}
