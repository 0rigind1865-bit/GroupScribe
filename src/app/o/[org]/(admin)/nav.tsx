'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { FloatingNav } from '@/app/floating-nav';

// 導覽（UI 提案階段 B）：手機五格底部 Tab＋桌面頂部 nav，同一份路由表、皆帶 active 標記。
// 換頁保留 ?group（原本會掉，是「不直覺」主因之一）。

const MORE_PATHS = ['/notes', '/files', '/groups', '/import', '/settings', '/more'];

const ICONS: Record<string, React.ReactNode> = {
  today: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4M12 14h.01" />
    </>
  ),
  inbox: (
    <>
      <path d="M3 13l3-8h12l3 8v6H3z" />
      <path d="M3 13h5l2 3h4l2-3h5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M9 13h.01M14 13h.01M9 17h.01M14 17h.01" />
    </>
  ),
  tasks: (
    <>
      <path d="M4 6l2 2 3-3M4 12l2 2 3-3M4 18l2 2 3-3" />
      <path d="M12 7h9M12 13h9M12 19h9" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </>
  ),
};

function useNav() {
  const full = usePathname();
  // 多租戶後路徑是 /o/[org]/...：從 pathname 取出 org 前綴，href 補回、active 判斷用相對路徑。
  // 從 pathname 而非 props 取得——client component 不必為了一個前綴串接 params。
  const base = full.match(/^\/o\/[^/]+/)?.[0] ?? '';
  const pathname = full.slice(base.length) || '/';
  const group = useSearchParams().get('group');
  const href = (path: string) => {
    const p = `${base}${path === '/' ? '' : path}` || '/';
    return group ? `${p}?group=${encodeURIComponent(group)}` : p;
  };
  return { pathname, href };
}

export function BottomNav({ pending }: { pending: number }) {
  const { pathname, href } = useNav();
  return (
    <FloatingNav
      className="md:hidden"
      tabs={[
        { href: href('/'), label: '今天', icon: ICONS.today, active: pathname === '/' },
        { href: href('/inbox'), label: '收件匣', icon: ICONS.inbox, active: pathname.startsWith('/inbox'), badge: pending },
        { href: href('/calendar'), label: '月曆', icon: ICONS.calendar, active: pathname.startsWith('/calendar') },
        { href: href('/tasks'), label: '待辦', icon: ICONS.tasks, active: pathname.startsWith('/tasks') },
        { href: href('/more'), label: '更多', icon: ICONS.more, active: MORE_PATHS.some((p) => pathname.startsWith(p)) },
      ]}
    />
  );
}

export function TopNav({ pending }: { pending: number }) {
  const { pathname, href } = useNav();
  const links: [string, string][] = [
    ['/', '今天'],
    ['/inbox', '收件匣'],
    ['/calendar', '月曆'],
    ['/tasks', '待辦'],
    ['/notes', '公告'],
    ['/files', '檔案'],
    ['/groups', '群組'],
    ['/import', '匯入'],
    ['/settings', '設定'],
  ];
  const isActive = (p: string) => (p === '/' ? pathname === '/' : pathname.startsWith(p));
  return (
    <nav className="hidden gap-1 text-sm md:flex">
      {links.map(([p, label]) => (
        <a
          key={p}
          href={href(p)}
          aria-current={isActive(p) ? 'page' : undefined}
          className={`relative rounded px-2.5 py-1 ${
            isActive(p) ? 'bg-emerald-100 font-bold text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {label}
          {p === '/inbox' && pending > 0 && (
            <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
              {pending > 99 ? '99+' : pending}
            </span>
          )}
        </a>
      ))}
    </nav>
  );
}
