'use client';

import { useMemo, useState } from 'react';
import { fmtMoney, type ExpenseItem } from '@/expense/types';
import { Icon } from '@/expense/icons';
import { Empty } from '@/app/ui/empty';

// 花費分析（從 Snaptab AnalyticsView 搬來）：期間＋專案篩選；分類甜甜圈、專案排行、付款方式比例、近 6 個月趨勢。
// 員工 App 看自己的、後台統計頁看全公司的，同一個元件。
type Period = 'month' | 'year' | 'all';
const PERIODS: [Period, string][] = [
  ['month', '本月'],
  ['year', '今年'],
  ['all', '全部'],
];
// 甜甜圈／長條的 8 色：中間色階，亮暗兩種底都看得清楚（inline style，不走 Tailwind 色彩 class）
const PALETTE = ['#d9773a', '#3e9e8b', '#5b7fbf', '#c9a13a', '#c85a4f', '#8f7cc0', '#76a044', '#8a8f98'];
const color = (i: number) => PALETTE[i % PALETTE.length];
const PAY = ['代墊', '公司卡', '現金'] as const;
const PAY_COLOR: Record<string, string> = { 代墊: '#d9773a', 公司卡: '#5b7fbf', 現金: '#76a044' };

const ym = (e: ExpenseItem) => e.spent_on.slice(0, 7);
const nowYm = () => new Date().toLocaleDateString('sv', { timeZone: 'Asia/Taipei' }).slice(0, 7);

// project／onProject 可不給（後台）；員工 App 給，讓「我的清單」選的專案帶過來（看花費分析）
export function AnalyticsView({
  items,
  icons,
  projectLabel = '專案',
  project: pinned,
  onProject,
}: {
  items: ExpenseItem[];
  icons: Record<string, string>;
  projectLabel?: string;
  project?: string;
  onProject?: (p: string) => void;
}) {
  const [period, setPeriod] = useState<Period>('all');
  const [own, setOwn] = useState('');
  const project = pinned ?? own;
  const setProject = onProject ?? setOwn;
  const projects = useMemo(() => [...new Set(items.map((e) => e.project).filter(Boolean))], [items]);
  const byProject = useMemo(() => (project ? items.filter((e) => e.project === project) : items), [items, project]);
  const filtered = useMemo(() => {
    const cur = nowYm();
    if (period === 'all') return byProject;
    return byProject.filter((e) => (period === 'month' ? ym(e) === cur : ym(e).slice(0, 4) === cur.slice(0, 4)));
  }, [byProject, period]);

  const stat = useMemo(() => {
    const total = filtered.reduce((a, e) => a + e.amount, 0);
    const sum = (key: (e: ExpenseItem) => string) => {
      const m = new Map<string, number>();
      for (const e of filtered) m.set(key(e) || '（未填）', (m.get(key(e) || '（未填）') ?? 0) + e.amount);
      return [...m].sort((a, b) => b[1] - a[1]);
    };
    const pay: Record<string, number> = { 代墊: 0, 公司卡: 0, 現金: 0 };
    for (const e of filtered) pay[e.pay_method] = (pay[e.pay_method] ?? 0) + e.amount;
    const ev = sum((e) => e.project);
    return { total, count: filtered.length, avg: filtered.length ? Math.round(total / filtered.length) : 0, cats: sum((e) => e.category), ev: ev.slice(0, 8), evMore: ev.length - 8, pay };
  }, [filtered]);

  // 近 6 個月趨勢：只受專案篩選影響（長期脈絡）
  const trend = useMemo(() => {
    const [y, m] = nowYm().split('-').map(Number);
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(Date.UTC(y, m - 1 - (5 - i), 1));
      return { key: d.toISOString().slice(0, 7), label: `${d.getUTCMonth() + 1}月`, amt: 0 };
    });
    for (const e of byProject) {
      const hit = months.find((x) => x.key === ym(e));
      if (hit) hit.amt += e.amount;
    }
    return months;
  }, [byProject]);

  if (!items.length) return <Empty title="還沒有資料可以分析" />;
  const evMax = Math.max(1, ...stat.ev.map(([, a]) => a));
  const monthMax = Math.max(1, ...trend.map((x) => x.amt));
  const payTotal = PAY.reduce((a, k) => a + stat.pay[k], 0) || 1;
  let prior = 0;
  const segs = stat.cats.map(([, amt]) => {
    const pct = stat.total ? (amt / stat.total) * 100 : 0;
    const offset = 125 - prior; // stroke-dasharray 甜甜圈：從 12 點鐘方向開始
    prior += pct;
    return { pct, offset };
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* 期間切換用全站 .segmented：頁內狀態（不換網址）所以標 aria-pressed，不是月曆那種 aria-current 連結。
            按鈕一律 44px（同 .input，手機、平板、電腦一樣）：寬螢幕不等於滑鼠，iPad 也是手指點。
            外框多 3px 內距，整組比旁邊 44px 的下拉高 6px，靠 items-center 對齊 */}
        <div className="segmented" role="group" aria-label="期間">
          {PERIODS.map(([k, label]) => (
            <button type="button" key={k} onClick={() => setPeriod(k)} aria-pressed={period === k} className="min-h-11">
              {label}
            </button>
          ))}
        </div>
        <select className="input text-sm" value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">全部{projectLabel}</option>
          {projects.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>

      {!filtered.length ? (
        <Empty variant="filtered" title={`這個條件下沒有資料，換個${projectLabel}或期間看看`} />
      ) : (
        <>
          <section className="card">
            <p className="text-xs text-gray-500">
              {PERIODS.find(([k]) => k === period)?.[1]}合計{project ? `・${project}` : ''}
            </p>
            <p className="mt-1 text-4xl font-black tabular-nums" style={{ fontFamily: 'var(--font-title)' }}>
              ${fmtMoney(stat.total)}
            </p>
            <p className="mt-1 flex gap-4 text-sm text-gray-500">
              <span>{stat.count} 筆</span>
              <span>平均 ${fmtMoney(stat.avg)}／筆</span>
            </p>
          </section>

          <section className="card">
            <h3 className="mb-3 text-base font-bold">分類占比</h3>
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="relative h-32 w-32 flex-none">
                <svg viewBox="0 0 42 42" className="chart-fade h-full w-full" fill="none">
                  <circle cx="21" cy="21" r="15.915" stroke="#8883" strokeWidth="5" />
                  {segs.map((s, i) => (
                    <circle
                      key={i}
                      cx="21"
                      cy="21"
                      r="15.915"
                      stroke={color(i)}
                      strokeWidth="5"
                      strokeDasharray={`${s.pct} ${100 - s.pct}`}
                      strokeDashoffset={s.offset}
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 grid place-items-center text-center">
                  <span>
                    <span className="block text-[10px] text-gray-500">總額</span>
                    <span className="block text-sm font-semibold tabular-nums">{fmtMoney(stat.total)}</span>
                  </span>
                </div>
              </div>
              <ul className="w-full min-w-0 flex-1 space-y-1 text-sm">
                {stat.cats.map(([name, amt], i) => (
                  <li key={name} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: color(i) }} />
                    <Icon name={icons[name] ?? 'tag'} size={14} />
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <span className="text-gray-500 tabular-nums">{Math.round((amt / stat.total) * 100)}%</span>
                    <span className="w-16 text-right tabular-nums">{fmtMoney(amt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {!project && stat.ev.length > 1 && (
            <section className="card">
              <h3 className="mb-3 text-base font-bold">{projectLabel}花費排行</h3>
              <ul className="space-y-2 text-sm">
                {stat.ev.map(([name, amt], i) => (
                  <li key={name}>
                    <div className="flex">
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      <span className="tabular-nums">{fmtMoney(amt)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-gray-100">
                      <div className="bar-grow-x h-2 rounded-full" style={{ width: `${(amt / evMax) * 100}%`, background: color(i) }} />
                    </div>
                  </li>
                ))}
              </ul>
              {stat.evMore > 0 && <p className="mt-2 text-xs text-gray-500">…還有 {stat.evMore} 個{projectLabel}</p>}
            </section>
          )}

          <section className="card">
            <h3 className="mb-3 text-base font-bold">付款方式</h3>
            {/* 整條色段包一層一起從左長出；各段各自長會在段與段之間露出底色縫 */}
            <div className="h-3 overflow-hidden rounded-full bg-gray-100">
              <div className="bar-grow-x flex h-full">
                {PAY.map((k) => (stat.pay[k] > 0 ? <span key={k} style={{ width: `${(stat.pay[k] / payTotal) * 100}%`, background: PAY_COLOR[k] }} /> : null))}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {PAY.map((k) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: PAY_COLOR[k] }} />
                  {k}
                  <span className="tabular-nums text-gray-500">{fmtMoney(stat.pay[k])}</span>
                </span>
              ))}
            </div>
          </section>
        </>
      )}

      <section className="card">
        <h3 className="mb-3 text-base font-bold">近 6 個月趨勢{project ? `・${project}` : ''}</h3>
        <div className="flex h-36 items-end gap-2">
          {trend.map((m) => (
            <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] text-gray-500 tabular-nums">{m.amt ? fmtMoney(m.amt) : ''}</span>
              <span className="bar-grow-y w-full rounded-t bg-emerald-600" style={{ height: `${(m.amt / monthMax) * 80}%` }} />
              <span className="text-xs text-gray-500">{m.label}</span>
            </div>
          ))}
        </div>
      </section>
      <p className="text-center text-xs text-gray-500">分類、{projectLabel}、付款方式依上方篩選；月趨勢固定看最近 6 個月</p>
    </div>
  );
}
