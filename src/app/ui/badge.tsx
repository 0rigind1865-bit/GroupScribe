import { TONE_SOFT, type Tone } from './tone';

// 狀態徽章。取代 7 份各自手刻的 `rounded px-1.5 py-0.5 text-xs font-bold bg-*`。
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${TONE_SOFT[tone]}`}>{children}</span>;
}

/** 身分標籤（管理員等）：描邊而非填色——身分不是狀態，不該跟狀態搶顏色配額 */
export function OutlineBadge({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-gray-300 px-1.5 py-0.5 text-xs font-bold text-gray-600">{children}</span>;
}

// 打卡方向：上班 ↘ 進、下班 ↗ 出。
//
// 刻意不上色：徽章上已經寫著「上班／下班」，顏色是純冗餘（principles.md 規則二的
// 呈現層噪音），而且原本用的 sky/emerald 正是群組助理側「待辦/事件」的類型色——
// 跨模組語意翻轉的來源。改中性底 + 方向圖示後，顏色配額全部留給狀態。
export function PunchBadge({ type, label }: { type: 'in' | 'out'; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-bold text-gray-700">
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
        {type === 'in' ? <path d="M12 5v14M5 12l7 7 7-7" /> : <path d="M12 19V5M5 12l7-7 7 7" />}
      </svg>
      {label}
    </span>
  );
}
