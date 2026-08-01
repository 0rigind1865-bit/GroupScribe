import { dbConfigured } from '@/db';
import { liffId, liffUser } from '@/core/liff';
import { myEmployees } from '@/attend/auth';
import { monthData } from '@/attend/data';
import { isYm, shiftMonth, workDate } from '@/attend/util';
import { locale, t, type MsgKey } from '@/attend/i18n';
import { monthGrid } from '@/core/grid';
import { LiffInit } from '@/app/g/liff-init';
import { LangBar } from '../lang-bar';
import type { DayStatus } from '@/attend/abnormal';

export const dynamic = 'force-dynamic';

// 我的月曆與打卡明細（對等舊員工月曆）。日格顏色 = 每日狀態；點日期看當日明細（?d=）。
const CELL: Record<DayStatus['status'], string> = {
  STATUS_PUNCH_NORMAL: 'bg-emerald-100 text-emerald-900',
  STATUS_REPAIR_APPROVED: 'bg-teal-100 text-teal-900',
  STATUS_REPAIR_PENDING: 'bg-amber-100 text-amber-900',
  STATUS_PUNCH_IN_MISSING: 'bg-red-100 text-red-800',
  STATUS_PUNCH_OUT_MISSING: 'bg-red-100 text-red-800',
  STATUS_PUNCH_BOTH_MISSING: 'bg-gray-100 text-gray-400',
  STATUS_TODAY_OPEN: 'bg-sky-100 text-sky-900',
};

const WEEK_KEYS: MsgKey[] = ['WEEK_SUN', 'WEEK_MON', 'WEEK_TUE', 'WEEK_WED', 'WEEK_THU', 'WEEK_FRI', 'WEEK_SAT'];

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; d?: string }>;
}) {
  const uid = await liffUser();
  if (!uid) return <LiffInit liffId={liffId()} />;
  const loc = await locale();
  const tt = (key: MsgKey, params?: Record<string, string | number>) => t(loc, key, params);
  if (!dbConfigured()) return <main className="p-6 text-gray-500">{tt('DB_NOT_CONFIGURED')}</main>;

  const employees = await myEmployees();
  const emp = employees.find((e) => e.status === 'active');
  if (!emp) {
    return (
      <main className="mx-auto max-w-md p-5">
        <p className="text-sm text-gray-600">{tt('NOT_ACTIVE')}</p>
      </main>
    );
  }

  const sp = await searchParams;
  const today = workDate(new Date());
  const month = sp.month && isYm(sp.month) ? sp.month : today.slice(0, 7);
  const { days } = await monthData(emp.org_id, emp.id, month);
  const byDate = new Map(days.map((d) => [d.date, d]));

  const [y, m] = month.split('-').map(Number);
  const weeks = monthGrid(y, m);
  const sel = sp.d && byDate.has(sp.d) ? byDate.get(sp.d)! : null;

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-3 flex items-center justify-between">
        <a className="btn px-3 py-1 text-sm" href={`/a/records?month=${shiftMonth(month, -1)}`}>←</a>
        <h1 className="text-lg font-bold">{tt('MONTH_TITLE', { y, m })}</h1>
        <a className="btn px-3 py-1 text-sm" href={`/a/records?month=${shiftMonth(month, 1)}`}>→</a>
      </div>

      <div className="mb-1 grid grid-cols-7 text-center text-xs text-gray-500">
        {WEEK_KEYS.map((w) => (
          <div key={w} className="py-1">{tt(w)}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((cell, i) => {
          if (!cell) return <div key={i} />;
          const st = byDate.get(cell.iso);
          const cls = st ? CELL[st.status] : 'text-gray-400';
          return (
            <a
              key={i}
              href={st ? `/a/records?month=${month}&d=${cell.iso}` : undefined}
              className={`grid h-10 place-items-center rounded text-sm ${cls} ${sp.d === cell.iso ? 'ring-2 ring-emerald-500' : ''}`}
            >
              {cell.day}
            </a>
          );
        })}
      </div>

      {sel && (
        <section className="card mt-4">
          <h2 className="mb-1 text-sm font-bold text-gray-700">
            {sel.date}｜{tt(sel.status)}
          </h2>
          {sel.punches.length ? (
            <ul className="space-y-1 text-sm">
              {sel.punches.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${p.type === 'in' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'}`}>
                    {p.type === 'in' ? tt('PUNCH_IN') : tt('PUNCH_OUT')}
                  </span>
                  <span>{p.time}</span>
                  {p.source === 'adjustment' && <span className="rounded bg-teal-100 px-1 text-xs text-teal-800">{tt('ADJ_BADGE')}</span>}
                  {p.locationName && <span className="text-xs text-gray-500">{p.locationName}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">{tt('DAY_NO_RECORDS')}</p>
          )}
          {sel.abnormal && (
            <a href="/a/adjust" className="mt-2 inline-block text-sm text-emerald-700 underline">
              {tt('GO_ADJUST')}
            </a>
          )}
        </section>
      )}

      <a href="/a" className="mt-4 inline-block text-sm text-gray-500 underline">{tt('BACK_HOME')}</a>
      <LangBar current={loc} back={`/a/records?month=${month}`} />
    </main>
  );
}
