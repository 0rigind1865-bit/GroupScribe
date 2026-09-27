import { notFound } from 'next/navigation';
import { requireModule } from '@/org/orgs';
import { oh } from '@/org/href';
import { ConfirmIcon, PendingBadge } from '@/app/ui/review-ui';
import { dbConfigured, getDb } from '@/db';
import { mediaForItems } from '@/core/media';
import { ItemPhotos } from '@/app/ui/item-photos';
import { Banner } from '@/app/ui/banner';
import { SetupNotice } from '../setup-notice';
import { BatchBar, BatchBox, SelectMode } from '../batch-bar';
import { fmtDate } from '@/core/date';

export const dynamic = 'force-dynamic';

// 收件匣（UI 提案階段 C）：三表待確認合流成一條把關流水線。
// 一張卡＝「來源訊息引文 → AI 整理結果 → 忽略/修改/確認」；確認/忽略直接打既有單筆 update 路由，零新 API。
// 無 ?group ＝ 跨群聚合（admin 殼內天然安全）；有 ?group ＝ 單群。

const LIMIT = 30;

function fmt(d: string) {
  return new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}
const md = fmtDate; // 期限/日期的格式統一在 core/date.ts

type Row = { kind: 'event' | 'task' | 'note'; item: any };

const KIND_STYLE = {
  event: { label: '事件', table: 'events', chip: 'bg-emerald-100 text-emerald-800', route: '/api/events/update', edit: (o: string, g: string, id: string) => oh(o, '/calendar', { group: g, event: id }) },
  task: { label: '待辦', table: 'tasks', chip: 'bg-sky-100 text-sky-800', route: '/api/tasks/update', edit: (o: string, g: string, id: string) => oh(o, '/tasks', { group: g, task: id }) },
  note: { label: '公告', table: 'notes', chip: 'bg-purple-100 text-purple-900', route: '/api/notes/update', edit: (o: string, g: string, id: string) => oh(o, '/notes', { group: g, note: id }) },
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
  const undoBack = (kind: Row['kind'], id: string) => oh(slug, '/inbox', { group, undo: `${kind}:${id}` });

  return (
    <main className="page">
      <div className="mb-2 flex items-center gap-3">
        <h1>收件匣</h1>
        {group && <span className="text-gray-500">{nameOf.get(group) ?? group}</span>}
        {total > 0 && <span className="ml-auto text-sm font-bold text-amber-700">還剩 {total} 筆</span>}
        {rows.length > 0 && <SelectMode />}
      </div>
      <p className="mb-5 text-sm leading-relaxed text-gray-500">
        AI 從對話整理出來的項目先到這裡，經你把關才算數。確認過的內容 AI 之後不會亂改。
      </p>

      {/* 忽略可復原（principles.md：可逆性優先——按錯了五秒內救得回來）。原生表單零 JS；
          送出後全站換頁不捲動，手機上黏在頂端，往下處理到一半忽略也看得到 */}
      {undoneCount > 0 && (
        <div className="sticky top-2 z-20 md:static">
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
        <div className="card text-sm text-gray-500">
          <p className="mb-1 font-bold text-gray-700">沒有待確認的項目</p>
          <p>群組有新對話時，AI 抽取的事件/待辦/公告會出現在這裡。可先到「今天」看本週安排。</p>
        </div>
      )}

      {/* 勾選後底部浮出批次列（與待辦/月曆頁同一套）：全選 → 確認，一次把關一批 */}
      {rows.length > 0 && (
        <BatchBar
          kind="inbox"
          back={back}
          total={total}
          group={group}
          before={asof}
          actions={[
            { action: 'confirm', label: '確認' },
            { action: 'ignore', label: '忽略', danger: true },
          ]}
        />
      )}
      <div className="space-y-3">
        {rows.map(({ kind, item }) => {
          const s = KIND_STYLE[kind];
          const quotes = (item.source_message_ids ?? [])
            .map((id: string) => msgOf.get(id))
            .filter(Boolean)
            .slice(0, 2);
          const meta =
            kind === 'event'
              ? [item.starts_at && md(item.starts_at), item.start_time && String(item.start_time).slice(0, 5), item.location]
              : kind === 'task'
                ? [item.due_at && `期限 ${md(item.due_at)}`, item.assignee]
                : [item.kind === 'decision' ? '決議' : '公告'];
          return (
            <div key={item.id} className="card space-y-3 p-4">
              {quotes.length > 0 ? (
                <div className="space-y-1 rounded-lg bg-gray-100 px-3 py-2 text-xs leading-relaxed text-gray-500">
                  {quotes.map((m: any) => (
                    <p key={m.id} className="line-clamp-2">
                      [{fmt(m.created_at)} {m.sender_name ?? m.sender_id ?? '—'}]{' '}
                      <span className="text-gray-700">{m.text}</span>
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">（來源訊息已被收回或刪除）</p>
              )}
              <div className="flex items-start gap-2">
                <BatchBox id={`${kind}:${item.id}`} />
                <span className={`mt-0.5 flex-none rounded-md px-2 py-0.5 text-xs font-bold ${s.chip}`}>
                  {s.label}
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-bold">
                    {item.title}
                    {/* 分辨「AI 新抽的」與「AI 依新對話改過的」——後者你可能已經確認過一次 */}
                    <span className="ml-1.5 align-middle">
                      <PendingBadge item={item} compact />
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {meta.filter(Boolean).join(' · ')}
                    {!group && (
                      <span className="ml-1.5 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800">
                        {nameOf.get(item.group_id) ?? item.group_id}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <ItemPhotos items={photos.get(item.id)} compact />
              <div className="flex gap-2">
                <form action={s.route} method="post" className="flex-1">
                  <input type="hidden" name="id" value={item.id} />
                  {/* 忽略後回來帶 ?undo=：上方出現「已忽略…」＋「復原」 */}
                  <input type="hidden" name="back" value={undoBack(kind, item.id)} />
                  <button className="btn-danger w-full" name="action" value="ignore">
                    忽略
                  </button>
                </form>
                <a
                  className="btn flex flex-1 items-center justify-center"
                  href={s.edit(slug, item.group_id, item.id)}
                >
                  編輯
                </a>
                <form action={s.route} method="post" className="flex-[1.6]">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="back" value={back} />
                  <button className="btn-confirm inline-flex w-full items-center justify-center gap-1" name="action" value="confirm">
                    <ConfirmIcon />
                    確認
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>

      {total > rows.length && (
        <p className="mt-4 text-center text-sm text-gray-400">
          先顯示最新 {rows.length} 筆，處理完會自動補上下一批。要一次處理全部 {total} 筆：按右上「選取」→ 勾任一筆 → 底下「全選」→「選取全部 {total} 筆」。
        </p>
      )}
    </main>
  );
}
