import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { redirectTo } from '@/http';
import { activeEmployee } from '@/attend/auth';
import { distanceMeters, workDate } from '@/attend/util';

// GPS 打卡（對等舊 action=punch）。三重把關（比照 /api/liff/item）：
// (1) gs_liff session（activeEmployee 內含）(2) 員工列存在且 active（從 session 反查，
// 不信任表單）(3) 寫入綁 employee.org_id。半徑驗證在伺服端——舊系統也是，
// 但注意已知天花板：瀏覽器 GPS 可被 DevTools 偽造，這裡擋的是誤按與懶人，不是有心人。
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const type = String(form.get('type') ?? '');
  const lat = Number(form.get('lat'));
  const lng = Number(form.get('lng'));
  if ((type !== 'in' && type !== 'out') || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: '參數不足' }, { status: 400 });
  }

  const emp = await activeEmployee();
  if (!emp) return redirectTo('/a?err=ERR_SESSION');

  const db = getDb();
  const { data: locs } = await db
    .from('punch_locations')
    .select('id, name, lat, lng, radius_m')
    .eq('org_id', emp.org_id)
    .eq('enabled', true);

  const hit = (locs ?? []).find((l) => distanceMeters(lat, lng, l.lat, l.lng) <= l.radius_m);
  if (!hit) return redirectTo('/a?err=ERR_OUT_OF_RANGE');

  const now = new Date();
  const { error } = await db.from('punch_records').insert({
    org_id: emp.org_id,
    employee_id: emp.id,
    type,
    punched_at: now.toISOString(),
    work_date: workDate(now),
    lat,
    lng,
    location_id: hit.id,
    location_name: hit.name,
    source: 'gps',
    note: req.headers.get('user-agent')?.slice(0, 200) ?? null, // 對等舊制：留裝置資訊供比對
  });
  if (error) {
    console.error('punch 寫入失敗', error);
    return redirectTo('/a?err=ERR_WRITE');
  }
  return redirectTo(`/a?ok=${type}`);
}
