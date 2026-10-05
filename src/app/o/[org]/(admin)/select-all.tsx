'use client';

import { useEffect, useState } from 'react';

// 全選切換：勾/取消頁面上所有批次核取方塊（.batch-box，以 form="batch" 掛在批次表單上）。
// 這頁只顯示一部分（收件匣一次 30 筆）時，勾全選後多一顆「選取全部 N 筆」——
// 按下去帶 all=1，伺服器照同一組條件處理全部，連沒顯示的也算（jielin：「不在這頁顯示的我也想選到」）。
// 換頁（含只換 ?group=）時整個內容區會重建（src/app/ui/soft-nav.tsx Remount），這裡的狀態不會帶到別群。
export function SelectAll({ total, before }: { total?: number; before?: string }) {
  const [on, setOn] = useState(false);
  const [all, setAll] = useState(false);
  const [shown, setShown] = useState(0);
  const more = !!total && total > shown && shown > 0;
  const sendAll = all && on && more; // 三個都成立才送 all=1：畫面沒寫「已選取全部」就絕不送

  useEffect(() => {
    // 取消任何一筆＝不是「全部」了
    const onChange = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.classList.contains('batch-box') && !t.checked) {
        setAll(false);
        setOn(false);
      }
    };
    addEventListener('change', onChange);
    return () => removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!sendAll) return;
    // 一次忽略全部要再問一次（capture：比全站換頁的送出攔截先跑）
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target;
      // getAttribute：f.id 會被 name="id" 的欄位蓋掉（同 soft-nav.tsx 的 attr）
      if (!(f instanceof HTMLFormElement) || f.getAttribute('id') !== 'batch') return;
      const btn = e.submitter instanceof HTMLButtonElement ? e.submitter : null;
      if (btn?.value === 'ignore' && !confirm(`忽略全部 ${total} 筆？忽略後不會再出現在把關清單。`)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    addEventListener('submit', onSubmit, true);
    return () => removeEventListener('submit', onSubmit, true);
  }, [sendAll, total]);

  return (
    <>
      <label className="flex cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            const v = e.currentTarget.checked;
            const boxes = document.querySelectorAll<HTMLInputElement>('input.batch-box');
            setOn(v);
            setShown(boxes.length);
            if (!v) setAll(false);
            boxes.forEach((b) => (b.checked = v));
          }}
        />
        全選
      </label>
      {sendAll && (
        <>
          <input type="hidden" name="all" value="1" />
          {/* 只處理這個時間點以前進來、或最後一次被改的：之後才到的新項目或 AI 剛改過的，你還沒看過，不算在「全部」裡 */}
          {before && <input type="hidden" name="before" value={before} />}
        </>
      )}
      {on &&
        more &&
        (all ? (
          <span className="text-xs font-bold text-amber-700">
            已選取全部 {total} 筆{' '}
            <button type="button" className="underline" onClick={() => setAll(false)}>
              只選這頁
            </button>
          </span>
        ) : (
          <button type="button" className="text-xs font-bold text-emerald-700 underline" onClick={() => setAll(true)}>
            選取全部 {total} 筆
          </button>
        ))}
    </>
  );
}
