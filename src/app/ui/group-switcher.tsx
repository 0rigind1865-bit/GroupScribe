'use client';

import { usePathname, useSearchParams } from 'next/navigation';

export interface GroupOption {
  group_id: string;
  name: string | null;
  category: string | null;
  picture_url?: string | null;
}

// 切群組時保留的 view 參數白名單；entity 參數（event/task/q）一律丟棄，避免把 A 群的詳情帶進 B 群
const KEEP_PARAMS = ['view', 'date', 'range'];

export function GroupSwitcher({ groups }: { groups: GroupOption[] }) {
  const pathname = usePathname();
  const search = useSearchParams();
  if (!groups.length) return null;

  const current = search.get('group') ?? '';
  const cur = groups.find((g) => g.group_id === current);
  // 多租戶後路徑是 /o/[org]/...：判斷頁面種類用去掉 org 前綴的相對路徑
  const rel = pathname.replace(/^\/o\/[^/]+/, '') || '/';
  // 「今天」與收件匣是跨群聚合視圖；更多／群組／匯入／設定不屬於任何一群——這些頁面沒選群組是正常狀態，
  // 不該顯示「選擇群組…」催人去選。其餘頁面（月曆／待辦／公告／檔案）一定落在單一群組。
  const supportsAll = rel === '/' || ['/inbox', '/more', '/groups', '/import', '/settings'].some((p) => rel.startsWith(p));
  const label = cur ? (cur.name ?? cur.group_id) : supportsAll ? '全部群組' : '選擇群組…';

  const byCat = new Map<string, GroupOption[]>();
  for (const g of groups) {
    const cat = g.category ?? '未分類';
    byCat.set(cat, [...(byCat.get(cat) ?? []), g]);
  }

  // 切到某群的網址：只保留 view 參數（KEEP_PARAMS），entity 參數丟掉
  function hrefFor(gid: string): string {
    const params = new URLSearchParams();
    if (gid) params.set('group', gid);
    for (const k of KEEP_PARAMS) {
      const v = search.get(k);
      if (v) params.set(k, v);
    }
    return params.toString() ? `${pathname}?${params.toString()}` : pathname;
  }
  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    // location.assign 維持 MPA 整頁載入，layout 每次重渲染、群組清單不過期
    location.assign(hrefFor(e.target.value));
  }
  const rowCls = (on: boolean) =>
    `block truncate rounded-md px-2.5 py-2 text-sm ${on ? 'bg-emerald-50 font-medium text-emerald-900' : 'hover:bg-gray-50'}`;

  const options = (
    <>
      {supportsAll ? (
        <option value="">全部群組</option>
      ) : (
        !current && (
          <option value="" disabled>
            選擇群組…
          </option>
        )
      )}
      {[...byCat.entries()].map(([cat, gs]) => (
        <optgroup key={cat} label={cat}>
          {gs.map((g) => (
            <option key={g.group_id} value={g.group_id}>
              {g.name ?? g.group_id}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );

  return (
    <>
      {/* 手機：context 欄——頭像＋群組名，點開是真正的清單（<details>，純 HTML）。
          原本是透明 <select> 疊在上面叫原生選單：在 LINE 內建瀏覽器不一定會開，
          而且「點擊切換群組」這行字不會告訴你到底開了沒（principles.md：別讓我想）。 */}
      <details className="group relative md:hidden">
        <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 rounded-md py-1 [&::-webkit-details-marker]:hidden">
          {cur?.picture_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cur.picture_url} alt="" className="h-8 w-8 flex-none rounded-full" />
          ) : (
            <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-emerald-600 text-sm font-semibold text-white">
              {cur ? label.slice(0, 1) : '全'}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm leading-tight font-semibold">{label}</span>
            <span className="block text-[11px] text-gray-500">{cur?.category ?? (cur ? '未分類' : '切換群組')}</span>
          </span>
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 flex-none text-gray-400 transition-transform group-open:rotate-180"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </summary>
        <div className="absolute right-0 left-0 z-40 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
          {supportsAll && (
            <a href={hrefFor('')} aria-current={!current ? 'page' : undefined} className={rowCls(!current)}>
              全部群組
            </a>
          )}
          {[...byCat.entries()].map(([cat, gs]) => (
            <div key={cat}>
              <p className="px-2.5 pt-2.5 pb-1 text-[11px] font-medium text-gray-500">{cat}</p>
              {gs.map((g) => (
                <a
                  key={g.group_id}
                  href={hrefFor(g.group_id)}
                  aria-current={g.group_id === current ? 'page' : undefined}
                  className={rowCls(g.group_id === current)}
                >
                  {g.name ?? g.group_id}
                </a>
              ))}
            </div>
          ))}
        </div>
      </details>

      {/* 桌面：一般下拉 */}
      <select value={current} onChange={onChange} className="input hidden max-w-44 text-sm md:block">
        {options}
      </select>
    </>
  );
}
