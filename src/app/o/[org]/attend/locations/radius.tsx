// 範圍只給 4 個選項，不用打數字（2026-10 設計畫布「打卡地點」）。
// 普通模組（不是 client）：頁面與「站在現場新增」的 client 元件都要用同一份選項。
export const RADII = [50, 100, 200, 500];

/** 表單版（零 JS）：四格單選，選中那格由 .segmented 的 :has(:checked) 浮起 */
export function RadiusPicker({ defaultValue = 100 }: { defaultValue?: number }) {
  return (
    <div role="radiogroup" aria-label="範圍" className="segmented grid w-full grid-cols-4">
      {RADII.map((r) => (
        <label key={r}>
          <input type="radio" name="radius" value={r} defaultChecked={r === defaultValue} className="sr-only" />
          {r} 公尺
        </label>
      ))}
    </div>
  );
}
