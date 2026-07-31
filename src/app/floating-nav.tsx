'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// 懸浮膠囊導覽：管理版與成員版共用（差別只在分頁內容與 md:hidden）。
//
// 三個行為，都是為了讓一條固定在畫面上的東西不要一直搶注意力：
//   指示器——一顆會滑動的藥丸，換頁時滑過去，讓「我從哪來、到哪去」有連續感
//   拖曳——橫向拖過膠囊即時預覽，放開才切換；比連點五格快，也不必瞄準
//   捲動——滑動中縮小半透明、停下回正常、滑到最底整條收走
//
// SSR 先用 aria-current 的底色畫出選中格，hydration 後換成可滑動的指示器
// （has-ind 一掛上就把 aria-current 的底色關掉，避免兩顆藥丸疊著）。

export type NavTab = {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: number;
};

type Mode = 'full' | 'mini' | 'hidden';

export function FloatingNav({ tabs, className = '' }: { tabs: NavTab[]; className?: string }) {
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('full');
  const drag = useRef({ active: false, startX: 0, moved: false, index: 0 });
  const suppressClick = useRef(false);

  const activeIndex = Math.max(0, tabs.findIndex((t) => t.active));
  const shown = dragIndex ?? activeIndex;

  const links = () => Array.from(navRef.current?.querySelectorAll('a') ?? []);

  // 指示器定位：字體載入、旋轉、分頁數變動都會改寬度，所以除了 shown 也監看尺寸
  useEffect(() => {
    const place = () => {
      const el = links()[shown];
      if (el) setInd({ x: el.offsetLeft, w: el.offsetWidth });
    };
    place();
    const nav = navRef.current;
    if (!nav) return;
    const ro = new ResizeObserver(() => {
      if (!drag.current.active) place();
    });
    ro.observe(nav);
    return () => ro.disconnect();
  }, [shown, tabs.length]);

  // 換頁後回到正常大小，並清掉拖曳預覽
  useEffect(() => {
    setMode('full');
    setDragIndex(null);
  }, [activeIndex]);

  useEffect(() => {
    let idle: ReturnType<typeof setTimeout> | null = null;
    const atBottom = () =>
      window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 8;
    const onScroll = () => {
      if (drag.current.active) return;
      setMode('mini');
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => setMode(atBottom() ? 'hidden' : 'full'), 160);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (idle) clearTimeout(idle);
    };
  }, []);

  function tabAtX(clientX: number): number {
    const els = links();
    if (!els.length) return activeIndex;
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) return i;
    }
    return clientX < els[0].getBoundingClientRect().left ? 0 : els.length - 1;
  }

  return (
    <nav
      ref={navRef}
      className={`floating-nav ${ind ? 'has-ind' : ''} ${mode === 'mini' ? 'nav-mini' : ''} ${
        mode === 'hidden' ? 'nav-hidden' : ''
      } ${className}`}
      onPointerDown={(e) => {
        suppressClick.current = false;
        drag.current = { active: true, startX: e.clientX, moved: false, index: tabAtX(e.clientX) };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d.active) return;
        // 6px 門檻：手指按下時的微小抖動不該被當成拖曳，否則單純點擊會誤觸預覽
        if (!d.moved && Math.abs(e.clientX - d.startX) < 6) return;
        if (!d.moved) {
          d.moved = true;
          try {
            navRef.current?.setPointerCapture(e.pointerId);
          } catch {}
        }
        d.index = tabAtX(e.clientX);
        setDragIndex(d.index);
      }}
      onPointerUp={() => {
        const d = drag.current;
        if (!d.active) return;
        d.active = false;
        // 拖過就由 router 換頁，並吃掉隨後那個 click（否則會連跳兩次）
        if (d.moved) {
          suppressClick.current = true;
          router.push(tabs[d.index].href);
        }
      }}
      onPointerCancel={() => {
        drag.current.active = false;
        setDragIndex(null);
      }}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.preventDefault();
          e.stopPropagation();
          suppressClick.current = false;
        }
        setMode('full');
      }}
    >
      {ind && <span className="nav-ind" style={{ width: ind.w, transform: `translateX(${ind.x}px)` }} />}
      {tabs.map((t, i) => (
        <a
          key={t.href}
          href={t.href}
          draggable={false}
          aria-current={t.active ? 'page' : undefined}
          className={i === shown ? 'on font-bold text-emerald-800' : 'text-gray-500'}
        >
          <span className="relative">
            <svg viewBox="0 0 24 24" className="h-5.5 w-5.5" fill="none" stroke="currentColor" strokeWidth="1.8">
              {t.icon}
            </svg>
            {!!t.badge && (
              <span className="absolute -top-1 -right-2 rounded-full bg-red-500 px-1.5 text-[10px] leading-4 font-bold text-white">
                {t.badge > 99 ? '99+' : t.badge}
              </span>
            )}
          </span>
          {t.label}
        </a>
      ))}
    </nav>
  );
}
