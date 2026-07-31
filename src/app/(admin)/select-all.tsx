'use client';

// 全選切換：勾/取消頁面上所有批次核取方塊（.batch-box，以 form="batch" 掛在批次表單上）
export function SelectAll() {
  return (
    <label className="flex cursor-pointer items-center gap-1.5">
      <input
        type="checkbox"
        onChange={(e) => {
          const on = e.currentTarget.checked;
          document.querySelectorAll<HTMLInputElement>('input.batch-box').forEach((b) => (b.checked = on));
        }}
      />
      全選
    </label>
  );
}
