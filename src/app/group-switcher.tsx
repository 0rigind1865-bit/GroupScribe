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
  // 只有「今天」與收件匣是跨群聚合視圖，其餘頁面一定落在單一群組
  const supportsAll = pathname === '/' || pathname.startsWith('/inbox');
  const label = cur ? (cur.name ?? cur.group_id) : supportsAll ? '全部群組' : '選擇群組…';

  const byCat = new Map<string, GroupOption[]>();
  for (const g of groups) {
    const cat = g.category ?? '未分類';
    byCat.set(cat, [...(byCat.get(cat) ?? []), g]);
  }

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const gid = e.target.value;
    const params = new URLSearchParams();
    if (gid) params.set('group', gid);
    for (const k of KEEP_PARAMS) {
      const v = search.get(k);
      if (v) params.set(k, v);
    }
    // location.assign 維持 MPA 整頁載入，layout 每次重渲染、群組清單不過期
    location.assign(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  }

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
      {/* 手機：context 欄——頭像＋群組名＋副標，整塊可點（透明 select 疊在上面叫出原生選單） */}
      <div className="relative flex min-w-0 items-center gap-2 md:hidden">
        {cur?.picture_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cur.picture_url} alt="" className="h-8 w-8 flex-none rounded-full" />
        ) : (
          <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-emerald-600 text-sm font-bold text-white">
            {cur ? label.slice(0, 1) : '全'}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm leading-tight font-bold">{label}</span>
          <span className="block text-[11px] text-gray-500">點擊切換群組</span>
        </span>
        <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none text-gray-400" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
        <select
          value={current}
          onChange={onChange}
          aria-label="切換群組"
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {options}
        </select>
      </div>

      {/* 桌面：一般下拉 */}
      <select value={current} onChange={onChange} className="input hidden max-w-44 text-sm md:block">
        {options}
      </select>
    </>
  );
}
