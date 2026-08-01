import { getDb } from '@/db';
import { notFound } from 'next/navigation';
import { orgBySlug } from '@/org/orgs';
import { monthData } from '@/attend/data';
import { dayInOut } from '@/attend/abnormal';
import { isYm, shiftMonth, workDate } from '@/attend/util';
import { currentRuleSet, holidayKinds } from '@/attend/rules-store';
import { computeMonthHybrid, type HybridResult } from '@/attend/sandbox';
import type { MonthDayInput } from '@/attend/salary';
import { MonthGrid } from '@/app/ui/month-grid';
import { dayCellClass } from '@/attend/day-tone';
import { Banner } from '@/app/ui/banner';
import { oh } from '@/org/href';
import type { Employee } from '@/attend/auth';

export const dynamic = 'force-dynamic';

// 員工月曆＋薪資明細（對等舊管理員日曆＋月薪摘要＋計算細節）。
// 已結算月份讀 payroll_snapshots 快照（金額凍結）；未結算＝以最新規則即時計算。
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const DAY_TYPE_TEXT: Record<string, string> = {
  normal: '平日',
  rest_day: '休息日',
  regular_off: '例假日',
  holiday: '國定假日',
};

export default async function AttendCalendar({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ emp?: string; month?: string; err?: string; ok?: string }>;
}) {
  const { org: slug } = await params;
  const org = await orgBySlug(slug);
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
  const emp = employees.find((e) => e.id === sp.emp) ?? employees[0];

  const today = workDate(new Date());
  const month = sp.month && isYm(sp.month) ? sp.month : today.slice(0, 7);

  if (!emp) {
    return (
      <main className="mx-auto max-w-4xl p-5">
        <h1 className="mb-4 text-2xl font-bold">月曆與薪資</h1>
        <p className="text-gray-500">還沒有已啟用的員工。</p>
      </main>
    );
  }

  // 月資料 → 成對上下班 → 薪資（快照優先）
  const [{ days }, hk, ruleSet, { data: snap }] = await Promise.all([
    monthData(org.id, emp.id, month),
    holidayKinds(org.id, month),
    currentRuleSet(org.id),
    db
      .from('payroll_snapshots')
      .select('id, result, monthly_salary, finalized_at, rule_set_id')
      .eq('org_id', org.id)
      .eq('employee_id', emp.id)
      .eq('month', `${month}-01`)
      .maybeSingle(),
  ]);

  const inputs: MonthDayInput[] = days.map((d) => {
    const { inTime, outTime } = dayInOut(d);
    return { date: d.date, inTime, outTime, holidayKind: hk.get(d.date) };
  });

  const finalized = !!snap;
  const result: HybridResult = snap
    ? (snap.result as HybridResult)
    : await computeMonthHybrid(inputs, emp.monthly_salary, ruleSet.rules, ruleSet.scriptEnabled ? ruleSet.script : null);

  const byDate = new Map(days.map((d) => [d.date, d]));
  const [y, m] = month.split('-').map(Number);

  return (
    <main className="mx-auto max-w-4xl p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">月曆與薪資</h1>
        {/* 員工切換：原生 select + GET（零 client JS） */}
        <form method="get" className="ml-auto flex items-center gap-2">
          <input type="hidden" name="month" value={month} />
          <select className="input text-sm" name="emp" defaultValue={emp.id}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.display_name}
                {e.status === 'disabled' ? '（停用）' : ''}
              </option>
            ))}
          </select>
          <button className="btn px-3 py-1.5 text-sm">切換</button>
        </form>
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

      <div className="grid gap-5 md:grid-cols-[1fr_320px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <a className="btn px-3 py-1 text-sm" href={oh(slug, '/attend/calendar', { emp: emp.id, month: shiftMonth(month, -1) })}>←</a>
            <h2 className="font-bold">
              {emp.display_name}｜{y} 年 {m} 月
              {finalized && (
                <span className="ml-2 inline-flex items-center gap-1 rounded bg-gray-200 px-1.5 py-0.5 text-xs font-bold text-gray-700">
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 018 0v4" />
                  </svg>
                  已結算
                </span>
              )}
            </h2>
            <a className="btn px-3 py-1 text-sm" href={oh(slug, '/attend/calendar', { emp: emp.id, month: shiftMonth(month, 1) })}>→</a>
          </div>
          <MonthGrid
            ym={month}
            weekLabels={WEEK}
            cell={(iso, day) => {
              const st = byDate.get(iso);
              const holiday = hk.get(iso) === 'national';
              return (
                <div className={`grid h-11 place-items-center rounded text-sm ${st ? dayCellClass(st.status) : 'text-gray-400'}`}>
                  <span className={holiday ? 'font-bold text-red-600' : ''}>{day}</span>
                </div>
              );
            }}
          />

          {/* 每日計算明細（對等舊「計算細節」展開區塊） */}
          <details className="mt-4 text-sm" open={!!result.days.length}>
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
        </section>

        {/* 月薪摘要（對等舊月薪摘要區塊） */}
        <aside className="card h-fit text-sm">
          <h3 className="mb-2 font-bold text-gray-700">本月薪資摘要</h3>
          <dl className="space-y-1">
            <div className="flex justify-between"><dt className="text-gray-500">月薪</dt><dd>{result.base.toFixed(2)} NTD</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">等效時薪</dt><dd>{result.hourlyRate.toFixed(2)} NTD/h</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">加班／假日加給</dt><dd>+{result.extra.toFixed(2)} NTD</dd></div>
            <div className="flex justify-between border-t border-gray-200 pt-1 font-bold"><dt>本月總薪資</dt><dd>{result.total.toFixed(2)} NTD</dd></div>
            <div className="flex justify-between pt-2"><dt className="text-gray-500">正常工時</dt><dd>{result.totals.normalHours} h</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">加班工時</dt><dd>{result.totals.overtimeHours} h</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">總淨工時</dt><dd>{result.totals.netHours} h</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">休息時數</dt><dd>{result.totals.restHours} h</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">總時數</dt><dd>{result.totals.grossHours} h</dd></div>
          </dl>

          <form action="/api/attend/finalize" method="post" className="mt-3 border-t border-gray-200 pt-3">
            <input type="hidden" name="org" value={slug} />
            <input type="hidden" name="emp" value={emp.id} />
            <input type="hidden" name="month" value={month} />
            {finalized ? (
              <>
                <button className="btn w-full" name="action" value="unfinalize">解除結算（回到即時計算）</button>
                <p className="mt-1 text-xs text-gray-400">結算於 {new Date((snap as { finalized_at: string }).finalized_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}</p>
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
