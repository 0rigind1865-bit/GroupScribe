'use client';

import { useEffect, useId, useRef } from 'react';

// Esc 關閉，但只讓最上層的那一個吃：編輯抽屜裡點照片會再疊一層 Lightbox，
// 這時 Esc 只關照片，不能連抽屜一起關掉（未存的欄位會跟著消失）。
// 「最上層」用 DOM 順序判——Lightbox 嵌在抽屜裡面，一定排在抽屜之後。
// 只算看得見的層：報帳 App 四個分頁同時掛著、只用 hidden 切換，清單分頁裡可能藏著一個還開著的編輯抽屜，
// 而清單分頁排在記一筆後面——不濾掉的話，Esc 會去關那個看不見的，畫面上的計算機反而不動。
// 關掉的那層再 preventDefault 做記號：listener 之間會跑 microtask，React 可能已把 Lightbox 拆掉，
// 輪到抽屜時它會以為自己是最上層；看到記號就收手。
function useEscClose(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 注音選字中按 Esc 是取消組字，不是關抽屜：isComposing，Safari 組字結束那一下只剩 keyCode 229（同 layout.tsx）
      if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229 || e.defaultPrevented) return;
      const layers = [...document.querySelectorAll('[aria-modal="true"]')].filter((el) => el.getClientRects().length > 0);
      if (layers[layers.length - 1] !== ref.current) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ref, onClose]);
}

// 底部彈出面板（Snaptab 的 cm-sheet）：點遮罩或 Esc 關閉。計算機、編輯、分類管理、選地點共用。
// 刻意維持 fixed div、不用 <dialog showModal>：top layer 會蓋掉 z-[70] 的 Toast，背景也會整片 inert。
// 也刻意不做下拉甩動關閉：編輯抽屜有未存欄位，一甩就靜默丟資料。
// 進場動畫與鎖背景捲動在 globals.css 的 .sheet-backdrop／.sheet-panel。
// data-no-swipe：FloatingNav 在 document 上聽整頁橫滑換頁，抽屜開著時快滑一下會換 tab、編輯跟著消失。
export function Sheet({
  title,
  label,
  onClose,
  action,
  children,
}: {
  title?: string;
  /** 沒有標題列時（計算機）給報讀用的名稱：dialog 一定要有名字，不然只念「對話框」 */
  label?: string;
  onClose: () => void;
  action?: React.ReactNode; // 右上角（預設「關閉」）
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEscClose(panel, onClose);
  return (
    <div className="sheet-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose} data-no-swipe="">
      <div
        ref={panel}
        className="sheet-panel card max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-b-none pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title !== undefined ? titleId : undefined}
        aria-label={title === undefined ? label : undefined}
      >
        {title !== undefined && (
          <div className="mb-3 flex items-center">
            <span id={titleId} className="text-lg font-semibold">
              {title}
            </span>
            <span className="ml-auto">
              {action ?? (
                <button type="button" className="btn btn-sm" onClick={onClose}>
                  關閉
                </button>
              )}
            </span>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// 全螢幕看照片（Snaptab PhotoLightbox）：點背景、✕ 或 Esc 關閉。
// 常疊在編輯抽屜裡面，所以同樣要 data-no-swipe，Esc 也走「只關最上層」。
export function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEscClose(root, onClose);
  // 打開時焦點移到 ✕：aria-modal 之後照片以外都不算數，焦點留在後面的縮圖上，
  // 報讀游標會卡在被排除的元素、Tab 會先走到被照片蓋住的「移除」。關掉時還給原本那張縮圖。
  // 不用 autoFocus：React 在 effect 之前就把焦點搬走，這裡會記錯「原本在哪」
  useEffect(() => {
    const prev = document.activeElement;
    closeBtn.current?.focus({ preventScroll: true });
    return () => {
      if (prev instanceof HTMLElement && prev.isConnected) prev.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div
      ref={root}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-3"
      onClick={onClose}
      data-no-swipe=""
      role="dialog"
      aria-modal="true"
      aria-label="收據照片"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="收據照片" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
      <button ref={closeBtn} type="button" aria-label="關閉" onClick={onClose} className="absolute top-4 right-4 h-11 w-11 rounded-full bg-black/60 text-xl text-white">
        ✕
      </button>
    </div>
  );
}

// 跳出式小提示（Snaptab toast）：1.8 秒後自動消失
export function Toast({ msg }: { msg: string }) {
  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex justify-center px-4 transition-opacity duration-200 ${msg ? 'opacity-100' : 'opacity-0'}`}
    >
      {msg && <span className="rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">{msg}</span>}
    </div>
  );
}
