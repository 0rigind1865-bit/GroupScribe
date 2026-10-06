'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { FloatingNav } from '@/app/ui/floating-nav';
import { bottomItems, moduleById, moduleOf, moreItems, type BadgeKey, type ModuleDef, type ModuleId, type NavItem } from './routes';

// 導覽：手機底部膠囊＋電腦左側欄，同一份路由表（routes.tsx）、皆帶 active 標記。
// 底部膠囊只放 primary 項目，其餘收在頂欄工具選單（shell-header.tsx）；左側欄全部列出。
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

/** 電腦版左側欄的導覽（2026-10 設計畫布 DesktopToday／AttendDesktop／ExpenseDesktop）。
 *  放在身分列的 navSlot：手機 .id-nav 不顯示；md 以上身分列整條變成左側欄（globals.css「電腦版左側欄」）。
 *  主要導覽＝底部分頁＋帶徽章的頁（群組助理的「把關」）；其餘頁面列在下面。scope＝範圍篩選（群組清單） */
export function SideNav({ moduleId, counts = {}, scope }: { moduleId: ModuleId; counts?: Counts; scope?: React.ReactNode }) {
  const module = modOf(moduleId);
  const { href, isActive } = useNav(module);
  const badged = moreItems(module).filter((i) => i.badge);
  const rest = moreItems(module).filter((i) => !i.badge);
  // 手機「今天」的徽章是替收在選單裡的「把關」掛的；側欄直接看得到「把關」，徽章只掛在它身上
  const count = (i: NavItem) => (i.badge && !(i.primary && badged.some((j) => j.badge === i.badge)) ? (counts[i.badge] ?? 0) : 0);
  const link = (i: NavItem, icon: boolean) => {
    const n = count(i);
    return (
      <a key={i.key} href={href(i.path)} aria-current={isActive(i.path) ? 'page' : undefined} className="side-link">
        {icon && <Icon>{i.icon}</Icon>}
        <span className="flex-1">{i.label}</span>
        {n > 0 && <span className="id-count">{n > 99 ? '99+' : n}</span>}
      </a>
    );
  };
  const gs = moduleId === 'gs';
  return (
    <>
      <nav aria-label="主要" className="side-nav">
        {[...bottomItems(module), ...badged].map((i) => link(i, true))}
      </nav>
      {scope}
      {rest.length > 0 && (
        // 群組助理：中間是群組清單，其餘頁面壓到最底；考勤／報帳緊接導覽、標「設定」（同畫布）
        <div className={gs ? 'side-more side-more--foot' : 'side-more'}>
          {!gs && <p className="side-sec">設定</p>}
          {rest.map((i) => link(i, false))}
        </div>
      )}
    </>
  );
}

/** 頂欄用：目前所在模組（client 端從 pathname 推導，不必逐頁傳 props） */
export function useCurrentModule() {
  return moduleOf(usePathname());
}
