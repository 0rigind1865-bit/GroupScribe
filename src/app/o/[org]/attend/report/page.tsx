import { getDb } from '@/db';
import { notFound } from 'next/navigation';
import { requireModule } from '@/org/orgs';
import { isYm, shiftMonth, workDate } from '@/attend/util';
import { currentRuleSet } from '@/attend/rules-store';
import { determineDayType } from '@/attend/salary';
import { PayrollTable } from './payroll-table';
import { MonthNav } from './month-nav';
import { monthPay } from '@/attend/payroll';
import { MonthGrid } from '@/app/ui/month-grid';
import { dayCellClass } from '@/attend/day-tone';
import { Banner } from '@/app/ui/banner';
import { TONE_TEXT, type Tone } from '@/app/ui/tone';
import { oh } from '@/org/href';
import type { Employee } from '@/attend/auth';
import type { DayStatus } from '@/attend/abnormal';

export const dynamic = 'force-dynamic';

// 一個人的月份（2026-10 設計畫布「一個人的月份」）：工時／加班／薪資三格 → 月曆（附圖例、每一格都能點）
// → 點哪天下面就說那天怎麼算（?d=）→ 這個月薪資怎麼加出來的。月曆跟員工端「紀錄」同一套 MonthGrid＋day-tone。
// 已結算月份讀 payroll_snapshots 快照（金額凍結）；未結算＝以最新規則即時計算。
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const DAY_TYPE_TEXT: Record<string, string> = {
  normal: '平日',
  rest_day: '休息日',
  regular_off: '例假日',
  holiday: '國定假日',
};
const money = (n: number) => Math.round(n).toLocaleString('en-US');

export default async function AttendCalendar({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ emp?: string; month?: string; d?: string; err?: string; ok?: string; n?: string; skip?: string }>;
}) {
  const { org: slug } = await params;
  const { org } = await requireModule(slug, 'attend');
  if (!org) notFound();
  const sp = await searchParams;
  const db = getDb();

  const { data: emps } = await db
    .from('employees')
    .select('*')
    .eq('org_id', org.id)
    .neq('status', 'pending')
    .order('display_name');
  const employees = (emps ?? []) as Employee[];
  const emp = employees.find((e) => e.id === sp.emp);

  const today = workDate(new Date());
  const month = sp.month && isYm(sp.month) ? sp.month : today.slice(0, 7);
  const ruleSet = await currentRuleSet(org.id);

  // 沒帶 ?emp（從底部「薪資」點進來）：全公司這個月的薪資總表，點一個人再看他的月曆與明細（2026-10 設計畫布「薪資」）。
  // 原本會直接跳到第一位員工，月底發薪得一個人一個人點、一個人一個人結算與匯出
  if (!emp) return <PayrollTable slug={slug} orgId={org.id} employees={employees.filter((e) => e.status === 'active')} month={month} ruleSet={ruleSet} sp={sp} />;

  // 月資料 → 成對上下班 → 薪資（快照優先）
  const { days, hk, snap, result } = await monthPay(org.id, emp, month, ruleSet);
  const finalized = !!snap;

  const byDate = new Map(days.map((d) => [d.date, d]));
  const calcByDate = new Map(result.days.map((d) => [d.date, d]));
  const [y, m] = month.split('-').map(Number);
  const here = (q: Record<string, string>) => oh(slug, '/attend/report', { emp: emp.id, month, ...q });

  // 選中的那天：?d= 優先，沒帶就是今天（看的是這個月時）
  const sel = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) && sp.d.startsWith(month) ? sp.d : today.startsWith(month) ? today : null;
  const holName =
    sel && hk.get(sel) === 'national'
      ? ((await db.from('holidays').select('name').eq('org_id', org.id).eq('day', sel).maybeSingle()).data?.name as string | null) || '國定假日'
      : '';
  /** 那天怎麼算：打了哪幾張卡 → 缺什麼／等審 → 工時與加給 */
  function dayStory(iso: string) {
    const st = byDate.get(iso);
    const calc = calcByDate.get(iso);
    const [, mm, dd] = iso.split('-').map(Number);
    const type = determineDayType(iso, hk.get(iso), ruleSet.rules);
    const off = type === 'normal' ? '' : type === 'holiday' ? '國定假日，放假' : `${DAY_TYPE_TEXT[type]}，沒排班`;
    const line = !st
      ? off || '還沒到這一天'
      : st.punches.length
        ? st.punches.map((p) => `${p.time} ${p.type === 'in' ? '上班' : '下班'}${p.source === 'adjustment' ? '（補卡）' : ''}`).join(' → ')
        : off || '沒有打卡';
    const NOTE: Partial<Record<DayStatus['status'], [string, Tone]>> = {
      STATUS_PUNCH_IN_MISSING: ['少一張上班卡', 'err'],
      STATUS_PUNCH_OUT_MISSING: ['少一張下班卡', 'err'],
      STATUS_REPAIR_PENDING: ['有補卡等你審', 'warn'],
      STATUS_TODAY_OPEN: ['還在班上', 'neutral'],
    };
    const note = st ? NOTE[st.status] : undefined;
    const sub = calc
      ? `${calc.dayType === 'normal' ? '' : `${DAY_TYPE_TEXT[calc.dayType]}上班 · `}休息扣 ${calc.restHours} 小時 · 淨 ${calc.netHours} 小時` +
        (calc.overtimeHours > 0 ? `，其中加班 ${calc.overtimeHours} 小時` : '') +
        (calc.pay > 0 ? `（+NT$ ${money(calc.pay)}）` : '')
      : '';
    return { title: `${mm}/${dd}（週${WEEK[new Date(`${iso}T00:00:00Z`).getUTCDay()]}）${holName ? ` ${holName}` : ''}`, line, note, sub, calc };
  }
  const story = sel ? dayStory(sel) : null;

  return (
    <main className="page">
      <a className="mb-1 -ml-1 inline-flex min-h-11 items-center gap-0.5 text-[15px] font-bold" href={oh(slug, '/attend/report', { month })}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        薪資
      </a>
      <div className="mb-4 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate">{emp.display_name}</h1>
          <p className="text-[13px] text-gray-600">
            {[emp.dept, `月薪 ${money(Number(emp.monthly_salary))}`].filter(Boolean).join(' · ')} ·{' '}
            {/* 月薪、部門、管理權在員工頁的抽屜裡改（員工清單點人是到這一頁） */}
            <a className="font-bold text-emerald-700 underline" href={oh(slug, '/attend/employees', { emp: emp.id })}>
              改資料
            </a>
          </p>
        </div>
        <MonthNav
          prev={oh(slug, '/attend/report', { emp: emp.id, month: shiftMonth(month, -1) })}
          next={oh(slug, '/attend/report', { emp: emp.id, month: shiftMonth(month, 1) })}
          label={y === Number(today.slice(0, 4)) ? `${m} 月` : `${y} 年 ${m} 月`}
        />
      </div>

      {sp.err === 'ERR_FINALIZE' && <Banner tone="err">結算失敗，請重試。</Banner>}
      {sp.ok === 'finalized' && <Banner>本月已結算，金額已凍結 ✓</Banner>}
      {sp.ok === 'unfinalized' && <Banner tone="warn">已解除結算，回到即時計算。</Banner>}

      {result.scriptErrors?.length > 0 && (
        <div className="mb-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-bold">⚠ 自訂腳本在 {result.scriptErrors.length} 天計算失敗，已回退預設規則：</p>
          <ul className="ml-4 list-disc">
            {result.scriptErrors.slice(0, 5).map((e) => (
              <li key={e.date}>
                {e.date}：{e.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 工時／加班／薪資：量測類，0 也是答案，不隱藏 */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        {[
          ['工時', `${result.totals.netHours}h`],
          ['加班', `${result.totals.overtimeHours}h`],
          ['薪資', money(result.total)],
        ].map(([k, v]) => (
          <div key={k} className="card px-3 py-2.5">
            <div className="text-xs text-gray-600">{k}</div>
            <div className="text-xl font-black tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_320px] md:gap-5">
        <div>
          <section className="card px-2.5 py-3" aria-label={`${m} 月出勤`}>
            <MonthGrid
              ym={month}
              weekLabels={WEEK}
              cell={(iso, day) => {
                const st = byDate.get(iso);
                const ot = (calcByDate.get(iso)?.overtimeHours ?? 0) > 0;
                const fixed = st?.punches.some((p) => p.source === 'adjustment');
                return (
                  // 每一格都能點（含沒打卡、還沒到的日子）：下面說那天怎麼算或為什麼沒算
                  <a
                    href={here({ d: iso })}
                    aria-label={`${m} 月 ${day} 日`}
                    aria-current={iso === sel ? 'date' : undefined}
                    className={`flex h-11 flex-col items-center justify-center gap-0.5 rounded-[10px] text-sm font-bold ${st ? dayCellClass(st.status) : 'text-gray-400'} ${iso === sel ? 'ring-2 ring-emerald-500' : ''}`}
                  >
                    <span className={hk.get(iso) === 'national' ? 'text-red-600' : ''}>{day}</span>
                    <span className="flex h-1.5 gap-0.5" aria-hidden="true">
                      {ot && <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />}
                      {fixed && <span className="h-1.5 w-1.5 rounded-sm bg-amber-500" />}
                    </span>
                  </a>
                );
              }}
            />
            {/* 圖例：顏色＝那天的狀態（同員工端），圓點／方塊＝那天另外發生的事 */}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-gray-700">
              {(
                [
                  ['STATUS_PUNCH_NORMAL', '正常'],
                  ['STATUS_REPAIR_PENDING', '補卡審核中'],
                  ['STATUS_PUNCH_OUT_MISSING', '缺卡'],
                ] as const
              ).map(([k, label]) => (
                <span key={k} className="flex items-center gap-1">
                  <span className={`h-3 w-3 rounded-[3px] ${dayCellClass(k)}`} aria-hidden="true" />
                  {label}
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
                有加班
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-sm bg-amber-500" aria-hidden="true" />
                補過卡
              </span>
              <span className="flex items-center gap-1">
                <span className="font-black text-red-600" aria-hidden="true">
                  10
                </span>
                國定假日
              </span>
            </div>
          </section>

          <section className="card mt-3" aria-live="polite">
            {story ? (
              <>
                <h2 className="text-[15px] font-bold">{story.title}</h2>
                <p className="mt-1.5 text-sm text-gray-700">{story.line}</p>
                {story.note && (
                  <p className={`mt-1 text-sm font-bold ${TONE_TEXT[story.note[1]]}`}>
                    {story.note[0]}
                    {story.note[1] === 'warn' && (
                      <a className="ml-2 underline" href={oh(slug, '/attend/reviews')}>
                        去審 →
                      </a>
                    )}
                  </p>
                )}
                {story.sub && <p className="mt-1 text-[13px] text-gray-600">{story.sub}</p>}
                {story.calc && story.calc.breakdown.length > 0 && (
                  <ul className="mt-1 ml-4 list-disc text-xs text-gray-500">
                    {story.calc.breakdown.map((l, j) => (
                      <li key={j}>
                        {l.label}：{l.hours}h = {l.amount.toFixed(2)}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-600">點月曆上任一天，看那天怎麼算。</p>
            )}
          </section>

          {/* 每日計算明細（對等舊「計算細節」展開區塊）：右邊「怎麼算的？」連到這裡 */}
          <details id="days" className="mt-4 text-sm" open={!!result.days.length}>
            <summary className="cursor-pointer font-bold text-gray-700">每日計算明細（{result.days.length} 天有成對打卡）</summary>
            <div className="mt-2 space-y-2">
              {result.days.map((d) => (
                <div key={d.date} className="card text-sm">
                  <p className="font-bold">
                    {d.date}（{DAY_TYPE_TEXT[d.dayType]}）{d.inTime}–{d.outTime}
                    <span className="ml-2 font-normal text-gray-500">
                      淨 {d.netHours}h｜休息扣除 {d.restHours}h
                    </span>
                    <span className="float-right font-bold">+{d.pay.toFixed(2)}</span>
                  </p>
                  {d.breakdown.length > 0 && (
                    <ul className="mt-1 ml-4 list-disc text-xs text-gray-500">
                      {d.breakdown.map((l, j) => (
                        <li key={j}>
                          {l.label}：{l.hours}h = {l.amount.toFixed(2)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {!result.days.length && <p className="text-gray-500">本月沒有成對的上下班紀錄。</p>}
            </div>
          </details>
        </div>

        {/* 這個月薪資怎麼加出來的（設計稿：月薪＋加班費＝薪資） */}
        <aside className="card h-fit text-sm">
          <dl className="space-y-2">
            <div className="flex justify-between">
              <dt className="text-gray-600">月薪</dt>
              <dd className="tabular-nums">{money(result.base)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">加班費（{result.totals.overtimeHours} 小時）</dt>
              <dd className="tabular-nums">+{money(result.extra)}</dd>
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-black">
              <dt>{m} 月薪資</dt>
              <dd className="tabular-nums">NT$ {money(result.total)}</dd>
            </div>
          </dl>
          <p className="mt-1 text-xs text-gray-500">
            時薪＝月薪 ÷ {ruleSet.rules.baseDivisor}＝{result.hourlyRate.toFixed(2)}
          </p>
          {result.days.length > 0 && (
            <a className="mt-1 inline-flex min-h-10 items-center text-[13px] font-bold text-emerald-700" href="#days">
              怎麼算的？看每天明細 →
            </a>
          )}

          <form action="/api/attend/finalize" method="post" className="mt-3 border-t border-gray-200 pt-3">
            <input type="hidden" name="org" value={slug} />
            <input type="hidden" name="emp" value={emp.id} />
            <input type="hidden" name="month" value={month} />
            {finalized ? (
              <>
                <button className="btn w-full" name="action" value="unfinalize">解除結算（回到即時計算）</button>
                <p className="mt-1 text-xs text-gray-400">結算於 {new Date(snap!.finalized_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}</p>
              </>
            ) : (
              <>
                <button className="btn-primary w-full" name="action" value="finalize">結算本月（凍結金額）</button>
                <p className="mt-1 text-xs text-gray-400">結算後改規則不影響本月；匯出以結算值為準。</p>
              </>
            )}
          </form>

          <p className="mt-2 text-xs text-gray-400">
            規則版本：v{ruleSet.version}
            {ruleSet.scriptEnabled && '（含自訂腳本）'}｜
            <a className="underline" href={oh(slug, '/attend/rules')}>編輯規則</a>
          </p>
          <a className="mt-2 inline-block text-xs text-emerald-700 underline" href={`/api/attend/export?org=${slug}&emp=${emp.id}&month=${month}`}>
            匯出 CSV ↓
          </a>
        </aside>
      </div>
    </main>
  );
}
