import { notFound } from 'next/navigation';
import { dbConfigured, getDb } from '@/db';
import { orgBySlug } from '@/org/orgs';
import { Banner } from '@/app/ui/banner';
import { Empty } from '@/app/ui/empty';
import { pivot, type ExpenseRow, type Pivot } from '@/expense/query';
import { SetupNotice } from '../../(admin)/setup-notice';

export const dynamic = 'force-dynamic';

// 報帳統計（X2-5，Snaptab AnalyticsView）：每月合計長條＋月份×分類、專案×人兩張交叉表。
// 長條只用 CSS 寬度，不裝圖表套件。
const money = (n: number) => (n ? `$${n.toLocaleString('en-US')}` : '—');

function PivotTable({ title, p }: { title: string; p: Pivot }) {
  return (
    <section className="card overflow-x-auto">
      <h2 className="mb-2 font-semibold">{title}</h2>
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="text-left text-xs text-gray-500">
            <th className="py-1 pr-3 font-medium" />
            {p.cols.map((c) => (
              <th key={c} className="py-1 pr-3 text-right font-medium">
                {c}
              </th>
            ))}
            <th className="py-1 text-right font-medium">合計</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {p.rows.map((r) => (
            <tr key={r} className="border-t border-gray-100">
              <td className="py-1.5 pr-3">{r}</td>
              {p.cols.map((c) => (
                <td key={c} className="py-1.5 pr-3 text-right text-gray-600">
                  {money(p.cell(r, c))}
                </td>
              ))}
              <td className="py-1.5 text-right font-medium">{money(p.rowTotal(r))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function ExpenseStats({ params }: { params: Promise<{ org: string }> }) {
  if (!dbConfigured()) return <SetupNotice />;
  const { org: slug } = await params;
  const org = await orgBySlug(slug);
  if (!org) notFound();
  // 近 12 個月
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)).toISOString().slice(0, 10);
  const { data, error } = await getDb()
    .from('expenses')
    .select('amount, spent_on, category, project, person_name')
    .eq('org_id', org.id)
    .gte('spent_on', since)
    .limit(5000);
  if (error)
    return (
      <main className="mx-auto max-w-3xl p-4 md:p-5">
        <h1 className="mb-3 text-2xl font-semibold tracking-tight">報帳統計</h1>
        <Banner tone="warn">
          報帳資料表還沒建立：請在 Supabase SQL Editor 執行 <code>supabase/migrations/022_expenses.sql</code>。
        </Banner>
      </main>
    );
  const rows = (data ?? []) as Pick<ExpenseRow, 'amount' | 'spent_on' | 'category' | 'project' | 'person_name'>[];
  const byMonth = pivot(rows, (r) => r.spent_on.slice(0, 7), (r) => r.category, (a, b) => b.localeCompare(a));
  const byProject = pivot(rows, (r) => r.project, (r) => r.person_name ?? '');
  const max = Math.max(1, ...byMonth.rows.map((m) => byMonth.rowTotal(m)));

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-5">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">報帳統計</h1>
      <p className="mb-4 text-sm text-gray-500">近 12 個月，含已報帳與還沒報的。</p>
      {!rows.length ? (
        <Empty title="近 12 個月沒有報帳" />
      ) : (
        <div className="space-y-4">
          <section className="card">
            <h2 className="mb-2 font-semibold">每月合計</h2>
            <ul className="space-y-1.5 text-sm">
              {byMonth.rows.map((m) => (
                <li key={m} className="flex items-center gap-2">
                  <span className="w-16 flex-none text-gray-500 tabular-nums">{m}</span>
                  <span className="h-4 flex-1 rounded bg-gray-100">
                    <span className="block h-4 rounded bg-emerald-600" style={{ width: `${(byMonth.rowTotal(m) / max) * 100}%` }} />
                  </span>
                  <span className="w-24 flex-none text-right font-medium tabular-nums">{money(byMonth.rowTotal(m))}</span>
                </li>
              ))}
            </ul>
          </section>
          <PivotTable title="月份 × 分類" p={byMonth} />
          <PivotTable title="專案 × 人" p={byProject} />
        </div>
      )}
    </main>
  );
}
