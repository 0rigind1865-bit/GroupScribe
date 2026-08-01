// 空狀態：三段式（主文 / 副文 / 下一步）。
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
    <div className="card text-sm text-gray-500">
      <p className="mb-1 font-bold text-gray-700">{title}</p>
      {variant === 'none' && hint && <p>{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
