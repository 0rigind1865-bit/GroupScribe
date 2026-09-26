import { dbConfigured, getDb } from '@/db';
import { liffId, liffUser } from '@/core/liff';
import { myEmployees } from '@/attend/auth';
import { monthData } from '@/attend/data';
import { workDate } from '@/attend/util';
import { locale, t, type MsgKey } from '@/attend/i18n';
import { Banner } from '@/app/ui/banner';
import { PunchBadge } from '@/app/ui/badge';
import { Empty } from '@/app/ui/empty';
import { AttendLiffBoot, AttendShell } from './shell';
import { PunchPanel, type PunchLocation } from './punch-client';

export const dynamic = 'force-dynamic';

// 員工打卡首頁（LIFF）：打卡專區（地圖＋狀態＋兩顆鈕）→ 今日紀錄 → 異常提醒。
// 版面對齊文輝考勤系統的儀表板。org 不放 URL——LIFF endpoint 只有一個固定連結，
// org 由 employees 表以 line_user_id 反查。
const MSG: Record<string, { key: MsgKey; ok?: boolean }> = {
  'ok=in': { key: 'MSG_PUNCH_IN_OK', ok: true },
  'ok=out': { key: 'MSG_PUNCH_OUT_OK', ok: true },
  'err=ERR_OUT_OF_RANGE': { key: 'ERR_OUT_OF_RANGE' },
  'err=ERR_SESSION': { key: 'ERR_SESSION' },
  'err=ERR_WRITE': { key: 'ERR_WRITE' },
  'joined=1': { key: 'MSG_JOINED', ok: true },
};

export default async function AttendHome({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string; joined?: string }>;
}) {
  const loc = await locale();
  const tt = (key: MsgKey, params?: Record<string, string | number>) => t(loc, key, params);
  const uid = await liffUser();
  if (!uid) return <AttendLiffBoot liffId={liffId()} tt={tt} />;
  if (!dbConfigured()) return <main className="p-6 text-gray-500">{tt('DB_NOT_CONFIGURED')}</main>;

  const sp = await searchParams;
  const msgKey = sp.ok ? `ok=${sp.ok}` : sp.err ? `err=${sp.err}` : sp.joined ? 'joined=1' : '';
  const msg = MSG[msgKey];
  const banner = msg && <Banner tone={msg.ok ? 'ok' : 'err'}>{tt(msg.key)}</Banner>;

  const employees = await myEmployees();
  const emp = employees.find((e) => e.status === 'active') ?? employees[0];

  // 尚未加入：唯一入口是管理員發的深連結（見 src/app/g/page.tsx 檔頭的權限說明），
  // 但已經走到這頁的人顯然拿到了連結，給他一個補填加入碼的路
  if (!emp) {
    return (
      <AttendShell current="dash" loc={loc} tt={tt} back="/a">
        {banner}
        <Empty
          title={tt('NOT_JOINED')}
          hint=""
          action={
            <a href="/a/join" className="btn-primary inline-block">
              {tt('ENTER_CODE')}
            </a>
          }
        />
      </AttendShell>
    );
  }

  // 待啟用／已停用：原本是一張沒有任何下一步的灰卡（進得來出不去）。
  // 現在明確講「接下來會發生什麼」並給兩個出口。
  if (emp.status !== 'active') {
    return (
      <AttendShell emp={emp} current="dash" loc={loc} tt={tt} back="/a">
        {banner}
        <div className="card space-y-3 text-sm">
          <p className="font-bold text-gray-700">
            {emp.status === 'pending' ? tt('PENDING_ACTIVATION') : tt('DISABLED_ACCOUNT')}
          </p>
          {emp.status === 'pending' && <p className="text-gray-500">{tt('PENDING_NEXT')}</p>}
          <div className="flex flex-wrap gap-2">
            <a href="/a" className="btn">
              {tt('REFRESH')}
            </a>
            <a href="/g" className="btn">
              {tt('BACK_TO_GROUPS')}
            </a>
          </div>
          {emp.status === 'pending' && (
            <a href="/a/join" className="inline-block text-xs text-gray-400 underline">
              {tt('WRONG_CODE')}
            </a>
          )}
        </div>
      </AttendShell>
    );
  }

  const today = workDate(new Date());
  const month = today.slice(0, 7);
  const [{ days }, { data: locs }] = await Promise.all([
    monthData(emp.org_id, emp.id, month),
    getDb()
      .from('punch_locations')
      .select('name, lat, lng, radius_m')
      .eq('org_id', emp.org_id)
      .eq('enabled', true),
  ]);
  const locations: PunchLocation[] = (locs ?? []).map((l) => ({
    name: l.name,
    lat: l.lat,
    lng: l.lng,
    radius: l.radius_m,
  }));
  const todayStatus = days.find((d) => d.date === today);
  const abnormalCount = days.filter((d) => d.abnormal).length;

  return (
    <AttendShell emp={emp} current="dash" loc={loc} tt={tt} back="/a">
      {banner}
      {!locations.length && <Banner tone="warn">{tt('NO_LOCATIONS')}</Banner>}

      <PunchPanel
        locations={locations}
        labels={{
          punchIn: tt('PUNCH_IN_BTN'),
          punchOut: tt('PUNCH_OUT_BTN'),
          locating: tt('LOCATING'),
          geoUnsupported: tt('GEO_UNSUPPORTED'),
          geoDenied: tt('GEO_DENIED'),
          geoFailed: tt('GEO_FAILED'),
          inRange: tt('IN_RANGE'),
          outOfRange: tt('OUT_OF_RANGE'),
          locatingStatus: tt('LOCATING_STATUS'),
        }}
      />

      <section className="card mt-4">
        <h2 className="mb-2 text-base font-bold">
          {tt('TODAY')}（{today}）
        </h2>
        {todayStatus?.punches.length ? (
          <ul className="space-y-1 text-sm">
            {todayStatus.punches.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <PunchBadge type={p.type} label={p.type === 'in' ? tt('PUNCH_IN') : tt('PUNCH_OUT')} />
                <span>{p.time}</span>
                {p.locationName && <span className="text-xs text-gray-500">{p.locationName}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">{tt('NO_PUNCH_TODAY')}</p>
        )}
      </section>

      {abnormalCount > 0 && (
        <a href="/a/adjust" className="card mt-3 flex items-center gap-2 text-sm hover:bg-gray-50">
          <span className="font-bold text-red-600">{tt('ABNORMAL_DAYS', { n: abnormalCount })}</span>
          <span className="ml-auto text-gray-400">›</span>
        </a>
      )}
    </AttendShell>
  );
}
