'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { FloatingNav } from '@/app/ui/floating-nav';
import { bottomItems, moduleById, moduleOf, type BadgeKey, type ModuleDef, type ModuleId } from './routes';

// 導覽：手機底部膠囊＋桌面頂部 nav，同一份路由表（routes.tsx）、皆帶 active 標記。
// 只放 primary 項目；其餘收在頂欄工具選單（shell-header.tsx）。
// 換頁保留該模組的 context 參數（群組助理＝?group、考勤＝?emp）——原本會掉，
// 是「不直覺」的主因之一。

export type Counts = Partial<Record<BadgeKey, number>>;

// 只收 moduleId 字串，不收整個 ModuleDef——ModuleDef 帶 base() 函式，
// 跨 server→client 邊界傳函式會被 React 擋下（"Functions cannot be passed
// directly to Client Components"）。routes.tsx 只有常數與 JSX，client 端直接 import 即可。
const modOf = moduleById;

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
  return { href, isActive };
}

const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export function BottomNav({ moduleId, counts = {} }: { moduleId: ModuleId; counts?: Counts }) {
  const module = modOf(moduleId);
  const { href, isActive } = useNav(module);
  return (
    <FloatingNav
      className="md:hidden"
      tabs={bottomItems(module).map((i) => ({
        href: href(i.path),
        label: i.label,
        icon: <Icon>{i.icon}</Icon>,
        active: isActive(i.path),
        badge: i.badge ? counts[i.badge] : undefined,
      }))}
    />
  );
}

export function TopNav({ moduleId, counts = {} }: { moduleId: ModuleId; counts?: Counts }) {
  const module = modOf(moduleId);
  const { href, isActive } = useNav(module);
  return (
    <nav className="hidden gap-0.5 text-sm md:flex" aria-label={`${module.label}分頁`}>
      {bottomItems(module).map((i) => {
        const n = i.badge ? (counts[i.badge] ?? 0) : 0;
        const on = isActive(i.path);
        return (
          <a
            key={i.key}
            href={href(i.path)}
            aria-current={on ? 'page' : undefined}
            className={`flex items-center gap-1.5 rounded-[10px] px-3 py-2 whitespace-nowrap ${
              on ? 'bg-[#2e3a34] font-bold text-white' : 'text-[#b8c2bc] hover:bg-white/10 hover:text-white'
            }`}
          >
            {i.label}
            {n > 0 && (
              <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#e0a43a] px-1 text-[11px] font-bold text-[#1c2420]">
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
