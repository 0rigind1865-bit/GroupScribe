import { dbConfigured, getDb } from '@/db';
import { liffId, liffUser } from '@/core/liff';
import { myEmployees } from '@/attend/auth';
import { monthData } from '@/attend/data';
import { workDate } from '@/attend/util';
import { locale, t, type MsgKey } from '@/attend/i18n';
import { Banner } from '@/app/ui/banner';
import { Badge } from '@/app/ui/badge';
import type { Tone } from '@/app/ui/tone';
import { AttendLiffBoot, AttendShell } from '../shell';

export const dynamic = 'force-dynamic';

// 補卡申請（對等舊補打卡 UI）：本月異常日清單（點了帶入日期與建議時間）＋
// datetime-local 表單 ＋ 我的申請狀態。原生 input 取代舊系統手刻的日期驗證。
const ERR: Record<string, MsgKey> = {
  ERR_ADJUST_RANGE: 'ERR_ADJUST_RANGE',
  ERR_WRITE: 'ERR_WRITE',
  ERR_SESSION: 'ERR_SESSION',
};

const STATUS_BADGE: Record<string, [MsgKey, Tone]> = {
  pending: ['REQ_PENDING', 'warn'],
  approved: ['REQ_APPROVED', 'ok'],
  rejected: ['REQ_REJECTED', 'err'],
};

export default async function AdjustPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string; d?: string; t?: string }>;
}) {
  const loc = await locale();
  const tt = (key: MsgKey, params?: Record<string, string | number>) => t(loc, key, params);
  const uid = await liffUser();
  if (!uid) return <AttendLiffBoot liffId={liffId()} tt={tt} />;
  if (!dbConfigured()) return <main className="p-6 text-gray-500">{tt('DB_NOT_CONFIGURED')}</main>;

  const employees = await myEmployees();
  const emp = employees.find((e) => e.status === 'active');
  if (!emp)
    return (
      <AttendShell current="requests" loc={loc} tt={tt} back="/a/adjust">
        <p className="text-sm text-gray-600">{tt('NOT_ACTIVE')}</p>
      </AttendShell>
    );

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
    <AttendShell emp={emp} current="requests" loc={loc} tt={tt} back="/a/adjust">
      {sp.ok && <Banner>{tt('MSG_ADJUST_SENT')}</Banner>}
      {sp.err && <Banner tone="err">{ERR[sp.err] ? tt(ERR[sp.err]) : sp.err}</Banner>}

      {abnormal.length > 0 && (
        <section className="card mb-4">
          <h2 className="mb-2 text-base font-bold">{tt('ADJUST_MONTH_ABNORMAL', { n: abnormal.length })}</h2>
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
          <h2 className="mb-2 text-base font-bold">{tt('MY_REQUESTS')}</h2>
          <ul className="space-y-1.5 text-sm">
            {(reqs ?? []).map((r) => {
              const [labelKey, tone] = STATUS_BADGE[r.status] ?? ['REQ_PENDING' as MsgKey, 'neutral' as Tone];
              return (
                <li key={r.id} className="flex items-center gap-2">
                  <span>{new Date(r.requested_at).toLocaleString(loc, { timeZone: 'Asia/Taipei', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-xs text-gray-500">{r.type === 'in' ? tt('PUNCH_IN') : tt('PUNCH_OUT')}</span>
                  <span className="ml-auto">
                    <Badge tone={tone}>{tt(labelKey)}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

    </AttendShell>
  );
}
