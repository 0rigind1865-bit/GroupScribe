import { TONE_BANNER, TONE_BORDER, TONE_TEXT, type Tone } from './tone';

export type StatItem = {
  n: number | string;
  label: string;
  hint?: string;
  href?: string;
  tone?: Tone;
};

/**
 * 統計格。hideZero 把 principles.md 規則二做進元件——
 * 「顯示 0 的統計卡」被明列為呈現層噪音：一個永遠寫著 0 的格子，每天都在消耗
 * 一次「這是什麼、要不要理它」的判斷，卻從來不需要行動。
 *
 * 待處理類（待審、待啟用）一律 hideZero；量測類（本月工時、總薪資）不能隱藏，
 * 因為 0 本身就是有意義的答案。
 */
export function StatGrid({
  items,
  hideZero = false,
  cols = 4,
}: {
  items: StatItem[];
  hideZero?: boolean;
  cols?: 2 | 3 | 4;
}) {
  const shown = hideZero ? items.filter((i) => Number(i.n) > 0) : items;
  if (!shown.length) return null;
  const grid = cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2 md:grid-cols-4';
  return (
    <div className={`grid gap-3 ${grid}`}>
      {shown.map((i) => {
        // 設計稿（2026-09）：襯線大數字在上、粗體標籤在下；warn/err 整格上淡底色，一眼分出「要處理的」
        const tone = i.tone ?? 'neutral';
        const tint = tone === 'warn' || tone === 'err' ? `${TONE_BANNER[tone]} ${TONE_BORDER[tone]}` : '';
        const inner = (
          <>
            <span
              className={`block text-3xl leading-none font-black tabular-nums ${TONE_TEXT[tone]}`}
              style={{ fontFamily: 'var(--font-title)' }}
            >
              {i.n}
            </span>
            <span className="mt-1.5 block text-xs font-bold text-gray-600">{i.label}</span>
            {i.hint && <span className="mt-0.5 block text-xs text-gray-400">{i.hint}</span>}
          </>
        );
        return i.href ? (
          <a key={i.label} href={i.href} className={`card hover:opacity-80 ${tint}`}>
            {inner}
          </a>
        ) : (
          <div key={i.label} className={`card ${tint}`}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
