import type { ReactNode } from 'react';
import { addDays } from '@/core/date';
import { I } from '@/app/o/[org]/routes';
import { Badge } from './badge';
import { TimeChip } from './item-marker';

// 行程清單：一排週曆＋只列有行程的日子（2026-10 設計畫布）。管理端行程頁與成員端行程分頁共用同一份。
// 週曆格點了跳到下面那天——兩邊靠 id="d-<日期>" 對上，所以放在同一個檔案。

// YYYY-MM-DD → 中文顯示，用 UTC 正午鎖定避免跨日
const zh = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('zh-TW', { timeZone: 'UTC', ...opts });

/** 一排週曆：今天起兩週，左右滑看下週。due＝有待辦期限的日子（成員端不列待辦，不給） */
export function WeekStrip({
  today,
  byDay,
  due,
}: {
  today: string;
  byDay: Map<string, { needs_confirmation: boolean }[]>;
  due?: { has(iso: string): boolean };
}) {
  const [y, m] = today.split('-');
  return (
    <div className="card px-1.5 py-2.5">
      <div className="flex items-center justify-between px-2 pb-1.5">
        <span className="text-sm font-bold">{`${y} 年 ${Number(m)} 月`}</span>
        <span className="text-xs text-gray-600">左右滑動看下週</span>
      </div>
      {/* data-no-swipe：這排要能橫滑，不能被底部膠囊當成換分頁；有東西的日子點了跳到清單那天 */}
      <div data-no-swipe="" className="flex snap-x snap-mandatory overflow-x-auto">
        {Array.from({ length: 14 }, (_, i) => addDays(today, i)).map((iso, i) => {
          const evs = byDay.get(iso) ?? [];
          const now = iso === today;
          const has = evs.length > 0 || !!due?.has(iso);
          const cls = `flex min-h-[60px] flex-none basis-[14.2857%] flex-col items-center justify-center gap-0.5 rounded-xl ${i % 7 ? '' : 'snap-start'} ${
            now ? 'bg-emerald-600 text-white' : 'text-gray-700'
          }`;
          const inner = (
            <>
              <span className={`text-[11px] ${now ? '' : 'text-gray-600'}`}>{zh(iso, { weekday: 'narrow' })}</span>
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
  );
}

/** 清單裡的一天：日期標題（今天另標）＋當天的東西；empty 時寫「沒有行程」（今天一定列，沒東西也列） */
export function AgendaDay({ iso, today, empty, children }: { iso: string; today: string; empty: boolean; children?: ReactNode }) {
  return (
    <section id={`d-${iso}`} className="scroll-mt-24">
      <h2 className={`mb-1.5 text-[13px] font-bold ${iso === today ? 'text-emerald-700' : 'text-gray-700'}`}>
        {iso === today && '今天 · '}
        {zh(iso, { month: 'numeric', day: 'numeric' })} {zh(iso, { weekday: 'short' })}
      </h2>
      {empty ? <p className="py-0.5 text-sm text-gray-600">沒有行程</p> : children}
    </section>
  );
}

/** 一筆行程：左邊幾點（沒定＝全天）、標題、地點；還沒把關的標「待把關」 */
export function AgendaEvent({
  e,
  href,
}: {
  e: { title: string; start_time: string | null; location?: string | null; needs_confirmation: boolean };
  href: string;
}) {
  return (
    <a href={href} className="card flex min-h-[72px] items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
      <TimeChip time={e.start_time ? String(e.start_time).slice(0, 5) : null} />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold break-words">{e.title}</span>
        {e.location && (
          <span className="mt-0.5 flex items-center gap-1 text-[13px] text-gray-600">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-none" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              {I.pin}
            </svg>
            <span className="truncate">{e.location}</span>
          </span>
        )}
      </span>
      {e.needs_confirmation && <Badge tone="warn">待把關</Badge>}
    </a>
  );
}
