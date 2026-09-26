import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { redirectTo } from '@/http';
import { moduleAccess, orgSettings } from '@/org/orgs';
import { attendAdminToggle, enabledModuleIds, isMissingModulesColumn } from '@/org/module-ids';

// 員工管理（對等舊 switchEnable / setSalary / switchPermissions——那三支在舊後端
// 根本不存在（前端呼叫了未部署的 action），這裡正式落地並收緊授權）。
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const slug = String(form.get('org') ?? '');
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');

  const access = await moduleAccess(slug, 'attend');
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
    // 這裡的開關只管「考勤」管理權（migration 028 的 org_members.modules）。
    // 原本是整家公司的管理權：在這裡把會計設成管理員，他也能進群組助理讀 LINE 對話整理。
    const { data: row, error: readErr } = await db
      .from('org_members')
      .select('role, modules')
      .eq('org_id', access.org.id)
      .eq('line_user_id', emp.line_user_id)
      .maybeSingle();
    if (readErr) {
      // migration 028 還沒跑：撤權照舊（整列刪掉，只會減少權限）；授權寧可不給，也不要退回「整家公司」的舊行為
      if (action === 'admin_off' && isMissingModulesColumn(readErr)) {
        await db.from('org_members').delete().eq('org_id', access.org.id).eq('line_user_id', emp.line_user_id).eq('role', 'admin');
        return redirectTo(`${back}?emp=${id}`);
      }
      return redirectTo(`${back}?emp=${id}&err=ERR_WRITE`);
    }
    const cur = row as { role: string; modules: string[] | null } | null;
    const orgMods = enabledModuleIds((await orgSettings(access.org.id)).modules);
    const next = attendAdminToggle(cur, orgMods, action === 'admin_on');
    const where = (q: any) => q.eq('org_id', access.org.id).eq('line_user_id', emp.line_user_id);
    const { error: writeErr } =
      next === 'keep'
        ? { error: null }
        : next === 'delete'
          ? await where(db.from('org_members').delete()).eq('role', 'admin') // owner 不可被此端點移除
          : cur
            ? await where(db.from('org_members').update({ modules: next }))
            : await db.from('org_members').insert({ org_id: access.org.id, line_user_id: emp.line_user_id, role: 'admin', modules: next });
    if (writeErr) return redirectTo(`${back}?emp=${id}&err=ERR_WRITE`);
    return redirectTo(`${back}?emp=${id}`);
  } else {
    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  }

  const { error } = await db.from('employees').update(patch).eq('id', id).eq('org_id', access.org.id);
  if (error) return redirectTo(`${back}?err=ERR_WRITE`);
  return redirectTo(`${back}?emp=${id}`);
}
