import { notFound } from 'next/navigation';
import { requireModule } from '@/org/orgs';
import { scopedGroup } from '../group-scope';
import { dbConfigured, getDb } from '@/db';
import { relatedItems, type RelatedItem } from '@/core/links';
import { SetupNotice } from '../setup-notice';
import { RelatedItems } from '../related-items';
import { addDays, agendaRange, hourRange, monthGrid, parseHour, splitTimed, weekDays, type AgendaPreset } from '@/core/grid';
import { BatchBar, BatchBox, SelectMode } from '../batch-bar';
import { mediaForItems } from '@/core/media';
import { ItemPhotos } from '@/app/ui/item-photos';
import { DetailSheet, SourceQuotes, safeFrom } from '@/app/ui/detail-sheet';
import { ConfirmIcon, PendingBadge } from '@/app/ui/review-ui';
import { TimeChip, realAssignee } from '@/app/ui/item-marker';
import { Badge } from '@/app/ui/badge';
import { I } from '../../routes';
import { oh } from '@/org/href';

export const dynamic = 'force-dynamic';

const pad = (n: number) => String(n).padStart(2, '0');
// 2026-10 設計畫布「行程」：清單（一排週曆＋只列有行程的日子）是主畫面，月格是右上角一顆小切換。
// 週／日檢視不在切換鈕上了，月格（手機）點某天仍會進日檢視；舊書籤的 ?view=week 照樣能開
const VIEWS = ['month', 'week', 'day', 'agenda'] as const;
type View = (typeof VIEWS)[number];
// 清單範圍：預設 90 天，底部「往後看 →」一次放寬一階（取代原本那排範圍切換鈕）
const RANGES = [
  ['30d', '接下來 30 天'],
  ['90d', '接下來 90 天'],
  ['1y', '接下來一年'],
  ['all', '今天以後'],
] as const;
const AGENDA_LIMIT = 200; // 「全部」防爆量

// YYYY-MM-DD → 中文顯示，用 UTC 正午鎖定避免跨日
function zhDate(dateIso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(`${dateIso}T12:00:00Z`).toLocaleDateString('zh-TW', { timeZone: 'UTC', ...opts });
}
function zhMonth(ym: string) {
  const [y, m] = ym.split('-');
  return `${y} 年 ${Number(m)} 月`;
}

type Ev = { id: string; title: string; starts_at: string; start_time: string | null; needs_confirmation: boolean; location?: string | null };
type Due = { id: string; title: string; assignee: string | null; due_at: string; needs_confirmation: boolean };
const EV_COLS = 'id, title, starts_at, start_time, needs_confirmation, location';

const Icon = ({ d, className = 'h-[18px] w-[18px]' }: { d: React.ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" className={`flex-none ${className}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    {d}
  </svg>
);

function EventChip({ e, href }: { e: Ev; href: string }) {
  return (
    <a
      href={href}
      title={e.title}
      className={`mt-1 block truncate rounded-md px-1.5 py-1 text-xs font-medium ${
        e.needs_confirmation
          ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
          : 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
      }`}
    >
      {e.start_time ? `${String(e.start_time).slice(0, 5)} ` : ''}
      {e.title}
    </a>
  );
}

// 一天的標頭＋事件列表（手機週檢視用）
function DayCard({
  iso,
  events,
  chipHref,
  todayIso,
  card = true,
  emptyText,
}: {
  iso: string;
  events: Ev[];
  chipHref: (id: string) => string;
  todayIso: string;
  card?: boolean;
  emptyText?: string;
}) {
  return (
    <div className={card ? 'card p-3.5' : 'p-1'}>
      <div className="mb-1 text-sm font-bold text-gray-900">
        {zhDate(iso, { month: 'long', day: 'numeric', weekday: 'short' })}
        {iso === todayIso && <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">今天</span>}
      </div>
      {events.length ? (
        events.map((e) => <EventChip key={e.id} e={e} href={chipHref(e.id)} />)
      ) : (
        <p className="text-xs text-gray-400">{emptyText ?? '無'}</p>
      )}
    </div>
  );
}

// 時間軸原語：日/週共用（日=1 欄、週=7 欄）。上「未定時間」區永在、下小時軸僅當有帶時間事件才畫（auto-degrade）
function TimeGrid({
  days,
  byDay,
  chipHref,
  todayIso,
}: {
  days: string[];
  byDay: Map<string, Ev[]>;
  chipHref: (id: string) => string;
  todayIso: string;
}) {
  const cols = { gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0,1fr))` };
  const perDay = days.map((d) => splitTimed(byDay.get(d) ?? []));
  const hr = hourRange(perDay.flatMap((p) => p.timed.map((e) => parseHour(e.start_time!))));
  const hasUndated = perDay.some((p) => p.undated.length);
  const multi = days.length > 1;

  if (!hr && !hasUndated) return <p className="card p-3 text-sm text-gray-400">這天沒有行程。</p>;

  return (
    <div className="card overflow-x-auto p-2">
      <div className={multi ? 'min-w-[560px]' : ''}>
        {multi && (
          <div className="grid border-b border-gray-100" style={cols}>
            <div />
            {days.map((d) => (
              <div key={d} className="px-1 py-1 text-center text-xs">
                <span
                  className={d === todayIso ? 'rounded-full bg-emerald-600 px-1.5 font-bold text-white' : 'text-gray-500'}
                >
                  {zhDate(d, { weekday: 'short' })} {zhDate(d, { day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        )}
        {hasUndated && (
          <div className="grid border-b border-gray-100" style={cols}>
            <div className="py-1 pr-1 text-right text-xs text-gray-400">未定</div>
            {perDay.map((p, i) => (
              <div key={i} className="flex flex-col gap-0.5 p-1">
                {p.undated.map((e) => (
                  <EventChip key={e.id} e={e} href={chipHref(e.id)} />
                ))}
              </div>
            ))}
          </div>
        )}
        {hr && (
          <div className="grid" style={{ ...cols, gridTemplateRows: `repeat(${hr[1] - hr[0]}, minmax(3rem,auto))` }}>
            {Array.from({ length: hr[1] - hr[0] }, (_, ri) => (
              <div
                key={`h${ri}`}
                className="border-t border-gray-100 pr-1 text-right text-xs text-gray-400"
                style={{ gridColumn: 1, gridRow: ri + 1 }}
              >
                {String(hr[0] + ri).padStart(2, '0')}:00
              </div>
            ))}
            {perDay.flatMap((p, di) => {
              const byHour = new Map<number, Ev[]>();
              for (const e of p.timed) {
                const h = parseHour(e.start_time!);
                const list = byHour.get(h) ?? [];
                list.push(e);
                byHour.set(h, list);
              }
              return [...byHour.entries()].map(([h, hEvs]) => (
                <div
                  key={`${di}-${h}`}
                  className="flex flex-col gap-0.5 border-t border-gray-100 p-0.5"
                  style={{ gridColumn: di + 2, gridRow: h - hr[0] + 1 }}
                >
                  {hEvs.map((e) => (
                    <EventChip key={e.id} e={e} href={chipHref(e.id)} />
                  ))}
                </div>
              ));
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default async function CalendarPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ group?: string; view?: string; date?: string; month?: string; event?: string; range?: string; from?: string }>;
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
  const group = scopedGroup(`/o/${slug}/calendar`, params, groupOptions);
  const groupName = groupOptions.find((g) => g.group_id === group)?.name ?? group;

  // 預設「議程」而不是「月」：預設值就是產品的主張（principles.md），而月格線在事件密度低的
  // 群組打開是一片空白——講了一個資料不支持的故事。要看月份分佈的人自己點「月」。
  const view: View = VIEWS.find((v) => v === params.view) ?? 'agenda';
  // 已忽略的事件降到深一層視圖（principles.md 規則三，同待辦／公告的 ?view=ignored）：
  // 月／週／日／議程照舊排除 ignored，主畫面不查、不顯示、連筆數都不提，只留底部一個低調入口
  const archived = params.view === 'ignored';
  const live = !!group && !archived;
  const range: AgendaPreset = (RANGES.find(([r]) => r === params.range)?.[0] ?? '90d') as AgendaPreset;
  const todayIso = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Taipei' });
  // 日期錨點：date 優先、相容舊 month、預設今天
  const dateIso = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '')
    ? params.date!
    : /^\d{4}-\d{2}$/.test(params.month ?? '')
      ? `${params.month}-01`
      : todayIso;
  const ym = dateIso.slice(0, 7);
  const [year, month] = ym.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  // 查詢範圍依 view 收窄（rangeEnd 為 null = 議程「全部」無上界）
  const wd = weekDays(dateIso);
  let rangeStart: string;
  let rangeEnd: string | null;
  if (view === 'week') [rangeStart, rangeEnd] = [wd[0], wd[6]];
  else if (view === 'day') [rangeStart, rangeEnd] = [dateIso, dateIso];
  else if (view === 'agenda') [rangeStart, rangeEnd] = agendaRange(range, todayIso);
  else [rangeStart, rangeEnd] = [`${ym}-01`, `${ym}-${pad(lastDay)}`];

  let events: Ev[] = [];
  if (group && archived) {
    // 不限日期：最近忽略的在最上面（按錯了回來找，通常找的是剛剛那筆）
    events =
      ((
        await db
          .from('events')
          .select(EV_COLS)
          .eq('group_id', group)
          .eq('status', 'ignored')
          .order('updated_at', { ascending: false })
          .limit(AGENDA_LIMIT)
      ).data as Ev[]) ?? [];
  } else if (group) {
    let q = db
      .from('events')
      .select(EV_COLS)
      .eq('group_id', group)
      .neq('status', 'ignored')
      .gte('starts_at', rangeStart)
      .order('starts_at')
      .order('start_time', { nullsFirst: true });
    if (rangeEnd) q = q.lte('starts_at', rangeEnd);
    if (view === 'agenda' && range === 'all') q = q.limit(AGENDA_LIMIT);
    events = ((await q).data as Ev[]) ?? [];
  }
  const byDay = new Map<string, Ev[]>();
  for (const e of events) {
    const list = byDay.get(e.starts_at) ?? [];
    list.push(e);
    byDay.set(e.starts_at, list);
  }
  // 清單也列進行中待辦的期限（設計稿「待辦期限：…」）：哪天要交什麼，跟行程放一起看
  let due: Due[] = [];
  if (live && view === 'agenda') {
    let q = db
      .from('tasks')
      .select('id, title, assignee, due_at, needs_confirmation')
      .eq('group_id', group)
      .eq('status', 'open')
      .gte('due_at', rangeStart)
      .order('due_at');
    if (rangeEnd) q = q.lte('due_at', rangeEnd);
    due = ((await q.limit(AGENDA_LIMIT)).data as Due[]) ?? [];
  }
  const dueByDay = new Map<string, Due[]>();
  for (const t of due) dueByDay.set(t.due_at, [...(dueByDay.get(t.due_at) ?? []), t]);

  // 詳情卡（?event= 同頁展開；group_id 條件防跨群讀取）
  let detail: any = null;
  let sources: any[] = [];
  let related: RelatedItem[] = [];
  let photos: any[] = [];
  if (params.event && group) {
    detail = (await db.from('events').select('*').eq('id', params.event).eq('group_id', group).maybeSingle()).data;
    if (detail?.source_message_ids?.length) {
      sources =
        (
          await db
            .from('messages')
            .select('sender_name, sender_id, text, created_at')
            .in('id', detail.source_message_ids)
            .order('created_at')
        ).data ?? [];
      related = await relatedItems(db, slug, group, detail.source_message_ids, { type: 'event', id: detail.id });
      photos = (await mediaForItems(db, group, [{ id: detail.id, sourceIds: detail.source_message_ids }])).get(detail.id) ?? [];
    }
  }

  const base = `/o/${slug}/calendar?group=${encodeURIComponent(group ?? '')}`;
  // 詳情編輯後回跳到當前視圖與日期；已忽略視圖回到已忽略清單
  const back = archived
    ? oh(slug, '/calendar', { group, view: 'ignored' })
    : `${base}&view=${view}&date=${dateIso}${view === 'agenda' && range !== '90d' ? `&range=${range}` : ''}`;
  const chipHref = (id: string) => `${back}&event=${id}`;
  // 從把關頁「修改」進來：關閉、存檔都回把關頁
  const from = safeFrom(slug, params.from);
  const navBase = `${base}&view=${view}`;

  // 導航步長與標題依 view
  const prevYm = month === 1 ? `${year - 1}-12` : `${year}-${pad(month - 1)}`;
  const nextYm = month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;
  const [prevDate, nextDate, label] =
    view === 'week'
      ? [
          addDays(dateIso, -7),
          addDays(dateIso, 7),
          `${zhDate(wd[0], { month: 'numeric', day: 'numeric' })} – ${zhDate(wd[6], { month: 'numeric', day: 'numeric' })}`,
        ]
      : view === 'day'
        ? [addDays(dateIso, -1), addDays(dateIso, 1), zhDate(dateIso, { month: 'long', day: 'numeric', weekday: 'short' })]
        : [`${prevYm}-01`, `${nextYm}-01`, `${year} 年 ${month} 月`];

  const weeks = monthGrid(year, month);
  // 清單：只列有行程或期限的日子，今天一定列（沒有就寫「沒有行程」）
  const agendaDays = [...new Set([todayIso, ...byDay.keys(), ...dueByDay.keys()])].sort();
  // 一排週曆：今天起兩週，左右滑看下週
  const strip = Array.from({ length: 14 }, (_, i) => addDays(todayIso, i));
  const rangeLabel = RANGES.find(([r]) => r === range)![1];
  const nextRange = ({ '30d': '90d', '90d': '1y', '1y': 'all' } as Record<string, string>)[range];
  const agendaTruncated = view === 'agenda' && range === 'all' && events.length === AGENDA_LIMIT;

  return (
    <main className="page">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1>行程</h1>
        {archived && <span className="rounded bg-gray-100 px-2 py-0.5 text-sm text-gray-600">已忽略</span>}
        {group && <span className="text-gray-500">{groupName}</span>}
        {/* 清單／月：右上角一顆小切換（已忽略清單沒有日期軸，不畫） */}
        {!archived && (
          <div className="segmented ml-auto" role="group" aria-label="檢視方式">
            <a href={`${base}&view=agenda`} aria-current={view === 'agenda' ? 'page' : undefined} aria-label="清單" className="w-11">
              <Icon d={<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />} />
            </a>
            <a href={`${base}&view=month&date=${dateIso}`} aria-current={view === 'month' ? 'page' : undefined} aria-label="月" className="w-11">
              <Icon d={I.calendar} />
            </a>
          </div>
        )}
        {archived && events.length > 0 && (
          <span className="ml-auto">
            <SelectMode />
          </span>
        )}
      </div>

      {!archived && view !== 'agenda' && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <a className="btn" href={`${navBase}&date=${prevDate}`}>
            ←
          </a>
          <strong className="min-w-32 text-center text-base">{label}</strong>
          <a className="btn" href={`${navBase}&date=${nextDate}`}>
            →
          </a>
          <a className="btn ml-2" href={`${navBase}&date=${todayIso}`}>
            今天
          </a>
        </div>
      )}

      {!group && <p className="text-gray-600">還沒有任何群組資料。</p>}

      {/* ── 月視圖 ── */}
      {live && view === 'month' && (
        <>
          {/* 桌機：7 欄文字格線 */}
          <div className="card hidden overflow-x-auto p-0 md:block">
            <div className="grid min-w-[640px] grid-cols-7 border-b border-gray-200 bg-gray-50 text-center text-xs text-gray-500">
              {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
                <div key={d} className="py-1.5">
                  {d}
                </div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="grid min-w-[640px] grid-cols-7 border-b border-gray-100 last:border-b-0">
                {week.map((cell, ci) => (
                  <div key={ci} className="min-h-24 border-r border-gray-100 p-1 last:border-r-0">
                    {cell && (
                      <>
                        <div
                          className={`text-xs ${
                            cell.iso === todayIso
                              ? 'inline-block rounded-full bg-emerald-600 px-1.5 font-bold text-white'
                              : 'text-gray-400'
                          }`}
                        >
                          {cell.day}
                        </div>
                        {(byDay.get(cell.iso) ?? []).map((e) => (
                          <EventChip key={e.id} e={e} href={chipHref(e.id)} />
                        ))}
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* 手機：圓點格線，點某天→日視圖 */}
          <div className="card grid grid-cols-7 gap-px p-1 md:hidden">
            {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
              <div key={d} className="py-1 text-center text-xs text-gray-400">
                {d}
              </div>
            ))}
            {weeks.flat().map((cell, ci) => {
              if (!cell) return <div key={ci} />;
              const evs = byDay.get(cell.iso) ?? [];
              return (
                <a
                  key={ci}
                  href={`${base}&view=day&date=${cell.iso}`}
                  className="flex aspect-square flex-col items-center rounded p-1 hover:bg-gray-50"
                >
                  <span
                    className={`text-xs ${
                      cell.iso === todayIso ? 'rounded-full bg-emerald-600 px-1.5 font-bold text-white' : 'text-gray-600'
                    }`}
                  >
                    {cell.day}
                  </span>
                  <span className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                    {evs.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className={`h-1.5 w-1.5 rounded-full ${e.needs_confirmation ? 'bg-amber-400' : 'bg-emerald-500'}`}
                      />
                    ))}
                    {evs.length > 3 && <span className="text-[10px] leading-none text-gray-400">+{evs.length - 3}</span>}
                  </span>
                </a>
              );
            })}
          </div>
        </>
      )}

      {/* ── 週視圖：桌機時間軸（7 欄）、手機維持直向 7 塊列表 ── */}
      {live && view === 'week' && (
        <>
          <div className="hidden md:block">
            <TimeGrid days={wd} byDay={byDay} chipHref={chipHref} todayIso={todayIso} />
          </div>
          <div className="grid gap-2 md:hidden">
            {wd.map((iso) => (
              <div key={iso} className="card p-2">
                <DayCard iso={iso} events={byDay.get(iso) ?? []} chipHref={chipHref} todayIso={todayIso} card={false} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── 日視圖：時間軸（單欄） ── */}
      {live && view === 'day' && <TimeGrid days={[dateIso]} byDay={byDay} chipHref={chipHref} todayIso={todayIso} />}

      {/* ── 清單：一排週曆＋只列有行程的日子（2026-10 設計畫布，取代議程的兩排切換鈕） ── */}
      {live && view === 'agenda' && (
        <div className="space-y-4">
          <div className="card px-1.5 py-2.5">
            <div className="flex items-center justify-between px-2 pb-1.5">
              <span className="text-sm font-bold">{zhMonth(todayIso.slice(0, 7))}</span>
              <span className="text-xs text-gray-600">左右滑動看下週</span>
            </div>
            {/* data-no-swipe：這排要能橫滑，不能被底部膠囊當成換分頁；有東西的日子點了跳到清單那天 */}
            <div data-no-swipe="" className="flex snap-x snap-mandatory overflow-x-auto">
              {strip.map((iso, i) => {
                const evs = byDay.get(iso) ?? [];
                const now = iso === todayIso;
                const has = evs.length > 0 || dueByDay.has(iso);
                const cls = `flex min-h-[60px] flex-none basis-[14.2857%] flex-col items-center justify-center gap-0.5 rounded-xl ${i % 7 ? '' : 'snap-start'} ${
                  now ? 'bg-emerald-600 text-white' : 'text-gray-700'
                }`;
                const inner = (
                  <>
                    <span className={`text-[11px] ${now ? '' : 'text-gray-600'}`}>{zhDate(iso, { weekday: 'narrow' })}</span>
                    <span className="text-[17px] font-bold">{Number(iso.slice(8))}</span>
                    {now ? (
                      <span className="text-[10px]">今天</span>
                    ) : evs.length ? (
                      // 圓點＝行程（琥珀＝還有待把關的）；方框＝只有待辦期限
                      <span className={`h-1.5 w-1.5 rounded-full ${evs.some((e) => e.needs_confirmation) ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    ) : has ? (
                      <span className="h-1.5 w-1.5 rounded-sm border border-gray-400" />
                    ) : (
                      <span className="h-1.5" />
                    )}
                  </>
                );
                return has || now ? (
                  <a key={iso} href={`#d-${iso}`} className={cls}>
                    {inner}
                  </a>
                ) : (
                  <span key={iso} className={cls}>
                    {inner}
                  </span>
                );
              })}
            </div>
          </div>

          {agendaDays.map((iso) => {
            const evs = byDay.get(iso) ?? [];
            const tks = dueByDay.get(iso) ?? [];
            return (
              <section key={iso} id={`d-${iso}`} className="scroll-mt-24">
                <h2 className={`mb-1.5 text-[13px] font-bold ${iso === todayIso ? 'text-emerald-700' : 'text-gray-700'}`}>
                  {iso === todayIso && '今天 · '}
                  {zhDate(iso, { month: 'numeric', day: 'numeric' })} {zhDate(iso, { weekday: 'short' })}
                </h2>
                {!evs.length && !tks.length && <p className="py-0.5 text-sm text-gray-600">沒有行程</p>}
                {tks.map((t) => (
                  <a
                    key={t.id}
                    href={oh(slug, '/tasks', { group, task: t.id, from: back })}
                    className="flex min-h-11 items-center gap-2.5 px-1 text-sm text-gray-700 hover:opacity-70"
                  >
                    <span className="text-gray-600">
                      <Icon d={I.tasks} />
                    </span>
                    <span className="min-w-0 flex-1">
                      待辦期限：{t.title}
                      {realAssignee(t.assignee) && ` · ${t.assignee}`}
                    </span>
                    {t.needs_confirmation && <Badge tone="warn">待把關</Badge>}
                  </a>
                ))}
                <div className="space-y-2">
                  {evs.map((e) => (
                    <a key={e.id} href={chipHref(e.id)} className="card flex min-h-[72px] items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
                      <TimeChip time={e.start_time ? String(e.start_time).slice(0, 5) : null} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-bold break-words">{e.title}</span>
                        {e.location && (
                          <span className="mt-0.5 flex items-center gap-1 text-[13px] text-gray-600">
                            <Icon d={I.pin} className="h-3.5 w-3.5" />
                            <span className="truncate">{e.location}</span>
                          </span>
                        )}
                      </span>
                      {e.needs_confirmation && <Badge tone="warn">待把關</Badge>}
                    </a>
                  ))}
                </div>
              </section>
            );
          })}

          {/* 資料少時直接講出來（只有這 N 個），而不是讓一大片空白自己說；入口不帶筆數（principles.md 規則三） */}
          <div className="border-t border-dashed border-gray-300 pt-3.5 text-sm leading-relaxed text-gray-600">
            {rangeLabel}
            {events.length ? (events.length <= 5 ? `只有這 ${events.length} 個行程。` : `共 ${events.length} 個行程。`) : '沒有行程。'}
            {agendaTruncated && `（已達顯示上限，只列前 ${AGENDA_LIMIT} 個）`}
            <div className="flex flex-wrap gap-x-4">
              {nextRange && (
                <a className="inline-flex min-h-11 items-center font-bold text-emerald-700" href={`${base}&view=agenda&range=${nextRange}`}>
                  往後看 →
                </a>
              )}
              <a className="inline-flex min-h-11 items-center font-bold text-gray-600" href={oh(slug, '/calendar', { group, view: 'ignored' })}>
                已忽略的行程 →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 入口不帶筆數：計數本身就是噪音（principles.md 規則三）。月／週／日共用一個（清單的在上面那段） */}
      {live && view !== 'agenda' && (
        <a
          className="mt-4 inline-flex min-h-11 items-center text-sm text-gray-500 underline"
          href={oh(slug, '/calendar', { group, view: 'ignored' })}
        >
          已忽略的行程 →
        </a>
      )}

      {/* ── 已忽略的事件：在收件匣或這裡忽略掉的，逐筆或勾選後批次復原 ── */}
      {group && archived && (
        <div className="space-y-5">
          <section>
            {events.length > 0 && (
              <BatchBar kind="event" back={back} actions={[{ action: 'restore', label: '復原' }]} />
            )}
            {events.length ? (
              <ul className="space-y-1.5">
                {events.map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                  >
                    <BatchBox id={e.id} />
                    <span className="flex-none text-xs text-gray-500 tabular-nums">
                      {zhDate(e.starts_at, { year: 'numeric', month: 'numeric', day: 'numeric' })}
                      {e.start_time ? ` ${String(e.start_time).slice(0, 5)}` : ''}
                    </span>
                    <a className="min-w-0 flex-1 font-bold hover:opacity-70" href={chipHref(e.id)}>
                      {e.title}
                    </a>
                    <form action="/api/events/update" method="post" className="flex-none">
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="back" value={back} />
                      <button className="btn" name="action" value="restore">
                        復原
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="card text-sm text-gray-500">
                <p className="mb-1 font-bold text-gray-700">沒有已忽略的行程</p>
                <p>在把關或行程頁忽略掉的行程會留在這裡，隨時可以復原。</p>
              </div>
            )}
            {events.length === AGENDA_LIMIT && (
              <p className="mt-2 text-sm text-gray-400">只顯示最近忽略的 {AGENDA_LIMIT} 筆。</p>
            )}
          </section>
          <a
            className="inline-flex min-h-11 items-center text-sm text-emerald-700 underline"
            href={oh(slug, '/calendar', { group })}
          >
            ← 回到行程
          </a>
        </div>
      )}

      {detail && (
        <DetailSheet
          closeHref={from ?? back}
          title="行程"
          badge={
            detail.status === 'ignored' ? (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">已忽略</span>
            ) : (
              <PendingBadge item={detail} compact />
            )
          }
        >
          <form action="/api/events/update" method="post" className="space-y-3 text-sm">
            <input type="hidden" name="id" value={detail.id} />
            <input type="hidden" name="back" value={from ?? back} />
            <label className="block">
              <span className="label">標題</span>
              <input className="input mt-1 block w-full" name="title" defaultValue={detail.title} required />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label">日期</span>
                <input className="input mt-1 block w-full" type="date" name="date" defaultValue={detail.starts_at} required />
              </label>
              <label className="block">
                <span className="label">時間（可空白＝全天）</span>
                <input className="input mt-1 block w-full" type="time" name="time" defaultValue={detail.start_time ? String(detail.start_time).slice(0, 5) : ''} />
              </label>
            </div>
            <label className="block">
              <span className="label">地點</span>
              <input className="input mt-1 block w-full" name="location" defaultValue={detail.location ?? ''} />
            </label>
            <label className="block">
              <span className="label">備註</span>
              <input className="input mt-1 block w-full" name="note" defaultValue={detail.note ?? ''} />
            </label>
            {/* 「儲存修正」排第一顆：欄位裡按 Enter 送出的是它 */}
            <div className="flex gap-2">
              <button className="btn flex-1" name="action" value="save">
                儲存修正
              </button>
              {detail.needs_confirmation && detail.status !== 'ignored' && (
                <button className="btn-confirm flex-1" name="action" value="confirm">
                  <ConfirmIcon />
                  確認沒錯
                </button>
              )}
            </div>
            {/* 已忽略的行程：這裡換成「復原」（從把關頁的「修改」或已忽略清單點進來都會看到） */}
            {detail.status === 'ignored' ? (
              <button className="btn w-full" name="action" value="restore">
                復原
              </button>
            ) : (
              <button className="block min-h-11 w-full text-center text-sm font-bold text-red-700" name="action" value="ignore">
                不是行程，忽略
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
