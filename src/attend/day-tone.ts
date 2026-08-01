import type { DayStatus } from './abnormal';
import type { Tone } from '@/app/ui/tone';

// 每日打卡狀態 → 月曆日格樣式。單一來源，員工端與管理端共用
// （原本兩邊各有一份逐字相同的 CELL 常數）。
//
// teal 已移除：「補卡通過」的狀態就是「正常」（emerald），差別只在來源。
// 狀態與來源是兩個維度，用兩個元素表達（底色 + 「補」徽章）比混成第五個顏色清楚。
export function dayTone(status: DayStatus['status']): Tone {
  switch (status) {
    case 'STATUS_PUNCH_NORMAL':
    case 'STATUS_REPAIR_APPROVED':
      return 'ok';
    case 'STATUS_REPAIR_PENDING':
      return 'warn';
    case 'STATUS_PUNCH_IN_MISSING':
    case 'STATUS_PUNCH_OUT_MISSING':
      return 'err';
    default: // BOTH_MISSING（沒上班的日子）與 TODAY_OPEN（進行中）都不是異常
      return 'neutral';
  }
}

/** 日格的 class：狀態底色 + 進行中的環（今天且尚未成對） */
export function dayCellClass(status: DayStatus['status']): string {
  const base: Record<Tone, string> = {
    ok: 'bg-emerald-100 text-emerald-900',
    warn: 'bg-amber-100 text-amber-900',
    err: 'bg-red-100 text-red-700',
    neutral: 'bg-gray-100 text-gray-400',
  };
  const cls = base[dayTone(status)];
  return status === 'STATUS_TODAY_OPEN' ? `${cls} ring-1 ring-gray-400` : cls;
}
