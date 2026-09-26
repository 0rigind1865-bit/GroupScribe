import { notFound } from 'next/navigation';
import { dbConfigured, getDb } from '@/db';
import { orgBySlug } from '@/org/orgs';
import { Banner } from '@/app/ui/banner';
import { Empty } from '@/app/ui/empty';
import { StatGrid } from '@/app/ui/stat';
import { expenseQuery, sumBy, type ExpenseFilter, type ExpenseRow } from '@/expense/query';
import { SetupNotice } from '../../(admin)/setup-notice';

export const dynamic = 'force-dynamic';

// 報帳加總（X1）：選專案或月份 → 依分類、依人加總，合計，匯出 CSV（給會計）。
const money = (n: number) => `$${n.toLocaleString('en-US')}`;

function SumTable({ title, rows }: { title: string; rows: [string, number, number][] }) {
  return (
    <section className="card">
      <h2 className="mb-3 text-base font-bold">{title}</h2>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([k, amt, n]) => (
            <tr key={k} className="border-t border-gray-100 first:border-0">
              <td className="py-1.5">{k}</td>
              <td className="py-1.5 text-right text-gray-500 tabular-nums">{n} 筆</td>
              <td className="py-1.5 text-right font-medium tabular-nums">{money(amt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function ExpenseReport({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<ExpenseFilter>;
}) {
  if (!dbConfigured()) return <SetupNotice />;
  const { org: slug } = await params;
  const org = await orgBySlug(slug);
  if (!org) notFound();
  const sp = await searchParams;
  const f: ExpenseFilter = { status: sp.status ?? 'all', project: sp.project, month: sp.month };
  const db = getDb();
  const [{ data, error }, { data: all }] = await Promise.all([
    expenseQuery(db, org.id, f),
    db.from('expenses').select('project').eq('org_id', org.id).neq('project', '').limit(2000),
  ]);
  if (error)
    return (
      <main className="mx-auto max-w-3xl p-4 md:p-8">
        <h1 className="mb-3 text-3xl md:text-4xl">報帳加總</h1>
        <Banner tone="warn">
          報帳資料表還沒建立：請在 Supabase SQL Editor 執行 <code>supabase/migrations/022_expenses.sql</code>。
        </Banner>
      </main>
    );
  const rows = (data ?? []) as unknown as ExpenseRow[];
  const projects = [...new Set((all ?? []).map((r) => r.project as string))].sort();
  const total = rows.reduce((n, r) => n + r.amount, 0);
  const open = rows.filter((r) => !r.reimbursed_at).reduce((n, r) => n + r.amount, 0);
  const qs = new URLSearchParams({ org: slug, status: f.status ?? 'all', ...(f.project ? { project: f.project } : {}), ...(f.month ? { month: f.month } : {}) });

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="mb-3 text-3xl md:text-4xl">報帳加總</h1>
      <form className="mb-4 flex flex-wrap items-end gap-2 text-sm" method="get">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">專案</span>
          <select className="input h-9" name="project" defaultValue={f.project ?? ''}>
            <option value="">全部</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">月份</span>
          <input className="input h-9" type="month" name="month" defaultValue={f.month ?? ''} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">狀態</span>
          <select className="input h-9" name="status" defaultValue={f.status}>
            <option value="all">全部</option>
            <option value="open">還沒報</option>
            <option value="done">已報帳</option>
          </select>
        </label>
        <button className="btn">加總</button>
        <a className="btn ml-auto" href={`/api/expense/export?${qs}`}>
          匯出 CSV
        </a>
      </form>

      {!rows.length ? (
        <Empty variant="filtered" title="這個條件下沒有報帳" />
      ) : (
        <div className="space-y-4">
          <StatGrid
            cols={3}
            items={[
              { n: money(total), label: '合計' },
              { n: money(open), label: '還沒報', tone: open > 0 ? 'warn' : 'neutral' },
              { n: rows.length, label: '筆數' },
            ]}
          />
          {/* 代墊要請款、公司卡要核銷，流程不同所以分開看（Snaptab） */}
          <SumTable title="依付款方式" rows={sumBy(rows, (r) => r.pay_method ?? '代墊')} />
          <SumTable title="依分類" rows={sumBy(rows, (r) => r.category)} />
          <SumTable title="依人" rows={sumBy(rows, (r) => r.person_name ?? '')} />
          {!f.project && <SumTable title="依專案" rows={sumBy(rows, (r) => r.project)} />}
        </div>
      )}
    </main>
  );
}
