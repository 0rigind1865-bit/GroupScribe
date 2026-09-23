import { TaskCircle, TimeChip, realAssignee } from '@/app/ui/item-marker';
import { ConfirmIcon, PendingBadge } from '@/app/ui/review-ui';
import { fmtDate, isOverdue, todayISO } from '@/core/date';
import { dbConfigured, getDb, MEDIA_BUCKET } from '@/db';
import { isGroupMember, liffId, liffUser, memberName } from '@/core/liff';
import { mediaForItems } from '@/core/media';
import { monthGrid } from '@/core/grid';
import { ItemPhotos } from '@/app/ui/item-photos';
import { LiffInit } from '../liff-init';
import { SubscribeToggle } from '../subscribe-toggle';
import { FloatingNav } from '@/app/ui/floating-nav';

export const dynamic = 'force-dynamic';

// LIFF 成員視圖（v2 可操作＋四分頁）：今天／月曆／待辦／公告。
// 第一性：成員是群組知識的第一消費者——單群視角的頁面成員都該有（B.1：跨群聚合才是 admin-only）。
// 分頁用 ?tab= query param（MPA、零 client JS，底部 Tab 為 server 渲染連結）。
// 「新增」刻意不做：成員在群組講一句話 bot 就會記錄，那才是主路徑。

function md(iso: string) {
  return {
    day: new Date(`${iso}T12:00:00Z`).getUTCDate(),
    week: new Date(`${iso}T12:00:00Z`).toLocaleDateString('zh-TW', { timeZone: 'UTC', weekday: 'short' }),
  };
}

type Kind = 'event' | 'task' | 'note';
type Tab = 'today' | 'calendar' | 'tasks' | 'notes' | 'files';
const TABS: [Tab, string][] = [
  ['today', '今天'],
  ['calendar', '月曆'],
  ['tasks', '待辦'],
  ['notes', '公告'],
  // 檔案給成員：規格與文件的第一消費者就是實際執行的人，而他們只有成員版。
  // 原本只能在「某項目剛好有同時段照片」時瞄到縮圖，無法主動找。
  ['files', '檔案'],
];
const TAB_ICON: Record<Tab, React.ReactNode> = {
  today: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4M12 14h.01" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M9 13h.01M14 13h.01M9 17h.01M14 17h.01" />
    </>
  ),
  tasks: (
    <>
      <path d="M4 6l2 2 3-3M4 12l2 2 3-3M4 18l2 2 3-3" />
      <path d="M12 7h9M12 13h9M12 19h9" />
    </>
  ),
  notes: <path d="M4 4h16v12H8l-4 4z" />,
  files: (
    <>
      <path d="M6 2h8l4 4v16H6z" />
      <path d="M14 2v4h4" />
    </>
  ),
};

export default async function MemberView({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{
    tab?: string;
    month?: string;
    edit?: string;
    view?: string;
    cat?: string;
    error?: string;
    suberror?: string;
  }>;
}) {
  const { groupId: raw } = await params;
  const groupId = decodeURIComponent(raw);
  const sp = await searchParams;
  const tab: Tab = TABS.some(([t]) => t === sp.tab) ? (sp.tab as Tab) : 'today';
  // 已完成的待辦降到深一層視圖（principles.md 規則三），與管理版同一個 ?view= 慣例
  const archived = tab === 'tasks' && sp.view === 'done';
  const { edit, error } = sp;
  const uid = await liffUser();
  if (!uid) return <LiffInit liffId={liffId()} />;
  if (!dbConfigured()) return <main className="p-6 text-gray-500">系統尚未設定資料庫。</main>;

  const db = getDb();
  if (!(await isGroupMember(groupId, uid)))
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="mb-2 text-xl font-semibold tracking-tight">沒有這個群組的權限</h1>
        <p className="text-sm text-gray-500">
          只有這個 LINE 群組的成員能看它的整理。<a className="text-emerald-700 underline" href="/g">回你的群組</a>
        </p>
      </main>
    );

  // 「我的待辦」最小版：tasks.assignee 是自由文字暱稱、與 LINE userId 沒有對應表，
  // 所以拿群成員 API 的 displayName 做寬鬆雙向比對就好——不建表、不改 schema。
  // 這只是排序與提示（「可能是你的」），不是權限，比錯了最多是多看一眼。
  const myName = await memberName(groupId, uid);
  const isMine = (t: any) =>
    !!myName && !!t.assignee && (String(t.assignee).includes(myName) || myName.includes(String(t.assignee)));

  const today = todayISO();
  const ym = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? sp.month! : today.slice(0, 7);
  const base = `/g/${encodeURIComponent(groupId)}`;
  const here = `${base}?tab=${tab}${tab === 'calendar' ? `&month=${ym}` : ''}${archived ? '&view=done' : ''}`;

  const { data: g } = await db.from('groups').select('name, picture_url').eq('group_id', groupId).maybeSingle();
  const name = g?.name ?? groupId;
  // 訂閱狀態（migration 009 未跑時查詢失敗 → 當作未訂閱，開關照樣顯示，按下去會提示）
  const { data: sub } = await db
    .from('push_subscriptions')
    .select('enabled')
    .eq('group_id', groupId)
    .eq('line_user_id', uid)
    .maybeSingle();

  // 依分頁抓資料（都綁 group_id）
  let events: any[] = [];
  let tasks: any[] = [];
  let notes: any[] = [];
  let files: any[] = [];
  if (tab === 'today') {
    [events, tasks, notes] = await Promise.all([
      db.from('events').select('id, title, starts_at, start_time, location, needs_confirmation, source_message_ids, created_at, updated_at')
        .eq('group_id', groupId).eq('status', 'active').gte('starts_at', today)
        .order('starts_at').order('start_time', { nullsFirst: true }).limit(20),
      db.from('tasks').select('id, title, status, assignee, due_at, needs_confirmation, source_message_ids, created_at, updated_at')
        .eq('group_id', groupId).eq('status', 'open').order('due_at', { nullsFirst: false }).order('created_at').limit(20),
      db.from('notes').select('id, title, body, kind, pinned, created_at, updated_at, needs_confirmation, source_message_ids')
        .eq('group_id', groupId).eq('status', 'active').eq('pinned', true)
        .order('created_at', { ascending: false }).limit(5),
    ]).then((r) => r.map((x) => x.data ?? []));
  } else if (tab === 'calendar') {
    const [y, m] = ym.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    events =
      (
        await db.from('events').select('id, title, starts_at, start_time, location, needs_confirmation, source_message_ids, created_at, updated_at')
          .eq('group_id', groupId).eq('status', 'active')
          .gte('starts_at', `${ym}-01`).lte('starts_at', `${ym}-${String(last).padStart(2, '0')}`)
          .order('starts_at').order('start_time', { nullsFirst: true })
      ).data ?? [];
  } else if (tab === 'tasks') {
    // 主清單只查進行中；已完成在 ?view=done 的深一層視圖，主畫面連筆數都不提
    const q = db
      .from('tasks')
      .select('id, title, status, assignee, due_at, needs_confirmation, source_message_ids, created_at, updated_at')
      .eq('group_id', groupId)
      .eq('status', archived ? 'done' : 'open');
    tasks =
      (archived
        ? await q.order('updated_at', { ascending: false }).limit(50)
        : await q.order('due_at', { nullsFirst: false }).order('created_at').limit(200)
      ).data ?? [];
  } else if (tab === 'files') {
    // media_assets 無 group_id，透過 messages inner join 綁群組（與管理版同一條路徑）
    files =
      (
        await db
          .from('media_assets')
          .select('id, kind, storage_path, vision_summary, category, status, messages!inner(group_id, sender_name, created_at)')
          .eq('messages.group_id', groupId)
          .order('created_at', { referencedTable: 'messages', ascending: false })
          .limit(300)
      ).data ?? [];
  } else {
    notes =
      (
        await db.from('notes').select('id, title, body, kind, pinned, created_at, updated_at, needs_confirmation, source_message_ids')
          .eq('group_id', groupId).eq('status', 'active')
          .order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100)
      ).data ?? [];
  }

  // 「我的」是成員版的軸線：今天頁拆成兩個獨立區塊，待辦分頁維持置頂排序
  const myTasks = myName ? tasks.filter(isMine) : [];
  const otherTasks = myName ? tasks.filter((t: any) => !isMine(t)) : tasks;
  if (myName) tasks = [...myTasks, ...otherTasks];
  const mineCount = myTasks.length;

  // 類別 chip 用全部檔案算（篩選後才算會讓選中的類別以外全部消失）
  const fileCats = [...new Set(files.map((f: any) => f.category).filter(Boolean))] as string[];
  const shownFiles = sp.cat ? files.filter((f: any) => f.category === sp.cat) : files;
  // 私有 bucket → 只為「這一頁真的要顯示的」批次簽名（1 小時）
  const fileUrl = new Map<string, string>();
  if (shownFiles.length) {
    const { data: signed } = await db.storage
      .from(MEDIA_BUCKET)
      .createSignedUrls(shownFiles.map((f: any) => f.storage_path), 3600);
    for (const s of signed ?? []) if (s.signedUrl) fileUrl.set(s.path!, s.signedUrl);
  }

  const shown = [...events, ...tasks, ...notes];
  const pendingItems = shown.filter((i: any) => i.needs_confirmation);
  const pendingCount = pendingItems.length;
  // v2 的用意是把 AI 待確認的工作量分散給最清楚狀況的人，但成員不會主動去找琥珀色小點——
  // 管理版有收件匣當專門動線，成員版本來沒有等價物（principles.md：別讓我想）。
  const firstPending = pendingItems[0];
  const photos = await mediaForItems(db, groupId, shown.map((i: any) => ({ id: i.id, sourceIds: i.source_message_ids })));

  // 待確認項目的來源引文（與管理版收件匣同構）：要成員把關就得讓他看到 AI 的依據，
  // 否則只能盲目蓋章，回流的確認品質不可信（審查 P0）。只撈待確認項目的來源，省查詢。
  const quoteIds = [...new Set(shown.filter((i: any) => i.needs_confirmation).flatMap((i: any) => i.source_message_ids ?? []))];
  const { data: quoteMsgs } = quoteIds.length
    ? await db.from('messages').select('id, sender_name, sender_id, text, created_at').in('id', quoteIds)
    : { data: [] as any[] };
  const msgOf = new Map((quoteMsgs ?? []).map((m: any) => [m.id, m]));
  const quoteTime = (d: string) =>
    new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

  const byDay = new Map<string, any[]>();
  for (const e of events) byDay.set(e.starts_at, [...(byDay.get(e.starts_at) ?? []), e]);

  const fileChip = (on: boolean) =>
    `rounded border px-2.5 py-1 text-xs ${on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300 bg-white text-gray-600'}`;
  const fileDate = (d: string) => new Date(d).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

  const hidden = (kind: Kind, id: string) => (
    <>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="group_id" value={groupId} />
      <input type="hidden" name="back" value={here} />
    </>
  );

  // 動作列：待確認的給「確認」，全部給「修正」；展開後才出現忽略
  function Actions({ kind, item }: { kind: Kind; item: any }) {
    const key = `${kind}-${item.id}`;
    if (edit === key)
      return (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <form action="/api/liff/item" method="post" className="space-y-2">
            {hidden(kind, item.id)}
            <label className="block text-xs text-gray-500">
              內容
              <input className="input mt-0.5 block w-full text-sm" name="title" defaultValue={item.title} required />
            </label>
            {kind === 'event' && (
              <div className="flex gap-2">
                <label className="flex-1 text-xs text-gray-500">
                  日期
                  <input className="input mt-0.5 block w-full text-sm" type="date" name="date" defaultValue={item.starts_at} required />
                </label>
                <label className="flex-1 text-xs text-gray-500">
                  時間
                  <input className="input mt-0.5 block w-full text-sm" type="time" name="time" defaultValue={item.start_time ? String(item.start_time).slice(0, 5) : ''} />
                </label>
              </div>
            )}
            {kind === 'event' && (
              <label className="block text-xs text-gray-500">
                地點
                <input className="input mt-0.5 block w-full text-sm" name="location" defaultValue={item.location ?? ''} />
              </label>
            )}
            {kind === 'task' && (
              <div className="flex gap-2">
                <label className="flex-1 text-xs text-gray-500">
                  負責人
                  <input className="input mt-0.5 block w-full text-sm" name="assignee" defaultValue={item.assignee ?? ''} />
                </label>
                <label className="flex-1 text-xs text-gray-500">
                  期限
                  <input className="input mt-0.5 block w-full text-sm" type="date" name="due" defaultValue={item.due_at ?? ''} />
                </label>
              </div>
            )}
            {kind === 'note' && (
              <label className="block text-xs text-gray-500">
                補充
                <textarea className="input mt-0.5 block w-full text-sm" name="body" rows={3} defaultValue={item.body ?? ''} />
              </label>
            )}
            <div className="flex gap-2">
              <a className="btn flex flex-1 items-center justify-center text-sm" href={here}>
                取消
              </a>
              <button className="btn-primary flex-[1.4] text-sm" name="action" value="save">
                儲存
              </button>
            </div>
          </form>
          <form action="/api/liff/item" method="post" className="mt-2">
            {hidden(kind, item.id)}
            <button className="w-full text-xs text-gray-400 underline" name="action" value="ignore">
              這不是真的項目，忽略它
            </button>
          </form>
        </div>
      );

    // 待確認 → 先給證據（AI 是從哪句話整理的），再要人蓋章
    const quotes = item.needs_confirmation
      ? (item.source_message_ids ?? []).map((id: string) => msgOf.get(id)).filter(Boolean).slice(0, 2)
      : [];

    return (
      <>
        {item.needs_confirmation && (
          <div className="mt-2 space-y-1 rounded bg-gray-50 px-2.5 py-1.5 text-[11px] text-gray-500">
            {quotes.length ? (
              quotes.map((m: any) => (
                <p key={m.id} className="line-clamp-2">
                  [{quoteTime(m.created_at)} {m.sender_name ?? m.sender_id ?? '—'}]{' '}
                  <span className="text-gray-700">{m.text}</span>
                </p>
              ))
            ) : (
              <p>（來源訊息已被收回或刪除）</p>
            )}
          </div>
        )}
        {/* U4：只有待確認（或已完成要重開）的卡才有動作列。平常的卡只留一個低調的「修正」——
            每張卡都掛一顆按鈕，是在對「已經確認過的東西」重複索求注意力。 */}
        {!item.needs_confirmation && !(kind === 'task' && item.status === 'done') ? (
          <div className="mt-1 text-right">
            <a className="text-xs text-gray-400 underline" href={`${here}&edit=${key}`}>
              修正
            </a>
          </div>
        ) : (
        <div className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2">
          <PendingBadge item={item} compact />
          <div className="ml-auto flex gap-1.5">
            {/* 用詞與管理版一致（編輯／完成／重新開啟／確認），同一個人在兩版之間不必重新認 */}
            <a className="btn btn-sm" href={`${here}&edit=${key}`}>
              編輯
            </a>
            {/* 「完成」已經是卡片左邊那個可勾的圈，這裡只留反向動作，免得同一件事兩個入口 */}
            {kind === 'task' && item.status === 'done' && (
              <form action="/api/liff/item" method="post">
                {hidden(kind, item.id)}
                <button className="btn btn-sm" name="action" value="reopen">
                  重新開啟
                </button>
              </form>
            )}
            {item.needs_confirmation && (
              <form action="/api/liff/item" method="post">
                {hidden(kind, item.id)}
                <button className="btn-confirm btn-sm" name="action" value="confirm">
                  <ConfirmIcon />
                  確認
                </button>
              </form>
            )}
          </div>
        </div>
        )}
      </>
    );
  }

  const EventCard = (e: any) => (
    <div key={e.id} id={`i-${e.id}`} className="scroll-mt-20 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex items-start gap-2.5">
        <TimeChip time={e.start_time ? String(e.start_time).slice(0, 5) : null} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{e.title}</p>
          {e.location && <p className="text-xs text-gray-500">{e.location}</p>}
        </div>
      </div>
      <ItemPhotos items={photos.get(e.id)} compact />
      <Actions kind="event" item={e} />
    </div>
  );
  const TaskCard = (t: any) => (
    <div key={t.id} id={`i-${t.id}`} className="scroll-mt-20 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex items-start gap-2.5">
        {t.status === 'done' ? (
          <span className="grid h-7 w-7 flex-none place-items-center rounded-full border-2 border-gray-300 text-gray-400">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M6 12l4 4 8-8" />
            </svg>
          </span>
        ) : (
          <TaskCircle
            formAction="/api/liff/item"
            id={t.id}
            back={here}
            title={t.title}
            overdue={isOverdue(t.due_at)}
            extraFields={
              <>
                <input type="hidden" name="kind" value="task" />
                <input type="hidden" name="group_id" value={groupId} />
              </>
            }
          />
        )}
        <div className="min-w-0 flex-1">
      <p className="text-sm font-bold">
        {t.title}
        {isMine(t) && (
          <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-900">可能是你的</span>
        )}
      </p>
      {/* 逾期與管理版同一套判斷與紅字（principles.md：一致性）——
          成員頁尤其不能漏：員工只看得到這裡，逾期不標就等於沒說 */}
      <p className={`text-xs ${isOverdue(t.due_at) ? 'font-bold text-red-600' : 'text-gray-500'}`}>
        {[
          t.due_at && `${isOverdue(t.due_at) ? '逾期' : '期限'} ${fmtDate(t.due_at)}`,
          realAssignee(t.assignee),
        ]
          .filter(Boolean)
          .join(' · ') || '無期限'}
      </p>
        </div>
      </div>
      <ItemPhotos items={photos.get(t.id)} compact />
      <Actions kind="task" item={t} />
    </div>
  );
  const NoteCard = (n: any) => (
    <div
      key={n.id}
      id={`i-${n.id}`}
      className="scroll-mt-20 rounded-lg border border-gray-200 border-l-4 border-l-purple-500 bg-white px-3 py-2 shadow-sm"
    >
      <p className="flex items-center gap-1 text-sm font-bold">
        {n.pinned && (
          <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none text-amber-700" fill="none" stroke="currentColor" strokeWidth="1.8">
            <title>置頂</title>
            <path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z" />
          </svg>
        )}
        {n.title}
      </p>
      {n.body && <p className="mt-0.5 text-xs whitespace-pre-wrap text-gray-500">{n.body}</p>}
      <ItemPhotos items={photos.get(n.id)} compact />
      <Actions kind="note" item={n} />
    </div>
  );

  const DayRail = ({ iso }: { iso: string }) => {
    const d = md(iso);
    return (
      <div className="w-11 flex-none pt-1 text-center">
        <div className={`text-2xl leading-none font-extrabold ${iso === today ? 'text-emerald-700' : ''}`}>{d.day}</div>
        <div className="text-[11px] text-gray-500">{iso === today ? '今天' : d.week}</div>
      </div>
    );
  };

  // 月曆導航
  const [yy, mm] = ym.split('-').map(Number);
  const prevYm = `${mm === 1 ? yy - 1 : yy}-${String(mm === 1 ? 12 : mm - 1).padStart(2, '0')}`;
  const nextYm = `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, '0')}`;

  return (
    <main className="nav-gap mx-auto max-w-md">
      {/* 釘在頂端：與管理版同一個理由——群組名是成員唯一的 context 錨點 */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <a href="/g" aria-label="回你的群組" className="-ml-1 p-1 text-gray-400">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </a>
        {g?.picture_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={g.picture_url} alt="" className="h-9 w-9 rounded-full" />
        ) : (
          <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-600 font-bold text-white">
            {name.slice(0, 1)}
          </span>
        )}
        <div>
          <p className="leading-tight font-bold">{name}</p>
          <p className="text-xs text-gray-500">群組工作助理</p>
        </div>
      </header>

      <div className="space-y-5 p-4">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">儲存失敗，請稍後再試。</p>
        )}
        {/* 待確認的把關動線：成員版沒有收件匣，這條就是等價物——直接跳到第一個要蓋章的項目。
            說明與入口合成一塊：兩個黃框上下疊著講同一件事，第二個只是噪音（principles.md 規則二）。
            firstPending 就是 pendingItems[0]，與 pendingCount > 0 同條件，不會漏顯示。 */}
        {firstPending && (
          <a
            href={`#i-${firstPending.id}`}
            className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 flex-none" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 9v4M12 17h.01M10.3 3.9L2.6 17a2 2 0 001.7 3h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
            </svg>
            <span className="flex-1">
              有 <strong>{pendingCount}</strong> 件 AI 整理的內容要你確認
              {/* 手機只有 390px，副標超過十來個字就會斷在詞中間 */}
              <span className="block text-xs text-amber-800">你最清楚狀況，順手把關</span>
            </span>
            <span className="flex-none whitespace-nowrap text-amber-700">去看看 →</span>
          </a>
        )}

        {/* ── 今天 ── */}
        {tab === 'today' && (
          <>
            {myTasks.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-bold tracking-widest text-sky-700">我的待辦</h2>
                <div className="space-y-1.5">{myTasks.map(TaskCard)}</div>
              </section>
            )}
            <section>
              <h2 className="mb-2 text-xs font-bold tracking-widest text-gray-500">本週起的行程</h2>
              {byDay.size ? (
                <div className="space-y-3">
                  {[...byDay.entries()].map(([iso, evs]) => (
                    <div key={iso} className="flex gap-3">
                      <DayRail iso={iso} />
                      <div className="min-w-0 flex-1 space-y-1.5">{evs.map(EventCard)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">近期沒有已排定的行程。</p>
              )}
            </section>
            <section>
              <h2 className="mb-2 text-xs font-bold tracking-widest text-gray-500">
                {myTasks.length > 0 ? '其他人的待辦' : '進行中的待辦'}
              </h2>
              {otherTasks.length ? (
                <div className="space-y-1.5">{otherTasks.map(TaskCard)}</div>
              ) : (
                <p className="text-sm text-gray-400">
                  {myTasks.length > 0 ? '其他待辦都有人認領了。' : '目前沒有進行中的待辦。'}
                </p>
              )}
            </section>
            {/* 只留置頂公告：公告是低頻參考、有自己的分頁，常駐在今天頁是噪音 */}
            {notes.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-bold tracking-widest text-gray-500">置頂公告</h2>
                <div className="space-y-1.5">{notes.map(NoteCard)}</div>
              </section>
            )}
          </>
        )}

        {/* ── 月曆 ── */}
        {tab === 'calendar' && (
          <>
            <div className="flex items-center gap-2">
              <a className="btn px-3" href={`${base}?tab=calendar&month=${prevYm}`}>←</a>
              <strong className="flex-1 text-center">{yy} 年 {mm} 月</strong>
              <a className="btn px-3" href={`${base}?tab=calendar&month=${nextYm}`}>→</a>
              <a className="btn btn-sm" href={`${base}?tab=calendar`}>本月</a>
            </div>
            <div className="card grid grid-cols-7 gap-px p-1">
              {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
                <div key={d} className="py-1 text-center text-xs text-gray-400">{d}</div>
              ))}
              {monthGrid(yy, mm).flat().map((cell, i) => {
                if (!cell) return <div key={i} />;
                const evs = byDay.get(cell.iso) ?? [];
                const inner = (
                  <>
                    <span className={`text-xs ${cell.iso === today ? 'rounded bg-emerald-600 px-1 font-bold text-white' : 'text-gray-600'}`}>
                      {cell.day}
                    </span>
                    <span className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                      {evs.slice(0, 3).map((e: any) => (
                        <span key={e.id} className={`h-1.5 w-1.5 rounded-full ${e.needs_confirmation ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                      ))}
                      {evs.length > 3 && <span className="text-[10px] leading-none text-gray-400">+{evs.length - 3}</span>}
                    </span>
                  </>
                );
                return evs.length ? (
                  <a key={i} href={`#d-${cell.iso}`} className="flex aspect-square flex-col items-center rounded p-1 hover:bg-gray-50">
                    {inner}
                  </a>
                ) : (
                  <div key={i} className="flex aspect-square flex-col items-center p-1">{inner}</div>
                );
              })}
            </div>
            {byDay.size ? (
              <div className="space-y-3">
                {[...byDay.entries()].map(([iso, evs]) => (
                  <div key={iso} id={`d-${iso}`} className="flex scroll-mt-2 gap-3">
                    <DayRail iso={iso} />
                    <div className="min-w-0 flex-1 space-y-1.5">{evs.map(EventCard)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">這個月沒有事件。</p>
            )}
          </>
        )}

        {/* ── 待辦 ── */}
        {tab === 'tasks' && (
          <>
            <section>
              <h2 className="mb-2 text-xs font-bold tracking-widest text-gray-500">
                {archived ? '已完成' : `進行中（${tasks.length}）`}
                {!archived && mineCount > 0 && (
                  <span className="ml-2 font-normal text-sky-700">可能是你的 {mineCount} 件</span>
                )}
              </h2>
              {tasks.length ? (
                <div className="space-y-1.5">{tasks.map(TaskCard)}</div>
              ) : (
                <p className="text-sm text-gray-400">
                  {archived ? '還沒有完成的待辦。' : '目前沒有進行中的待辦。'}
                </p>
              )}
            </section>
            {/* 入口不帶筆數：計數本身就是噪音（principles.md 規則三） */}
            <a
              className={`inline-block text-sm underline ${archived ? 'text-emerald-700' : 'text-gray-500'}`}
              href={archived ? `${base}?tab=tasks` : `${base}?tab=tasks&view=done`}
            >
              {archived ? '← 回到進行中' : '已完成的待辦 →'}
            </a>
          </>
        )}

        {/* ── 公告 ── */}
        {tab === 'notes' &&
          (notes.length ? (
            <div className="space-y-1.5">{notes.map(NoteCard)}</div>
          ) : (
            <p className="text-sm text-gray-400">目前沒有公告或決議。</p>
          ))}

        {/* ── 檔案 ── */}
        {tab === 'files' && (
          <>
            {fileCats.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                <a href={`${base}?tab=files`} className={fileChip(!sp.cat)}>
                  全部
                </a>
                {fileCats.map((c) => (
                  <a key={c} href={`${base}?tab=files&cat=${encodeURIComponent(c)}`} className={fileChip(sp.cat === c)}>
                    {c}
                  </a>
                ))}
              </div>
            )}
            {shownFiles.length ? (
              <div className="grid grid-cols-2 gap-2">
                {shownFiles.map((f: any) => {
                  const url = fileUrl.get(f.storage_path);
                  return (
                    <a
                      key={f.id}
                      href={url ?? '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm"
                    >
                      {f.kind === 'image' && url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="" className="mb-1 aspect-square w-full rounded object-cover" />
                      ) : (
                        <span className="mb-1 flex aspect-square items-center justify-center rounded bg-gray-100 text-gray-400">
                          <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M6 2h8l4 4v16H6z" />
                            <path d="M14 2v4h4" />
                            {f.kind === 'pdf' && <path d="M9 13h6M9 17h6" />}
                            {f.kind === 'audio' && <path d="M9 11v4M12 9v8M15 12v2" />}
                          </svg>
                        </span>
                      )}
                      <p className="text-[11px] text-gray-500">
                        {f.category ?? '未分類'}
                        {f.status !== 'done' && '｜解析中'}
                      </p>
                      {f.vision_summary && <p className="line-clamp-2 text-xs">{f.vision_summary}</p>}
                      <p className="mt-0.5 text-[10px] text-gray-400">
                        {fileDate(f.messages.created_at)}｜{f.messages.sender_name ?? '—'}
                      </p>
                    </a>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                {sp.cat ? `沒有「${sp.cat}」類的檔案。` : '這個群組還沒有圖片或檔案。群組裡傳的圖片與 PDF 會自動收進這裡。'}
              </p>
            )}
          </>
        )}

        {tab === 'today' && (
          <SubscribeToggle groupId={groupId} back={here} enabled={!!sub?.enabled} error={!!sp.suberror} />
        )}

        <p className="pt-2 text-center text-[11px] text-gray-400">
          內容由群組對話自動整理。要新增東西，直接在群組裡講一句就好；
          要查舊資料，在群組 @我 提問。
        </p>
      </div>

      {/* 成員底部 Tab：與管理版共用同一個懸浮膠囊（滑動指示器／拖曳切換／捲動收合） */}
      <FloatingNav
        tabs={TABS.map(([t, label]) => ({
          href: `${base}?tab=${t}`,
          label,
          icon: TAB_ICON[t],
          active: t === tab,
        }))}
      />
    </main>
  );
}
