import { getDb } from '@/db';
import { oh } from '@/org/href';
import { holidayKinds, type RuleSet } from '@/attend/rules-store';
import { monthPay } from '@/attend/payroll';
import { shiftMonth, workDate } from '@/attend/util';
import type { Employee } from '@/attend/auth';
import { Banner } from '@/app/ui/banner';
import { Empty } from '@/app/ui/empty';

// 全公司薪資總表（2026-10 設計畫布「薪資」）：先看這個月全公司，再點進個人；一次結算、一次匯出。
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
  const pendingOf = new Set((pend ?? []).filter((p) => workDate(new Date(p.requested_at)).startsWith(month)).map((p) => p.employee_id as string));
  const rows = await Promise.all(
    employees.map(async (e) => {
      const { days, snap, result } = await monthPay(orgId, e, month, ruleSet, { hk });
      return { e, result, finalized: !!snap, pending: pendingOf.has(e.id), missing: days.filter((d) => d.abnormal).length };
    }),
  );
  const ready = rows.filter((r) => !r.pending);
  const toFinalize = ready.filter((r) => !r.finalized).length;
  const total = ready.reduce((s, r) => s + r.result.total, 0);
  const blocked = rows.filter((r) => r.pending);

  return (
    <main className="page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1>薪資</h1>
        <div className="flex items-center">
          <a className="btn min-w-11 px-2.5" aria-label="上個月" href={oh(slug, '/attend/report', { month: shiftMonth(month, -1) })}>
            ←
          </a>
          <span className="px-2 text-[15px] font-bold">
            {y} 年 {m} 月
          </span>
          <a className="btn min-w-11 px-2.5" aria-label="下個月" href={oh(slug, '/attend/report', { month: shiftMonth(month, 1) })}>
            →
          </a>
        </div>
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
          <section className="card mb-4">
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
              {ready.length} 人{blocked.length > 0 && ` · ${blocked.map((r) => r.e.display_name).join('、')}還有補卡沒審，先不算`}
            </p>
          </section>

          <ul className="card divide-y divide-gray-100 p-0">
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
                        ? '這個月有補卡等你審，審完才算得準'
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

          <div className="mt-4 grid grid-cols-[1fr_1.6fr] gap-2">
            <a className="btn" href={`/api/attend/export?org=${slug}&emp=all&month=${month}`}>
              匯出全公司
            </a>
            {toFinalize > 0 ? (
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
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-gray-600">結算後金額就固定下來；之後改薪資規則，也不會動到 {m} 月。要改單一個人，點進去「解除結算」。</p>
        </>
      )}
    </main>
  );
}
