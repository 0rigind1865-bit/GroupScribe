'use client';

import { usePathname, useSearchParams } from 'next/navigation';

export interface GroupOption {
  group_id: string;
  name: string | null;
  category: string | null;
  picture_url?: string | null;
}

// 切群組時保留的 view 參數白名單；entity 參數（event/task/q）一律丟棄，避免把 A 群的詳情帶進 B 群
const KEEP_PARAMS = ['view', 'date', 'range', 'q']; // q：在「找」頁換群組時保留搜尋詞

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
  const supportsAll = rel === '/' || ['/inbox', '/search', '/more', '/groups', '/import', '/settings', '/upgrade'].some((p) => rel.startsWith(p));
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
  // 設計稿（2026-09）：一顆「群組名 ▾」膠囊，在身分列最右（手機、電腦都在深色帶上）。
  // 點開是真正的清單（<details>，純 HTML）：LINE 內建瀏覽器不一定叫得出原生 <select>。
  // data-no-swipe 掛在 details：點外面收合的遮罩是 summary::before、跟面板是兄弟，掛在面板上 closest() 找不到，
  // 在遮罩上橫滑會被底部膠囊當成換分頁（同身分列，T10 第 2 輪）
  return (
    <details className="group relative" data-no-swipe="">
      <summary className={PILL}>
        <span>{label}</span>
        <Chevron />
      </summary>
      <div className={PANEL}>
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

/** 頂端情境膠囊（群組／員工共用）：外觀在 globals.css 的 .ctx-pill——淺色列白底細框、深色列透明底白字（審查 F17） */
export const PILL = 'ctx-pill';

/** 膠囊點開的清單面板與每一列（群組／員工共用，兩顆長一樣就要行為一樣——審查 F40）。
 *  ctx-panel（globals.css）：最大高度 vh 後備＋dvh、從膠囊長出來的進場動畫 */
export const PANEL =
  'ctx-panel absolute right-0 z-40 mt-2 w-64 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 text-gray-900 shadow-lg';
/** 每一列 44px 高（py-3＋text-sm 行高 20）：觸控目標；仍是 block＋truncate，名字太長照樣出省略號 */
export const rowCls = (on: boolean) =>
  `block truncate rounded-md px-2.5 py-3 text-sm ${on ? 'bg-emerald-50 font-medium text-emerald-900' : 'hover:bg-gray-50'}`;

export function Chevron() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-none transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
