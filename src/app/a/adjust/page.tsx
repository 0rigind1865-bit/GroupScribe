import { dbConfigured, getDb } from '@/db';
import { liffId, liffUser } from '@/core/liff';
import { myEmployees } from '@/attend/auth';
import { monthData } from '@/attend/data';
import { workDate } from '@/attend/util';
import { locale, t, type MsgKey } from '@/attend/i18n';
import { LiffInit } from '@/app/g/liff-init';
import { LangBar } from '../lang-bar';

export const dynamic = 'force-dynamic';

// 補卡申請（對等舊補打卡 UI）：本月異常日清單（點了帶入日期與建議時間）＋
// datetime-local 表單 ＋ 我的申請狀態。原生 input 取代舊系統手刻的日期驗證。
const ERR: Record<string, MsgKey> = {
  ERR_ADJUST_RANGE: 'ERR_ADJUST_RANGE',
  ERR_WRITE: 'ERR_WRITE',
  ERR_SESSION: 'ERR_SESSION',
};

const STATUS_BADGE: Record<string, [MsgKey, string]> = {
  pending: ['REQ_PENDING', 'bg-amber-100 text-amber-800'],
  approved: ['REQ_APPROVED', 'bg-emerald-100 text-emerald-800'],
  rejected: ['REQ_REJECTED', 'bg-red-100 text-red-700'],
};

export default async function AdjustPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string; d?: string; t?: string }>;
}) {
  const uid = await liffUser();
  if (!uid) return <LiffInit liffId={liffId()} />;
  const loc = await locale();
  const tt = (key: MsgKey, params?: Record<string, string | number>) => t(loc, key, params);
  if (!dbConfigured()) return <main className="p-6 text-gray-500">{tt('DB_NOT_CONFIGURED')}</main>;

  const employees = await myEmployees();
  const emp = employees.find((e) => e.status === 'active');
  if (!emp) return <main className="mx-auto max-w-md p-5 text-sm text-gray-600">{tt('NOT_ACTIVE')}</main>;

  const sp = await searchParams;
  const today = workDate(new Date());
  const { days } = await monthData(emp.org_id, emp.id, today.slice(0, 7));
  const abnormal = days.filter((d) => d.abnormal);

  const { data: reqs } = await getDb()
    .from('adjustment_requests')
    .select('id, type, requested_at, reason, status, created_at')
    .eq('org_id', emp.org_id)
    .eq('employee_id', emp.id)
    .order('created_at', { ascending: false })
    .limit(20);

  // 點異常日帶入預設：缺上班卡 → 09:00、缺下班卡 → 18:00（對等舊 UI 的預設時間）
  const defType = sp.t === 'out' ? 'out' : 'in';
  const defDatetime = sp.d ? `${sp.d}T${defType === 'in' ? '09:00' : '18:00'}` : '';

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="mb-3 text-xl font-bold">{tt('ADJUST_TITLE')}</h1>
      {sp.ok && <p className="mb-3 rounded bg-emerald-50 p-2 text-sm text-emerald-800">{tt('MSG_ADJUST_SENT')}</p>}
      {sp.err && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{ERR[sp.err] ? tt(ERR[sp.err]) : sp.err}</p>}

      {abnormal.length > 0 && (
        <section className="card mb-4">
          <h2 className="mb-2 text-sm font-bold text-gray-700">{tt('ADJUST_MONTH_ABNORMAL', { n: abnormal.length })}</h2>
          <ul className="space-y-1.5 text-sm">
            {abnormal.map((d) => {
              const missIn = !d.punches.some((p) => p.type === 'in');
              const missOut = !d.punches.some((p) => p.type === 'out');
              return (
                <li key={d.date} className="flex items-center gap-2">
                  <span>{d.date}</span>
                  <span className="text-xs text-red-600">
                    {missIn && missOut ? tt('MISS_BOTH') : missIn ? tt('MISS_IN') : tt('MISS_OUT')}
                  </span>
                  <a
                    className="ml-auto text-xs text-emerald-700 underline"
                    href={`/a/adjust?d=${d.date}&t=${missIn ? 'in' : 'out'}`}
                  >
                    {tt('FILL_IN')}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <form action="/api/attend/adjust" method="post" className="card space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-bold text-gray-700">{tt('TYPE_LABEL')}</span>
          <select className="input w-full" name="type" defaultValue={defType}>
            <option value="in">{tt('IN_CARD')}</option>
            <option value="out">{tt('OUT_CARD')}</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-bold text-gray-700">{tt('DATETIME_LABEL')}</span>
          <input className="input w-full" type="datetime-local" name="datetime" defaultValue={defDatetime} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-bold text-gray-700">{tt('REASON_LABEL')}</span>
          <input className="input w-full" name="reason" placeholder={tt('REASON_PLACEHOLDER')} />
        </label>
        <button className="btn-primary w-full">{tt('SUBMIT_ADJUST')}</button>
      </form>

      {(reqs ?? []).length > 0 && (
        <section className="card mt-4">
          <h2 className="mb-2 text-sm font-bold text-gray-700">{tt('MY_REQUESTS')}</h2>
          <ul className="space-y-1.5 text-sm">
            {(reqs ?? []).map((r) => {
              const [labelKey, cls] = STATUS_BADGE[r.status] ?? ['REQ_PENDING' as MsgKey, 'bg-gray-100 text-gray-600'];
              return (
                <li key={r.id} className="flex items-center gap-2">
                  <span>{new Date(r.requested_at).toLocaleString(loc, { timeZone: 'Asia/Taipei', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-xs text-gray-500">{r.type === 'in' ? tt('PUNCH_IN') : tt('PUNCH_OUT')}</span>
                  <span className={`ml-auto rounded px-1.5 py-0.5 text-xs font-bold ${cls}`}>{tt(labelKey)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <a href="/a" className="mt-4 inline-block text-sm text-gray-500 underline">{tt('BACK_HOME')}</a>
      <LangBar current={loc} back="/a/adjust" />
    </main>
  );
}
