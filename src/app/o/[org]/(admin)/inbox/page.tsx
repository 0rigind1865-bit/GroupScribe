import { notFound } from 'next/navigation';
import { requireModule } from '@/org/orgs';
import { oh } from '@/org/href';
import { ConfirmIcon, PendingBadge } from '@/app/ui/review-ui';
import { dbConfigured, getDb } from '@/db';
import { mediaForItems } from '@/core/media';
import { ItemPhotos } from '@/app/ui/item-photos';
import { SetupNotice } from '../setup-notice';
import { isRevised } from '@/core/date';

export const dynamic = 'force-dynamic';

// 把關（原「收件匣」）：三表待確認合流成一條把關流水線。
// 2026-10 設計畫布「把關模式」：一次看一則對話——上面前後文，下面它整理出的每一筆（可取消勾選、欄位直接改），
// 「確認 N 筆」最大顆在拇指區；忽略不再多問，忽略與確認之後都在下方跳「復原」。手機蓋滿整個畫面（像抽屜），
// 電腦版左邊待把關清單、右邊這則對話（左側導覽外框在 layout）。寫入都打既有的 /api/batch。
// 無 ?group ＝ 跨群聚合（admin 殼內天然安全）；有 ?group ＝ 單群。?at=kind:id 指定看哪一則；?of＝這輪開始時的筆數（進度條用）。

const LIMIT = 30;

function fmt(d: string) {
  return new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

type Row = { kind: 'event' | 'task' | 'note'; item: any };
type Msg = { id: string; sender_name: string | null; sender_id: string | null; type: string; text: string | null; created_at: string };
const MSG = 'id, sender_name, sender_id, type, text, created_at';

const KIND_STYLE = {
  // edit：開那一頁的詳情抽屜，帶 from＝把關頁，存檔或關閉都回這裡（detail-sheet.tsx 的 safeFrom）
  event: { label: '行程', table: 'events', chip: 'bg-emerald-100 text-emerald-800', edit: (o: string, g: string, id: string, from: string) => oh(o, '/calendar', { group: g, event: id, from }) },
  task: { label: '待辦', table: 'tasks', chip: 'bg-sky-100 text-sky-800', edit: (o: string, g: string, id: string, from: string) => oh(o, '/tasks', { group: g, task: id, from }) },
  note: { label: '公告', table: 'notes', chip: 'bg-purple-100 text-purple-900', edit: (o: string, g: string, id: string, from: string) => oh(o, '/notes', { group: g, note: id, from }) },
} as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 每筆可直接改的欄位（name＝欄位:kind:id，/api/batch 確認時照改）。公告的內文太長，留在詳情抽屜改
function fieldsOf({ kind, item }: Row) {
  if (kind === 'event')
    return [
      { k: 'date', label: '日期', type: 'date', v: item.starts_at ?? '' },
      { k: 'time', label: '時間', type: 'time', v: item.start_time ? String(item.start_time).slice(0, 5) : '', ph: '全天' },
      { k: 'location', label: '地點', type: 'text', v: item.location ?? '', ph: '沒有地點' },
    ];
  if (kind === 'task')
    return [
      { k: 'assignee', label: '負責人', type: 'text', v: item.assignee ?? '', ph: '沒人負責' },
      { k: 'due', label: '期限', type: 'date', v: item.due_at ?? '' },
    ];
  return [];
}

const Pencil = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </svg>
);

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ group?: string; undo?: string | string[]; confirmed?: string | string[]; at?: string; of?: string }>;
}) {
  const { org: slug } = await params;
  if (!dbConfigured()) return <SetupNotice />;
  const { group: groupParam, undo: undoParam, confirmed: confirmedParam, at, of: ofParam } = await searchParams;
  const db = getDb();

  const { org } = await requireModule(slug, 'gs');
  if (!org) notFound();
  const { data: groupRows } = await db.from('groups_view').select('group_id, name').eq('org_id', org.id);
  const nameOf = new Map((groupRows ?? []).map((g: any) => [g.group_id, g.name ?? g.group_id]));
  // ?group= 不在本 org 就當沒帶；沒帶則跨群聚合綁本 org 全部群（商業計劃 2.1 節 A3）
  const ids = (groupRows ?? []).map((g: any) => g.group_id as string);
  const group = groupParam && ids.includes(groupParam) ? groupParam : undefined;
  const filt = (q: any) => (group ? q.eq('group_id', group) : q.in('group_id', ids));
  // 「選取全部 N 筆」的時間截點：在算 N 的查詢之前記下，之後才進來或被改的不算（src/app/api/batch/route.ts）
  const asof = new Date().toISOString();
  const [ev, tk, nt] = await Promise.all([
    filt(db.from('events').select('*', { count: 'exact' }).eq('needs_confirmation', true).neq('status', 'ignored'))
      .order('created_at', { ascending: false }).limit(LIMIT),
    filt(db.from('tasks').select('*', { count: 'exact' }).eq('needs_confirmation', true).eq('status', 'open'))
      .order('created_at', { ascending: false }).limit(LIMIT),
    filt(db.from('notes').select('*', { count: 'exact' }).eq('needs_confirmation', true).eq('status', 'active'))
      .order('created_at', { ascending: false }).limit(LIMIT),
  ]);
  const total = (ev.count ?? 0) + (tk.count ?? 0) + (nt.count ?? 0);

  const rows: Row[] = [
    ...(ev.data ?? []).map((item: any) => ({ kind: 'event' as const, item })),
    ...(tk.data ?? []).map((item: any) => ({ kind: 'task' as const, item })),
    ...(nt.data ?? []).map((item: any) => ({ kind: 'note' as const, item })),
  ]
    .sort((a, b) => new Date(b.item.created_at).getTime() - new Date(a.item.created_at).getTime())
    .slice(0, LIMIT);

  // 來源訊息一次撈齊（清單預覽與目前這則都要）
  const srcIds = [...new Set(rows.flatMap((r) => r.item.source_message_ids ?? []))];
  const { data: msgs } = srcIds.length
    ? await db.from('messages').select(MSG).in('id', srcIds).in('group_id', ids)
    : { data: [] as Msg[] };
  const msgOf = new Map((msgs ?? []).map((m: any) => [m.id, m as Msg]));

  // 剛忽略的項目（?undo=kind:id，多筆逗號串）→ 下方「已忽略『標題』」＋「復原」；
  // 剛確認的（?confirmed=，同格式）→「已確認…」＋「復原」＝翻回待確認。兩個都由 /api/batch 補進網址，一次只會有一種。
  // 標題從 DB 查、不放網址；只認本公司的群、而且現在還是 ignored／已確認的（已經復原過或被改過就不再顯示）。
  // 網址被手打成 ?undo=a&undo=b 時 Next 給的是陣列：先接成一串，不然 split 會讓整頁 500
  const confirmed = !undoParam && !!confirmedParam;
  const undoSrc = confirmed ? confirmedParam : undoParam;
  const undoRaw = Array.isArray(undoSrc) ? undoSrc.join(',') : (undoSrc ?? '');
  const undoIds = new Map<Row['kind'], string[]>();
  // 「選取全部 N 筆」忽略／確認的復原憑證 all@<毫秒>：那次 update 把每一筆的 updated_at 都寫成同一刻（/api/batch），
  // 幾百筆也不用把 id 塞進網址。筆數現查：同一刻、現在還是 ignored 且仍待確認（確認的：已確認）、在本公司的群
  const undoAll = new Set<string>(); // Set：網址重複帶同一個憑證也不會算兩次
  for (const raw of undoRaw.split(',')) {
    if (/^all@\d{10,15}$/.test(raw)) {
      undoAll.add(raw);
      continue;
    }
    const [k, id] = raw.split(':');
    // hasOwn 不用 in：網址帶 toString:… 之類時 in 會沿原型鏈判成真
    if (Object.hasOwn(KIND_STYLE, k) && UUID.test(id ?? '')) {
      const kind = k as Row['kind'];
      undoIds.set(kind, [...(undoIds.get(kind) ?? []), id]);
    }
  }
  const undone = (
    await Promise.all(
      [...undoIds].map(([kind, list]) =>
        db
          .from(KIND_STYLE[kind].table)
          .select('id, title, status, needs_confirmation')
          .in('id', list)
          .in('group_id', ids)
          .then(({ data, error }) =>
            error
              ? list.map((id) => ({ kind, id, title: '' })) // 查不到標題：照網址的筆數，只寫「已忽略／已確認 N 筆」
              : (data ?? [])
                  .filter((r: any) => (confirmed ? r.needs_confirmation === false : r.status === 'ignored'))
                  .map((r: any) => ({ kind, id: r.id as string, title: r.title as string })),
          ),
      ),
    )
  ).flat();
  const undoneAll = (
    await Promise.all(
      [...undoAll].flatMap((token) => {
        const at = new Date(Number(token.slice(4))).toISOString();
        return Object.values(KIND_STYLE).map((s) => {
          const q = db.from(s.table).select('id', { count: 'exact', head: true }).in('group_id', ids).eq('updated_at', at);
          return (confirmed ? q.eq('needs_confirmation', false) : q.eq('status', 'ignored').eq('needs_confirmation', true)).then(
            ({ count }) => count ?? 0,
          );
        });
      }),
    )
  ).reduce((a, n) => a + n, 0);
  const undoneCount = undone.length + undoneAll;

  // 進度條：這輪開始時有幾筆（第一次進來＝現在的筆數，之後跟著 back 帶著走）
  const of = Math.max(Number(ofParam) || 0, total);
  // back 不帶 undo、at：處理完自動換下一則（或按復原之後提示自然消失）
  const back = oh(slug, '/inbox', { group, of: of || undefined });
  const today = oh(slug, '', { group });

  // 同一句話整理出的幾筆收成一張卡：原話只出現一次、一次確認完。卡的順序跟著卡裡最新的那一筆（rows 已經新到舊）
  const cards = new Map<string, Row[]>();
  for (const r of rows) {
    const key = [...(r.item.source_message_ids ?? [])].sort().join(',') || `${r.kind}:${r.item.id}`;
    cards.set(key, [...(cards.get(key) ?? []), r]);
  }
  const list = [...cards.values()];
  const cur = list.find((items) => items.some((r) => `${r.kind}:${r.item.id}` === at)) ?? list[0];
  const quotesOf = (items: Row[]) =>
    (items[0].item.source_message_ids ?? [])
      .map((id: string) => msgOf.get(id))
      .filter(Boolean)
      .sort((a: Msg, b: Msg) => a.created_at.localeCompare(b.created_at)) as Msg[];

  // 目前這則：來源訊息前後各兩則當前後文（手機只露最近的一則），以及同時段照片
  let thread: (Msg & { src: boolean })[] = [];
  let photos: any[] | undefined;
  const gid: string | undefined = cur?.[0].item.group_id;
  if (cur && gid) {
    const src = quotesOf(cur).slice(0, 4);
    if (src.length) {
      const [b, a] = await Promise.all([
        db.from('messages').select(MSG).eq('group_id', gid).lt('created_at', src[0].created_at).order('created_at', { ascending: false }).limit(2),
        db.from('messages').select(MSG).eq('group_id', gid).gt('created_at', src[src.length - 1].created_at).order('created_at').limit(2),
      ]);
      thread = [
        ...((b.data ?? []) as Msg[]).reverse().map((m) => ({ ...m, src: false })),
        ...src.map((m) => ({ ...m, src: true })),
        ...((a.data ?? []) as Msg[]).map((m) => ({ ...m, src: false })),
      ];
    }
    photos = (await mediaForItems(db, gid, cur.map((r) => ({ id: r.item.id, sourceIds: r.item.source_message_ids })))).get(cur[0].item.id);
  }
  const okForm = 'review-ok';
  const remain = total > rows.length ? `剩 ${total} 筆` : list.length ? `剩 ${list.length} 則對話` : '完成';
  const progress = of ? Math.round(((of - total) / of) * 100) : 100;

  return (
    <main className="page">
      <div className="md:grid md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:gap-8">
        {/* ── 電腦版左欄：待把關清單（手機一次一則，不需要） ── */}
        <section aria-label="待把關清單" className="hidden space-y-3 md:block">
          <h1>把關</h1>
          <p className="text-sm text-gray-600">
            {total ? `${total} 筆，來自 ${list.length}${total > rows.length ? '+' : ''} 則對話。` : ''}你點頭才算數。
          </p>
          {list.map((items) => {
            const q = quotesOf(items)[0];
            const first = `${items[0].kind}:${items[0].item.id}`;
            const on = items === cur;
            return (
              <a
                key={first}
                href={oh(slug, '/inbox', { group, of, at: first })}
                aria-current={on ? 'true' : undefined}
                className={`card block space-y-1.5 p-3.5 hover:bg-gray-50 ${on ? 'ring-2 ring-amber-500' : ''}`}
              >
                <span className="block text-xs text-gray-600">
                  {q ? `${q.sender_name ?? q.sender_id ?? '—'} · ${fmt(q.created_at)}` : '來源訊息已收回'}
                  {!group && ` · ${nameOf.get(items[0].item.group_id) ?? items[0].item.group_id}`}
                </span>
                <span className="line-clamp-2 block text-[15px] leading-relaxed">{q?.text ?? items[0].item.title}</span>
                <span className="flex flex-wrap gap-1.5">
                  {items.map(({ kind, item }) => (
                    <span key={item.id} className={`rounded-md px-2 py-0.5 text-xs font-bold ${KIND_STYLE[kind].chip}`}>
                      {KIND_STYLE[kind].label}
                    </span>
                  ))}
                </span>
              </a>
            );
          })}
          {list.length > 0 && <p className="text-[13px] text-gray-600">處理完的會自動從這裡消失。</p>}
        </section>

        {/* ── 這一則：手機蓋滿畫面（review-full 鎖背景捲動，globals.css），電腦版回到右欄。
            data-no-swipe：蓋著底部膠囊時，在這裡橫滑不該換分頁（同 DetailSheet） ── */}
        <div
          data-no-swipe=""
          className="review-full fixed inset-0 z-50 flex flex-col overflow-y-auto md:static md:z-auto md:overflow-visible"
        >
          <header className="flex h-14 flex-none items-center justify-between px-2 md:hidden">
            <a href={today} aria-label="關閉，回今天" className="grid h-11 w-11 place-items-center rounded-xl">
              <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </a>
            <div className="text-center leading-tight">
              <div className="text-base font-black">把關</div>
              <div className="text-xs text-gray-600">{remain}</div>
            </div>
            <span className="w-11" />
          </header>
          <div className="h-[3px] flex-none bg-gray-200 md:hidden">
            <div className="h-[3px] bg-amber-500" style={{ width: `${progress}%` }} />
          </div>

          {cur ? (
            // review-card：globals.css 用 CSS counter 數勾了幾筆，寫進「確認 N 筆」；一筆都沒勾時按鈕變灰
            <article className="review-card flex flex-1 flex-col">
              <div className="space-y-4 p-4 md:p-0 md:pb-6">
                <section aria-label="來源對話">
                  <h2 className="section-title mb-2">
                    來源對話 · {nameOf.get(gid) ?? gid}
                  </h2>
                  {thread.length ? (
                    <div className="card space-y-2.5 p-3">
                      {thread.map((m, i) => {
                        const who = m.sender_name ?? m.sender_id ?? '—';
                        // 手機只留來源前後各一則：離來源兩則遠的收起來
                        const far = !m.src && !thread[i - 1]?.src && !thread[i + 1]?.src;
                        return (
                          <div key={m.id} className={`gap-2.5 ${far ? 'hidden md:flex' : 'flex'} ${m.src ? '-mx-1 rounded-xl bg-amber-50 p-2.5' : 'opacity-60'}`}>
                            <span className={`grid h-7 w-7 flex-none place-items-center rounded-full text-xs font-black ${m.src ? 'bg-emerald-100 text-emerald-900' : 'bg-gray-100'}`}>
                              {who.slice(0, 1)}
                            </span>
                            <div className="min-w-0">
                              <p className={`text-xs ${m.src ? 'text-amber-900' : 'text-gray-600'}`}>
                                {who} · {fmt(m.created_at)}
                                {m.src && ' · AI 根據這句整理'}
                              </p>
                              <p className={`break-words ${m.src ? 'text-base leading-normal font-semibold' : 'text-sm'}`}>
                                {m.text ?? (m.type === 'image' ? '（圖片）' : '（檔案）')}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">來源訊息已被收回或刪除</p>
                  )}
                  <ItemPhotos items={photos} compact />
                </section>

                <section aria-label="AI 整理出的項目">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
                    <h2 className="section-title">AI 整理出 {cur.length} 筆</h2>
                    <span className="text-xs text-gray-600">錯的取消勾選，點欄位可直接改</span>
                  </div>
                  <div className="space-y-2.5">
                    {cur.map((r) => {
                      const { kind, item } = r;
                      const s = KIND_STYLE[kind];
                      const n = (k: string) => `${k}:${kind}:${item.id}`;
                      return (
                        // review-item：沒勾的那筆整張變淡（globals.css）
                        <div key={item.id} className="review-item flex gap-1 rounded-2xl border border-gray-200 bg-white py-1.5 pr-3 pl-1">
                          {/* 勾選框與欄位都掛到下面的確認表單（form 屬性，不巢狀） */}
                          <label className="grid h-11 w-11 flex-none cursor-pointer place-items-center">
                            <input
                              type="checkbox"
                              name="ids"
                              value={`${kind}:${item.id}`}
                              form={okForm}
                              defaultChecked
                              aria-label={`收下這一筆：${item.title}`}
                              className="review-pick h-5 w-5 accent-amber-600"
                            />
                          </label>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-h-11 items-center gap-2">
                              <span className={`flex-none rounded-md px-2 py-0.5 text-xs font-bold ${s.chip}`}>{s.label}</span>
                              <input
                                form={okForm}
                                name={n('title')}
                                defaultValue={item.title}
                                aria-label={`${s.label}標題`}
                                className="min-w-0 flex-1 rounded-md bg-transparent px-1 text-[17px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
                              />
                              {/* 只標「AI 依新對話改過的」——這一頁本來就全是待確認，不必每筆再貼一次 */}
                              {isRevised(item) && <PendingBadge item={item} compact />}
                            </div>
                            {fieldsOf(r).map((f) => (
                              <label key={f.k} className="flex min-h-11 items-center gap-2 border-t border-gray-100 px-1">
                                <span className="w-14 flex-none text-[13px] text-gray-600">{f.label}</span>
                                <input
                                  form={okForm}
                                  name={n(f.k)}
                                  type={f.type}
                                  defaultValue={f.v}
                                  placeholder={f.ph}
                                  className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-2 text-[15px] font-semibold outline-none placeholder:font-normal placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-amber-500/40"
                                />
                                <Pencil />
                              </label>
                            ))}
                            {kind === 'note' && (
                              <div className="border-t border-gray-100 px-1 py-2 text-sm">
                                {item.body && <p className="mb-1 line-clamp-3 text-gray-700">{item.body}</p>}
                                <a className="inline-flex min-h-11 items-center font-bold text-emerald-700" href={s.edit(slug, item.group_id, item.id, back)}>
                                  看全文、改內文 →
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {total > 1 && (
                  // 匯入舊記錄後一次幾百筆時用：照本頁同一組條件處理全部（/api/batch 的 all=1，before 之後進來的不算）
                  <form action="/api/batch" method="post" className="text-center">
                    <input type="hidden" name="kind" value="inbox" />
                    <input type="hidden" name="back" value={back} />
                    <input type="hidden" name="all" value="1" />
                    <input type="hidden" name="before" value={asof} />
                    {group && <input type="hidden" name="group" value={group} />}
                    <button className="min-h-11 px-3 text-sm font-bold text-gray-600 underline" name="action" value="confirm">
                      都看過了，全部 {total} 筆一次確認
                    </button>
                  </form>
                )}
              </div>

              {/* 左小「忽略整則」、右大「確認」：最常按的放最大、最靠拇指（principles.md：費茨定律）。
                  手機黏在畫面底，電腦版黏在右下 */}
              <div className="sticky bottom-0 mt-auto grid grid-cols-[1fr_2fr] gap-2.5 border-t border-gray-200 bg-white px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:flex md:justify-end md:bg-gray-50 md:px-0 md:pt-3.5">
                <form action="/api/batch" method="post">
                  <input type="hidden" name="kind" value="inbox" />
                  <input type="hidden" name="back" value={back} />
                  {cur.map(({ kind, item }) => (
                    <input key={item.id} type="hidden" name="ids" value={`${kind}:${item.id}`} />
                  ))}
                  {/* 不再問「確定嗎」：/api/batch 忽略後回來會帶 ?undo=，下方跳「已忽略…」＋「復原」 */}
                  <button className="btn min-h-[52px] w-full text-[15px] md:min-h-12 md:px-5" name="action" value="ignore">
                    {cur.length > 1 ? '忽略整則' : '忽略'}
                  </button>
                </form>
                <form id={okForm} action="/api/batch" method="post">
                  <input type="hidden" name="kind" value="inbox" />
                  <input type="hidden" name="back" value={back} />
                  <button className="btn-confirm review-ok min-h-[52px] w-full gap-2 text-base font-black md:min-h-12 md:px-7" name="action" value="confirm">
                    <ConfirmIcon />
                    {cur.length > 1 ? (
                      <>
                        確認 <span className="review-n" /> 筆
                      </>
                    ) : (
                      '確認'
                    )}
                  </button>
                </form>
              </div>
            </article>
          ) : (
            <div className="flex flex-1 flex-col items-center gap-3 px-8 pt-28 text-center md:pt-16">
              <h2 className="text-[28px] font-black" style={{ fontFamily: 'var(--font-title)' }}>
                都把關完了
              </h2>
              <p className="max-w-sm text-[15px] leading-relaxed text-gray-600">
                確認過的會出現在今天、待辦和行程裡，AI 之後不會亂改。群組有新對話時，AI 整理出的會先到這裡。
              </p>
              <a href={today} className="btn-primary mt-3 px-7">
                回今天
              </a>
            </div>
          )}

          {/* 忽略、確認都可復原（principles.md：可逆性優先——按錯了救得回來）。原生表單零 JS；浮在確認列上方。
              確認的復原只把那幾筆翻回待確認；確認時順手改的欄位留著，不還原 */}
          {undoneCount > 0 && (
            <div
              role="status"
              className={`fixed inset-x-4 z-[60] mx-auto flex max-w-md items-center gap-2 rounded-xl bg-gray-900 py-1 pr-1 pl-4 text-sm text-white shadow-lg ring-1 ring-white/15 ${
                cur ? 'bottom-[calc(6rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(1.75rem+env(safe-area-inset-bottom))]'
              }`}
            >
              <span className="min-w-0 flex-1 py-2 break-words">
                {undoneCount === 1 && undone[0]?.title
                  ? `${confirmed ? '已確認' : '已忽略'}「${undone[0].title}」`
                  : `${confirmed ? '已確認' : '已忽略'} ${undoneCount} 筆`}
              </span>
              <form action="/api/batch" method="post" className="flex-none">
                <input type="hidden" name="kind" value="inbox" />
                {undone.map((u) => (
                  <input key={`${u.kind}:${u.id}`} type="hidden" name="ids" value={`${u.kind}:${u.id}`} />
                ))}
                {undoneAll > 0 && [...undoAll].map((token) => <input key={token} type="hidden" name="ids" value={token} />)}
                <input type="hidden" name="back" value={back} />
                <button className="review-undo min-h-11 rounded-lg px-3 font-bold" name="action" value={confirmed ? 'unconfirm' : 'restore'}>
                  復原
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
