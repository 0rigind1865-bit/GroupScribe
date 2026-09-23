// 審核相關的共用視覺（管理版與成員版共用）。
//
// 「確認」與「完成」是這個系統最容易按錯的一對，因為它們語意完全不同卻長得一樣：
//   確認 = 核可 AI 的判斷（這筆資料是對的）——對「資料」的判斷
//   完成 = 這件事做完了——對「工作」的狀態
// 分辨靠三層：顏色（琥珀 vs 綠）、形狀（方形印章 vs 圓圈）、位置（確認在待確認區塊裡）。

export const ConfirmIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M8 12l3 3 5-6" />
  </svg>
);

export const DoneIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12l3 3 5-6" />
  </svg>
);

import { isRevised, needsReview } from '@/core/date';

// 判斷邏輯在 core/date.ts（純函式、有測試），這裡只負責長相
export function PendingBadge({ item, compact = false }: { item: any; compact?: boolean }) {
  if (!needsReview(item)) return null;
  const revised = isRevised(item);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900 ${
        compact ? 'text-[10px]' : 'text-xs'
      }`}
    >
      {revised ? (
        <>
          <svg viewBox="0 0 24 24" className="h-3 w-3 flex-none" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M4 20h4L19 9a2.8 2.8 0 10-4-4L4 16z" />
          </svg>
          AI 已更新，請重新確認
        </>
      ) : (
        <>
          <svg viewBox="0 0 24 24" className="h-3 w-3 flex-none" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 9v4M12 17h.01M10.3 3.9L2.6 17a2 2 0 001.7 3h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
          </svg>
          待確認
        </>
      )}
    </span>
  );
}
