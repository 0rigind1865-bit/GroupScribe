import { notFound } from 'next/navigation';
import { dbConfigured, getDb } from '@/db';
import { orgBySlug } from '@/org/orgs';
import { Banner } from '@/app/ui/banner';
import { Empty } from '@/app/ui/empty';
import { pivot, type Pivot } from '@/expense/query';
import { rowToItem } from '@/expense/items';
import { orgCategoryItems } from '@/expense/categories';
import { AnalyticsView } from '@/app/ui/expense/analytics-view';
import { SetupNotice } from '../../(admin)/setup-notice';

export const dynamic = 'force-dynamic';

// 報帳統計（X2-5，Snaptab AnalyticsView）：每月合計長條＋月份×分類、專案×人兩張交叉表。
// 長條只用 CSS 寬度，不裝圖表套件。
const money = (n: number) => (n ? `$${n.toLocaleString('en-US')}` : '—');

function PivotTable({ title, p }: { title: string; p: Pivot }) {
  return (
    <section className="card overflow-x-auto">
      <h2 className="mb-3 card-title">{title}</h2>
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
  const [{ data, error }, cats] = await Promise.all([
    // ponytail: 一次載最近 5000 筆在瀏覽器裡算；一家公司真的超過再改成資料庫加總
    getDb().from('expenses').select('*').eq('org_id', org.id).order('spent_on', { ascending: false }).limit(5000),
    orgCategoryItems(org.id),
  ]);
  if (error)
    return (
      <main className="page">
        <h1 className="mb-3">報帳統計</h1>
        <Banner tone="warn">
          報帳資料表還沒建立：請在 Supabase SQL Editor 執行 <code>supabase/migrations/022_expenses.sql</code>。
        </Banner>
      </main>
    );
  const items = (data ?? []).map((r) => rowToItem(r));
  const byProject = pivot(items, (r) => r.project, (r) => r.person);

  return (
    <main className="page">
      <h1 className="mb-1">報帳統計</h1>
      <p className="mb-4 text-sm text-gray-500">全公司的報帳，含已報帳與還沒報的。</p>
      {!items.length ? (
        <Empty title="還沒有報帳" />
      ) : (
        <div className="space-y-4">
          <AnalyticsView items={items} icons={Object.fromEntries(cats.map((c) => [c.name, c.icon]))} />
          <PivotTable title="專案 × 人" p={byProject} />
        </div>
      )}
    </main>
  );
}
