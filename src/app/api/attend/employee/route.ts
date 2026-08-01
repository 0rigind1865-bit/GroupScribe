import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { redirectTo } from '@/http';
import { orgAdminAccess } from '@/attend/auth';

// 員工管理（對等舊 switchEnable / setSalary / switchPermissions——那三支在舊後端
// 根本不存在（前端呼叫了未部署的 action），這裡正式落地並收緊授權）。
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const slug = String(form.get('org') ?? '');
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');

  const access = await orgAdminAccess(slug);
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const back = `/o/${slug}/attend/employees`;
  const db = getDb();

  // 產生 / 重設加入碼（不需要 employee id）
  if (action === 'joincode') {
    const code = crypto.randomUUID().slice(0, 8);
    await db
      .from('org_settings')
      .upsert({ org_id: access.org.id, attend_join_code: code, updated_at: new Date().toISOString() }, { onConflict: 'org_id' });
    return redirectTo(back);
  }

  if (!id) return NextResponse.json({ error: '參數不足' }, { status: 400 });
  const { data: emp } = await db
    .from('employees')
    .select('id, line_user_id, status')
    .eq('id', id)
    .eq('org_id', access.org.id)
    .maybeSingle();
  if (!emp) return NextResponse.json({ error: '找不到員工' }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (action === 'activate') patch.status = 'active';
  else if (action === 'disable') patch.status = 'disabled';
  else if (action === 'save') {
    const dept = String(form.get('dept') ?? '').trim();
    const salary = Number(form.get('salary'));
    if (Number.isFinite(salary) && salary >= 0 && salary <= 10_000_000) patch.monthly_salary = salary;
    patch.dept = dept || null;
    const name = String(form.get('name') ?? '').trim();
    if (name) patch.display_name = name;
  } else if (action === 'admin_on' || action === 'admin_off') {
    // org 管理權掛在 org_members（身分查表決定，撤權立即生效）
    if (action === 'admin_on') {
      await db.from('org_members').upsert(
        { org_id: access.org.id, line_user_id: emp.line_user_id, role: 'admin' },
        { onConflict: 'org_id,line_user_id' },
      );
    } else {
      // owner 不可被此端點移除（防止把最後一個 owner 拔掉）
      await db
        .from('org_members')
        .delete()
        .eq('org_id', access.org.id)
        .eq('line_user_id', emp.line_user_id)
        .eq('role', 'admin');
    }
    return redirectTo(`${back}?emp=${id}`);
  } else {
    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  }

  const { error } = await db.from('employees').update(patch).eq('id', id).eq('org_id', access.org.id);
  if (error) return redirectTo(`${back}?err=ERR_WRITE`);
  return redirectTo(`${back}?emp=${id}`);
}
