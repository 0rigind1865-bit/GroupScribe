import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { redirectTo } from '@/http';
import { liffUser, verifyInviteToken } from '@/core/liff';
import { moduleAdminToggle } from '@/org/module-ids';
import { orgBySlug } from '@/org/orgs';

// 接受管理員邀請：還不是成員的人加入公司的唯一端點。不走 gsAccess（他還沒有權限），
// 憑邀請連結的簽章＋到期時間把關；守門測試以 org/ 白名單註明。
// 只給群組助理（gs）：公司另外開了考勤／報帳時，不會因為一條群組邀請連結就看得到薪資。
export async function POST(req: NextRequest) {
  const uid = await liffUser();
  if (!uid) return NextResponse.json({ error: '請先用 LINE 登入' }, { status: 403 });
  const form = await req.formData();
  const org = await orgBySlug(String(form.get('slug') ?? ''));
  if (!org || !verifyInviteToken(org.id, form.get('e'), form.get('t')))
    return NextResponse.json({ error: '邀請連結已失效，請對方重新傳一次' }, { status: 403 });

  const db = getDb();
  const where = (q: any) => q.eq('org_id', org.id).eq('line_user_id', uid);
  // modules 欄不存在（migration 028 未跑）時讀取會失敗 → 直接擋：授權寧可不給，也不要給成整家公司
  const { data: cur, error: readErr } = await where(db.from('org_members').select('role, modules')).maybeSingle();
  if (readErr) {
    console.error('接受邀請：讀取成員失敗', readErr);
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  const next = moduleAdminToggle(cur, 'gs', true); // 已是擁有者／已有 gs → keep；只管考勤的人 → 補上 gs
  const name = String(form.get('name') ?? '').trim().slice(0, 20) || `LINE 使用者 ${uid.slice(-6)}`;
  const { error } =
    next === 'keep' || next === 'delete'
      ? { error: null }
      : cur
        ? await where(db.from('org_members').update({ modules: next }))
        : await db.from('org_members').insert({ org_id: org.id, line_user_id: uid, role: 'admin', modules: next, display_name: name });
  if (error) {
    console.error('接受邀請：寫入失敗', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return redirectTo(`/o/${org.slug}`);
}
