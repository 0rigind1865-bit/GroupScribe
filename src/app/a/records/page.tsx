import { redirect } from 'next/navigation';
import { dbConfigured } from '@/db';
import { liffId, liffUser } from '@/core/liff';
import { myEmployees } from '@/attend/auth';
import { monthData } from '@/attend/data';
import { isYm, shiftMonth, workDate } from '@/attend/util';
import { locale, t, type MsgKey } from '@/attend/i18n';
import { MonthGrid } from '@/app/ui/month-grid';
import { dayCellClass } from '@/attend/day-tone';
import { PunchBadge, Badge } from '@/app/ui/badge';
import { AttendLiffBoot, AttendShell } from '../shell';
import { shellData } from '../shell-data';

export const dynamic = 'force-dynamic';

// 我的月曆與打卡明細（對等舊員工月曆）。日格顏色 = 每日狀態；點日期看當日明細（?d=）。
const WEEK_KEYS: MsgKey[] = ['WEEK_SUN', 'WEEK_MON', 'WEEK_TUE', 'WEEK_WED', 'WEEK_THU', 'WEEK_FRI', 'WEEK_SAT'];

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; d?: string }>;
}) {
  const loc = await locale();
  const tt = (key: MsgKey, params?: Record<string, string | number>) => t(loc, key, params);
  const uid = await liffUser();
  if (!uid) return <AttendLiffBoot liffId={liffId()} tt={tt} />;
  if (!dbConfigured()) return <main className="p-6 text-gray-500">{tt('DB_NOT_CONFIGURED')}</main>;

  const employees = await myEmployees();
  const emp = employees.find((e) => e.status === 'active');
  const { inGroups: _g, ...sd } = await shellData(uid, emp, employees);
  // 還沒加入或還沒啟用：回打卡頁——那裡會講清楚現在的狀態並給下一步（輸入加入碼／重新整理），
  // 這頁只剩一行「尚未啟用」是死路（審查 F34）
  if (!emp) redirect('/a');

  const sp = await searchParams;
  const today = workDate(new Date());
  const month = sp.month && isYm(sp.month) ? sp.month : today.slice(0, 7);
  const { days } = await monthData(emp.org_id, emp.id, month);
  const byDate = new Map(days.map((d) => [d.date, d]));

  const [y, m] = month.split('-').map(Number);
  const sel = sp.d && byDate.has(sp.d) ? byDate.get(sp.d)! : null;
  const abnormal = [...byDate.values()].filter((d) => d.abnormal).length;
  const thisMonth = today.slice(0, 7);
  const alert = month === thisMonth ? abnormal : (await monthData(emp.org_id, emp.id, thisMonth)).days.filter((d) => d.abnormal).length;

  return (
    <AttendShell emp={emp} current="records" loc={loc} tt={tt} back={`/a/records?month=${month}`} {...sd} alert={alert}>
      <div className="mb-3 flex items-center justify-between">
        <a className="btn px-3 py-1 text-sm" href={`/a/records?month=${shiftMonth(month, -1)}`}>←</a>
        <h1>{tt('MONTH_TITLE', { y, m })}</h1>
        <a className="btn px-3 py-1 text-sm" href={`/a/records?month=${shiftMonth(month, 1)}`}>→</a>
      </div>

      <MonthGrid
        ym={month}
        weekLabels={WEEK_KEYS.map((k) => tt(k))}
        cell={(iso, day) => {
          const st = byDate.get(iso);
          // 有狀態＝過去日或今天（monthStatuses 只產出到今天）→ 可點看明細；
          // 未來日渲染成 div，不再是「長得像連結卻按不動」的 <a>
          if (!st) return <div className="grid h-10 place-items-center text-sm text-gray-300">{day}</div>;
          return (
            <a
              href={`/a/records?month=${month}&d=${iso}`}
              className={`grid h-10 place-items-center rounded text-sm ${dayCellClass(st.status)} ${
                sp.d === iso ? 'ring-2 ring-emerald-500' : ''
              }`}
            >
              {day}
            </a>
          );
        }}
      />

      {/* 圖例＋異常摘要：日格只用顏色說狀態，沒說明就得一格一格點（審查 F38）。字與顏色都從同一份來（day-tone.ts、i18n） */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
        {(['STATUS_PUNCH_NORMAL', 'STATUS_PUNCH_IN_MISSING', 'STATUS_REPAIR_PENDING'] as const).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className={`h-3 w-3 rounded-sm ${dayCellClass(k)}`} aria-hidden="true" />
            {k === 'STATUS_PUNCH_IN_MISSING' ? tt('MISS_ANY') : tt(k)}
          </span>
        ))}
      </div>
      {abnormal > 0 && (
        <a href="/a/adjust" className="mt-3 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {tt('ABNORMAL_DAYS', { n: abnormal })}
          <span>{tt('GO_ADJUST')}</span>
        </a>
      )}

      {sel && (
        <section className="card mt-4">
          <h2 className="mb-1 card-title">
            {sel.date}｜{tt(sel.status)}
          </h2>
          {sel.punches.length ? (
            <ul className="space-y-1 text-sm">
              {sel.punches.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <PunchBadge type={p.type} label={p.type === 'in' ? tt('PUNCH_IN') : tt('PUNCH_OUT')} />
                  <span>{p.time}</span>
                  {p.source === 'adjustment' && <Badge tone="neutral">{tt('ADJ_BADGE')}</Badge>}
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

    </AttendShell>
  );
}
