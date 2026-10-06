'use client';

import { Chevron, PANEL, PILL, rowCls } from '@/app/ui/group-switcher';

// 報帳管理端的兩個小控制項。'use client' 是為了拿 group-switcher 的 class 常數（server 端 import 只拿得到參照）。

/** 篩選膠囊（人／專案／月份）：點開是連結清單，選了就換網址生效，不用再按「篩選」（2026-10 設計畫布「收據」）。
 *  跟群組膠囊同一顆外觀、同一種清單（<details>＋連結）；膠囊在左邊，面板改從左緣長出 */
export function FilterPill({ label, options }: { label: string; options: { href: string; label: string; on: boolean }[] }) {
  return (
    <details className="group relative" data-no-swipe="">
      <summary className={PILL}>
        <span>{label}</span>
        <Chevron />
      </summary>
      <div className={PANEL.replace('right-0', 'left-0')}>
        {options.map((o) => (
          <a key={o.href} href={o.href} aria-current={o.on ? 'page' : undefined} className={rowCls(o.on)}>
            {o.label}
          </a>
        ))}
      </div>
    </details>
  );
}

/** 全選這頁還沒核銷的（勾選框 .exp-pick）。手機清單與電腦表格各有一份勾選框，只勾看得見的那一份。
 *  掛在批次表單上（form=）：浮出列的「取消選取」（reset）會連它一起取消 */
export function PickAll({ label }: { label?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-1.5">
      <input
        type="checkbox"
        form="reimburse-batch"
        aria-label="全選這頁"
        className="h-[18px] w-[18px]"
        onChange={(e) => {
          const v = e.currentTarget.checked;
          document.querySelectorAll<HTMLInputElement>('input.exp-pick').forEach((b) => {
            if (b.offsetParent) b.checked = v;
          });
        }}
      />
      {label}
    </label>
  );
}
