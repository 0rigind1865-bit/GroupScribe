import { notFound } from 'next/navigation';
import { dbConfigured, getDb, MEDIA_BUCKET } from '@/db';
import { orgBySlug } from '@/org/orgs';
import { oh } from '@/org/href';
import { Banner, Flash } from '@/app/ui/banner';
import { Badge } from '@/app/ui/badge';
import { Empty } from '@/app/ui/empty';
import { StatGrid } from '@/app/ui/stat';
import { PAY_METHODS } from '@/expense/receipt';
import { orgCategories } from '@/expense/categories';
import { expenseQuery, type ExpenseFilter, type ExpenseRow } from '@/expense/query';
import { SetupNotice } from '../(admin)/setup-notice';

export const dynamic = 'force-dynamic';

// 報帳清單（X1）：員工私訊群記的收據照，AI 讀出金額後自動記一筆。
// 管理者在這裡補專案、改讀錯的金額、標「已報帳」。寫入全走 /api/expense/update（orgAdminAccess＋綁 org_id）。

const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const money = (n: number) => `$${n.toLocaleString('en-US')}`;

export default async function ExpenseList({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<ExpenseFilter & { ok?: string; err?: string }>;
}) {
  if (!dbConfigured()) return <SetupNotice />;
  const { org: slug } = await params;
  const org = await orgBySlug(slug);
  if (!org) notFound();
  const sp = await searchParams;
  const f: ExpenseFilter = { status: sp.status ?? 'open', who: sp.who, project: sp.project, month: sp.month };
  const db = getDb();

  const [{ data, error }, { data: all }, cats] = await Promise.all([
    expenseQuery(db, org.id, f),
    // 篩選下拉的選項（人、專案）要看全部，不受目前篩選影響
    db.from('expenses').select('line_user_id, person_name, project').eq('org_id', org.id).limit(2000),
    orgCategories(org.id),
  ]);
  if (error)
    return (
      <main className="mx-auto max-w-3xl p-4 md:p-5">
        <h1 className="mb-3 text-2xl font-semibold tracking-tight">報帳</h1>
        <Banner tone="warn">
          報帳資料表還沒建立：請在 Supabase SQL Editor 執行 <code>supabase/migrations/022_expenses.sql</code>。
        </Banner>
      </main>
    );
  const rows = (data ?? []) as unknown as ExpenseRow[];
  const people = new Map<string, string>();
  const projects = new Set<string>();
  for (const r of all ?? []) {
    people.set(r.line_user_id, r.person_name ?? people.get(r.line_user_id) ?? '（未命名）');
    if (r.project) projects.add(r.project);
  }

  // 收據縮圖：私有 bucket → 批次簽名 1 小時（同 core/media.ts）
  // 私訊的收據照在 media_assets；員工網頁上傳的在 photo_path（X2-1）
  const pathOf = (r: ExpenseRow) => r.photo_path ?? r.media_assets?.storage_path ?? null;
  const paths = rows.map(pathOf).filter((p): p is string => !!p);
  const { data: signed } = paths.length
    ? await db.storage.from(MEDIA_BUCKET).createSignedUrls(paths, 3600)
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const urlOf = new Map((signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path!, s.signedUrl]));

  const total = rows.reduce((n, r) => n + r.amount, 0);
  const back = oh(slug, '/expense', { status: sp.status, who: sp.who, project: sp.project, month: sp.month });

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-5">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">報帳</h1>
      <p className="mb-3 text-sm text-gray-500">員工在 LINE 私訊群記一張收據照，就會自動記在這裡。</p>
      <Flash
        sp={sp}
        dict={{
          saved: { tone: 'ok', text: '已儲存' },
          deleted: { tone: 'ok', text: '已刪除' },
          bad: { tone: 'err', text: '資料不正確，沒有儲存' },
        }}
      />

      <form className="mb-4 flex flex-wrap items-end gap-2 text-sm" method="get">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">狀態</span>
          <select className="input h-9" name="status" defaultValue={f.status}>
            <option value="open">還沒報</option>
            <option value="done">已報帳</option>
            <option value="all">全部</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">人</span>
          <select className="input h-9" name="who" defaultValue={f.who ?? ''}>
            <option value="">全部</option>
            {[...people].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">專案</span>
          <select className="input h-9" name="project" defaultValue={f.project ?? ''}>
            <option value="">全部</option>
            {[...projects].sort().map((p) => (
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
        <button className="btn">篩選</button>
      </form>

      {rows.length > 0 && (
        <div className="mb-4">
          <StatGrid cols={2} items={[{ n: rows.length, label: '筆數' }, { n: money(total), label: '合計' }]} />
        </div>
      )}

      {!rows.length ? (
        all?.length ? (
          <Empty variant="filtered" title="這個條件下沒有報帳" />
        ) : (
          <Empty
            title="還沒有報帳"
            hint="請員工加群記好友，把收據或發票拍照私訊給群記（AI 會讀出金額），或從 LINE 打開「我的報帳」自己記一筆。"
          />
        )
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const p = pathOf(r);
            const img = p ? urlOf.get(p) : undefined;
            return (
              <li key={r.id} className="card">
                <div className="flex items-start gap-3">
                  {img ? (
                    <a href={img} target="_blank" rel="noreferrer" className="flex-none">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt="收據" className="h-14 w-14 rounded-md object-cover" />
                    </a>
                  ) : (
                    <span className="grid h-14 w-14 flex-none place-items-center rounded-md bg-gray-100 text-xs text-gray-400">無圖</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-lg font-semibold tabular-nums">{money(r.amount)}</span>
                      <span className="text-sm text-gray-600">{r.category}</span>
                      {r.pay_method && r.pay_method !== '代墊' && <span className="text-xs text-gray-500">{r.pay_method}</span>}
                      {r.reimbursed_at ? <Badge tone="ok">已報帳</Badge> : <Badge tone="warn">還沒報</Badge>}
                    </div>
                    <p className="truncate text-sm text-gray-600">
                      {md(r.spent_on)}・{r.person_name ?? '（未命名）'}
                      {r.vendor ? `・${r.vendor}` : ''}
                      {r.project ? `・${r.project}` : ''}
                    </p>
                    {r.note && <p className="truncate text-xs text-gray-500">{r.note}</p>}
                  </div>
                  <form action="/api/expense/update" method="post" className="flex-none">
                    <input type="hidden" name="org" value={slug} />
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="back" value={back} />
                    <input type="hidden" name="action" value={r.reimbursed_at ? 'unreimburse' : 'reimburse'} />
                    <button className="btn btn-sm">{r.reimbursed_at ? '改回未報' : '標已報帳'}</button>
                  </form>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-gray-500">編輯</summary>
                  <form action="/api/expense/update" method="post" className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <input type="hidden" name="org" value={slug} />
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="back" value={back} />
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">金額</span>
                      <input className="input" name="amount" inputMode="numeric" defaultValue={r.amount} required />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">日期</span>
                      <input className="input" type="date" name="spent_on" defaultValue={r.spent_on} required />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">分類</span>
                      <select className="input" name="category" defaultValue={r.category}>
                        {/* 舊資料的分類可能已被改名或刪除：仍列出目前值，避免一存檔就被換掉 */}
                        {(cats.includes(r.category) ? cats : [r.category, ...cats]).map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">付款方式</span>
                      <select className="input" name="pay_method" defaultValue={r.pay_method ?? '代墊'}>
                        {PAY_METHODS.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">店家</span>
                      <input className="input" name="vendor" defaultValue={r.vendor} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">專案</span>
                      <input className="input" name="project" defaultValue={r.project} list="expense-projects" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">備註</span>
                      <input className="input" name="note" defaultValue={r.note} />
                    </label>
                    <div className="col-span-2 flex gap-2">
                      <button className="btn-primary" name="action" value="save">
                        儲存
                      </button>
                      <button className="btn" name="action" value="delete" formNoValidate>
                        刪除
                      </button>
                    </div>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <datalist id="expense-projects">
        {[...projects].map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </main>
  );
}
