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

  // 捲動收合。三道防線，因為這條一旦收起來叫不回來就是死路：
  //   (1) 頁面不夠長就完全不收——LINE 內建瀏覽器即使不能捲也會因為橡皮筋效果與網址列
  //       收合而送出 scroll 事件，而短頁面的 atBottom() 永遠為真，於是「一進頁面就永久消失」。
  //   (2) 往上捲一律叫回來，不等 idle timer。
  //   (3) 視窗尺寸變動（網址列收合／轉向）重算，順便復原。
  useEffect(() => {
    let idle: ReturnType<typeof setTimeout> | null = null;
    let lastY = 0;
    const doc = () => document.documentElement;
    // 24px 容差：網址列收放會讓 innerHeight 抖動，差幾 px 不該算「可捲動」
    const scrollable = () => doc().scrollHeight > window.innerHeight + 24;
    const atBottom = () => window.scrollY + window.innerHeight >= doc().scrollHeight - 8;
    const onScroll = () => {
      if (drag.current.active) return;
      if (!scrollable()) {
        setMode('full');
        return;
      }
      const y = window.scrollY;
      const up = y < lastY;
      lastY = y;
      if (idle) clearTimeout(idle);
      if (up) {
        setMode('full');
        return;
      }
      setMode('mini');
      idle = setTimeout(() => setMode(atBottom() ? 'hidden' : 'full'), 160);
    };
    const onResize = () => {
      if (idle) clearTimeout(idle);
      setMode('full');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (idle) clearTimeout(idle);
    };
  }, []);

  // 整頁左右滑動換頁。手機上這才是主要的換頁手勢——拖曳膠囊要先把拇指移到底部，
  // 而分頁之間的來回是最高頻的動作（費茨定律：最好按的位置是「不用移動」）。
  // 四個不攔的情況：多指縮放、從螢幕左緣起手（iOS 返回手勢）、橫向可捲的內容
  // （時間軸表格、篩選 chip 列），以及膠囊本身（否則拖曳與滑動會各自 push 一次）。
  useEffect(() => {
    let sx = 0;
    let sy = 0;
    let st = 0;
    let tracking = false;
    const onStart = (e: TouchEvent) => {
      const p = e.touches[0];
      const el = e.target as Element | null;
      tracking =
        e.touches.length === 1 &&
        p.clientX >= 24 &&
        !el?.closest?.('.floating-nav, [data-no-swipe], .overflow-x-auto, table');
      if (!tracking) return;
      sx = p.clientX;
      sy = p.clientY;
      st = Date.now();
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const p = e.changedTouches[0];
      const dx = p.clientX - sx;
      const dy = p.clientY - sy;
      // 要「快、明顯橫向」才算：慢的、位移小的、偏直向的都放行給捲動
      if (Date.now() - st > 600) return;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      const next = activeIndex + (dx < 0 ? 1 : -1); // 左滑＝下一頁
      if (next < 0 || next >= tabs.length) return; // 到底不繞回，免得從最後一頁滑回第一頁
      router.push(tabs[next].href);
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, [activeIndex, tabs, router]);

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
