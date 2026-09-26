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
  const supportsAll = rel === '/' || ['/inbox', '/more', '/groups', '/import', '/settings', '/upgrade'].some((p) => rel.startsWith(p));
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
  const rowCls = (on: boolean) =>
    `block truncate rounded-md px-2.5 py-2 text-sm ${on ? 'bg-emerald-50 font-medium text-emerald-900' : 'hover:bg-gray-50'}`;

  // 設計稿（2026-09）：一顆「群組名 ▾」膠囊，手機在頂端右側、桌機在深色頂欄上。
  // 點開是真正的清單（<details>，純 HTML）：LINE 內建瀏覽器不一定叫得出原生 <select>。
  return (
    <details className="group relative">
      <summary className={PILL}>
        <span className="max-w-40 truncate">{label}</span>
        <Chevron />
      </summary>
      <div className="absolute right-0 z-40 mt-2 max-h-[70vh] w-64 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 text-gray-900 shadow-lg">
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
  );
}

/** 頂端 context 膠囊（群組／員工共用）：淺底細框；桌機在深色頂欄上改透明底白字 */
export const PILL =
  'flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 text-[13px] [&::-webkit-details-marker]:hidden md:border-[#3d4a43] md:bg-transparent md:text-white';

export function Chevron() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-none transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
