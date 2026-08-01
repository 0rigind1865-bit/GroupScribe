import { TONE_TEXT, type Tone } from './tone';

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
        const inner = (
          <>
            <span className={`block text-2xl font-bold ${TONE_TEXT[i.tone ?? 'neutral']}`}>{i.n}</span>
            <span className="text-xs text-gray-500">{i.label}</span>
            {i.hint && <span className="mt-0.5 block text-xs text-gray-400">{i.hint}</span>}
          </>
        );
        return i.href ? (
          <a key={i.label} href={i.href} className="card text-center hover:bg-gray-50">
            {inner}
          </a>
        ) : (
          <div key={i.label} className="card text-center">
            {inner}
          </div>
        );
      })}
    </div>
  );
}
