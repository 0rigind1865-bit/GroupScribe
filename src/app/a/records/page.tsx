import { redirect } from 'next/navigation';
import { dbConfigured, getDb } from '@/db';
import { liffId, liffUser } from '@/core/liff';
import { myEmployees } from '@/attend/auth';
import { monthData } from '@/attend/data';
import { isYm, shiftMonth, taipeiHm, workDate } from '@/attend/util';
import { locale, t, type MsgKey } from '@/attend/i18n';
import { MonthGrid } from '@/app/ui/month-grid';
import { dayCellClass, dayTone } from '@/attend/day-tone';
import { Badge } from '@/app/ui/badge';
import { AttendLiffBoot, AttendShell } from '../shell';
import { shellData } from '../shell-data';

export const dynamic = 'force-dynamic';

// 我的月曆與打卡明細（設計畫布 StaffRecords）：標題列「紀錄 ‹ 10 月 ›」、日格顏色 = 每日狀態＋圖例、
// 點哪天（?d=，預設今天）下面就列那天的打卡與補卡狀態。月曆元件與日格配色跟管理端同一份（month-grid、day-tone）。
const WEEK_KEYS: MsgKey[] = ['WEEK_SUN', 'WEEK_MON', 'WEEK_TUE', 'WEEK_WED', 'WEEK_THU', 'WEEK_FRI', 'WEEK_SAT'];
const Chevron = ({ d }: { d: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d={d} />
  </svg>
);

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
  const thisMonth = today.slice(0, 7);
  const month = sp.month && isYm(sp.month) ? sp.month : thisMonth;
  const { days } = await monthData(emp.org_id, emp.id, month);
  const byDate = new Map(days.map((d) => [d.date, d]));

  const selDate = sp.d ?? today;
  const sel = byDate.get(selDate) ?? null;
  const alert = month === thisMonth ? days.filter((d) => d.abnormal).length : (await monthData(emp.org_id, emp.id, thisMonth)).days.filter((d) => d.abnormal).length;
  // 審核中的補卡還沒落地成打卡（只在 adjustment_requests）：點到那天才查，列在明細裡
  const pending =
    sel?.status === 'STATUS_REPAIR_PENDING'
      ? (
          ((
            await getDb()
              .from('adjustment_requests')
              .select('type, requested_at')
              .eq('org_id', emp.org_id)
              .eq('employee_id', emp.id)
              .eq('status', 'pending')
          ).data ?? []) as { type: 'in' | 'out'; requested_at: string }[]
        ).filter((r) => workDate(new Date(r.requested_at)) === sel.date)
      : [];

  // 「10 月」：跨年才帶年份；‹ › 的讀屏名稱就用目標月份，不另開字串
  const monthName = (ym: string) =>
    new Date(`${ym}-15T00:00:00Z`).toLocaleDateString(loc, { timeZone: 'UTC', month: 'long', year: ym.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' });
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const missIn = sel ? !sel.punches.some((p) => p.type === 'in') : false;

  return (
    <AttendShell
      emp={emp}
      current="records"
      loc={loc}
      tt={tt}
      back={`/a/records?month=${month}`}
      {...sd}
      alert={alert}
      title={tt('TAB_RECORDS')}
      aside={
        <span className="flex items-center">
          <a href={`/a/records?month=${prev}`} aria-label={monthName(prev)} className="grid h-11 w-11 place-items-center rounded-xl text-gray-700">
            <Chevron d="M15 6l-6 6 6 6" />
          </a>
          <span className="text-[15px] font-bold">{monthName(month)}</span>
          {/* 未來的月份沒有紀錄：這個月就是最後一頁，箭頭變淡、按不動 */}
          {month < thisMonth ? (
            <a href={`/a/records?month=${next}`} aria-label={monthName(next)} className="grid h-11 w-11 place-items-center rounded-xl text-gray-700">
              <Chevron d="M9 6l6 6-6 6" />
            </a>
          ) : (
            <span className="grid h-11 w-11 place-items-center text-gray-300">
              <Chevron d="M9 6l6 6-6 6" />
            </span>
          )}
        </span>
      }
    >
      <section className="card px-2.5 py-3" aria-label={monthName(month)}>
        <MonthGrid
          ym={month}
          weekLabels={WEEK_KEYS.map((k) => tt(k))}
          cell={(iso, day) => {
            const st = byDate.get(iso);
            // 有狀態＝過去日或今天（monthStatuses 只產出到今天）→ 可點看明細；
            // 未來日渲染成 div，不再是「長得像連結卻按不動」的 <a>
            if (!st) return <div className="grid h-11 place-items-center text-sm text-gray-300">{day}</div>;
            // 今天＝綠框（圖例「今天」）；還在進行中就白底綠字，不疊 day-tone 的灰環
            const tone = iso === today && st.status === 'STATUS_TODAY_OPEN' ? 'bg-white text-emerald-700' : dayCellClass(st.status);
            return (
              <a
                href={`/a/records?month=${month}&d=${iso}`}
                aria-current={iso === selDate ? 'date' : undefined}
                className={`grid h-11 place-items-center rounded-[10px] text-sm font-bold ${tone} ${iso === today ? 'border-2 border-emerald-600' : ''} ${
                  iso === selDate ? 'ring-2 ring-current' : ''
                }`}
              >
                {day}
              </a>
            );
          }}
        />

        {/* 圖例：日格只用顏色說狀態，沒說明就得一格一格點（審查 F38）。字與顏色都從同一份來（day-tone.ts、i18n） */}
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs text-gray-700">
          {(['STATUS_PUNCH_NORMAL', 'STATUS_REPAIR_PENDING', 'STATUS_PUNCH_IN_MISSING'] as const).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`h-3 w-3 rounded-[3px] ${dayCellClass(k)}`} aria-hidden="true" />
              {k === 'STATUS_PUNCH_IN_MISSING' ? tt('MISS_ANY') : tt(k)}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-[3px] border-2 border-emerald-600" aria-hidden="true" />
            {tt('TODAY')}
          </span>
        </div>
      </section>

      {sel && (
        <section className="card mt-3 flex flex-col gap-2 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold">
              {new Date(`${sel.date}T12:00:00+08:00`).toLocaleDateString(loc, { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', weekday: 'short' })}
            </h2>
            <Badge tone={dayTone(sel.status)}>{tt(sel.status)}</Badge>
          </div>
          {sel.punches.map((p, i) => (
            <div key={i} className="flex justify-between gap-3 text-sm">
              <span className="flex flex-none items-center gap-1.5">
                {p.type === 'in' ? tt('PUNCH_IN') : tt('PUNCH_OUT')}
                {p.source === 'adjustment' && <Badge>{tt('ADJ_BADGE')}</Badge>}
              </span>
              <span className="truncate tabular-nums">
                {p.time}
                {p.locationName && ` · ${p.locationName}`}
              </span>
            </div>
          ))}
          {pending.map((r, i) => (
            <div key={`p${i}`} className="flex justify-between gap-3 text-sm text-amber-900">
              <span className="flex flex-none items-center gap-1.5">
                {r.type === 'in' ? tt('PUNCH_IN') : tt('PUNCH_OUT')}
                <Badge tone="warn">{tt('ADJ_BADGE')}</Badge>
              </span>
              <span className="truncate tabular-nums">
                {taipeiHm(new Date(r.requested_at))} · {tt('REQ_PENDING')}
              </span>
            </div>
          ))}
          {!sel.punches.length && !pending.length && <p className="text-sm text-gray-500">{tt('DAY_NO_RECORDS')}</p>}
          {sel.abnormal && (
            <a href={`/a/adjust?d=${sel.date}&t=${missIn ? 'in' : 'out'}`} className="self-start text-sm font-bold text-emerald-700 underline">
              {tt('GO_ADJUST')}
            </a>
          )}
        </section>
      )}
    </AttendShell>
  );
}
