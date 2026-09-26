'use client';

// 底部彈出面板（Snaptab 的 cm-sheet）：點遮罩關閉。計算機、編輯、分類管理、選地點共用。
export function Sheet({
  title,
  onClose,
  action,
  children,
}: {
  title?: string;
  onClose: () => void;
  action?: React.ReactNode; // 右上角（預設「關閉」）
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="card max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-b-none pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title !== undefined && (
          <div className="mb-3 flex items-center">
            <span className="text-lg font-semibold">{title}</span>
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

// 全螢幕看照片（Snaptab PhotoLightbox）：點背景或 ✕ 關閉
export function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-3" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="收據照片" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
      <button type="button" aria-label="關閉" onClick={onClose} className="absolute top-4 right-4 h-10 w-10 rounded-full bg-black/60 text-xl text-white">
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
