'use client';

import { useEffect, useRef, useState } from 'react';
import { SCENES } from './intro-flow-scenes';

// 「整理到哪裡」捲動敘事（scrollytelling）：這段釘在畫面上，往下滑一次亮一步——
// 進度線長到那一步、圓點跳起來發光、上方換成這一步的小畫面、說明只展開目前這一步；走過的步驟打勾。
// 沒有 JS 或 prefers-reduced-motion：退回一般清單，所有說明直接顯示。

const FLOW = [
  { t: '群組對話', d: '大家照常講話。文字、圖片、PDF、語音都收，貼圖和「好」「收到」這類閒聊不記錄。', tag: '零輸入' },
  { t: 'AI 提取', d: '找出日期、時間、地點、負責人和拍板的決定，整理成行程、待辦、公告。', tag: '自動' },
  { t: '收件匣：人員確認', d: '每一筆都附上 AI 根據的那句原話。管理員或最清楚狀況的群成員按「確認」、改錯字，或一鍵忽略。', tag: '你把關' },
  { t: '定案歸位', d: '確認過的內容進月曆、待辦、公告與檔案。之後的對話若改期，AI 會提出更新，再等你確認。', tag: '可回溯' },
  { t: '送到每個人手上', d: '成員在 LINE 裡點開就看得到；訂閱的人每天早上收到私訊提醒；忘了就在群裡 @群記 問。', tag: '在 LINE 裡' },
];
const N = FLOW.length;
const PER_STEP_VH = 55; // 每一步要滑多遠

export function FlowSection() {
  const sec = useRef<HTMLElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const dots = useRef<(HTMLSpanElement | null)[]>([]);
  const [scrolly, setScrolly] = useState(false);
  const [active, setActive] = useState(-1); // -1＝還沒釘住

  useEffect(() => {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setScrolly(true);
  }, []);

  useEffect(() => {
    if (!scrolly) return;
    let raf = 0;
    const update = () => {
      const el = sec.current;
      const ol = list.current;
      if (!el || !ol) return;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 1;
      const a = r.top > 0 ? -1 : Math.min(N - 1, Math.floor(p * N * 0.9999));
      setActive(a);
      // 進度線：長到「目前這一步」與「下一步」之間，隨捲動連續前進
      const center = (i: number) => {
        const d = dots.current[i];
        if (!d) return 0;
        return d.getBoundingClientRect().top - ol.getBoundingClientRect().top + d.offsetHeight / 2;
      };
      let h = 0;
      if (a >= 0) {
        const frac = p * N - a;
        const from = center(a);
        const to = a < N - 1 ? center(a + 1) : from;
        h = from + (to - from) * Math.min(1, Math.max(0, frac));
      }
      if (fill.current) fill.current.style.height = `${h}px`;
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [scrolly]);

  const head = (
    <div className="mb-5">
      <div className="flex items-baseline justify-between">
        <p className="mb-1 text-xs font-semibold tracking-widest text-emerald-700">整理到哪裡</p>
        {scrolly && active >= 0 && (
          <p className="text-xs text-gray-500 tabular-nums">
            {active + 1} / {N}
          </p>
        )}
      </div>
      <h2 className="mb-1 text-lg font-semibold tracking-tight">從一句話，到每個人的行事曆</h2>
      <p className="text-sm text-gray-600">AI 只負責提出線索，人確認過才算數。</p>
    </div>
  );

  // 退回版：一般清單
  if (!scrolly) {
    return (
      <section>
        {head}
        <ol className="space-y-5">
          {FLOW.map((s, i) => (
            <li key={s.t} className="flex gap-3">
              <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-emerald-600 text-xs font-semibold text-white">{i + 1}</span>
              <span>
                <span className="block font-semibold">{s.t}</span>
                <span className="block text-sm leading-relaxed text-gray-600">{s.d}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section ref={sec} style={{ height: `calc(${N * PER_STEP_VH}svh + 100svh)` }}>
      <div className="sticky top-0 flex h-svh flex-col justify-center pb-16">
        {head}
        <div className="mb-4 h-44 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
          {(() => {
            const Scene = SCENES[Math.max(0, active)];
            return (
              <div key={active} className={`h-full transition-opacity duration-300 ${active < 0 ? 'opacity-40' : ''}`}>
                <Scene />
              </div>
            );
          })()}
        </div>
        <ol ref={list} className="relative space-y-3 pl-10">
          <span aria-hidden className="absolute top-3.5 bottom-3.5 left-[15px] w-1 rounded-full bg-gray-200" />
          <span
            aria-hidden
            ref={fill}
            className="absolute top-0 left-[15px] w-1 rounded-full bg-emerald-500 transition-[height] duration-150 ease-out"
            style={{ height: 0 }}
          />
          {FLOW.map((s, i) => {
            const done = i < active;
            const on = i === active;
            const reached = i <= active;
            return (
              <li key={s.t} className="relative">
                <span
                  ref={(el) => {
                    dots.current[i] = el;
                  }}
                  className={`absolute top-0 -left-10 grid h-8 w-8 place-items-center rounded-full text-xs font-semibold transition-all duration-500 ${
                    reached ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'
                  } ${on ? 'scale-125 shadow-lg' : 'scale-100'}`}
                >
                  {on && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-40" />}
                  <span className="relative">{done ? '✓' : i + 1}</span>
                </span>
                <p className={`flex min-h-8 items-center gap-2 font-semibold transition-colors duration-500 ${reached ? '' : 'text-gray-400'}`}>
                  <span className={on ? 'text-lg' : ''}>{s.t}</span>
                  <span
                    className={`rounded-full bg-emerald-100 px-2 py-px text-[11px] font-medium text-emerald-900 transition-all duration-500 ${
                      reached ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    {s.tag}
                  </span>
                </p>
                {/* 說明：只展開目前這一步，走過的收回成一行（grid-rows 0fr→1fr 做高度動畫） */}
                <div
                  className={`grid transition-all duration-500 ease-out ${on ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                >
                  <p className={`overflow-hidden text-sm leading-relaxed text-gray-600 ${on ? 'translate-y-0' : ''}`}>{s.d}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <p className={`mt-4 text-center text-xs text-gray-500 transition-opacity duration-500 ${active < N - 1 ? 'opacity-100' : 'opacity-0'}`}>
          <span className="inline-block animate-bounce">↓</span> 繼續往下滑
        </p>
      </div>
    </section>
  );
}
