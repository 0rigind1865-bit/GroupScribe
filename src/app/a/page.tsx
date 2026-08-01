import { dbConfigured } from '@/db';
import { liffId, liffUser } from '@/core/liff';
import { myEmployees } from '@/attend/auth';
import { monthData } from '@/attend/data';
import { workDate } from '@/attend/util';
import { locale, t, type MsgKey } from '@/attend/i18n';
import { LiffInit } from '@/app/g/liff-init';
import { LangBar } from './lang-bar';
import { PunchButtons } from './punch-client';

export const dynamic = 'force-dynamic';

// 員工打卡首頁（LIFF）：今日狀態＋上下班鈕。org 不放 URL——員工開 LIFF 的入口
// 必須是固定連結（LIFF endpoint 只有一個），org 由 employees 表以 line_user_id 反查。
// 訊息 key：查詢參數 → i18n key（值不合法時原樣顯示無害）
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
  const uid = await liffUser();
  if (!uid) return <LiffInit liffId={liffId()} />;
  const loc = await locale();
  const tt = (key: MsgKey, params?: Record<string, string | number>) => t(loc, key, params);
  if (!dbConfigured()) return <main className="p-6 text-gray-500">{tt('DB_NOT_CONFIGURED')}</main>;

  const sp = await searchParams;
  const msgKey = sp.ok ? `ok=${sp.ok}` : sp.err ? `err=${sp.err}` : sp.joined ? 'joined=1' : '';
  const msg = MSG[msgKey];
  const banner = msg && (
    <p className={`mb-3 rounded p-2 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
      {tt(msg.key)}
    </p>
  );

  const employees = await myEmployees();
  const emp = employees.find((e) => e.status === 'active') ?? employees[0];

  if (!emp || emp.status !== 'active') {
    return (
      <main className="mx-auto max-w-md p-5">
        <h1 className="mb-2 text-xl font-bold">{tt('APP_TITLE')}</h1>
        {banner}
        {!emp ? (
          <>
            <p className="mb-4 text-sm text-gray-600">{tt('NOT_JOINED')}</p>
            <a href="/a/join" className="btn-primary inline-block">{tt('ENTER_CODE')}</a>
          </>
        ) : (
          <div className="card text-sm text-gray-600">
            {emp.status === 'pending' ? tt('PENDING_ACTIVATION') : tt('DISABLED_ACCOUNT')}
          </div>
        )}
        <LangBar current={loc} back="/a" />
      </main>
    );
  }

  const today = workDate(new Date());
  const month = today.slice(0, 7);
  const { days } = await monthData(emp.org_id, emp.id, month);
  const todayStatus = days.find((d) => d.date === today);
  const abnormalCount = days.filter((d) => d.abnormal).length;

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-4 flex items-center gap-3">
        {emp.picture_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={emp.picture_url} alt="" className="h-10 w-10 rounded-full" />
        ) : (
          <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-600 font-bold text-white">
            {emp.display_name.slice(0, 1)}
          </span>
        )}
        <div>
          <p className="font-bold">{emp.display_name}</p>
          <p className="text-xs text-gray-500">{emp.dept ?? '—'}</p>
        </div>
      </header>

      {banner}

      <PunchButtons
        labels={{
          punchIn: tt('PUNCH_IN_BTN'),
          punchOut: tt('PUNCH_OUT_BTN'),
          locating: tt('LOCATING'),
          geoUnsupported: tt('GEO_UNSUPPORTED'),
          geoDenied: tt('GEO_DENIED'),
          geoFailed: tt('GEO_FAILED'),
        }}
      />

      <section className="card mt-4">
        <h2 className="mb-2 text-sm font-bold text-gray-700">
          {tt('TODAY')}（{today}）
        </h2>
        {todayStatus?.punches.length ? (
          <ul className="space-y-1 text-sm">
            {todayStatus.punches.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${p.type === 'in' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'}`}>
                  {p.type === 'in' ? tt('PUNCH_IN') : tt('PUNCH_OUT')}
                </span>
                <span>{p.time}</span>
                {p.locationName && <span className="text-xs text-gray-500">{p.locationName}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">{tt('NO_PUNCH_TODAY')}</p>
        )}
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3 text-center text-sm">
        <a href="/a/records" className="card hover:bg-gray-50">
          <span className="block font-bold">{tt('MONTH_RECORDS')}</span>
          <span className="text-xs text-gray-500">{tt('MONTH_RECORDS_SUB')}</span>
        </a>
        <a href="/a/adjust" className="card hover:bg-gray-50">
          <span className="block font-bold">{tt('ADJUST_TITLE')}</span>
          {abnormalCount > 0 ? (
            <span className="text-xs font-bold text-red-600">{tt('ABNORMAL_DAYS', { n: abnormalCount })}</span>
          ) : (
            <span className="text-xs text-gray-500">{tt('ADJUST_SUB')}</span>
          )}
        </a>
      </div>

      <LangBar current={loc} back="/a" />
    </main>
  );
}
