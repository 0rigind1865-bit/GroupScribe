import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { redirectTo } from '@/http';
import { orgAdminAccess } from '@/attend/auth';

// 打卡地點管理（對等舊 addLocation；舊系統這支完全沒有授權——任何人拿到 URL 就能
// 在自家新增地點遠端打卡。這裡照三重把關收緊）。
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const slug = String(form.get('org') ?? '');
  const action = String(form.get('action') ?? 'add');

  const access = await orgAdminAccess(slug);
  if (!access) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const back = `/o/${slug}/attend/locations`;
  const db = getDb();

  if (action === 'add') {
    const name = String(form.get('name') ?? '').trim();
    const lat = Number(form.get('lat'));
    const lng = Number(form.get('lng'));
    const radius = Math.min(Math.max(Number(form.get('radius') || 100), 10), 5000); // 10m–5km 合理範圍
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return redirectTo(`${back}?err=ERR_LOCATION_PARAMS`);
    }
    const { error } = await db
      .from('punch_locations')
      .insert({ org_id: access.org.id, name, lat, lng, radius_m: radius });
    if (error) return redirectTo(`${back}?err=ERR_WRITE`);
    return redirectTo(`${back}?ok=1`);
  }

  const id = String(form.get('id') ?? '');
  if (!id) return NextResponse.json({ error: '參數不足' }, { status: 400 });
  if (action === 'toggle') {
    const { data: loc } = await db
      .from('punch_locations')
      .select('enabled')
      .eq('id', id)
      .eq('org_id', access.org.id)
      .maybeSingle();
    if (loc) await db.from('punch_locations').update({ enabled: !loc.enabled }).eq('id', id).eq('org_id', access.org.id);
    return redirectTo(back);
  }
  if (action === 'delete') {
    // punch_records.location_id 有 FK：曾被引用的地點刪不掉（改停用），沒被用過的可直接刪
    const { error } = await db.from('punch_locations').delete().eq('id', id).eq('org_id', access.org.id);
    if (error) return redirectTo(`${back}?err=ERR_LOCATION_IN_USE`);
    return redirectTo(back);
  }
  return NextResponse.json({ error: '未知操作' }, { status: 400 });
}
