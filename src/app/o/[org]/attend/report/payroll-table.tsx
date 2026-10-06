import { getDb } from '@/db';
import { oh } from '@/org/href';
import { holidayKinds, type RuleSet } from '@/attend/rules-store';
import { monthPay } from '@/attend/payroll';
import { shiftMonth, workDate } from '@/attend/util';
import type { Employee } from '@/attend/auth';
import { Banner } from '@/app/ui/banner';
import { Empty } from '@/app/ui/empty';
import { MonthNav } from './month-nav';

// 全公司薪資總表（2026-10 設計畫布「薪資」；電腦版照 AttendDesktop 改成一張表）：先看這個月全公司，再點進個人；一次結算、一次匯出。
// 還有補卡沒審的人單獨標出來、直接連去審——審完工時才準，也不會被一起結算（finalize 的 emp=all 會跳過）。
// ponytail: 逐人計算（每人兩個查詢＋規則運算），小團隊夠用；上百人再改成一次撈全公司打卡

const money = (n: number) => Math.round(n).toLocaleString('en-US');

export async function PayrollTable({
  slug,
  orgId,
  employees,
  month,
  ruleSet,
  sp,
}: {
  slug: string;
  orgId: string;
  employees: Employee[];
  month: string;
  ruleSet: RuleSet;
  sp: { ok?: string; err?: string; n?: string; skip?: string };
}) {
  const [y, m] = month.split('-').map(Number);
  const [hk, { data: pend }] = await Promise.all([
    holidayKinds(orgId, month),
    getDb().from('adjustment_requests').select('employee_id, requested_at').eq('org_id', orgId).eq('status', 'pending'),
  ]);
  // 誰有補卡沒審、是哪幾天（列上寫「9/30 有補卡等你審」，不只說「有」）
  const pendingOf = new Map<string, string[]>();
  for (const p of pend ?? []) {
    const d = workDate(new Date(p.requested_at));
    if (d.startsWith(month)) pendingOf.set(p.employee_id, [...(pendingOf.get(p.employee_id) ?? []), `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`]);
  }
  const rows = await Promise.all(
    employees.map(async (e) => {
      const { days, snap, result } = await monthPay(orgId, e, month, ruleSet, { hk });
      return { e, result, finalized: !!snap, pending: pendingOf.get(e.id), missing: days.filter((d) => d.abnormal).length };
    }),
  );
  const ready = rows.filter((r) => !r.pending);
  const toFinalize = ready.filter((r) => !r.finalized).length;
  const total = ready.reduce((s, r) => s + r.result.total, 0);
  const blocked = rows.filter((r) => r.pending);
  const blockedN = blocked.reduce((s, r) => s + r.pending!.length, 0);
  const extra = ready.reduce((s, r) => s + r.result.extra, 0);
  const prev = oh(slug, '/attend/report', { month: shiftMonth(month, -1) });
  const next = oh(slug, '/attend/report', { month: shiftMonth(month, 1) });

  // 匯出＋結算：手機在清單下面、電腦在標題列右邊（設計稿 AttendPayroll／AttendDesktop），同一組元素兩處用
  const exportBtn = (
    <a className="btn" href={`/api/attend/export?org=${slug}&emp=all&month=${month}`}>
      匯出全公司
    </a>
  );
  const finalizeBtn =
    toFinalize > 0 ? (
      <form action="/api/attend/finalize" method="post">
        <input type="hidden" name="org" value={slug} />
        <input type="hidden" name="emp" value="all" />
        <input type="hidden" name="month" value={month} />
        <button className="btn-primary w-full" name="action" value="finalize">
          結算 {m} 月（{toFinalize} 人）
        </button>
      </form>
    ) : (
      <span className="btn pointer-events-none opacity-60">這個月都結算了</span>
    );
  const pendingText = (dates: string[]) => `${dates.join('、')} 有補卡等你審，審完才算得出來`;

  return (
    <main className="page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 md:mb-5">
        <div className="flex items-center gap-3">
          <h1>薪資</h1>
          <div className="hidden md:block">
            <MonthNav boxed prev={prev} next={next} label={`${y} 年 ${m} 月`} />
          </div>
        </div>
        <div className="md:hidden">
          <MonthNav prev={prev} next={next} label={`${y} 年 ${m} 月`} />
        </div>
        {rows.length > 0 && (
          <div className="hidden gap-2.5 md:flex">
            {exportBtn}
            {finalizeBtn}
          </div>
        )}
      </div>

      {sp.ok === 'finalized_all' && (
        <Banner>
          已結算 {sp.n ?? 0} 人，金額已固定 ✓{Number(sp.skip) > 0 && `（${sp.skip} 人有補卡還沒審，先跳過）`}
        </Banner>
      )}
      {sp.err === 'ERR_FINALIZE' && <Banner tone="err">結算失敗，請重試。</Banner>}

      {!rows.length ? (
        <Empty title="還沒有已啟用的員工" hint="員工用加入碼申請後，到「員工」分頁啟用，這裡就會出現他的薪資。" />
      ) : (
        <>
          {/* ── 手機：合計卡＋一人一列 ── */}
          <section className="card mb-4 md:hidden">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-600">{m} 月薪資合計</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${toFinalize ? 'bg-gray-100 text-gray-700' : 'bg-emerald-100 text-emerald-900'}`}>
                {toFinalize ? '還沒結算' : '都結算了'}
              </span>
            </div>
            <p className="mt-1 text-3xl font-black tabular-nums" style={{ fontFamily: 'var(--font-title)' }}>
              NT$ {money(total)}
            </p>
            <p className="mt-0.5 text-sm text-gray-600">
              {ready.length} 人{blocked.length > 0 && ` · ${blocked.map((r) => r.e.display_name).join('、')}還有 ${blockedN} 筆補卡沒審，先不算`}
            </p>
          </section>

          <ul className="card divide-y divide-gray-100 p-0 md:hidden">
            {rows.map(({ e, result, finalized, pending, missing }) => (
              <li key={e.id}>
                <a
                  href={pending ? oh(slug, '/attend/reviews') : oh(slug, '/attend/report', { emp: e.id, month })}
                  className={`flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-gray-50 ${pending ? 'bg-amber-50' : ''}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold">
                      {e.display_name} <span className="text-xs font-normal text-gray-600">{e.dept ?? ''}</span>
                    </span>
                    <span className={`block text-xs ${pending ? 'text-amber-800' : 'text-gray-600'}`}>
                      {pending
                        ? pendingText(pending)
                        : `工時 ${result.totals.netHours}h · ${result.totals.overtimeHours > 0 ? `加班 ${result.totals.overtimeHours}h` : '沒有加班'}${missing ? ` · 缺卡 ${missing} 天` : ''}`}
                    </span>
                  </span>
                  {pending ? (
                    <span className="flex-none rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">去審 →</span>
                  ) : (
                    <span className="flex-none text-right">
                      <span className="block text-base font-black tabular-nums">{money(result.total)}</span>
                      {finalized && <span className="block text-[11px] font-bold text-emerald-700">已結算</span>}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-4 grid grid-cols-[1fr_1.6fr] gap-2 md:hidden">
            {exportBtn}
            {finalizeBtn}
          </div>

          {/* ── 電腦（md 以上）：三張數字卡＋一張表看全公司（設計稿 AttendDesktop）；卡住的人直接連去審 ── */}
          <div className="mb-5 hidden grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 md:grid">
            <div className="card">
              <div className="text-[13px] font-bold text-gray-600">{m} 月薪資合計</div>
              <div className="text-3xl font-black tabular-nums" style={{ fontFamily: 'var(--font-title)' }}>
                NT$ {money(total)}
              </div>
            </div>
            <div className="card">
              <div className="text-[13px] font-bold text-gray-600">其中加班費</div>
              <div className="text-3xl font-black tabular-nums" style={{ fontFamily: 'var(--font-title)' }}>
                NT$ {money(extra)}
              </div>
            </div>
            {blocked.length > 0 ? (
              <a href={oh(slug, '/attend/reviews')} className="rounded-[14px] border border-amber-300 bg-amber-50 p-4 text-amber-900 hover:opacity-80">
                <div className="text-[13px] font-bold text-amber-800">還不能結算</div>
                <div className="mt-1.5 text-[17px] font-bold">
                  {blocked.map((r) => r.e.display_name).join('、')}有 {blockedN} 筆補卡沒審 →
                </div>
              </a>
            ) : (
              <div className="card">
                <div className="text-[13px] font-bold text-gray-600">結算</div>
                <div className="mt-1.5 text-[17px] font-bold">{toFinalize ? `${toFinalize} 人還沒結算` : '這個月都結算了'}</div>
              </div>
            )}
          </div>

          <div className="card hidden overflow-x-auto p-0 md:block">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-600">
                  <th className="px-4 py-3 font-bold">員工</th>
                  <th className="px-4 py-3 font-bold">部門</th>
                  <th className="px-4 py-3 text-right font-bold">正常工時</th>
                  <th className="px-4 py-3 text-right font-bold">加班</th>
                  <th className="px-4 py-3 text-right font-bold">加班費</th>
                  <th className="px-4 py-3 text-right font-bold">{m} 月薪資</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 tabular-nums">
                {rows.map(({ e, result, finalized, pending }) => (
                  <tr key={e.id} className={pending ? 'bg-amber-50' : ''}>
                    <td className="px-4 py-3.5 font-bold">
                      {pending ? e.display_name : <a className="underline-offset-2 hover:underline" href={oh(slug, '/attend/report', { emp: e.id, month })}>{e.display_name}</a>}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">{e.dept ?? ''}</td>
                    {pending ? (
                      <td colSpan={4} className="px-4 py-3.5 text-right">
                        <a className="font-bold text-amber-800" href={oh(slug, '/attend/reviews')}>
                          {pendingText(pending)} →
                        </a>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3.5 text-right">{result.totals.normalHours}h</td>
                        <td className="px-4 py-3.5 text-right">{result.totals.overtimeHours > 0 ? `${result.totals.overtimeHours}h` : '—'}</td>
                        <td className="px-4 py-3.5 text-right">{result.extra > 0 ? money(result.extra) : '—'}</td>
                        <td className="px-4 py-3.5 text-right font-black">
                          {money(result.total)}
                          {finalized && <span className="ml-1.5 text-[11px] font-bold text-emerald-700">已結算</span>}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-gray-600 md:mt-3 md:text-[13px]">結算後金額就固定下來；之後改薪資規則，也不會動到 {m} 月。要改單一個人，點進去「解除結算」。</p>
        </>
      )}
    </main>
  );
}
