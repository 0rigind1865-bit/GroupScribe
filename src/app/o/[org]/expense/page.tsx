import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { dbConfigured, getDb, MEDIA_BUCKET } from '@/db';
import { requireModule } from '@/org/orgs';
import { oh } from '@/org/href';
import { Banner, Flash } from '@/app/ui/banner';
import { Badge } from '@/app/ui/badge';
import { Empty } from '@/app/ui/empty';
import { DetailSheet } from '@/app/ui/detail-sheet';
import { PAY_METHODS } from '@/expense/receipt';
import { orgCategories } from '@/expense/categories';
import { expenseQuery, isMonth, type ExpenseFilter, type ExpenseRow } from '@/expense/query';
import { isSubmitted, photoPathOf } from '@/expense/items';
import { SetupNotice } from '../(admin)/setup-notice';
import { FilterPill, PickAll } from './controls';

export const dynamic = 'force-dynamic';

// 報帳清單（X1）：員工私訊群記的收據照，AI 讀出金額後自動記一筆。
// 管理者在這裡補專案、改讀錯的金額、標「已核銷」（2026-10 起不叫「已報帳」：員工端的「報帳」是送出申請，公司這邊是核銷）。寫入全走 /api/expense/update（moduleAccess＋綁 org_id）。
// 2026-10 設計畫布「報帳 · 收據」：一列只留「勾選」一個動作，點列上其他地方從下面拉出那一張（?id=）；
// 篩選選了就生效；手機是清單、電腦（md 以上）是表格。

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fmt = (n: number) => n.toLocaleString('en-US');
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const tw = (iso: string) => new Date(iso).toLocaleString('sv', { timeZone: 'Asia/Taipei' }); // YYYY-MM-DD HH:MM:SS
// datetime-local 的預設值（台北時間）；沒有精確時間的舊資料用中午
const localDt = (r: ExpenseRow) => (r.spent_at ? tw(r.spent_at).slice(0, 16).replace(' ', 'T') : `${r.spent_on}T12:00`);
const titleOf = (r: ExpenseRow) => r.note || r.vendor || r.category;
const who = (r: ExpenseRow) => r.person_name ?? '（未命名）';
const sum = (rs: ExpenseRow[]) => rs.reduce((n, r) => n + r.amount, 0);
const statusBadge = (r: ExpenseRow) =>
  r.reimbursed_at ? <Badge tone="ok">已核銷</Badge> : isSubmitted(r) ? <Badge tone="warn">還沒核銷</Badge> : <Badge tone="neutral">員工還沒申請</Badge>;
// 抽屜底下一行「這筆怎麼來的」（migration 023 的 source；還沒貼時都是照片）
const VIA: Record<string, string> = {
  photo: '在 LINE 私訊群記一張照片，金額由 AI 讀出',
  text: '在 LINE 私訊群記一句話，由 AI 整理',
  web: '自己在「報帳」記的',
};
const ymLabel = (m: string, year: string) => (m.startsWith(year) ? `${Number(m.slice(5))} 月` : `${m.slice(0, 4)} 年 ${Number(m.slice(5))} 月`);

// 抽屜裡的一列欄位：左邊欄名、右邊直接可改（設計稿是一排可點的列）
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-h-[50px] items-center gap-3 border-b border-gray-100 px-3.5 last:border-0">
      <span className="w-14 flex-none text-[13px] text-gray-600">{label}</span>
      {children}
    </label>
  );
}
const FIELD_INPUT = 'input min-w-0 flex-1 border-0 px-1 font-bold';

export default async function ExpenseList({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<ExpenseFilter & { ok?: string; err?: string; n?: string; undo?: string; id?: string }>;
}) {
  if (!dbConfigured()) return <SetupNotice />;
  const { org: slug } = await params;
  const { org } = await requireModule(slug, 'expense');
  if (!org) notFound();
  const sp = await searchParams;
  const f: ExpenseFilter = { status: sp.status ?? 'open', who: sp.who, project: sp.project, month: sp.month };
  const db = getDb();
  const detailId = sp.id && UUID.test(sp.id) ? sp.id : null;

  const [{ data, error }, { data: all }, cats, { data: detail }] = await Promise.all([
    expenseQuery(db, org.id, f),
    // 篩選膠囊的選項（人、專案、月份）與各籤的筆數要看全部，不受目前狀態影響；* 而非欄位名：沒貼 030 時 submitted_at 不存在
    // ponytail: 只看最近 2000 筆
    db.from('expenses').select('*').eq('org_id', org.id).order('spent_on', { ascending: false }).limit(2000),
    orgCategories(org.id),
    detailId
      ? db.from('expenses').select('*, media_assets(storage_path)').eq('id', detailId).eq('org_id', org.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (error)
    return (
      <main className="page">
        <h1 className="mb-3">收據</h1>
        <Banner tone="warn">
          報帳資料表還沒建立：請在 Supabase SQL Editor 執行 <code>supabase/migrations/022_expenses.sql</code>。
        </Banner>
      </main>
    );
  const rows = (data ?? []) as unknown as ExpenseRow[];
  const allRows = (all ?? []) as unknown as ExpenseRow[];
  const d = detail as unknown as ExpenseRow | null;
  const people = new Map<string, string>();
  const projects = new Set<string>();
  const months = new Set<string>();
  for (const r of allRows) {
    people.set(r.line_user_id, r.person_name ?? people.get(r.line_user_id) ?? '（未命名）');
    if (r.project) projects.add(r.project);
    months.add(r.spent_on.slice(0, 7));
  }
  // 籤上的「還沒核銷 N」與「員工還沒申請」提示：跟清單同一組人／專案／月份條件
  const scoped = allRows.filter(
    (r) => (!f.who || r.line_user_id === f.who) && (!f.project || r.project === f.project) && (!isMonth(f.month) || r.spent_on.startsWith(f.month)),
  );
  const openN = scoped.filter((r) => !r.reimbursed_at && isSubmitted(r)).length;
  const drafts = scoped.filter((r) => !isSubmitted(r));

  // 收據照只在抽屜裡看：只簽打開的那一張（私有 bucket，1 小時，同 core/media.ts）
  const photo = d ? photoPathOf(d) : null;
  const img = photo ? (await db.storage.from(MEDIA_BUCKET).createSignedUrl(photo, 3600)).data?.signedUrl : undefined;

  const q = { status: sp.status, who: sp.who, project: sp.project, month: sp.month };
  const back = oh(slug, '/expense', q);
  const openHref = (id: string) => oh(slug, '/expense', { ...q, id });
  const pickable = rows.some((r) => !r.reimbursed_at);
  const year = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Taipei' }).slice(0, 4);
  const undo = sp.ok === 'reimbursed' ? String(sp.undo ?? '').split(',').filter((x) => UUID.test(x)) : [];
  const pick = (r: ExpenseRow) => (
    <input type="checkbox" name="id" value={r.id} form="reimburse-batch" className="exp-pick h-5 w-5" aria-label={`選 ${titleOf(r)} ${fmt(r.amount)}`} />
  );
  const TH = 'border-b border-gray-200 px-3 py-2.5 font-extrabold';
  const TD = 'border-b border-gray-100 px-3 py-3';

  return (
    // exp-list：globals.css 用 CSS 計數器數勾了幾筆，寫進底部浮出的「已選 N 筆」
    <main className="page exp-list">
      <h1 className="mb-3">收據</h1>
      {/* 按錯有「復原」：把剛標的那幾筆改回還沒核銷（同把關頁的 ?undo=，原生表單零 JS） */}
      {undo.length ? (
        <Banner tone="ok">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1">已把 {undo.length} 筆標成已核銷</span>
            <form action="/api/expense/update" method="post" className="flex-none">
              <input type="hidden" name="org" value={slug} />
              <input type="hidden" name="back" value={back} />
              {undo.map((id) => (
                <input key={id} type="hidden" name="id" value={id} />
              ))}
              <button className="btn btn-sm" name="action" value="unreimburse">
                復原
              </button>
            </form>
          </div>
        </Banner>
      ) : (
        <Flash
          sp={sp}
          dict={{
            saved: { tone: 'ok', text: '已儲存' },
            reimbursed: { tone: 'ok', text: `已把 ${sp.n ?? ''} 筆標成已核銷` },
            unreimbursed: { tone: 'ok', text: `已把 ${sp.n ?? ''} 筆改回還沒核銷` },
            deleted: { tone: 'ok', text: '已刪除' },
            bad: { tone: 'err', text: '資料不正確，沒有儲存' },
            confirm: { tone: 'err', text: '要先勾「刪了救不回來」才能刪' },
          }}
        />
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        {/* 狀態分段籤：點了就換，不必再按「篩選」 */}
        <nav className="segmented grid w-full grid-cols-3 md:inline-flex md:w-auto" aria-label="狀態">
          {(
            [
              ['open', `還沒核銷${openN ? ` ${openN}` : ''}`],
              ['done', '已核銷'],
              ['all', '全部'],
            ] as const
          ).map(([v, label]) => (
            <a key={v} href={oh(slug, '/expense', { ...q, status: v === 'open' ? undefined : v })} aria-current={f.status === v ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        {/* 人／專案／月份：膠囊點開選一個就生效 */}
        <FilterPill
          label={f.who ? (people.get(f.who) ?? '所有人') : '所有人'}
          options={[['', '所有人'] as const, ...people].map(([id, name]) => ({ href: oh(slug, '/expense', { ...q, who: id }), label: name, on: (f.who ?? '') === id }))}
        />
        <FilterPill
          label={f.project || '所有專案'}
          options={['', ...[...projects].sort()].map((p) => ({ href: oh(slug, '/expense', { ...q, project: p }), label: p || '所有專案', on: (f.project ?? '') === p }))}
        />
        <FilterPill
          label={isMonth(f.month) ? ymLabel(f.month, year) : '所有月份'}
          options={['', ...[...months].sort().reverse()].map((m) => ({ href: oh(slug, '/expense', { ...q, month: m }), label: m ? ymLabel(m, year) : '所有月份', on: (f.month ?? '') === m }))}
        />
        {rows.length > 0 && (
          <span className="flex w-full items-center text-[13px] text-gray-600 md:ml-auto md:w-auto">
            {rows.length} 筆 · 合計 NT$ {fmt(sum(rows))}
            {pickable && (
              <span className="ml-auto md:hidden">
                <PickAll label="全選" />
              </span>
            )}
          </span>
        )}
      </div>

      {f.status === 'open' && drafts.length > 0 && (
        <Banner tone="neutral">
          <div className="flex flex-wrap items-center gap-x-3">
            <span className="min-w-0 flex-1">
              這裡只列員工按過「申請核銷」的。另有 <b>{drafts.length} 筆</b>（NT$ {fmt(sum(drafts))}）員工還沒申請。
            </span>
            <a className="flex min-h-9 items-center font-bold text-emerald-700" href={oh(slug, '/expense', { ...q, status: 'all' })}>
              在「全部」看 →
            </a>
          </div>
        </Banner>
      )}

      {!rows.length ? (
        allRows.length ? (
          <Empty variant="filtered" title="這個條件下沒有報帳" />
        ) : (
          <Empty
            title="還沒有報帳"
            hint="請員工加群記好友，把收據或發票拍照私訊給群記（AI 會讀出金額），或從 LINE 打開「個人 → 報帳」自己記一筆。"
          />
        )
      ) : (
        <>
          {/* 手機：清單。左邊勾選（已核銷的沒得勾），點其他地方拉出抽屜 */}
          <ul className="card overflow-hidden p-0 md:hidden">
            {rows.map((r) => (
              <li key={r.id} className={`exp-row flex min-h-[68px] items-center gap-1.5 border-b border-gray-100 py-1 pr-3.5 last:border-0 ${f.status === 'done' ? 'pl-3.5' : 'pl-1'}`}>
                {f.status !== 'done' && <label className="grid h-11 w-11 flex-none cursor-pointer place-items-center">{!r.reimbursed_at && pick(r)}</label>}
                <a href={openHref(r.id)} className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[15px] font-bold">{titleOf(r)}</span>
                      {f.status === 'all' && <span className="flex-none">{statusBadge(r)}</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-gray-600">
                      {who(r)} · {md(r.spent_on)} · {r.category} · {r.pay_method ?? '代墊'}
                    </span>
                  </span>
                  <span className="text-base font-extrabold tabular-nums">{fmt(r.amount)}</span>
                </a>
              </li>
            ))}
          </ul>
          {/* 電腦：表格＋勾選（設計畫布「報帳 · 收據 · 電腦」）；「全部」才標狀態 */}
          <div className="card hidden overflow-x-auto p-0 md:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-600">
                  <th className="w-11 border-b border-gray-200 py-1 pl-4">{pickable && <PickAll />}</th>
                  <th className={TH}>日期</th>
                  <th className={TH}>誰</th>
                  <th className={TH}>內容</th>
                  <th className={TH}>分類</th>
                  <th className={TH}>專案</th>
                  <th className={TH}>付款</th>
                  <th className={`${TH} pr-4 text-right`}>金額</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {rows.map((r) => (
                  <tr key={r.id} className="exp-row">
                    <td className="border-b border-gray-100 py-1 pl-4">{!r.reimbursed_at && pick(r)}</td>
                    <td className={TD}>{md(r.spent_on)}</td>
                    <td className={TD}>{who(r)}</td>
                    <td className={TD}>
                      <a href={openHref(r.id)} className="font-bold hover:underline">
                        {titleOf(r)}
                      </a>
                      {f.status === 'all' && <span className="ml-2">{statusBadge(r)}</span>}
                    </td>
                    <td className={TD}>{r.category}</td>
                    <td className={TD}>{r.project}</td>
                    <td className={TD}>{r.pay_method ?? '代墊'}</td>
                    <td className={`${TD} pr-4 text-right font-extrabold`}>{fmt(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 勾了才浮出（body:has(.exp-pick:checked)）；手機浮在底部導覽上面。「取消選取」＝reset，零 JS */}
      <form id="reimburse-batch" action="/api/expense/update" method="post" className="exp-bar fixed inset-x-3 bottom-24 z-40 mx-auto max-w-md items-center gap-3 rounded-2xl border border-gray-200 bg-white py-2.5 pr-2.5 pl-4 shadow-lg md:bottom-6">
        <input type="hidden" name="org" value={slug} />
        <input type="hidden" name="back" value={back} />
        <span className="flex-1 text-sm font-bold">
          已選 <span className="exp-n" /> 筆
        </span>
        <button type="reset" className="btn hidden border-0 md:inline-flex">
          取消選取
        </button>
        <button className="btn-primary" name="action" value="reimburse">
          標成已核銷
        </button>
      </form>

      {/* 一張收據（設計畫布「報帳 · 一張收據」）：「標成已核銷」是唯一的主要按鈕；刪除收在下面、要再確認一次 */}
      {d && (
        <DetailSheet closeHref={back} title="收據">
          <div className="mb-4 flex items-center gap-3.5">
            {img ? (
              <a href={img} target="_blank" rel="noreferrer" aria-label="放大看收據照片" className="flex-none">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="收據" className="h-[120px] w-[92px] rounded-xl object-cover" />
              </a>
            ) : (
              <span className="grid h-[120px] w-[92px] flex-none place-items-center rounded-xl bg-gray-100 text-xs text-gray-500">沒有照片</span>
            )}
            <div className="min-w-0">
              <p className="text-[32px] leading-tight font-black tabular-nums" style={{ fontFamily: 'var(--font-title)' }}>
                NT$ {fmt(d.amount)}
              </p>
              <p className="mt-0.5 truncate font-bold">{titleOf(d)}</p>
              <div className="mt-2 flex gap-1.5">
                {statusBadge(d)}
                <Badge>{d.pay_method ?? '代墊'}</Badge>
              </div>
            </div>
          </div>
          <form action="/api/expense/update" method="post" className="space-y-3 text-sm">
            <input type="hidden" name="org" value={slug} />
            <input type="hidden" name="id" value={d.id} />
            <input type="hidden" name="back" value={back} />
            <div className="overflow-hidden rounded-[14px] border border-gray-200">
              <Field label="誰">
                <span className="text-[15px] font-bold">{who(d)}</span>
              </Field>
              <Field label="金額">
                <input className={FIELD_INPUT} name="amount" inputMode="numeric" defaultValue={d.amount} required />
              </Field>
              <Field label="時間">
                <input className={FIELD_INPUT} type="datetime-local" name="spent_at" defaultValue={localDt(d)} required />
              </Field>
              <Field label="分類">
                <select className={FIELD_INPUT} name="category" defaultValue={d.category}>
                  {/* 舊資料的分類可能已被改名或刪除：仍列出目前值，避免一存檔就被換掉 */}
                  {(cats.includes(d.category) ? cats : [d.category, ...cats]).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="付款">
                <select className={FIELD_INPUT} name="pay_method" defaultValue={d.pay_method ?? '代墊'}>
                  {PAY_METHODS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <Field label="專案">
                <input className={FIELD_INPUT} name="project" defaultValue={d.project} list="expense-projects" placeholder="沒選專案" />
              </Field>
              <Field label="用途">
                <input className={FIELD_INPUT} name="note" defaultValue={d.note} placeholder="買了什麼" />
              </Field>
              <Field label="店家">
                <input className={FIELD_INPUT} name="vendor" defaultValue={d.vendor} placeholder="店家名稱" />
              </Field>
              <Field label="地點">
                <input className={FIELD_INPUT} name="place_name" defaultValue={d.place_name ?? ''} placeholder="在哪裡花的" />
              </Field>
              <Field label="發票">
                <input className={FIELD_INPUT} name="invoice_no" defaultValue={d.invoice_no} placeholder="發票號碼" />
              </Field>
            </div>
            {img && (
              <label className="flex min-h-11 items-center gap-2 text-gray-600">
                <input type="checkbox" name="remove_photo" value="1" />
                儲存時移除這張收據照片
              </label>
            )}
            <p className="text-xs text-gray-600">
              {who(d)} {md(tw(d.created_at))} {tw(d.created_at).slice(11, 16)} {VIA[d.source ?? 'photo'] ?? VIA.photo}。
            </p>
            {/* 「儲存修改」排在表單第一顆：在欄位裡按 Enter 送出的是它，不會誤按成核銷或刪除 */}
            <button className="btn w-full" name="action" value="save">
              儲存修改
            </button>
            <div className="space-y-1 border-t border-gray-100 pt-3">
              {d.reimbursed_at ? (
                <button className="btn w-full" name="action" value="unreimburse" formNoValidate>
                  改回還沒核銷
                </button>
              ) : (
                <button className="btn-primary min-h-[52px] w-full text-base" name="action" value="reimburse" formNoValidate>
                  標成已核銷
                </button>
              )}
              {/* 刪除要再確認一次：先點開，勾「刪了救不回來」才按得下去（globals.css 的 data-ack） */}
              <details>
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center font-bold text-red-700 [&::-webkit-details-marker]:hidden">刪除這筆…</summary>
                <div className="flex items-center gap-2 pb-1">
                  <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-1.5 text-gray-600">
                    <input type="checkbox" name="confirm_delete" data-ack />
                    刪了救不回來
                  </label>
                  <button className="btn-danger" name="action" value="delete" formNoValidate data-requires-ack>
                    刪除
                  </button>
                </div>
              </details>
            </div>
          </form>
          <datalist id="expense-projects">
            {[...projects].map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </DetailSheet>
      )}
    </main>
  );
}
