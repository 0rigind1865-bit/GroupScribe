import { notFound } from 'next/navigation';
import { orgBySlug } from '@/org/orgs';
import { oh } from '@/org/href';
import { ConfirmIcon, PendingBadge } from '@/app/ui/review-ui';
import { dbConfigured, getDb } from '@/db';
import { mediaForItems } from '@/core/media';
import { ItemPhotos } from '@/app/ui/item-photos';
import { SetupNotice } from '../setup-notice';
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
  event: { label: '事件', chip: 'bg-emerald-600', route: '/api/events/update', edit: (o: string, g: string, id: string) => oh(o, '/calendar', { group: g, event: id }) },
  task: { label: '待辦', chip: 'bg-sky-600', route: '/api/tasks/update', edit: (o: string, g: string, id: string) => oh(o, '/tasks', { group: g, task: id }) },
  note: { label: '公告', chip: 'bg-purple-600', route: '/api/notes/update', edit: (o: string, g: string, id: string) => oh(o, '/notes', { group: g, note: id }) },
} as const;

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ group?: string }>;
}) {
  const { org: slug } = await params;
  if (!dbConfigured()) return <SetupNotice />;
  const { group } = await searchParams;
  const db = getDb();

  const filt = (q: any) => (group ? q.eq('group_id', group) : q);
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
    ? await db.from('messages').select('id, sender_name, sender_id, text, created_at').in('id', srcIds)
    : { data: [] as any[] };
  const msgOf = new Map((msgs ?? []).map((m: any) => [m.id, m]));

  const org = await orgBySlug(slug);
  if (!org) notFound();
  const { data: groupRows } = await db.from('groups_view').select('group_id, name').eq('org_id', org.id);
  const nameOf = new Map((groupRows ?? []).map((g: any) => [g.group_id, g.name ?? g.group_id]));

  // 同時段照片：確認時看得到「講的是這張圖」，判斷更準。跨群時逐群查（單群只查一次）
  const photos = new Map<string, any[]>();
  for (const gid of new Set(rows.map((r) => r.item.group_id))) {
    const sub = rows.filter((r) => r.item.group_id === gid);
    const m = await mediaForItems(db, gid, sub.map((r) => ({ id: r.item.id, sourceIds: r.item.source_message_ids })));
    for (const [k, v] of m) photos.set(k, v);
  }

  const back = `/o/${slug}/inbox${group ? `?group=${encodeURIComponent(group)}` : ''}`;

  return (
    <main className="mx-auto max-w-2xl p-5">
      <div className="mb-1 flex items-baseline gap-3">
        <h1 className="text-2xl font-bold">收件匣</h1>
        {group && <span className="text-gray-500">{nameOf.get(group) ?? group}</span>}
        {total > 0 && <span className="ml-auto text-sm text-gray-500">還剩 {total} 筆</span>}
      </div>
      <p className="mb-4 text-sm text-gray-500">
        AI 從對話整理出來的項目先到這裡，經你把關才算數。確認過的內容 AI 之後不會亂改。
      </p>

      {!rows.length && (
        <div className="card text-sm text-gray-500">
          <p className="mb-1 font-bold text-gray-700">沒有待確認的項目</p>
          <p>群組有新對話時，AI 抽取的事件/待辦/公告會出現在這裡。可先到「今天」看本週安排。</p>
        </div>
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
            <div key={item.id} className="card space-y-2.5 p-3.5">
              {quotes.length > 0 ? (
                <div className="space-y-1 rounded bg-gray-50 px-3 py-2 text-xs text-gray-500">
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
              <div className="flex items-start gap-2.5">
                <span className={`mt-0.5 flex-none rounded px-1.5 py-0.5 text-xs font-bold text-white ${s.chip}`}>
                  {s.label}
                </span>
                <div className="min-w-0">
                  <p className="font-bold">
                    {item.title}
                    {/* 分辨「AI 新抽的」與「AI 依新對話改過的」——後者你可能已經確認過一次 */}
                    <span className="ml-1.5 align-middle">
                      <PendingBadge item={item} compact />
                    </span>
                  </p>
                  <p className="text-xs text-gray-500">
                    {meta.filter(Boolean).join(' · ')}
                    {!group && (
                      <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
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
                  <input type="hidden" name="back" value={back} />
                  <button className="btn w-full" name="action" value="ignore">
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
        <p className="mt-4 text-center text-sm text-gray-400">先處理這 {rows.length} 筆，確認後重新整理載入下一批。</p>
      )}
    </main>
  );
}
