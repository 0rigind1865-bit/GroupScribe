import { dbConfigured, getDb, MEDIA_BUCKET } from '@/db';
import { liffId, liffUser } from '@/core/liff';
import { LiffInit } from '@/app/g/liff-init';
import { SurfaceSwitcher } from '@/app/ui/surface-switcher';
import { Flash } from '@/app/ui/banner';
import { Badge } from '@/app/ui/badge';
import { Empty } from '@/app/ui/empty';
import { myExpenseEmployee } from '@/expense/mine';
import { orgCategories } from '@/expense/categories';
import { PAY_METHODS } from '@/expense/receipt';
import { sumBy, type ExpenseRow } from '@/expense/query';
import { LocateButton } from './locate-button';

export const dynamic = 'force-dynamic';

// 我的報帳（X2-1 記一筆＋X2-2 我的清單，Snaptab AddView／ListView）。
// 大字金額、分類一點就選、專案記住上次、可附收據照與位置；下面是自己的清單，依專案分組＋小計。
// 已被管理者標「已報帳」的鎖定不能改。
// ponytail: 只有繁中（員工端打卡頁有五語系）；外籍員工有需要再接 attend/i18n
const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

export default async function MyExpense({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string; project?: string }>;
}) {
  const uid = await liffUser();
  if (!uid) return <LiffInit liffId={liffId()} />;
  if (!dbConfigured()) return <main className="p-6 text-gray-500">系統尚未設定資料庫。</main>;
  const emp = await myExpenseEmployee();
  if (!emp)
    return (
      <main className="mx-auto max-w-md p-6 text-sm text-gray-600">
        你所屬的公司還沒開報帳功能，或你還不是在職員工。請聯絡管理者。
      </main>
    );

  const sp = await searchParams;
  const db = getDb();
  const [cats, { data, error }] = await Promise.all([
    orgCategories(emp.org_id),
    db
      .from('expenses')
      .select('*, media_assets(storage_path)')
      .eq('org_id', emp.org_id)
      .eq('line_user_id', emp.line_user_id)
      .order('spent_on', { ascending: false })
      .limit(300),
  ]);
  const rows = (data ?? []) as unknown as ExpenseRow[];
  const lastProject = sp.project ?? rows[0]?.project ?? '';
  const projects = [...new Set(rows.map((r) => r.project).filter(Boolean))];

  const pathOf = (r: ExpenseRow) => r.photo_path ?? r.media_assets?.storage_path ?? null;
  const paths = rows.map(pathOf).filter((p): p is string => !!p);
  const { data: signed } = paths.length
    ? await db.storage.from(MEDIA_BUCKET).createSignedUrls(paths, 3600)
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const urlOf = new Map((signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path!, s.signedUrl]));

  const groups = sumBy(rows, (r) => r.project); // [專案, 小計, 筆數]，金額大的先

  return (
    <main className="mx-auto max-w-md p-4 pb-16">
      <div className="mb-3">
        <SurfaceSwitcher current="myexpense" />
      </div>
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">記一筆</h1>
      <Flash
        sp={sp}
        dict={{
          saved: { tone: 'ok', text: '記好了' },
          deleted: { tone: 'ok', text: '已刪除' },
          bad: { tone: 'err', text: '金額或分類不對，沒有記' },
          photo: { tone: 'err', text: '照片要是圖片、10MB 以內' },
          failed: { tone: 'err', text: '沒有記成功，請稍後再試' },
        }}
      />
      {error && <p className="mb-3 text-sm text-amber-700">報帳資料表還沒建立，請管理者先執行資料庫更新。</p>}

      <form action="/api/liff/expense/add" method="post" encType="multipart/form-data" className="card space-y-4">
        <label className="block">
          <span className="text-xs text-gray-500">金額</span>
          <input
            className="input h-16 w-full text-4xl font-semibold tabular-nums"
            name="amount"
            inputMode="numeric"
            placeholder="0"
            required
            autoComplete="off"
          />
        </label>
        <fieldset>
          <legend className="mb-1 text-xs text-gray-500">分類</legend>
          <div className="flex flex-wrap gap-2">
            {cats.map((c, i) => (
              <label key={c}>
                <input type="radio" name="category" value={c} defaultChecked={i === 0} className="peer sr-only" />
                <span className="inline-block cursor-pointer rounded-full border border-gray-300 px-3 py-1.5 text-sm peer-checked:border-emerald-600 peer-checked:bg-emerald-600 peer-checked:text-white">
                  {c}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">專案</span>
            <input className="input" name="project" defaultValue={lastProject} list="my-projects" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">付款方式</span>
            <select className="input" name="pay_method" defaultValue="代墊">
              {PAY_METHODS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">店家／用途</span>
            <input className="input" name="note" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">日期</span>
            <input className="input" type="date" name="spent_on" />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-gray-500">地點（選填）</span>
            <input className="input" name="place_name" placeholder="例如：台中店" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-xs text-gray-500">收據照（選填）</span>
          <input className="mt-1 block w-full text-sm" type="file" name="photo" accept="image/*" capture="environment" />
        </label>
        <LocateButton />
        <button className="btn-primary w-full">記下來</button>
      </form>
      <datalist id="my-projects">
        {projects.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <h2 className="mt-6 mb-2 text-lg font-semibold">我的報帳</h2>
      {!rows.length ? (
        <Empty title="還沒有記錄" hint="上面記一筆，或把收據拍照私訊給群記。" />
      ) : (
        <div className="space-y-4">
          {groups.map(([project, subtotal, n]) => (
            <section key={project}>
              <p className="mb-1 flex text-sm font-medium text-gray-600">
                <span>{project}</span>
                <span className="ml-auto tabular-nums">
                  {n} 筆・{money(subtotal)}
                </span>
              </p>
              <ul className="space-y-2">
                {rows
                  .filter((r) => (r.project || '（未填）') === project)
                  .map((r) => {
                    const p = pathOf(r);
                    const img = p ? urlOf.get(p) : undefined;
                    return (
                      <li key={r.id} className="card text-sm">
                        <div className="flex items-center gap-3">
                          {img && (
                            // 收據照：點開原圖（取代 Snaptab 的 PhotoLightbox，用瀏覽器內建檢視）
                            <a href={img} target="_blank" rel="noreferrer" className="flex-none">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={img} alt="收據" className="h-10 w-10 rounded object-cover" />
                            </a>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="font-semibold tabular-nums">{money(r.amount)}</span>{' '}
                            <span className="text-gray-600">{r.category}</span>
                            <span className="block truncate text-xs text-gray-500">
                              {md(r.spent_on)}
                              {r.note || r.vendor ? `・${r.note || r.vendor}` : ''}
                              {r.pay_method && r.pay_method !== '代墊' ? `・${r.pay_method}` : ''}
                            </span>
                          </span>
                          {r.reimbursed_at ? <Badge tone="ok">已報帳</Badge> : null}
                        </div>
                        {!r.reimbursed_at && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-gray-500">修改</summary>
                            <form action="/api/liff/expense/mine" method="post" className="mt-2 grid grid-cols-2 gap-2">
                              <input type="hidden" name="id" value={r.id} />
                              <input className="input" name="amount" inputMode="numeric" defaultValue={r.amount} required />
                              <select className="input" name="category" defaultValue={r.category}>
                                {(cats.includes(r.category) ? cats : [r.category, ...cats]).map((c) => (
                                  <option key={c}>{c}</option>
                                ))}
                              </select>
                              <input className="input" name="project" defaultValue={r.project} list="my-projects" />
                              <select className="input" name="pay_method" defaultValue={r.pay_method ?? '代墊'}>
                                {PAY_METHODS.map((m) => (
                                  <option key={m}>{m}</option>
                                ))}
                              </select>
                              <input className="input" name="note" defaultValue={r.note} placeholder="店家／用途" />
                              <input className="input" type="date" name="spent_on" defaultValue={r.spent_on} />
                              <input type="hidden" name="vendor" value={r.vendor} />
                              <input type="hidden" name="place_name" value={r.place_name ?? ''} />
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
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
