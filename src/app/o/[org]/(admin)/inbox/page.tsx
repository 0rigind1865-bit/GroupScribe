import { notFound } from 'next/navigation';
import { requireModule } from '@/org/orgs';
import { oh } from '@/org/href';
import { ConfirmIcon, PendingBadge } from '@/app/ui/review-ui';
import { dbConfigured, getDb } from '@/db';
import { mediaForItems } from '@/core/media';
import { ItemPhotos } from '@/app/ui/item-photos';
import { Banner } from '@/app/ui/banner';
import { SetupNotice } from '../setup-notice';
import { fmtDate, isRevised } from '@/core/date';

export const dynamic = 'force-dynamic';

// 把關（原「收件匣」）：三表待確認合流成一條把關流水線。
// 一張卡＝一句原話 → 它整理出的每一筆（可取消勾選）→ 忽略整則／確認 N 筆；兩顆都打既有的 /api/batch，零新 API。
// 無 ?group ＝ 跨群聚合（admin 殼內天然安全）；有 ?group ＝ 單群。

const LIMIT = 30;

function fmt(d: string) {
  return new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}
const md = fmtDate; // 期限/日期的格式統一在 core/date.ts

type Row = { kind: 'event' | 'task' | 'note'; item: any };

const KIND_STYLE = {
  // edit：開那一頁的詳情抽屜，帶 from＝把關頁，存檔或關閉都回這裡（detail-sheet.tsx 的 safeFrom）
  event: { label: '行程', table: 'events', chip: 'bg-emerald-100 text-emerald-800', edit: (o: string, g: string, id: string, from: string) => oh(o, '/calendar', { group: g, event: id, from }) },
  task: { label: '待辦', table: 'tasks', chip: 'bg-sky-100 text-sky-800', edit: (o: string, g: string, id: string, from: string) => oh(o, '/tasks', { group: g, task: id, from }) },
  note: { label: '公告', table: 'notes', chip: 'bg-purple-100 text-purple-900', edit: (o: string, g: string, id: string, from: string) => oh(o, '/notes', { group: g, note: id, from }) },
} as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ group?: string; undo?: string | string[] }>;
}) {
  const { org: slug } = await params;
  if (!dbConfigured()) return <SetupNotice />;
  const { group: groupParam, undo: undoParam } = await searchParams;
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

  // 來源訊息一次撈齊（每卡最多引 2 則）
  const srcIds = [...new Set(rows.flatMap((r) => r.item.source_message_ids ?? []))];
  const { data: msgs } = srcIds.length
    ? await db.from('messages').select('id, sender_name, sender_id, text, created_at').in('id', srcIds).in('group_id', ids)
    : { data: [] as any[] };
  const msgOf = new Map((msgs ?? []).map((m: any) => [m.id, m]));

  // 同時段照片：確認時看得到「講的是這張圖」，判斷更準。跨群時逐群查（單群只查一次）
  const photos = new Map<string, any[]>();
  for (const gid of new Set(rows.map((r) => r.item.group_id))) {
    const sub = rows.filter((r) => r.item.group_id === gid);
    const m = await mediaForItems(db, gid, sub.map((r) => ({ id: r.item.id, sourceIds: r.item.source_message_ids })));
    for (const [k, v] of m) photos.set(k, v);
  }

  // 剛忽略的項目（?undo=kind:id，多筆逗號串）→ 上方「已忽略『標題』」＋「復原」。
  // 單筆由卡片的忽略表單帶進 back、批次由 /api/batch 補。標題從 DB 查、不放網址；
  // 只認本公司的群、而且現在還是 ignored 的（已經復原過或被改過就不再顯示）。
  // 網址被手打成 ?undo=a&undo=b 時 Next 給的是陣列：先接成一串，不然 split 會讓整頁 500
  const undoRaw = Array.isArray(undoParam) ? undoParam.join(',') : (undoParam ?? '');
  const undoIds = new Map<Row['kind'], string[]>();
  // 「選取全部 N 筆」忽略的復原憑證 all@<毫秒>：那次 update 把每一筆的 updated_at 都寫成同一刻（/api/batch），
  // 幾百筆也不用把 id 塞進網址。筆數現查：同一刻、現在還是 ignored、仍待確認、在本公司的群
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
          .select('id, title, status')
          .in('id', list)
          .in('group_id', ids)
          .then(({ data, error }) =>
            error
              ? list.map((id) => ({ kind, id, title: '' })) // 查不到標題：照網址的筆數，只寫「已忽略 N 筆」
              : (data ?? []).filter((r: any) => r.status === 'ignored').map((r: any) => ({ kind, id: r.id as string, title: r.title as string })),
          ),
      ),
    )
  ).flat();
  const undoneAll = (
    await Promise.all(
      [...undoAll].flatMap((token) => {
        const at = new Date(Number(token.slice(4))).toISOString();
        return Object.values(KIND_STYLE).map((s) =>
          db
            .from(s.table)
            .select('id', { count: 'exact', head: true })
            .in('group_id', ids)
            .eq('updated_at', at)
            .eq('status', 'ignored')
            .eq('needs_confirmation', true)
            .then(({ count }) => count ?? 0),
        );
      }),
    )
  ).reduce((a, n) => a + n, 0);
  const undoneCount = undone.length + undoneAll;

  // back 不帶 undo：處理下一張卡（或按復原）之後橫幅自然消失
  const back = oh(slug, '/inbox', { group });

  // 同一句話整理出的幾筆收成一張卡（2026-10 設計畫布「把關模式」）：原話只出現一次、一次確認完。
  // 卡的順序跟著卡裡最新的那一筆（rows 已經新到舊）
  const cards = new Map<string, Row[]>();
  for (const r of rows) {
    const key = [...(r.item.source_message_ids ?? [])].sort().join(',') || `${r.kind}:${r.item.id}`;
    cards.set(key, [...(cards.get(key) ?? []), r]);
  }

  return (
    <main className="page">
      <div className="mb-2 flex items-center gap-3">
        <h1>把關</h1>
        {group && <span className="text-gray-500">{nameOf.get(group) ?? group}</span>}
        {total > 0 && <span className="ml-auto text-sm font-bold text-amber-700">還剩 {total} 筆</span>}
      </div>
      <p className="mb-5 text-sm leading-relaxed text-gray-600">AI 從對話整理出來的，你點頭才算數。確認過的內容 AI 之後不會亂改。</p>

      {/* 忽略可復原（principles.md：可逆性優先——按錯了五秒內救得回來）。原生表單零 JS；
          送出後全站換頁不捲動，手機上黏在頂端，往下處理到一半忽略也看得到 */}
      {undoneCount > 0 && (
        <div className="sticky top-2 z-20 mb-3 md:static">
          <Banner tone="neutral">
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 break-words">
                {undoneCount === 1 && undone[0]?.title ? `已忽略「${undone[0].title}」` : `已忽略 ${undoneCount} 筆`}
              </span>
              <form action="/api/batch" method="post" className="flex-none">
                <input type="hidden" name="kind" value="inbox" />
                {undone.map((u) => (
                  <input key={`${u.kind}:${u.id}`} type="hidden" name="ids" value={`${u.kind}:${u.id}`} />
                ))}
                {undoneAll > 0 && [...undoAll].map((token) => <input key={token} type="hidden" name="ids" value={token} />)}
                <input type="hidden" name="back" value={back} />
                <button className="btn" name="action" value="restore">
                  復原
                </button>
              </form>
            </div>
          </Banner>
        </div>
      )}

      {!rows.length && (
        <div className="card text-sm text-gray-600">
          <p className="mb-1 font-bold text-gray-900">都把關完了</p>
          <p>群組有新對話時，AI 整理出的行程、待辦、公告會先到這裡。</p>
        </div>
      )}

      <div className="space-y-4">
        {[...cards].map(([key, items], ci) => {
          const quotes = (items[0].item.source_message_ids ?? [])
            .map((id: string) => msgOf.get(id))
            .filter(Boolean)
            .slice(0, 2);
          const gid = items[0].item.group_id;
          const okForm = `ok-${ci}`;
          return (
            // review-card：globals.css 用 CSS counter 數勾了幾筆，寫進「確認 N 筆」；一筆都沒勾時按鈕變灰
            <article key={key} className="card review-card space-y-3 p-4">
              {quotes.length > 0 ? (
                <div className="space-y-2">
                  {quotes.map((m: any) => {
                    const who = m.sender_name ?? m.sender_id ?? '—';
                    return (
                      <div key={m.id} className="flex gap-2.5 rounded-xl bg-amber-50 px-3 py-2.5">
                        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-emerald-100 text-[13px] font-black text-emerald-900">
                          {String(who).slice(0, 1)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs text-amber-900">
                            {who} · {fmt(m.created_at)}
                            {!group && ` · ${nameOf.get(gid) ?? gid}`}
                          </p>
                          <p className="text-[15px] leading-relaxed break-words">{m.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-500">（來源訊息已被收回或刪除）{!group && ` · ${nameOf.get(gid) ?? gid}`}</p>
              )}

              <p className="text-xs font-bold tracking-wider text-gray-600">
                AI 整理出 {items.length} 筆{items.length > 1 && '　不對的那筆取消勾選'}
              </p>
              <ul className="divide-y divide-gray-100">
                {items.map(({ kind, item }) => {
                  const s = KIND_STYLE[kind];
                  const meta =
                    kind === 'event'
                      ? [item.starts_at && md(item.starts_at), item.start_time && String(item.start_time).slice(0, 5), item.location]
                      : kind === 'task'
                        ? [item.due_at && `期限 ${md(item.due_at)}`, item.assignee]
                        : [item.kind === 'decision' ? '決議' : '公告'];
                  return (
                    <li key={item.id} className="flex items-start gap-2 py-2">
                      {/* 整塊 label 都是勾選的觸控目標；勾選框掛到下面的確認表單（form 屬性，不巢狀） */}
                      <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                        <input
                          type="checkbox"
                          name="ids"
                          value={`${kind}:${item.id}`}
                          form={okForm}
                          defaultChecked
                          className="review-pick mt-0.5 h-5 w-5 flex-none accent-amber-600"
                        />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${s.chip}`}>{s.label}</span>
                            <span className="text-[15px] font-bold">{item.title}</span>
                            {/* 只標「AI 依新對話改過的」——這一頁本來就全是待確認，不必每筆再貼一次 */}
                            {isRevised(item) && <PendingBadge item={item} compact />}
                          </span>
                          {meta.some(Boolean) && <span className="mt-0.5 block text-[13px] text-gray-600">{meta.filter(Boolean).join(' · ')}</span>}
                        </span>
                      </label>
                      <a className="flex min-h-11 flex-none items-center px-2 text-sm font-bold text-emerald-700" href={s.edit(slug, item.group_id, item.id, back)}>
                        修改
                      </a>
                    </li>
                  );
                })}
              </ul>
              <ItemPhotos items={photos.get(items[0].item.id)} compact />

              {/* 左小「忽略整則」、右大「確認」：最常按的放最大、最靠拇指（principles.md：費茨定律） */}
              <div className="flex gap-2">
                <form action="/api/batch" method="post" className="flex-1">
                  <input type="hidden" name="kind" value="inbox" />
                  <input type="hidden" name="back" value={back} />
                  {items.map(({ kind, item }) => (
                    <input key={item.id} type="hidden" name="ids" value={`${kind}:${item.id}`} />
                  ))}
                  {/* /api/batch 忽略後回來會帶 ?undo=：上方出現「已忽略…」＋「復原」 */}
                  <button className="btn w-full" name="action" value="ignore">
                    {items.length > 1 ? '忽略整則' : '忽略'}
                  </button>
                </form>
                <form id={okForm} action="/api/batch" method="post" className="flex-[2]">
                  <input type="hidden" name="kind" value="inbox" />
                  <input type="hidden" name="back" value={back} />
                  <button className="btn-confirm review-ok w-full gap-1.5" name="action" value="confirm">
                    <ConfirmIcon />
                    {items.length > 1 ? (
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
          );
        })}
      </div>

      {total > rows.length && <p className="mt-4 text-center text-sm text-gray-500">先顯示最新 {rows.length} 筆，處理完會自動補上下一批。</p>}
      {total > 1 && (
        // 匯入舊記錄後一次幾百筆時用：照本頁同一組條件處理全部（/api/batch 的 all=1，before 之後進來的不算）
        <form action="/api/batch" method="post" className="mt-6 text-center">
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
    </main>
  );
}
