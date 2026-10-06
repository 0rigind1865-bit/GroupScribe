import { notFound } from 'next/navigation';
import { ConfirmIcon, DoneIcon, PendingBadge } from '@/app/ui/review-ui';
import { TaskCircle, realAssignee } from '@/app/ui/item-marker';
import { DetailSheet, SourceQuotes, safeFrom } from '@/app/ui/detail-sheet';
import { addDays } from '@/core/grid';
import { fmtDate, isOverdue, todayISO } from '@/core/date';
import { requireModule } from '@/org/orgs';
import { scopedGroup } from '../group-scope';
import { dbConfigured, getDb } from '@/db';
import { relatedItems, type RelatedItem } from '@/core/links';
import { SetupNotice } from '../setup-notice';
import { RelatedItems } from '../related-items';
import { BatchBar, BatchBox, SelectMode } from '../batch-bar';
import { mediaForItems } from '@/core/media';
import { ItemPhotos } from '@/app/ui/item-photos';

export const dynamic = 'force-dynamic';

// 一列只留一個動作（2026-10 設計畫布「待辦」）：左邊的圈＝完成；點列上其他地方＝從下面拉出詳情。
// 「確認／修改／忽略」都收進詳情抽屜；待確認的不另開一區，直接在列上標「待把關」。
function TaskRow({ t, back, open }: { t: any; back: string; open: string }) {
  const late = t.status === 'open' && isOverdue(t.due_at);
  return (
    <li className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm">
      <BatchBox id={t.id} />
      {t.status === 'open' && <TaskCircle formAction="/api/tasks/update" id={t.id} back={back} title={t.title} overdue={late} />}
      <a href={open} className="min-w-0 flex-1 py-0.5 hover:opacity-70">
        <span className={`block font-bold ${t.status === 'done' ? 'text-gray-500 line-through' : ''}`}>
          {t.title}
          {t.needs_confirmation && t.status === 'open' && (
            <span className="ml-1.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 align-middle text-[11px] font-bold text-amber-900">待把關</span>
          )}
        </span>
        {(realAssignee(t.assignee) || t.due_at) && (
          <span className={`mt-0.5 block text-xs ${late ? 'font-bold text-red-600' : 'text-gray-600'}`}>
            {[t.due_at && (late ? `逾期 ${fmtDate(t.due_at)}` : `期限 ${fmtDate(t.due_at)}`), realAssignee(t.assignee)].filter(Boolean).join(' · ')}
          </span>
        )}
      </a>
      {t.status !== 'open' && (
        <form action="/api/tasks/update" method="post" className="flex-none">
          <input type="hidden" name="id" value={t.id} />
          <input type="hidden" name="back" value={back} />
          <button className="btn btn-sm" name="action" value="reopen">
            重新開啟
          </button>
        </form>
      )}
    </li>
  );
}

export default async function TasksPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ group?: string; task?: string; view?: string; from?: string }>;
}) {
  if (!dbConfigured()) return <SetupNotice />;
  const { org: slug } = await routeParams;
  const { org } = await requireModule(slug, 'gs');
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
  // 依期限分組（逾期／7 天內／之後／沒有期限）；查詢已照期限排好
  const today = todayISO();
  const in7 = addDays(today, 7);
  const buckets = archived
    ? []
    : [
        { title: '逾期', tone: 'text-red-700', rows: tasks.filter((t) => isOverdue(t.due_at, today)) },
        { title: '7 天內', tone: '', rows: tasks.filter((t) => t.due_at && t.due_at >= today && t.due_at <= in7) },
        { title: '之後', tone: '', rows: tasks.filter((t) => t.due_at && t.due_at > in7) },
        { title: '沒有期限', tone: '', rows: tasks.filter((t) => !t.due_at) },
      ].filter((b) => b.rows.length);

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
  // 從把關頁「修改」進來：關閉、存檔都回把關頁
  const from = safeFrom(slug, params.from);
  const openHref = (id: string) => `${back}&task=${id}`;

  return (
    <main className="page">
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <h1>待辦</h1>
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
                  <TaskRow key={t.id} t={t} back={back} open={openHref(t.id)} />
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
          {buckets.length ? (
            buckets.map((b) => (
              <section key={b.title}>
                <h2 className={`mb-2 section-title ${b.tone}`}>{b.title}</h2>
                <ul className="space-y-2">
                  {b.rows.map((t: any) => (
                    <TaskRow key={t.id} t={t} back={back} open={openHref(t.id)} />
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <div className="card text-sm text-gray-600">
              <p className="mb-1 font-bold text-gray-900">目前沒有進行中的待辦</p>
              <p>群組裡交辦事情時，AI 會自動整理進來。</p>
            </div>
          )}
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
        <DetailSheet
          closeHref={from ?? back}
          title="待辦"
          badge={
            detail.status === 'open' && isOverdue(detail.due_at) ? (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">逾期</span>
            ) : (
              <PendingBadge item={detail} compact />
            )
          }
        >
          <form action="/api/tasks/update" method="post" className="space-y-3 text-sm">
            <input type="hidden" name="id" value={detail.id} />
            <input type="hidden" name="back" value={from ?? back} />
            <label className="block">
              <span className="label">內容</span>
              <input className="input mt-1 block w-full" name="title" defaultValue={detail.title} required />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label">負責人</span>
                <input className="input mt-1 block w-full" name="assignee" defaultValue={detail.assignee ?? ''} />
              </label>
              <label className="block">
                <span className="label">期限</span>
                <input className="input mt-1 block w-full" type="date" name="due" defaultValue={detail.due_at ?? ''} />
              </label>
            </div>
            <label className="block">
              <span className="label">備註</span>
              <input className="input mt-1 block w-full" name="note" defaultValue={detail.note ?? ''} />
            </label>
            {/* 「儲存修正」排在表單第一顆：在欄位裡按 Enter 送出的是它，不會誤按成完成或忽略 */}
            <div className="flex gap-2">
              <button className="btn flex-1" name="action" value="save">
                儲存修正
              </button>
              {detail.needs_confirmation && detail.status === 'open' && (
                <button className="btn-confirm flex-1" name="action" value="confirm">
                  <ConfirmIcon />
                  確認沒錯
                </button>
              )}
            </div>
            {detail.status === 'open' ? (
              <button className="btn-primary w-full" name="action" value="done">
                <DoneIcon />
                標成完成
              </button>
            ) : (
              <button className="btn w-full" name="action" value="reopen">
                重新開啟
              </button>
            )}
            {detail.status !== 'ignored' && (
              <button className="block min-h-11 w-full text-center text-sm font-bold text-red-700" name="action" value="ignore">
                不是待辦，忽略
              </button>
            )}
          </form>
          <SourceQuotes messages={sources} manual={detail.source === 'manual'} />
          <ItemPhotos items={photos} />
          <RelatedItems items={related} />
        </DetailSheet>
      )}
    </main>
  );
}
