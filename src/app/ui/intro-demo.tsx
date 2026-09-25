'use client';

import { useEffect, useRef, useState } from 'react';

// 官方網站／認領頁的示範短劇：捲到這裡才開始播，播完可重播。
//   ① 對話：「正在輸入…」→ 訊息一則一則進來
//   ② 提取：群記逐則掃描，被掃到的訊息發光、彈出整理卡；閒聊變灰不記錄
//   ③ 確認：假游標（代表人）逐張點「確認」，點下去有漣漪，卡片轉綠
//   ④ 歸位：每張卡標上去了哪裡（月曆／待辦／公告）
// 對話內容是虛構的一般商務情境，不寫死任何產業（plan.md B.7）。
// prefers-reduced-motion：直接顯示最終狀態，不播放。
//
// 鎖捲動（使用者要求）：滑到示範框時自動對齊並鎖住捲動，播完或按「跳過」才解鎖。
// 三個保險避免讓人以為當機：跳過鈕全程可見、播完自動解鎖、同一次瀏覽只鎖一次（重播不鎖）。

type Kind = 'event' | 'task' | 'note';
const CHIP: Record<Kind, { label: string; cls: string; dest: string }> = {
  event: { label: '行程', cls: 'bg-emerald-600', dest: '月曆' },
  task: { label: '待辦', cls: 'bg-sky-600', dest: '待辦' },
  note: { label: '公告', cls: 'bg-purple-600', dest: '公告' },
};

const CHAT = [
  { who: '老王', at: '09:10', text: '週四下午兩點在新莊倉庫點貨，小林記得帶清單' },
  { who: '小林', at: '09:12', text: '好', noise: true },
  { who: '雅婷', at: '09:15', text: '以後報價單一律副本給會計喔' },
  { who: '阿凱', at: '09:20', text: '我週三前把新版估價單傳上來' },
];

// 每則訊息會整理出哪些卡（空陣列＝閒聊）
const EXTRACT: { kind: Kind; title: string; meta: string }[][] = [
  [
    { kind: 'event', title: '新莊倉庫點貨', meta: '週四 14:00 · 來源：老王' },
    { kind: 'task', title: '帶點貨清單', meta: '小林 · 期限週四 · 來源：老王' },
  ],
  [],
  [{ kind: 'note', title: '報價單一律副本給會計', meta: '全員適用 · 來源：雅婷' }],
  [{ kind: 'task', title: '傳新版估價單', meta: '阿凱 · 期限週三 · 來源：阿凱' }],
];
const ALL_CARDS = EXTRACT.flat();

type Phase = 'idle' | 'chat' | 'extract' | 'review' | 'done';
const STAGES: { p: Phase[]; t: string }[] = [
  { p: ['chat'], t: '對話' },
  { p: ['extract'], t: 'AI 提取' },
  { p: ['review'], t: '人員確認' },
  { p: ['done'], t: '歸位' },
];
const CAPTION: Record<Phase, string> = {
  idle: '大家照常講話，群記不會插嘴。',
  chat: '大家照常講話，群記不會插嘴。',
  extract: '群記正在讀對話，找出日期、負責人和決定…',
  review: 'AI 只提出線索，你按「確認」才算數。',
  done: '完成！已放進月曆、待辦與公告，群成員在 LINE 裡就看得到。',
};

type Cursor = { x: number; y: number; on: boolean; click: boolean };

// 鎖住捲動：html 加 class（CSS 設 overflow hidden、藏底部 CTA）＋擋滾輪、觸控拖動與捲動鍵
const SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ']);
const block = (e: Event) => {
  if (e instanceof KeyboardEvent && !SCROLL_KEYS.has(e.key)) return;
  e.preventDefault();
};
function lockScroll(on: boolean) {
  document.documentElement.classList.toggle('demo-lock', on);
  const fn = on ? window.addEventListener : window.removeEventListener;
  for (const t of ['wheel', 'touchmove', 'keydown']) fn(t, block, { passive: false } as AddEventListenerOptions);
}

export function IntroDemo() {
  const box = useRef<HTMLDivElement>(null);
  const runRef = useRef({ dead: false });
  const lockedOnce = useRef(false);
  const [locked, setLocked] = useState(false);
  const btns = useRef<(HTMLButtonElement | null)[]>([]);
  const [started, setStarted] = useState(false);
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [shown, setShown] = useState(0); // 已出現的訊息數
  const [typing, setTyping] = useState<string | null>(null);
  const [scan, setScan] = useState<number | null>(null); // 正在掃描第幾則
  const [noise, setNoise] = useState(false);
  const [cards, setCards] = useState(0); // 已彈出的卡片數
  const [ok, setOk] = useState<Set<number>>(new Set());
  const [cursor, setCursor] = useState<Cursor>({ x: 0, y: 0, on: false, click: false });

  // 捲到這裡才開始播
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // 播放中鎖捲動；解鎖時一定清掉監聽（元件卸載也要）
  useEffect(() => {
    lockScroll(locked);
    return () => lockScroll(false);
  }, [locked]);

  const finish = () => {
    setShown(CHAT.length);
    setTyping(null);
    setScan(null);
    setNoise(true);
    setCards(ALL_CARDS.length);
    setOk(new Set(ALL_CARDS.map((_, i) => i)));
    setCursor((p) => ({ ...p, on: false }));
    setPhase('done');
    setLocked(false);
  };
  const skip = () => {
    runRef.current.dead = true;
    finish();
  };

  useEffect(() => {
    if (!started) return;
    const ctl = { dead: false };
    runRef.current = ctl;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const reset = () => {
      setShown(0);
      setTyping(null);
      setScan(null);
      setNoise(false);
      setCards(0);
      setOk(new Set());
      setCursor({ x: 0, y: 0, on: false, click: false });
    };

    // 不要動畫的人：直接看結果
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }

    // 第一次播：把示範框對齊到畫面上緣，然後鎖住捲動
    if (!lockedOnce.current && box.current) {
      lockedOnce.current = true;
      window.scrollTo({ top: box.current.getBoundingClientRect().top + window.scrollY - 12, behavior: 'smooth' });
      // 等平滑捲動對齊完再鎖，太早鎖會把捲動卡在半路
      setTimeout(() => {
        if (!ctl.dead) setLocked(true);
      }, 500);
    }

    // 游標移到第 j 張卡的確認鈕（座標相對於示範框）
    const aim = (j: number) => {
      const b = btns.current[j];
      const c = box.current;
      if (!b || !c) return;
      const br = b.getBoundingClientRect();
      const cr = c.getBoundingClientRect();
      setCursor({ x: br.left - cr.left + br.width * 0.55, y: br.top - cr.top + br.height * 0.6, on: true, click: false });
    };

    (async () => {
      reset();
      setPhase('chat');
      await sleep(400);
      for (let i = 0; i < CHAT.length; i++) {
        if (ctl.dead) return; // 每一步開頭都檢查：跳過後不能再多冒出一個「正在輸入」
        setTyping(CHAT[i].who);
        await sleep(i === 1 ? 450 : 850); // 「好」打得比較快
        if (ctl.dead) return;
        setTyping(null);
        setShown(i + 1);
        await sleep(300);
      }
      await sleep(500);
      if (ctl.dead) return;

      if (ctl.dead) return;
      setPhase('extract');
      let n = 0;
      for (let i = 0; i < CHAT.length; i++) {
        if (ctl.dead) return;
        setScan(i);
        await sleep(650);
        if (ctl.dead) return;
        if (CHAT[i].noise) setNoise(true);
        for (const _ of EXTRACT[i]) {
          n++;
          setCards(n);
          await sleep(380);
          if (ctl.dead) return;
        }
        setScan(null);
        await sleep(200);
      }
      await sleep(400);
      if (ctl.dead) return;

      if (ctl.dead) return;
      setPhase('review');
      const c = box.current;
      if (c) setCursor({ x: c.clientWidth - 30, y: c.clientHeight - 20, on: true, click: false });
      await sleep(350);
      for (let j = 0; j < ALL_CARDS.length; j++) {
        if (ctl.dead) return;
        aim(j);
        await sleep(700);
        if (ctl.dead) return;
        setCursor((p) => ({ ...p, click: true }));
        await sleep(160);
        setOk((s) => new Set(s).add(j));
        setCursor((p) => ({ ...p, click: false }));
        await sleep(320);
        if (ctl.dead) return;
      }
      setCursor((p) => ({ ...p, on: false }));
      await sleep(300);
      if (!ctl.dead) {
        setPhase('done');
        setLocked(false);
      }
    })();
    return () => {
      ctl.dead = true;
    };
  }, [started, run]);

  const stageIdx = STAGES.findIndex((s) => s.p.includes(phase));

  return (
    <div ref={box} className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* 跳過：播放中全程可見（鎖捲動的出口），放在拇指最好按的右下角。
          鎖住時固定在螢幕右下（示範框可能比螢幕高，框的右下角會在畫面外；底部 CTA 此時已讓開）；
          重播不鎖時改放在示範框右下，免得使用者滑去別段它還浮在那裡。
          綠色實心：深色模式下黑色按鈕會跟背景融在一起。 */}
      {phase !== 'idle' && phase !== 'done' && (
        // 注意：祖先不能有 transform（例如 .reveal 捲動浮入），否則 fixed 會以祖先為準、跑出畫面——
        // 所以 DemoSection 刻意不加 .reveal（見 intro.tsx）
        <button
          onClick={skip}
          className={`${
            locked ? 'fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))]' : 'absolute right-3 bottom-3'
          } msg-in z-40 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg`}
        >
          {locked ? '跳過動畫 ↓' : '跳過'}
        </button>
      )}
      {/* 進度條：對話 → AI 提取 → 人員確認 → 歸位 */}
      <div className="grid grid-cols-4 gap-1 border-b border-gray-200 px-3 py-2 text-center text-[11px]">
        {STAGES.map((s, i) => (
          <div key={s.t}>
            <div className={`mb-1 h-1 rounded-full transition-colors duration-500 ${i <= stageIdx ? 'bg-emerald-500' : 'bg-gray-200'}`} />
            <span className={i === stageIdx ? 'font-semibold text-emerald-800' : 'text-gray-400'}>{s.t}</span>
          </div>
        ))}
      </div>

      {/* 假聊天室：固定高度，訊息進來時版面不跳 */}
      <div className="border-b border-gray-200 px-4 py-2 text-sm font-semibold">宏達 · 專案群（示範）</div>
      <div className="min-h-[17.5rem] space-y-2.5 bg-sky-50 px-3 py-4">
        {CHAT.slice(0, shown).map((m, i) => (
          <div
            key={m.at}
            className={`msg-in flex items-start gap-2 transition-opacity duration-500 ${noise && m.noise ? 'opacity-40' : ''}`}
          >
            <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">
              {m.who.slice(-1)}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] text-gray-500">{m.who}</p>
              <div className="flex items-end gap-1.5">
                <p
                  className={`rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm shadow-xs transition-shadow duration-300 ${
                    scan === i ? 'scan-glow' : ''
                  } ${noise && m.noise ? 'line-through' : ''}`}
                >
                  {m.text}
                </p>
                <span className="flex-none text-[10px] text-gray-400">{m.at}</span>
              </div>
              {noise && m.noise && <p className="msg-in mt-0.5 text-[11px] text-gray-500">閒聊不記錄</p>}
            </div>
          </div>
        ))}
        {typing && (
          <div className="msg-in flex items-center gap-2">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">
              {typing.slice(-1)}
            </span>
            <span className="flex gap-1 rounded-2xl rounded-tl-sm bg-white px-3 py-3 shadow-xs" aria-label={`${typing} 正在輸入`}>
              <span className="typing-dot" />
              <span className="typing-dot [animation-delay:150ms]" />
              <span className="typing-dot [animation-delay:300ms]" />
            </span>
          </div>
        )}
      </div>

      {/* 整理結果 */}
      <div className="min-h-[20rem] space-y-2 px-3 py-3">
        <p className="flex items-center justify-center gap-1.5 px-1 py-1 text-center text-xs text-gray-600" aria-live="polite">
          {phase === 'extract' && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}
          {CAPTION[phase]}
        </p>
        {ALL_CARDS.slice(0, cards).map((r, j) => {
          const done = ok.has(j);
          return (
            <div
              key={r.title}
              className={`card-pop flex items-start gap-2.5 rounded-xl border bg-white px-3 py-2.5 transition-colors duration-300 ${
                done ? 'border-emerald-600' : 'border-gray-200'
              }`}
            >
              <span className={`mt-0.5 flex-none rounded-full px-2 py-0.5 text-[11px] font-medium text-white ${CHIP[r.kind].cls}`}>
                {CHIP[r.kind].label}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{r.title}</p>
                <p className="text-xs text-gray-500">{r.meta}</p>
                {phase === 'done' && (
                  <p className="msg-in mt-1 text-[11px] font-medium text-emerald-800">→ 已放進{CHIP[r.kind].dest}</p>
                )}
              </div>
              {done ? (
                <span className="badge-pop flex-none rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900">
                  ✓ 已確認
                </span>
              ) : (
                <button
                  ref={(el) => {
                    btns.current[j] = el;
                  }}
                  tabIndex={-1}
                  className="flex-none rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900"
                >
                  確認
                </button>
              )}
            </div>
          );
        })}
      </div>

      {phase === 'done' && (
        <div className="border-t border-gray-200 p-3">
          <button className="btn w-full" onClick={() => setRun((r) => r + 1)}>
            ↻ 再看一次
          </button>
        </div>
      )}

      {/* 假游標：代表「人」去點確認 */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 z-10"
        style={{
          transform: `translate(${cursor.x}px, ${cursor.y}px)`,
          opacity: cursor.on ? 1 : 0,
          transition: 'transform 650ms cubic-bezier(0.65, 0, 0.35, 1), opacity 250ms',
        }}
      >
        {cursor.click && <span className="click-ripple absolute -top-3 -left-3 h-6 w-6 rounded-full bg-amber-400" />}
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          style={{ transform: cursor.click ? 'scale(0.82)' : 'scale(1)', transition: 'transform 120ms', filter: 'drop-shadow(0 2px 3px rgb(0 0 0 / 0.3))' }}
        >
          <path d="M4 2l15 11-6.5 1.2L9.5 21z" fill="#111827" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
