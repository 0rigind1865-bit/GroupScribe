import { notFound } from 'next/navigation';
import { ConfirmIcon, PendingBadge } from '@/app/ui/review-ui';
import { TaskCircle, realAssignee } from '@/app/ui/item-marker';
import { fmtDate, isOverdue } from '@/core/date';
import { orgBySlug } from '@/org/orgs';
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

function TaskRow({ t, back }: { t: any; back: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm">
      <BatchBox id={t.id} />
      {t.status === 'open' && (
        <TaskCircle formAction="/api/tasks/update" id={t.id} back={back} title={t.title} overdue={!!t.due_at && isOverdue(t.due_at)} />
      )}
      {/* 兩行：上＝標題（＋待確認徽章），下＝負責人與期限（設計稿 2026-09） */}
      <div className="min-w-0 flex-1">
        <p className={`font-bold ${t.status === 'done' ? 'text-gray-400 line-through' : ''}`}>
          {t.title}
          {/* 待確認的兩種來源要分開講：新抽的 vs AI 依新對話改過的 */}
          <span className="ml-1.5 align-middle">
            <PendingBadge item={t} />
          </span>
        </p>
        {(realAssignee(t.assignee) || t.due_at) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {realAssignee(t.assignee) && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{t.assignee}</span>
            )}
            {t.due_at &&
              (t.status === 'open' && isOverdue(t.due_at) ? (
                // 與「今天」頁同一套判斷與紅字（principles.md：一致性）
                <span className="text-xs font-bold text-red-600">逾期 {fmtDate(t.due_at)}</span>
              ) : (
                <span className="text-xs text-gray-500">期限 {fmtDate(t.due_at)}</span>
              ))}
          </div>
        )}
      </div>
      {/* 一列只留兩個動作（U3）：左邊的圈＝完成、右邊「編輯」；待確認多一顆「確認」、封存區多一顆「重新開啟」。
          「忽略」降到編輯卡裡——它是低頻且不可逆度較高的動作，不該跟高頻動作並排。 */}
      <span className="flex flex-none flex-wrap justify-end gap-1.5">
        {t.needs_confirmation && t.status === 'open' && (
          <form action="/api/tasks/update" method="post">
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="back" value={back} />
            <button className="btn-confirm btn-sm" name="action" value="confirm">
              <ConfirmIcon />
              確認
            </button>
          </form>
        )}
        {t.status !== 'open' && (
          <form action="/api/tasks/update" method="post">
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="back" value={back} />
            <button className="btn btn-sm" name="action" value="reopen">
              重新開啟
            </button>
          </form>
        )}
        <a className="btn btn-sm" href={`${back}&task=${t.id}`}>
          編輯
        </a>
      </span>
    </li>
  );
}

export default async function TasksPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ group?: string; task?: string; view?: string }>;
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
  const group = scopedGroup(`/o/${slug}/tasks`, params, groupOptions);
  const groupName = groupOptions.find((g) => g.group_id === group)?.name ?? group;

  // 已處置的待辦降到深一層視圖（principles.md 規則三）：主畫面只查進行中，
  // 已完成／已忽略各自一個 ?view=，主畫面連筆數都不提（計數本身即噪音）。
  const archived = params.view === 'done' || params.view === 'ignored' ? params.view : null;

  let tasks: any[] = [];
  if (group) {
    tasks =
      (
        await db
          .from('tasks')
          .select('*')
          .eq('group_id', group)
          .eq('status', archived ?? 'open')
          .order('due_at', { nullsFirst: false })
          .order('created_at')
      ).data ?? [];
  }
  const pending = archived ? [] : tasks.filter((t) => t.needs_confirmation);
  const open = archived ? [] : tasks.filter((t) => !t.needs_confirmation);

  // 詳情（?task= 展開編輯）
  let detail: any = null;
  let sources: any[] = [];
  let related: RelatedItem[] = [];
  let photos: any[] = [];
  if (params.task && group) {
    // 加 group_id 條件：防跨群讀取（LIFF 前置）
    detail = (await db.from('tasks').select('*').eq('id', params.task).eq('group_id', group).maybeSingle()).data;
    if (detail?.source_message_ids?.length) {
      sources =
        (
          await db
            .from('messages')
            .select('sender_name, sender_id, text, created_at')
            .in('id', detail.source_message_ids)
            .order('created_at')
        ).data ?? [];
      related = await relatedItems(db, slug, group, detail.source_message_ids, { type: 'task', id: detail.id });
      photos = (await mediaForItems(db, group, [{ id: detail.id, sourceIds: detail.source_message_ids }])).get(detail.id) ?? [];
    }
  }

  const g = encodeURIComponent(group ?? '');
  const back = `/o/${slug}/tasks?group=${g}${archived ? `&view=${archived}` : ''}`;

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-8">
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <h1 className="text-3xl md:text-4xl">待辦</h1>
        {archived && (
          <span className="rounded bg-gray-100 px-2 py-0.5 text-sm text-gray-600">
            {archived === 'done' ? '已完成' : '已忽略'}
          </span>
        )}
        {group && <span className="text-gray-500">{groupName}</span>}
        {group && tasks.length > 0 && <span className="ml-auto"><SelectMode /></span>}
      </div>

      {!group && <p className="text-gray-600">還沒有任何群組資料。</p>}

      {group && tasks.length > 0 && (
        <BatchBar
          kind="task"
          back={back}
          actions={[
            { action: 'confirm', label: '確認' },
            { action: 'done', label: '完成' },
            { action: 'ignore', label: '忽略', danger: true },
            { action: 'restore', label: '重新開啟' },
          ]}
        />
      )}

      {group && archived && (
        <div className="space-y-5">
          <section>
            {tasks.length ? (
              <ul className="space-y-1.5">
                {tasks.map((t) => (
                  <TaskRow key={t.id} t={t} back={back} />
                ))}
              </ul>
            ) : (
              <div className="card text-sm text-gray-500">
                <p className="mb-1 font-bold text-gray-700">
                  沒有{archived === 'done' ? '已完成' : '已忽略'}的待辦
                </p>
                <p>在主畫面{archived === 'done' ? '完成' : '忽略'}掉的待辦會留在這裡，隨時可以重新開啟。</p>
              </div>
            )}
          </section>
          <a className="inline-block text-sm text-emerald-700 underline" href={`/o/${slug}/tasks?group=${g}`}>
            ← 回到待辦
          </a>
        </div>
      )}

      {group && !archived && (
        <div className="space-y-5">
          {pending.length > 0 && (
            <section>
              <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <h2 className="text-xs font-bold tracking-widest text-amber-700">待確認 · AI 抽取</h2>
                <ul className="space-y-2">
                  {pending.map((t) => (
                    <TaskRow key={t.id} t={t} back={back} />
                  ))}
                </ul>
              </div>
            </section>
          )}
          <section>
            <h2 className="mb-2 text-xs font-bold tracking-widest text-gray-500">進行中</h2>
            {open.length ? (
              <ul className="space-y-2">
                {open.map((t) => (
                  <TaskRow key={t.id} t={t} back={back} />
                ))}
              </ul>
            ) : (
              <div className="card text-sm text-gray-500">
                <p className="mb-1 font-bold text-gray-700">目前沒有進行中的待辦</p>
                <p>
                  群組裡交辦事情時，AI 會自動整理進來。也可以到{' '}
                  <a className="text-emerald-700 underline" href={`/o/${slug}/inbox`}>收件匣</a> 看待確認的項目。
                </p>
              </div>
            )}
          </section>
          {/* 入口不帶筆數：計數本身就是噪音（principles.md 規則三） */}
          <div className="flex flex-wrap gap-4">
            <a className="text-sm text-gray-500 underline" href={`/o/${slug}/tasks?group=${g}&view=done`}>
              已完成的待辦 →
            </a>
            <a className="text-sm text-gray-500 underline" href={`/o/${slug}/tasks?group=${g}&view=ignored`}>
              已忽略的待辦 →
            </a>
          </div>
        </div>
      )}

      {detail && (
        <div className="card mt-5">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-lg font-bold">編輯待辦</h2>
            {detail.needs_confirmation && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">⚠ AI 抽取，待確認</span>
            )}
          </div>
          <form action="/api/tasks/update" method="post" className="space-y-3 text-sm">
            <input type="hidden" name="id" value={detail.id} />
            <input type="hidden" name="back" value={back} />
            <div className="flex flex-wrap gap-3">
              <label className="flex-1 basis-64">
                內容
                <input className="input mt-1 block w-full" name="title" defaultValue={detail.title} required />
              </label>
              <label>
                負責人
                <input className="input mt-1 block w-32" name="assignee" defaultValue={detail.assignee ?? ''} />
              </label>
              <label>
                期限
                <input className="input mt-1 block" type="date" name="due" defaultValue={detail.due_at ?? ''} />
              </label>
            </div>
            <label className="block">
              備註
              <input className="input mt-1 block w-full" name="note" defaultValue={detail.note ?? ''} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" name="action" value="save">
                儲存修正
              </button>
              {detail.status !== 'ignored' && (
                <button className="btn-danger" name="action" value="ignore">
                  忽略
                </button>
              )}
            </div>
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
