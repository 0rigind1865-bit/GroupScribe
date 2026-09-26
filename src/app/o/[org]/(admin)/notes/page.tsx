import { notFound } from 'next/navigation';
import { orgBySlug } from '@/org/orgs';
import { ConfirmIcon, PendingBadge } from '@/app/ui/review-ui';
import { scopedGroup } from '../group-scope';
import { dbConfigured, getDb } from '@/db';
import { relatedItems, type RelatedItem } from '@/core/links';
import { SetupNotice } from '../setup-notice';
import { RelatedItems } from '../related-items';
import { BatchBar, BatchBox, SelectMode } from '../batch-bar';
import { mediaForItems } from '@/core/media';
import { ItemPhotos } from '@/app/ui/item-photos';

export const dynamic = 'force-dynamic';

function fmt(d: string) {
  return new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
}
const kindLabel = (k: string) => (k === 'decision' ? '決議' : '公告');
const kindClass = (k: string) =>
  k === 'decision' ? 'bg-blue-100 text-blue-900' : 'bg-purple-100 text-purple-900';

function NoteRow({ n, back }: { n: any; back: string }) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm">
      <BatchBox id={n.id} />
      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${kindClass(n.kind)}`}>{kindLabel(n.kind)}</span>
      {n.pinned && (
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-700" fill="none" stroke="currentColor" strokeWidth="1.8">
          <title>置頂</title>
          <path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z" />
        </svg>
      )}
      <span className="font-bold">{n.title}</span>
      <PendingBadge item={n} />
      <span className="ml-auto flex flex-wrap gap-1.5">
        <a className="btn btn-sm" href={`${back}&note=${n.id}`}>
          編輯
        </a>
        <form action="/api/notes/update" method="post" className="flex flex-wrap gap-1.5">
          <input type="hidden" name="id" value={n.id} />
          <input type="hidden" name="back" value={back} />
          {n.needs_confirmation && n.status === 'active' && (
            <button className="btn-confirm btn-sm" name="action" value="confirm">
              <ConfirmIcon />
              確認
            </button>
          )}
          {n.status === 'active' && (
            <button className="btn btn-sm" name="action" value={n.pinned ? 'unpin' : 'pin'}>
              {n.pinned ? '取消置頂' : '置頂'}
            </button>
          )}
          {n.status === 'active' ? (
            <button className="btn-danger btn-sm" name="action" value="ignore">
              忽略
            </button>
          ) : (
            <button className="btn btn-sm" name="action" value="restore">
              復原
            </button>
          )}
        </form>
      </span>
    </li>
  );
}

export default async function NotesPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ group?: string; note?: string; view?: string }>;
}) {
  if (!dbConfigured()) return <SetupNotice />;
  const { org: slug } = await routeParams;
  const org = await orgBySlug(slug);
  if (!org) notFound();
  const params = await searchParams;
  const db = getDb();

  const { data: groupRows } = await db
    .from('groups_view')
    .select('group_id, name')
    .eq('org_id', org.id)
    .order('last_at', { ascending: false });
  const groupOptions = (groupRows ?? []) as { group_id: string; name: string | null }[];
  const group = scopedGroup(`/o/${slug}/notes`, params, groupOptions);
  const groupName = groupOptions.find((g) => g.group_id === group)?.name ?? group;

  // 已處置的項目降到深一層視圖（principles.md 規則三）：主畫面不查、不顯示、連筆數都不提，
  // 因為「已忽略（201）」這個數字本身就是天天提醒你有 201 筆垃圾的噪音源。
  const archived = params.view === 'ignored';

  let notes: any[] = [];
  if (group) {
    notes =
      (
        await db
          .from('notes')
          .select('*')
          .eq('group_id', group)
          .eq('status', archived ? 'ignored' : 'active')
          .order('pinned', { ascending: false })
          .order('created_at', { ascending: false })
      ).data ?? [];
  }
  const pending = archived ? [] : notes.filter((n) => n.needs_confirmation);
  const active = archived ? [] : notes.filter((n) => !n.needs_confirmation);

  let detail: any = null;
  let sources: any[] = [];
  let related: RelatedItem[] = [];
  let photos: any[] = [];
  if (params.note && group) {
    detail = (await db.from('notes').select('*').eq('id', params.note).eq('group_id', group).maybeSingle()).data;
    if (detail?.source_message_ids?.length) {
      sources =
        (
          await db
            .from('messages')
            .select('sender_name, sender_id, text, created_at')
            .in('id', detail.source_message_ids)
            .order('created_at')
        ).data ?? [];
      related = await relatedItems(db, slug, group, detail.source_message_ids, { type: 'note', id: detail.id });
      photos = (await mediaForItems(db, group, [{ id: detail.id, sourceIds: detail.source_message_ids }])).get(detail.id) ?? [];
    }
  }

  const g = encodeURIComponent(group ?? '');
  const back = `/o/${slug}/notes?group=${g}${archived ? '&view=ignored' : ''}`;

  return (
    <main className="page">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <h1>公告 / 決議</h1>
        {archived && <span className="rounded bg-gray-100 px-2 py-0.5 text-sm text-gray-600">已忽略</span>}
        {group && <span className="text-gray-500">{groupName}</span>}
      </div>

      {!group && <p className="text-gray-600">還沒有任何群組資料。</p>}

      {group && notes.length > 0 && (
        <>
          <div className="mb-2 flex justify-end"><SelectMode /></div>
          <BatchBar
            kind="note"
            back={back}
            actions={[
              { action: 'confirm', label: '確認' },
              { action: 'ignore', label: '忽略', danger: true },
              { action: 'restore', label: '復原' },
            ]}
          />
        </>
      )}

      {group && archived && (
        <div className="space-y-5">
          <section>
            {notes.length ? (
              <ul className="space-y-1.5">
                {notes.map((n) => (
                  <NoteRow key={n.id} n={n} back={back} />
                ))}
              </ul>
            ) : (
              <div className="card text-sm text-gray-500">
                <p className="mb-1 font-bold text-gray-700">沒有已忽略的公告</p>
                <p>在主畫面忽略掉的項目會留在這裡，隨時可以復原。</p>
              </div>
            )}
          </section>
          <a className="inline-block text-sm text-emerald-700 underline" href={`/o/${slug}/notes?group=${g}`}>
            ← 回到公告 / 決議
          </a>
        </div>
      )}

      {group && !archived && (
        <div className="space-y-5">
          {pending.length > 0 && (
            <section>
              <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <h2 className="section-title text-amber-700">待確認 · AI 抽取</h2>
              <ul className="space-y-2">
                {pending.map((n) => (
                  <NoteRow key={n.id} n={n} back={back} />
                ))}
              </ul>
              </div>
            </section>
          )}
          <section>
            <h2 className="mb-2 section-title">有效</h2>
            {active.length ? (
              <ul className="space-y-1.5">
                {active.map((n) => (
                  <NoteRow key={n.id} n={n} back={back} />
                ))}
              </ul>
            ) : (
              <div className="card text-sm text-gray-500">
                <p className="mb-1 font-bold text-gray-700">目前沒有公告或決議</p>
                <p>群組裡拍板規則或宣布事項時（例如「以後到場一律提前 30 分鐘」），AI 會整理到這裡。</p>
              </div>
            )}
          </section>
          {/* 入口不帶筆數：計數本身就是噪音（principles.md 規則三） */}
          <a className="inline-block text-sm text-gray-500 underline" href={`/o/${slug}/notes?group=${g}&view=ignored`}>
            已忽略的公告 →
          </a>
        </div>
      )}

      {detail && (
        <div className="card mt-5">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="card-title">編輯</h2>
            {detail.needs_confirmation && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">⚠ AI 抽取，待確認</span>
            )}
          </div>
          <form action="/api/notes/update" method="post" className="space-y-3 text-sm">
            <input type="hidden" name="id" value={detail.id} />
            <input type="hidden" name="back" value={back} />
            <div className="flex flex-wrap gap-3">
              <label className="flex-1 basis-64">
                標題
                <input className="input mt-1 block w-full" name="title" defaultValue={detail.title} required />
              </label>
              <label>
                類型
                <select className="input mt-1 block" name="kind" defaultValue={detail.kind}>
                  <option value="announcement">公告</option>
                  <option value="decision">決議</option>
                </select>
              </label>
            </div>
            <label className="block">
              內容
              <textarea className="input mt-1 block w-full" name="body" rows={3} defaultValue={detail.body ?? ''} />
            </label>
            <button className="btn-primary" name="action" value="save">
              儲存修正
            </button>
          </form>
          <h3 className="mt-4 mb-2 text-sm font-bold text-gray-600">來源訊息</h3>
          {sources.length ? (
            <ul className="space-y-1 text-sm">
              {sources.map((s, i) => (
                <li key={i} className="rounded bg-gray-50 px-2 py-1">
                  <span className="text-gray-500">
                    {fmt(s.created_at)}｜{s.sender_name ?? s.sender_id ?? '—'}：
                  </span>
                  {s.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">
              {detail.source === 'manual' ? '手動建立' : '來源訊息已被收回或刪除'}
            </p>
          )}
          <ItemPhotos items={photos} />
          <RelatedItems items={related} />
        </div>
      )}
    </main>
  );
}
