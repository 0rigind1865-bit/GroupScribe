'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { FloatingNav } from '@/app/ui/floating-nav';
import {
  ATTEND_MODULE,
  GS_MODULE,
  bottomItems,
  moduleOf,
  type BadgeKey,
  type ModuleDef,
  type ModuleId,
  type NavItem,
} from './routes';

// 導覽：手機五格底部膠囊＋桌面頂部 nav，同一份路由表（routes.tsx）、皆帶 active 標記。
// 換頁保留該模組的 context 參數（群組助理＝?group、考勤＝?emp）——原本會掉，
// 是「不直覺」的主因之一。
//
// 兩個模組共用這支：考勤原本是 6 個裸 <a>（無 active、無 badge、手機得橫捲），
// 現在跟群組助理走同一套殼。

export type Counts = Partial<Record<BadgeKey, number>>;

// 只收 moduleId 字串，不收整個 ModuleDef——ModuleDef 帶 base() 函式，
// 跨 server→client 邊界傳函式會被 React 擋下（"Functions cannot be passed
// directly to Client Components"）。routes.tsx 只有常數與 JSX，client 端直接 import 即可。
const modOf = (id: ModuleId) => (id === 'attend' ? ATTEND_MODULE : GS_MODULE);

function useNav(module: ModuleDef) {
  const full = usePathname();
  const search = useSearchParams();
  const base = module.base(full.match(/^\/o\/([^/]+)/)?.[1] ?? '');
  const rel = full.slice(base.length) || '';
  const ctx = module.ctxParam ? search.get(module.ctxParam) : null;

  const href = (path: string) => {
    const p = `${base}${path}` || '/';
    return ctx && module.ctxParam ? `${p}?${module.ctxParam}=${encodeURIComponent(ctx)}` : p;
  };
  // active：模組首頁要精準比對（否則所有子頁都會亮），其餘用前綴
  const isActive = (path: string) => (path === '' ? rel === '' || rel === '/' : rel.startsWith(path));
  return { href, isActive, rel };
}

const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export function BottomNav({ moduleId, counts = {} }: { moduleId: ModuleId; counts?: Counts }) {
  const module = modOf(moduleId);
  const { href, isActive, rel } = useNav(module);
  const items = bottomItems(module);
  // 「更多」格的 active 範圍＝它自己的頁 ＋ 收在裡面的所有項目（路徑全來自路由表）
  const moreItem = items.find((i) => i.key === 'more');
  const morePaths = [
    ...module.items.filter((i) => !i.primary).map((i) => i.path),
    ...(moreItem ? [moreItem.path] : []),
  ];

  return (
    <FloatingNav
      className="md:hidden"
      tabs={items.map((i) => ({
        href: href(i.path),
        label: i.label,
        icon: <Icon>{i.icon}</Icon>,
        active: i.key === 'more' ? morePaths.some((p) => rel.startsWith(p)) : isActive(i.path),
        badge: i.badge ? counts[i.badge] : undefined,
      }))}
    />
  );
}

export function TopNav({ moduleId, counts = {} }: { moduleId: ModuleId; counts?: Counts }) {
  const module = modOf(moduleId);
  const { href, isActive } = useNav(module);
  return (
    <nav className="hidden gap-1 text-sm md:flex">
      {module.items.map((i: NavItem) => {
        const n = i.badge ? (counts[i.badge] ?? 0) : 0;
        return (
          <a
            key={i.key}
            href={href(i.path)}
            aria-current={isActive(i.path) ? 'page' : undefined}
            className={`relative rounded px-2.5 py-1 whitespace-nowrap ${
              isActive(i.path) ? 'bg-emerald-100 font-bold text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {i.label}
            {n > 0 && (
              <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {n > 99 ? '99+' : n}
              </span>
            )}
          </a>
        );
      })}
    </nav>
  );
}

/** 頂欄用：目前所在模組（client 端從 pathname 推導，不必逐頁傳 props） */
export function useCurrentModule() {
  return moduleOf(usePathname());
}
