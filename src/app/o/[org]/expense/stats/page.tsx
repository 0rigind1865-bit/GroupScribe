import { notFound } from 'next/navigation';
import { dbConfigured, getDb } from '@/db';
import { requireModule } from '@/org/orgs';
import { oh } from '@/org/href';
import { Banner } from '@/app/ui/banner';
import { Empty } from '@/app/ui/empty';
import { expenseQuery, isMonth, sumBy, type ExpenseRow } from '@/expense/query';
import { isSubmitted } from '@/expense/items';
import { orgProjects } from '@/expense/categories';
import { SetupNotice } from '../../(admin)/setup-notice';
import { FilterPill } from '../controls';

export const dynamic = 'force-dynamic';

// 報帳統計（2026-10 設計畫布「報帳 · 統計」：合併原本的「加總」和「統計」，舊網址 /report 轉來這裡）。
// 一排期間籤＋一顆專案膠囊，點了就換網址生效；「其中還沒核銷」放最上面，點了直接去收據頁處理；
// 花在哪＝分類長條；依專案／人／付款用一個切換看；匯出 CSV（Excel 打得開）。長條只用 CSS 寬度，不裝圖表套件。
const fmt = (n: number) => n.toLocaleString('en-US');
const BY: Record<string, [string, (r: ExpenseRow) => string]> = {
  project: ['專案', (r) => r.project],
  person: ['人', (r) => r.person_name ?? ''],
  pay: ['付款', (r) => r.pay_method ?? '代墊'],
};
// 期間籤：選中的反白（同手機的群組籤）
const chip = (on: boolean) =>
  `flex min-h-10 flex-none items-center rounded-full border px-3.5 text-[13px] font-bold ${on ? 'border-transparent bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700'}`;

export default async function ExpenseStats({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ period?: string; project?: string; by?: string }>;
}) {
  if (!dbConfigured()) return <SetupNotice />;
  const { org: slug } = await params;
  const { org } = await requireModule(slug, 'expense');
  if (!org) notFound();
  const sp = await searchParams;

  // 期間：YYYY-MM（某個月）／year（今年）／all（全部）；沒給＝這個月
  const cur = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Taipei' }).slice(0, 7);
  const [y, m] = cur.split('-').map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const period = sp.period === 'year' || sp.period === 'all' || isMonth(sp.period) ? sp.period : cur;
  const mLabel = (p: string) => (p === cur ? '這個月' : p.startsWith(String(y)) ? `${Number(p.slice(5))} 月` : `${p.slice(0, 4)} 年 ${Number(p.slice(5))} 月`);
  const label = period === 'year' ? '今年' : period === 'all' ? '全部' : mLabel(period);
  const project = sp.project ?? '';
  const by = sp.by && Object.hasOwn(BY, sp.by) ? sp.by : 'project';
  const month = isMonth(period) ? period : undefined;
  const year = period === 'year' ? String(y) : undefined;

  const [{ data, error }, projects] = await Promise.all([
    expenseQuery(getDb(), org.id, { status: 'all', project: project || undefined, month, year }),
    orgProjects(org.id),
  ]);
  if (error)
    return (
      <main className="page">
        <h1 className="mb-3">統計</h1>
        <Banner tone="warn">
          報帳資料表還沒建立：請在 Supabase SQL Editor 執行 <code>supabase/migrations/022_expenses.sql</code>。
        </Banner>
      </main>
    );
  const rows = (data ?? []) as unknown as ExpenseRow[];
  const total = rows.reduce((n, r) => n + r.amount, 0);
  // 還沒核銷＝員工申請過、公司還沒核銷（同收據頁的「還沒核銷」）
  const open = rows.filter((r) => !r.reimbursed_at && isSubmitted(r)).reduce((n, r) => n + r.amount, 0);
  const here = (q: { period?: string; project?: string; by?: string }) =>
    oh(slug, '/expense/stats', { period: period === cur ? undefined : period, project: project || undefined, by: by === 'project' ? undefined : by, ...q });
  const periods: [string, string][] = [
    [cur, '這個月'],
    [prev, mLabel(prev)],
    // 舊網址帶來的其他月份：多一顆籤標出來
    ...(month && month !== cur && month !== prev ? [[month, mLabel(month)] as [string, string]] : []),
    ['year', '今年'],
    ['all', '全部'],
  ];
  const qs = new URLSearchParams({ org: slug, status: 'all', ...(project ? { project } : {}), ...(month ? { month } : {}), ...(year ? { year } : {}) });

  return (
    <main className="page">
      <h1 className="mb-3">統計</h1>
      <div className="mb-3.5 flex flex-wrap gap-2">
        {periods.map(([p, l]) => (
          <a key={p} href={here({ period: p === cur ? undefined : p })} aria-current={p === period ? 'page' : undefined} className={chip(p === period)}>
            {l}
          </a>
        ))}
        <FilterPill
          label={project || '所有專案'}
          options={['', ...projects].map((p) => ({ href: here({ project: p || undefined }), label: p || '所有專案', on: p === project }))}
        />
      </div>

      {!rows.length ? (
        <Empty variant="filtered" title="這段期間沒有報帳，換個期間或專案看看" />
      ) : (
        <div className="space-y-3">
          <section className="card space-y-2.5">
            <div>
              <p className="text-[13px] font-bold text-gray-600">
                {label}合計{project ? ` · ${project}` : ''} · {rows.length} 筆
              </p>
              <p className="text-[34px] leading-tight font-black tabular-nums" style={{ fontFamily: 'var(--font-title)' }}>
                NT$ {fmt(total)}
              </p>
            </div>
            {open > 0 && (
              <a
                href={oh(slug, '/expense', { project: project || undefined, month })}
                className="flex min-h-11 items-center justify-between rounded-xl bg-amber-50 px-3 text-sm font-extrabold text-amber-900"
              >
                <span>其中還沒核銷 NT$ {fmt(open)}</span>
                <span>去處理 →</span>
              </a>
            )}
          </section>

          <section className="card">
            <h2 className="mb-3 card-title">花在哪</h2>
            <ul className="space-y-3 text-sm">
              {sumBy(rows, (r) => r.category).map(([k, amt]) => {
                const pct = total ? Math.round((amt / total) * 100) : 0;
                return (
                  <li key={k}>
                    <div className="flex justify-between gap-3">
                      <span className="truncate">{k}</span>
                      <span className="tabular-nums">
                        {fmt(amt)} <span className="text-gray-600">· {pct}%</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 rounded bg-gray-100">
                      <div className="bar-grow-x h-2 rounded bg-emerald-600" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-1.5">
              <h2 className="card-title">依{BY[by][0]}</h2>
              <nav className="segmented" aria-label="分組方式">
                {Object.entries(BY).map(([k, [l]]) => (
                  <a key={k} href={here({ by: k === 'project' ? undefined : k })} aria-current={k === by ? 'page' : undefined}>
                    {l}
                  </a>
                ))}
              </nav>
            </div>
            <ul className="text-sm">
              {sumBy(rows, BY[by][1]).map(([k, amt]) => (
                <li key={k} className="flex min-h-11 items-center justify-between gap-3 border-t border-gray-100 px-4">
                  <span className="truncate">{k}</span>
                  <span className="flex-none font-bold tabular-nums">{fmt(amt)}</span>
                </li>
              ))}
            </ul>
          </section>

          <a className="btn w-full" href={`/api/expense/export?${qs}`}>
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
            </svg>
            匯出{/^\d/.test(label) ? ' ' : ''}
            {label}（Excel 打得開）
          </a>
        </div>
      )}
    </main>
  );
}
