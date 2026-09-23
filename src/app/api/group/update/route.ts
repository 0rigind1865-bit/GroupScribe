import { NextRequest, NextResponse } from 'next/server';
import { redirectTo } from '@/http';
import { getDb } from '@/db';
import { claimGroup, gsAccess } from '@/org/orgs';

// 設定群組分類／群組理解（自由文字）。upsert 不用 update：匯入群可能還沒有 groups 列；
// 只寫送來的欄位，不碰 name/picture_url（upsert 紀律，與 webhook 名稱回填互不覆寫）。
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const access = await gsAccess(req, form);
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const groupId = String(form.get('group_id') ?? '').trim();
  const back = `${access.base}/groups`;
  if (groupId) {
    // 沒有 groups 列的（純匯入群）在此認領進本 org；已屬別家的擋下
    if (!(await claimGroup(access.org.id, groupId))) return NextResponse.json({ error: '群組不屬於此組織' }, { status: 403 });
    const patch: Record<string, unknown> = { group_id: groupId, updated_at: new Date().toISOString() };
    if (form.has('category')) patch.category = String(form.get('category') ?? '').trim() || null;
    if (form.has('profile')) {
      patch.profile = String(form.get('profile') ?? '').trim() || null;
      patch.profile_updated_at = new Date().toISOString();
    }
    const { error } = await getDb().from('groups').upsert(patch);
    if (error) {
      console.error('儲存群組設定失敗', error);
      // 只有寫 profile 失敗才提示 migration 004；純分類儲存失敗是別的原因，不要誤導
      const param = 'profile' in patch ? 'profile_error' : 'save_error';
      return redirectTo(`${back}?${param}=1&group=${encodeURIComponent(groupId)}`);
    }
  }
  return redirectTo(`${back}?group=${encodeURIComponent(groupId)}`);
}
