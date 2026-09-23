// 載入中畫面：給 Next.js 的 loading.tsx 用（殼留著、內容區換成這個）。
// 只有一種尺寸、一句文字——載入畫面不是設計重點，看得出「在動」就好。
export function Loading({ label = '載入中…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}
