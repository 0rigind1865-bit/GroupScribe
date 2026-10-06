import { TaskCircle, realAssignee } from '@/app/ui/item-marker';
import { ConfirmIcon, DoneIcon, PendingBadge } from '@/app/ui/review-ui';
import { Badge } from '@/app/ui/badge';
import { Banner } from '@/app/ui/banner';
import { Empty } from '@/app/ui/empty';
import { DetailSheet, SourceQuotes } from '@/app/ui/detail-sheet';
import { RoleToggle } from '@/app/ui/role-toggle';
import { addDays, fmtDate, isOverdue, needsReview, todayISO } from '@/core/date';
import { dbConfigured, getDb, MEDIA_BUCKET } from '@/db';
import { isGroupMember, liffId, liffUser, memberName } from '@/core/liff';
import { mediaForItems, type ItemMedia } from '@/core/media';
import { monthGrid } from '@/core/grid';
import { ItemPhotos } from '@/app/ui/item-photos';
import { LiffInit } from '../liff-init';
import { logFunnel, parseLiffEntry } from '@/core/funnel';
import { SubscribeToggle } from '../subscribe-toggle';
import { FloatingNav } from '@/app/ui/floating-nav';
import { I } from '@/app/o/[org]/routes';
import { surfaces } from '@/org/surfaces';
import { groupSurfaces, hasRoleToggle } from '@/org/surface-groups';
import { adminPendingKey } from '@/org/pending';
import { locale, t, type MsgKey } from '@/attend/i18n';

export const dynamic = 'force-dynamic';

// LIFF 成員視圖（2026-10 設計畫布「成員端」）：跟管理端同一套元件、同樣 4 格導覽（今天／待辦／行程／找）。
// 第一性：成員是群組知識的第一消費者——單群視角的頁面成員都該有（B.1：跨群聚合才是 admin-only）。
// 分頁用 ?tab= query param（MPA，底部膠囊是 server 渲染連結）。
// 一列只留一個動作：左邊的圈＝完成；點列上其他地方＝從下面拉出詳情（?task= / ?event= / ?note=），
// 「確認／修改／忽略」都收進詳情抽屜（原本一張卡同時有「可能是你的」「修正」「編輯」「確認」）。
// 「新增」刻意不做：成員在群組講一句話 bot 就會記錄，那才是主路徑。

type Kind = 'event' | 'task' | 'note';
type Tab = 'today' | 'tasks' | 'calendar' | 'search';
const TABS: [Tab, string, React.ReactNode][] = [
  ['today', '今天', I.today],
  ['tasks', '待辦', I.tasks],
  ['calendar', '行程', I.calendar],
  // 公告與檔案原本各佔一格，跟管理端一樣收進「找」當篩選籤
  ['search', '找', I.search],
];
const KINDS = [
  ['', '全部'],
  ['msg', '對話'],
  ['file', '檔案'],
  ['note', '公告 / 決議'],
] as const;
const EMPTY_BROWSE: Record<string, string> = { '': '這個群組還沒有公告或檔案', msg: '打個關鍵字找對話', file: '這個群組還沒有圖片或檔案', note: '目前沒有公告或決議' };
const TABLE = { event: 'events', task: 'tasks', note: 'notes' } as const;
const LABEL = { event: '行程', task: '待辦', note: '公告' } as const;
const LIMIT = 20;
// ilike 的 % _ \ 是萬用字元，使用者打的要當字面比對（同管理端「找」）
const like = (q: string) => `%${q.replace(/[%_\\]/g, '\\$&')}%`;

export default async function MemberView({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{
    tab?: string;
    month?: string;
    view?: string;
    q?: string;
    kind?: string;
    task?: string;
    event?: string;
    note?: string;
    error?: string;
    suberror?: string;
    src?: string;
  }>;
}) {
  const { groupId: raw } = await params;
  const groupId = decodeURIComponent(raw);
  const sp = await searchParams;
  const tab: Tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as Tab) : 'today';
  // 已完成的待辦降到深一層視圖（principles.md 規則三），與管理版同一個 ?view= 慣例
  const archived = tab === 'tasks' && sp.view === 'done';
  const q = tab === 'search' ? (sp.q ?? '').trim().slice(0, 50) : '';
  const kind = tab === 'search' && KINDS.some(([k]) => k === sp.kind) ? (sp.kind ?? '') : '';
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

  // 漏斗（L1）：只在從觸點進來（帶 src）時記——頁內切分頁也是整頁重載，每次都記會灌水。
  // org_id 不另查：分析時經 group_id join groups 即可
  const { src } = parseLiffEntry(sp);
  if (src) await logFunnel({ group_id: groupId, line_user_id: uid, step: 'liff_open', source: src });

  // 「我的待辦」：tasks.assignee 是自由文字暱稱、與 LINE userId 沒有對應表，
  // 所以拿群成員 API 的 displayName 做寬鬆雙向比對來「猜」——這只是排序與提示，不是權限。
  // 猜到的那筆直接問「是你的嗎？」，回答記在 task_claims（migration 034，只影響自己的畫面）。
  const myName = await memberName(groupId, uid);
  const loose = (x: any) =>
    !!myName && !!x.assignee && (String(x.assignee).includes(myName) || myName.includes(String(x.assignee)));

  const today = todayISO();
  const ym = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? sp.month! : today.slice(0, 7);
  const base = `/g/${encodeURIComponent(groupId)}`;
  const here = `${base}?tab=${tab}${tab === 'calendar' ? `&month=${ym}` : ''}${archived ? '&view=done' : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}${kind ? `&kind=${kind}` : ''}`;

  // 角色開關：只有群組＋管理兩種身分都有的人看得到（ComponentsMore：只有一種身分的人看不到「個人／管理」）
  const [{ data: g }, { data: sub }, roles, loc] = await Promise.all([
    db.from('groups').select('name, picture_url').eq('group_id', groupId).maybeSingle(),
    // 訂閱狀態（migration 009 未跑時查詢失敗 → 當作未訂閱，開關照樣顯示，按下去會提示）
    db.from('push_subscriptions').select('enabled').eq('group_id', groupId).eq('line_user_id', uid).maybeSingle(),
    surfaces().then((s) => groupSurfaces(s.list)),
    locale(),
  ]);
  const name = g?.name ?? groupId;
  const toggle = hasRoleToggle(roles);
  const dot = toggle ? ((await adminPendingKey(roles, uid)) ?? undefined) : undefined;
  const tt = (key: MsgKey, p?: Record<string, string | number>) => t(loc, key, p);

  // 依分頁抓資料（都綁 group_id）
  const EV = 'id, title, starts_at, start_time, location, needs_confirmation';
  const TK = 'id, title, status, assignee, due_at, needs_confirmation';
  const NT = 'id, title, body, kind, pinned, needs_confirmation';
  // media_assets 無 group_id，透過 messages inner join 綁群組（與管理版同一條路徑）
  const FILE = 'id, kind, storage_path, vision_summary, category, status, messages!inner(group_id, sender_name, created_at)';
  const none = Promise.resolve({ data: [] as any[] });
  let events: any[] = [];
  let tasks: any[] = [];
  let notes: any[] = [];
  let files: any[] = [];
  let msgs: any[] = [];
  if (tab === 'today') {
    [events, tasks, notes] = await Promise.all([
      db.from('events').select(EV).eq('group_id', groupId).eq('status', 'active').gte('starts_at', today)
        .order('starts_at').order('start_time', { nullsFirst: true }).limit(20),
      db.from('tasks').select(TK).eq('group_id', groupId).eq('status', 'open').order('due_at', { nullsFirst: false }).order('created_at').limit(20),
      // 只留置頂公告：公告是低頻參考、在「找」裡有自己的篩選籤，常駐在今天頁是噪音
      db.from('notes').select(NT).eq('group_id', groupId).eq('status', 'active').eq('pinned', true)
        .order('created_at', { ascending: false }).limit(5),
    ]).then((r) => r.map((x) => x.data ?? []));
  } else if (tab === 'calendar') {
    const [y, m] = ym.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    events =
      (
        await db.from('events').select(EV).eq('group_id', groupId).eq('status', 'active')
          .gte('starts_at', `${ym}-01`).lte('starts_at', `${ym}-${String(last).padStart(2, '0')}`)
          .order('starts_at').order('start_time', { nullsFirst: true })
      ).data ?? [];
  } else if (tab === 'tasks') {
    // 主清單只查進行中；已完成在 ?view=done 的深一層視圖，主畫面連筆數都不提
    const qb = db.from('tasks').select(TK).eq('group_id', groupId).eq('status', archived ? 'done' : 'open');
    tasks =
      (archived
        ? await qb.order('updated_at', { ascending: false }).limit(50)
        : await qb.order('due_at', { nullsFirst: false }).order('created_at').limit(200)
      ).data ?? [];
  } else if (q) {
    // 「找」：對話、檔案、公告一起搜（同管理端）；比兩個欄位就查兩次再合併——不用 .or()，免得搜尋詞裡的逗號被當語法
    const want = (k: string) => !kind || kind === k;
    const fileQ = (col: string) => db.from('media_assets').select(FILE).eq('messages.group_id', groupId).ilike(col, like(q)).limit(LIMIT);
    const noteQ = (col: string) => db.from('notes').select(NT).eq('group_id', groupId).eq('status', 'active').ilike(col, like(q)).limit(LIMIT);
    const r = await Promise.all([
      want('msg')
        ? db.from('messages').select('id, sender_name, sender_id, text, created_at').eq('group_id', groupId)
            .ilike('text', like(q)).order('created_at', { ascending: false }).limit(LIMIT)
        : none,
      want('file') ? fileQ('vision_summary') : none,
      want('file') ? fileQ('ocr_text') : none,
      want('note') ? noteQ('title') : none,
      want('note') ? noteQ('body') : none,
    ]);
    const uniq = (rows: any[]) => [...new Map(rows.map((x) => [x.id, x])).values()].slice(0, LIMIT);
    msgs = r[0].data ?? [];
    files = uniq([...(r[1].data ?? []), ...(r[2].data ?? [])]);
    notes = uniq([...(r[3].data ?? []), ...(r[4].data ?? [])]);
  } else {
    // 還沒搜：公告與檔案（原本的兩個分頁）直接列出來
    [notes, files] = await Promise.all([
      kind === '' || kind === 'note'
        ? db.from('notes').select(NT).eq('group_id', groupId).eq('status', 'active')
            .order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100)
        : none,
      kind === '' || kind === 'file'
        ? db.from('media_assets').select(FILE).eq('messages.group_id', groupId)
            .order('created_at', { referencedTable: 'messages', ascending: false }).limit(300)
        : none,
    ]).then((r) => r.map((x) => x.data ?? []));
  }

  // 「是我／不是我」的回答（migration 034 未跑 → 查詢失敗 → 不問，照舊用名字猜）。
  // 只篩自己：一個人按過的筆數很少，不必帶一長串 task id 進網址
  let claims = new Map<string, boolean>();
  let claimsOk = false;
  if (tasks.length) {
    const { data, error } = await db.from('task_claims').select('task_id, mine').eq('line_user_id', uid);
    claimsOk = !error;
    claims = new Map((data ?? []).map((c: any) => [c.task_id, c.mine]));
  }
  const isMine = (x: any) => claims.get(x.id) ?? loose(x);
  const guess = (x: any) => claimsOk && !claims.has(x.id) && loose(x);
  // 「我的」是成員版的軸線：今天頁拆成兩個獨立區塊，待辦分頁在各組裡置頂
  const myTasks = tasks.filter(isMine);
  const otherTasks = tasks.filter((x) => !isMine(x));
  tasks = [...myTasks, ...otherTasks];

  // 等人把關（同管理端今天頁的「等你把關」卡）：成員不會主動去找琥珀色標記，
  // 給一張卡直接打開第一筆的詳情抽屜，在裡面看 AI 的依據再確認（principles.md：別讓我想）
  const pending =
    tab === 'today'
      ? [
          ...events.filter((e) => e.needs_confirmation).map((e) => `event=${e.id}`),
          ...tasks.filter((x) => x.needs_confirmation).map((x) => `task=${x.id}`),
          ...notes.filter((n) => n.needs_confirmation).map((n) => `note=${n.id}`),
        ]
      : [];

  // 詳情抽屜：只查這一筆，綁 group_id（別群的 id 在這裡就找不到）
  const sheet = (['task', 'event', 'note'] as const).find((k) => sp[k]);
  let detail: any = null;
  let sources: any[] = [];
  let photos: ItemMedia[] = [];
  if (sheet) {
    detail = (await db.from(TABLE[sheet]).select('*').eq('id', sp[sheet]!).eq('group_id', groupId).maybeSingle()).data;
    if (detail?.source_message_ids?.length)
      [sources, photos] = await Promise.all([
        db.from('messages').select('sender_name, sender_id, text, created_at').in('id', detail.source_message_ids)
          .eq('group_id', groupId).order('created_at').then((r) => r.data ?? []),
        mediaForItems(db, groupId, [{ id: detail.id, sourceIds: detail.source_message_ids }]).then((m) => m.get(detail.id) ?? []),
      ]);
  }

  // 私有 bucket → 只為「這一頁真的要顯示的」批次簽名（1 小時）
  const fileUrl = new Map<string, string>();
  if (files.length) {
    const { data: signed } = await db.storage.from(MEDIA_BUCKET).createSignedUrls(files.map((f: any) => f.storage_path), 3600);
    for (const s of signed ?? []) if (s.signedUrl) fileUrl.set(s.path!, s.signedUrl);
  }

  const byDay = new Map<string, any[]>();
  for (const e of events) byDay.set(e.starts_at, [...(byDay.get(e.starts_at) ?? []), e]);

  const at = (d: string) =>
    new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  const lateDays = (d: string) => Math.round((Date.parse(today) - Date.parse(d)) / 864e5);
  const open = (k: Kind, id: string) => `${here}&${k}=${id}`;

  const hidden = (k: Kind, id: string) => (
    <>
      <input type="hidden" name="kind" value={k} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="group_id" value={groupId} />
      <input type="hidden" name="back" value={here} />
    </>
  );
  // 「待把關」靠右、不換行（同管理端今天頁）
  const pendingTag = (on: boolean) =>
    on && (
      <span className="flex-none">
        <Badge tone="warn">待把關</Badge>
      </span>
    );

  const TaskRow = ({ t: x, ask = false }: { t: any; ask?: boolean }) => {
    const late = x.status === 'open' && isOverdue(x.due_at, today);
    const who = realAssignee(x.assignee);
    return (
      <li className="border-b border-gray-100 last:border-b-0">
        <div className="flex min-h-16 items-center gap-1 py-1.5 pr-3 pl-1">
          <span className="grid h-11 w-11 flex-none place-items-center">
            {x.status === 'open' ? (
              <TaskCircle
                formAction="/api/liff/item"
                id={x.id}
                back={here}
                title={x.title}
                overdue={late}
                extraFields={
                  <>
                    <input type="hidden" name="kind" value="task" />
                    <input type="hidden" name="group_id" value={groupId} />
                  </>
                }
              />
            ) : (
              <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-gray-300 text-gray-400">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                  <path d="M6 12l4 4 8-8" />
                </svg>
              </span>
            )}
          </span>
          <a href={open('task', x.id)} className="flex min-w-0 flex-1 items-center gap-2 py-1 hover:opacity-70">
            <span className="min-w-0 flex-1">
              <span className={`block text-[15px] font-bold ${x.status === 'done' ? 'text-gray-500 line-through' : ''}`}>{x.title}</span>
              {/* 逾期與管理版同一套判斷與紅字（principles.md：一致性）——員工只看得到這裡，逾期不標就等於沒說 */}
              {(x.due_at || who) && (
                <span className="mt-0.5 block text-[13px] text-gray-600">
                  {x.due_at && (late ? <span className="font-bold text-red-700">逾期 {lateDays(x.due_at)} 天</span> : `期限 ${fmtDate(x.due_at)}`)}
                  {x.due_at && who && ' · '}
                  {/* 猜的時候寫出原文，讓人自己判斷是不是在說他 */}
                  {who && (ask ? `負責人寫「${who}」` : who)}
                </span>
              )}
            </span>
            {pendingTag(x.status === 'open' && x.needs_confirmation)}
          </a>
        </div>
        {ask && (
          <form action="/api/liff/item" method="post" className="flex items-center gap-2 border-t border-dashed border-gray-200 bg-sky-50 py-2.5 pr-3 pl-12">
            {hidden('task', x.id)}
            <span className="flex-1 text-[13px] font-bold text-sky-800">AI 猜這是你的，對嗎？</span>
            <button className="btn rounded-[10px] px-3 text-[13px]" name="action" value="notmine">
              不是我
            </button>
            {/* 不用 .btn：深色模式的 .btn 底色是未分層規則，會蓋掉這顆的實心藍 */}
            <button className="inline-flex min-h-11 items-center rounded-[10px] bg-[#1d4f8a] px-3 text-[13px] font-extrabold text-white" name="action" value="mine">
              是我
            </button>
          </form>
        )}
      </li>
    );
  };

  // 行程＝發生在某一天的事：左邊是日期大字（設計畫布「成員端」），時間寫在第二行
  const EventRow = ({ e, anchor }: { e: any; anchor?: boolean }) => {
    const d = new Date(`${e.starts_at}T12:00:00Z`);
    return (
      <li id={anchor ? `d-${e.starts_at}` : undefined} className="scroll-mt-20 border-b border-gray-100 last:border-b-0">
        <a href={open('event', e.id)} className="flex min-h-16 items-center gap-3 px-3 py-2 hover:opacity-70">
          <span className="w-[52px] flex-none text-center leading-tight">
            <span className={`block text-[22px] font-black ${e.starts_at === today ? 'text-emerald-700' : ''}`} style={{ fontFamily: 'var(--font-title)' }}>
              {d.getUTCDate()}
            </span>
            <span className="text-[11px] text-gray-600">
              {d.getUTCMonth() + 1} 月 · {d.toLocaleDateString('zh-TW', { timeZone: 'UTC', weekday: 'narrow' })}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-extrabold">{e.title}</span>
            <span className="mt-0.5 block text-[13px] text-gray-600">
              {[e.start_time ? String(e.start_time).slice(0, 5) : '全天', e.location].filter(Boolean).join(' · ')}
            </span>
          </span>
          {pendingTag(e.needs_confirmation)}
        </a>
      </li>
    );
  };

  const NoteRow = ({ n }: { n: any }) => (
    <li className="border-b border-gray-100 last:border-b-0">
      <a href={open('note', n.id)} className="flex min-h-16 items-center gap-3 px-3 py-2 hover:opacity-70">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-[15px] font-bold">
            {n.pinned && (
              <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none text-amber-700" fill="none" stroke="currentColor" strokeWidth="1.8">
                <title>置頂</title>
                <path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z" />
              </svg>
            )}
            {n.title}
          </span>
          {n.body && <span className="mt-0.5 line-clamp-2 block text-[13px] text-gray-600">{n.body}</span>}
        </span>
        {pendingTag(n.needs_confirmation)}
      </a>
    </li>
  );

  const FileTile = ({ f }: { f: any }) => {
    const url = fileUrl.get(f.storage_path);
    return (
      <a href={url ?? '#'} target="_blank" rel="noreferrer" className="card p-2">
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
        <p className="mt-0.5 text-[10px] text-gray-500">
          {new Date(f.messages.created_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}｜{f.messages.sender_name ?? '—'}
        </p>
      </a>
    );
  };

  // 月曆導航
  const [yy, mm] = ym.split('-').map(Number);
  const prevYm = `${mm === 1 ? yy - 1 : yy}-${String(mm === 1 ? 12 : mm - 1).padStart(2, '0')}`;
  const nextYm = `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, '0')}`;

  // 待辦依期限分組（同管理端「待辦」）；查詢已照期限排好，各組裡「我的」在前
  const in7 = addDays(today, 7);
  const buckets = (
    archived
      ? [{ title: '已完成', tone: '', rows: tasks }]
      : [
          { title: '逾期', tone: 'text-red-700', rows: tasks.filter((x) => isOverdue(x.due_at, today)) },
          { title: '7 天內', tone: '', rows: tasks.filter((x) => x.due_at && x.due_at >= today && x.due_at <= in7) },
          { title: '之後', tone: '', rows: tasks.filter((x) => x.due_at && x.due_at > in7) },
          { title: '沒有期限', tone: '', rows: tasks.filter((x) => !x.due_at) },
        ]
  ).filter((b) => b.rows.length);

  return (
    <main className="nav-gap mx-auto max-w-md">
      {/* 釘在頂端：群組名是成員唯一的 context 錨點。整塊「‹ 頭像 群組名」連回群組清單（看得見的 44px，審查 F46）；
          右邊的角色開關借 .id-bar--light 的配色，尺寸由 .g-head 調成置中（globals.css） */}
      <header className="id-bar id-bar--light g-head sticky top-0 z-30 border-b border-gray-200 bg-gray-50">
        <a href="/g" className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl pr-2 pl-1 hover:bg-gray-100">
          <svg viewBox="0 0 24 24" className="h-5 w-5 flex-none" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          {g?.picture_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={g.picture_url} alt="" className="h-8 w-8 flex-none rounded-full" />
          ) : (
            <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-emerald-600 text-sm font-extrabold text-white">{name.slice(0, 1)}</span>
          )}
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[15px] font-extrabold">{name}</span>
            <span className="text-xs text-gray-600">你的群組</span>
          </span>
        </a>
        {toggle && (
          <span className="ml-auto">
            <RoleToggle side="me" from="groups" tt={tt} dot={dot} />
          </span>
        )}
      </header>

      <div className="space-y-5 px-4 pt-3.5 pb-4">
        {sp.error && <Banner tone="err">儲存失敗，請稍後再試。</Banner>}

        {pending.length > 0 && (
          <a
            href={`${here}&${pending[0]}`}
            className="flex min-h-14 items-center gap-2.5 rounded-[14px] border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-amber-900"
          >
            <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-amber-200">
              <ConfirmIcon />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-extrabold">{pending.length} 筆等人把關</span>
              {/* 手機只有 390px，副標超過十來個字就會斷在詞中間 */}
              <span className="block text-xs text-amber-800">你最清楚狀況，順手看一下</span>
            </span>
            <span className="flex-none text-sm font-extrabold whitespace-nowrap">去看 →</span>
          </a>
        )}

        {/* ── 今天 ── */}
        {tab === 'today' && (
          <>
            {myTasks.length > 0 && (
              <section>
                <h2 className="mb-2 section-title text-sky-800">我的待辦</h2>
                <ul className="card overflow-hidden p-0">
                  {myTasks.map((x) => (
                    <TaskRow key={x.id} t={x} ask={guess(x)} />
                  ))}
                </ul>
              </section>
            )}
            <section>
              <h2 className="mb-2 section-title">接下來的行程</h2>
              {events.length ? (
                <ul className="card overflow-hidden p-0">
                  {events.map((e) => (
                    <EventRow key={e.id} e={e} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">近期沒有已排定的行程。</p>
              )}
            </section>
            <section>
              <h2 className="mb-2 section-title">{myTasks.length > 0 ? '其他人的待辦' : '進行中的待辦'}</h2>
              {otherTasks.length ? (
                <ul className="card overflow-hidden p-0">
                  {otherTasks.map((x) => (
                    <TaskRow key={x.id} t={x} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">{myTasks.length > 0 ? '其他待辦都有人認領了。' : '目前沒有進行中的待辦。'}</p>
              )}
            </section>
            {notes.length > 0 && (
              <section>
                <h2 className="mb-2 section-title">置頂公告</h2>
                <ul className="card overflow-hidden p-0">
                  {notes.map((n) => (
                    <NoteRow key={n.id} n={n} />
                  ))}
                </ul>
              </section>
            )}
            <SubscribeToggle groupId={groupId} back={here} enabled={!!sub?.enabled} error={sp.suberror === 'full' ? 'full' : sp.suberror ? 'fail' : undefined} />
          </>
        )}

        {/* ── 待辦 ── */}
        {tab === 'tasks' && (
          <>
            {buckets.length ? (
              buckets.map((b) => (
                <section key={b.title}>
                  <h2 className={`mb-2 section-title ${b.tone}`}>{b.title}</h2>
                  <ul className="card overflow-hidden p-0">
                    {b.rows.map((x: any) => (
                      <TaskRow key={x.id} t={x} />
                    ))}
                  </ul>
                </section>
              ))
            ) : (
              <Empty
                title={archived ? '還沒有完成的待辦' : '目前沒有進行中的待辦'}
                hint={archived ? '在這裡勾掉的待辦會留在這裡，隨時可以重新開啟。' : '群組裡交辦事情時，AI 會自動整理進來。'}
              />
            )}
            {/* 入口不帶筆數：計數本身就是噪音（principles.md 規則三） */}
            <a className="inline-block text-sm text-gray-600 underline" href={archived ? `${base}?tab=tasks` : `${base}?tab=tasks&view=done`}>
              {archived ? '← 回到進行中' : '已完成的待辦 →'}
            </a>
          </>
        )}

        {/* ── 行程 ── */}
        {tab === 'calendar' && (
          <>
            <div className="flex items-center gap-2">
              <a className="btn px-3" href={`${base}?tab=calendar&month=${prevYm}`} aria-label="上個月">←</a>
              <strong className="flex-1 text-center">{yy} 年 {mm} 月</strong>
              <a className="btn px-3" href={`${base}?tab=calendar&month=${nextYm}`} aria-label="下個月">→</a>
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
            {events.length ? (
              <ul className="card overflow-hidden p-0">
                {events.map((e, i) => (
                  <EventRow key={e.id} e={e} anchor={events[i - 1]?.starts_at !== e.starts_at} />
                ))}
              </ul>
            ) : (
              <Empty title="這個月沒有行程" hint="群組裡講到時間、地點的安排，AI 會自動整理進來。" />
            )}
          </>
        )}

        {/* ── 找 ── */}
        {tab === 'search' && (
          <>
            <form method="get" role="search" className="flex gap-2">
              <input type="hidden" name="tab" value="search" />
              {kind && <input type="hidden" name="kind" value={kind} />}
              <input className="input min-w-0 flex-1" type="search" name="q" defaultValue={q} placeholder="搜尋對話、檔案、公告…" aria-label="搜尋對話、檔案、公告" />
              <button className="btn-primary">搜尋</button>
            </form>
            <nav className="flex gap-2 overflow-x-auto" aria-label="種類">
              {KINDS.map(([k, label]) => (
                <a
                  key={k}
                  href={`${base}?tab=search${q ? `&q=${encodeURIComponent(q)}` : ''}${k ? `&kind=${k}` : ''}`}
                  aria-current={kind === k ? 'page' : undefined}
                  className={`flex min-h-10 flex-none items-center rounded-full border px-3.5 text-[13px] font-bold ${
                    kind === k ? 'border-transparent bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700'
                  }`}
                >
                  {label}
                </a>
              ))}
            </nav>
            {!msgs.length && !files.length && !notes.length ? (
              q ? (
                <Empty title={`找不到「${q}」`} hint="換個說法試試，或在 LINE 群組裡 @群記 直接問。只搜得到群記進群之後的對話。" />
              ) : (
                <Empty
                  title={EMPTY_BROWSE[kind]}
                  hint={kind === 'msg' ? '也可以在 LINE 群組裡 @群記 直接問，它會說是誰、哪天講的。' : '群組裡拍板的事、傳的圖片與 PDF 會自動收進這裡。'}
                />
              )
            ) : (
              <>
                {notes.length > 0 && (
                  <section>
                    <h2 className="mb-2 section-title">公告 / 決議{q && ` · ${notes.length}`}</h2>
                    <ul className="card overflow-hidden p-0">
                      {notes.map((n) => (
                        <NoteRow key={n.id} n={n} />
                      ))}
                    </ul>
                  </section>
                )}
                {files.length > 0 && (
                  <section>
                    <h2 className="mb-2 section-title">檔案{q && ` · ${files.length}`}</h2>
                    <div className="grid grid-cols-2 gap-2">
                      {files.map((f) => (
                        <FileTile key={f.id} f={f} />
                      ))}
                    </div>
                  </section>
                )}
                {msgs.length > 0 && (
                  <section>
                    <h2 className="mb-2 section-title">對話 · {msgs.length}</h2>
                    <ul className="card overflow-hidden p-0">
                      {msgs.map((m) => {
                        const who = m.sender_name ?? m.sender_id ?? '—';
                        return (
                          <li key={m.id} className="flex gap-2.5 border-b border-gray-100 px-3 py-2.5 last:border-b-0">
                            <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-emerald-100 text-[13px] font-black text-emerald-900">
                              {who.slice(0, 1)}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-xs text-gray-600">
                                {who} · {at(m.created_at)}
                              </span>
                              <span className="mt-0.5 line-clamp-3 block text-[15px] whitespace-pre-wrap">{m.text}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
                {q && [msgs, files, notes].some((r) => r.length === LIMIT) && (
                  <p className="text-center text-sm text-gray-500">每一種最多列 {LIMIT} 筆，找不到的話把關鍵字打得更準一點。</p>
                )}
              </>
            )}
          </>
        )}

        <p className="pt-2 text-center text-[11px] text-gray-500">
          內容由群組對話自動整理。要新增東西，直接在群組裡講一句就好；
          要查舊資料，在群組 @我 提問。
        </p>
      </div>

      {/* 詳情抽屜（同管理端「待辦詳情」）：要改的欄位、確認、完成、忽略都在這，來源對話一起看 */}
      {detail && sheet && (
        <DetailSheet
          closeHref={here}
          title={LABEL[sheet]}
          badge={
            sheet === 'task' && detail.status === 'open' && isOverdue(detail.due_at, today) ? (
              <Badge tone="err">逾期</Badge>
            ) : (
              <PendingBadge item={detail} compact />
            )
          }
        >
          <form action="/api/liff/item" method="post" className="space-y-3 text-sm">
            {hidden(sheet, detail.id)}
            <label className="block">
              <span className="label">內容</span>
              <input className="input mt-1 block w-full" name="title" defaultValue={detail.title} required />
            </label>
            {sheet === 'event' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="label">日期</span>
                    <input className="input mt-1 block w-full" type="date" name="date" defaultValue={detail.starts_at} required />
                  </label>
                  <label className="block">
                    <span className="label">時間</span>
                    <input className="input mt-1 block w-full" type="time" name="time" defaultValue={detail.start_time ? String(detail.start_time).slice(0, 5) : ''} />
                  </label>
                </div>
                <label className="block">
                  <span className="label">地點</span>
                  <input className="input mt-1 block w-full" name="location" defaultValue={detail.location ?? ''} />
                </label>
              </>
            )}
            {sheet === 'task' && (
              <>
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
              </>
            )}
            {sheet === 'note' && (
              <label className="block">
                <span className="label">補充</span>
                <textarea className="input mt-1 block w-full py-2" name="body" rows={4} defaultValue={detail.body ?? ''} />
              </label>
            )}
            {/* 「儲存修正」排在表單第一顆：在欄位裡按 Enter 送出的是它，不會誤按成完成或忽略 */}
            <div className="flex gap-2">
              <button className="btn flex-1" name="action" value="save">
                儲存修正
              </button>
              {needsReview(detail) && (
                <button className="btn-confirm flex-1" name="action" value="confirm">
                  <ConfirmIcon />
                  確認沒錯
                </button>
              )}
            </div>
            {sheet === 'task' && detail.status === 'open' && (
              <button className="btn-primary w-full" name="action" value="done">
                <DoneIcon />
                標成完成
              </button>
            )}
            {sheet === 'task' && detail.status === 'done' && (
              <button className="btn w-full" name="action" value="reopen">
                重新開啟
              </button>
            )}
            {detail.status !== 'ignored' && (
              <button className="block min-h-11 w-full text-center text-sm font-bold text-red-700" name="action" value="ignore">
                不是{LABEL[sheet]}，忽略
              </button>
            )}
          </form>
          <SourceQuotes messages={sources} manual={detail.source === 'manual'} />
          <ItemPhotos items={photos} />
        </DetailSheet>
      )}

      {/* 底部 4 格：與管理端共用同一個懸浮膠囊、同樣的格子（滑動指示器／拖曳切換／捲動收合） */}
      <FloatingNav tabs={TABS.map(([k, label, icon]) => ({ href: `${base}?tab=${k}`, label, icon, active: k === tab }))} />
    </main>
  );
}
