// Empty state（Component Gallery 同名）：三段式（主文 / 副文 / 下一步）。
// 形態採 Origin UI 的空狀態：虛線框、置中、主文 medium、副文淡色、下一步是一顆按鈕。
//
// variant 區分兩種完全不同的處境（借鑑 wenhui-materials）：
//   none     ＝ 本來就還沒有東西 → 該給「怎麼開始」的引導
//   filtered ＝ 有東西但這個條件篩不到 → 給引導反而是噪音，使用者要的是「換條件」
// principles.md：空狀態一律附下一步——但「下一步」在這兩種處境下不一樣。
export function Empty({
  variant = 'none',
  title,
  hint,
  action,
}: {
  variant?: 'none' | 'filtered';
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
      <p className="mb-1 font-medium text-gray-700">{title}</p>
      {variant === 'none' && hint && <p className="mx-auto max-w-sm">{hint}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}
