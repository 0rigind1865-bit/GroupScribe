import type { ReactNode } from 'react';

// AI 抽不到負責人時常填「未定／待定／無」，那等於沒填——兩版都不該讓它佔一行版面
export const realAssignee = (a: string | null | undefined) =>
  a && !/^(未定|待定|無|不明|tbd|n\/a)$/i.test(a.trim()) ? a : null;

// 行程與待辦的左側視覺錨點（管理版今天頁與 LIFF 成員版共用）。
//
// 為什麼不是顏色：綠=行程、藍=待辦是任意指派的對應，得背對照表；4px 色線在手機上是一條細線，
// 深色模式再降一階飽和度。改讓資訊結構自己說話——待辦是「可完成的事」、行程是「某一刻發生的事」，
// 即使整頁轉灰階也分得出來（顏色退為輔助）。

// 待辦＝可勾的圈，點了就是完成。最高頻的動作放在最好按的位置（費茨定律）。
export function TaskCircle({
  formAction,
  id,
  back,
  title,
  overdue,
  extraFields,
}: {
  formAction: string;
  id: string;
  back: string;
  title: string;
  overdue?: boolean;
  extraFields?: ReactNode; // LIFF 端要多帶 kind / group_id
}) {
  return (
    <form action={formAction} method="post" className="flex-none">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value={back} />
      {extraFields}
      <button
        name="action"
        value="done"
        aria-label={`標記完成：${title}`}
        title="標記完成"
        className={`group grid h-7 w-7 place-items-center rounded-full border-2 transition-colors ${
          overdue ? 'border-red-400 text-red-500 hover:bg-red-50' : 'border-sky-500 text-sky-600 hover:bg-sky-50'
        }`}
      >
        {/* 平常只有空圈（免得看起來像「已完成」）；桌面 hover、手機按住時浮出勾——
            手機沒有 hover，少了 active 就等於按下去毫無回饋 */}
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        >
          <path d="M6 12l4 4 8-8" />
        </svg>
      </button>
    </form>
  );
}

// 行程＝發生在某一刻的事，錨點就是「幾點」；沒定時間的顯示「全天」。
// 固定寬度讓同一天的行程與待辦標題起始位置對齊。
export function TimeChip({ time }: { time?: string | null }) {
  return (
    <span
      className={`w-14 flex-none rounded-md px-1 py-1 text-center text-xs leading-tight font-semibold tabular-nums ${
        time ? 'bg-emerald-100 text-emerald-900' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {time ?? '全天'}
    </span>
  );
}
