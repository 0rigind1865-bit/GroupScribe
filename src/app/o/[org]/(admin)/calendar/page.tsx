import { notFound } from 'next/navigation';
import { orgBySlug } from '@/org/orgs';
import { scopedGroup } from '../group-scope';
import { dbConfigured, getDb } from '@/db';
import { relatedItems, type RelatedItem } from '@/core/links';
import { SetupNotice } from '../setup-notice';
import { RelatedItems } from '../related-items';
import { addDays, agendaRange, hourRange, monthGrid, parseHour, splitTimed, weekDays, type AgendaPreset } from '@/core/grid';
import { BatchBar, BatchBox, SelectMode } from '../batch-bar';
import { mediaForItems } from '@/core/media';
import { ItemPhotos } from '@/app/ui/item-photos';

export const dynamic = 'force-dynamic';

const pad = (n: number) => String(n).padStart(2, '0');
const VIEWS = [
  ['month', '月'],
  ['week', '週'],
  ['day', '日'],
  ['agenda', '議程'],
] as const;
type View = (typeof VIEWS)[number][0];
const RANGES = [
  ['30d', '未來 30 天'],
  ['90d', '未來 90 天'],
  ['1y', '未來 1 年'],
  ['all', '全部'],
] as const;
const AGENDA_LIMIT = 200; // 「全部」防爆量

function fmt(d: string) {
  return new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
}
// YYYY-MM-DD → 中文顯示，用 UTC 正午鎖定避免跨日
function zhDate(dateIso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(`${dateIso}T12:00:00Z`).toLocaleDateString('zh-TW', { timeZone: 'UTC', ...opts });
}
function zhMonth(ym: string) {
  const [y, m] = ym.split('-');
  return `${y} 年 ${Number(m)} 月`;
}

type Ev = { id: string; title: string; starts_at: string; start_time: string | null; needs_confirmation: boolean };

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

// 議程渲染原語：一天的標頭＋事件列表（agenda / day / week 共用）；selectable = 議程視圖的批次多選
function DayCard({
  iso,
  events,
  chipHref,
  todayIso,
  card = true,
  emptyText,
  selectable = false,
}: {
  iso: string;
  events: Ev[];
  chipHref: (id: string) => string;
  todayIso: string;
  card?: boolean;
  emptyText?: string;
  selectable?: boolean;
}) {
  return (
    <div className={card ? 'card p-3.5' : 'p-1'}>
      <div className="mb-1 text-sm font-bold text-gray-900">
        {zhDate(iso, { month: 'long', day: 'numeric', weekday: 'short' })}
        {iso === todayIso && <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">今天</span>}
      </div>
      {events.length ? (
        events.map((e) =>
          selectable ? (
            <div key={e.id} className="flex items-center gap-1.5">
              <BatchBox id={e.id} />
              <div className="min-w-0 flex-1">
                <EventChip e={e} href={chipHref(e.id)} />
              </div>
            </div>
          ) : (
            <EventChip key={e.id} e={e} href={chipHref(e.id)} />
          ),
        )
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

  if (!hr && !hasUndated) return <p className="card p-3 text-sm text-gray-400">這天沒有事件。</p>;

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
  searchParams: Promise<{ group?: string; view?: string; date?: string; month?: string; event?: string; range?: string }>;
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
  const group = scopedGroup(`/o/${slug}/calendar`, params, groupOptions);
  const groupName = groupOptions.find((g) => g.group_id === group)?.name ?? group;

  // 預設「議程」而不是「月」：預設值就是產品的主張（principles.md），而月格線在事件密度低的
  // 群組打開是一片空白——講了一個資料不支持的故事。要看月份分佈的人自己點「月」。
  const view: View = (VIEWS.find(([v]) => v === params.view)?.[0] ?? 'agenda') as View;
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
  if (group) {
    let q = db
      .from('events')
      .select('id, title, starts_at, start_time, needs_confirmation')
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
  const back = `${base}&view=${view}&date=${dateIso}`; // 詳情編輯後回跳到當前視圖與日期
  const chipHref = (id: string) => `${back}&event=${id}`;
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
  const agendaDays = [...byDay.keys()].sort();
  // 議程按月分組（跨月/跨年 sticky 標頭）
  const agendaGroups: { month: string; days: string[] }[] = [];
  for (const dIso of agendaDays) {
    const m = dIso.slice(0, 7);
    const last = agendaGroups[agendaGroups.length - 1];
    if (last && last.month === m) last.days.push(dIso);
    else agendaGroups.push({ month: m, days: [dIso] });
  }
  const agendaLabel = rangeEnd
    ? `${zhDate(rangeStart, { month: 'numeric', day: 'numeric' })} – ${zhDate(rangeEnd, { month: 'numeric', day: 'numeric' })}`
    : `${zhDate(rangeStart, { month: 'numeric', day: 'numeric' })} 起`;
  const agendaTruncated = view === 'agenda' && range === 'all' && events.length === AGENDA_LIMIT;

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-3xl md:text-4xl">月曆</h1>
        {group && <span className="text-gray-500">{groupName}</span>}
        {/* 視圖切換器：手機四等分、桌機 inline */}
        <div className="segmented grid w-full grid-cols-4 md:ml-auto md:inline-flex md:w-auto">
          {VIEWS.map(([v, zh]) => (
            <a key={v} href={`${base}&view=${v}&date=${dateIso}`} aria-current={v === view ? 'page' : undefined}>
              {zh}
            </a>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {view === 'agenda' ? (
          <>
            <div className="segmented">
              {RANGES.map(([r, zh]) => (
                <a key={r} href={`${base}&view=agenda&range=${r}`} aria-current={r === range ? 'page' : undefined}>
                  {zh}
                </a>
              ))}
            </div>
            <span className="text-gray-500">{agendaLabel}</span>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {!group && <p className="text-gray-600">還沒有任何群組資料。</p>}

      {/* ── 月視圖 ── */}
      {group && view === 'month' && (
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
      {group && view === 'week' && (
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
      {group && view === 'day' && <TimeGrid days={[dateIso]} byDay={byDay} chipHref={chipHref} todayIso={todayIso} />}

      {/* ── 議程視圖：時間範圍內所有事件，按月分組；多選批次操作在此視圖 ── */}
      {group && view === 'agenda' && (
        <div className="space-y-3">
          {agendaGroups.length > 0 && (
            <>
              <div className="mb-2 flex justify-end"><SelectMode /></div>
              <BatchBar
                kind="event"
                back={`${base}&view=agenda&range=${range}`}
                actions={[
                  { action: 'confirm', label: '確認' },
                  { action: 'ignore', label: '忽略', danger: true },
                ]}
              />
            </>
          )}
          {agendaGroups.map((g) => (
            <div key={g.month}>
              <h2 className="sticky top-0 z-10 bg-gray-50 py-2 text-xl font-black text-gray-900" style={{ fontFamily: 'var(--font-title)' }}>
                {zhMonth(g.month)}
              </h2>
              <div className="space-y-2">
                {g.days.map((iso) => (
                  <DayCard
                    key={iso}
                    iso={iso}
                    events={byDay.get(iso)!}
                    chipHref={chipHref}
                    todayIso={todayIso}
                    selectable
                  />
                ))}
              </div>
            </div>
          ))}
          {!agendaGroups.length && <p className="text-sm text-gray-400">這個範圍沒有事件。</p>}
          {agendaTruncated && (
            <p className="text-sm text-gray-400">已達顯示上限，僅顯示前 {AGENDA_LIMIT} 筆（可縮小範圍）。</p>
          )}
        </div>
      )}

      {detail && (
        <div className="card mt-4">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-lg font-bold">事件詳情</h2>
            {detail.needs_confirmation ? (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">⚠ AI 抽取，待確認</span>
            ) : (
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">已確認</span>
            )}
            {detail.status === 'ignored' && (
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">已忽略</span>
            )}
          </div>
          <form action="/api/events/update" method="post" className="space-y-3 text-sm">
            <input type="hidden" name="id" value={detail.id} />
            <input type="hidden" name="back" value={back} />
            <div className="flex flex-wrap gap-3">
              <label className="flex-1 basis-64">
                標題
                <input className="input mt-1 block w-full" name="title" defaultValue={detail.title} required />
              </label>
              <label>
                日期
                <input className="input mt-1 block" type="date" name="date" defaultValue={detail.starts_at} required />
              </label>
              <label>
                時間
                <input
                  className="input mt-1 block"
                  type="time"
                  name="time"
                  defaultValue={detail.start_time ? String(detail.start_time).slice(0, 5) : ''}
                />
              </label>
              <label className="flex-1 basis-48">
                地點
                <input className="input mt-1 block w-full" name="location" defaultValue={detail.location ?? ''} />
              </label>
            </div>
            <label className="block">
              備註
              <input className="input mt-1 block w-full" name="note" defaultValue={detail.note ?? ''} />
            </label>
            <div className="flex gap-2">
              <button className="btn-primary" name="action" value="save">
                儲存修正
              </button>
              {detail.needs_confirmation && (
                <button className="btn" name="action" value="confirm">
                  確認無誤
                </button>
              )}
              <button className="btn-danger" name="action" value="ignore">
                忽略
              </button>
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
