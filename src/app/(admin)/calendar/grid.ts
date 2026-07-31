// 月曆日期純函式：一律 UTC 計算，零時區問題（顯示時才轉 Asia/Taipei）
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (t: Date) => `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;

// 月格線：回傳以週為列的儲存格（null = 前後月補位）
export function monthGrid(year: number, month: number): ({ day: number; iso: string } | null)[][] {
  const offset = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = 週日
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: ({ day: number; iso: string } | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= days; d++) cells.push({ day: d, iso: `${year}-${pad(month)}-${pad(d)}` });
  while (cells.length % 7) cells.push(null);
  const weeks: ({ day: number; iso: string } | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ISO 日期加減天數（週 ±7、日 ±1 導航用）
export function addDays(dateIso: string, n: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  return iso(new Date(Date.UTC(y, m - 1, d + n)));
}

// 含指定日期的整週 7 個 ISO（週日起，對齊 monthGrid 的 getUTCDay 0=Sun）
export function weekDays(dateIso: string): string[] {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return Array.from({ length: 7 }, (_, i) => iso(new Date(Date.UTC(y, m - 1, d - dow + i))));
}

// "14:30:00" / "14:30" → 14（時間軸落格用）
export function parseHour(t: string): number {
  return Number(t.slice(0, 2));
}

// 時間軸小時窗：從有事件的小時算 [lo, hi)，各 ±pad、撐到最小跨度、clamp[0,24]；無事件回 null（＝不畫軸）
export function hourRange(hours: number[], pad = 1, minSpan = 6): [number, number] | null {
  if (!hours.length) return null;
  let lo = Math.max(0, Math.min(...hours) - pad);
  let hi = Math.min(24, Math.max(...hours) + 1 + pad); // +1 讓最後一個事件的小時整格顯示
  if (hi - lo < minSpan) hi = Math.min(24, lo + minSpan);
  if (hi - lo < minSpan) lo = Math.max(0, hi - minSpan);
  return [lo, hi];
}

// 依 start_time 是否為 null 分成「有時間」與「未定時間」兩堆（時間軸兩區的關鍵）
export function splitTimed<T extends { start_time: string | null }>(evs: T[]): { timed: T[]; undated: T[] } {
  const timed: T[] = [];
  const undated: T[] = [];
  for (const e of evs) (e.start_time ? timed : undated).push(e);
  return { timed, undated };
}

export type AgendaPreset = '30d' | '90d' | '1y' | 'all';

// 議程視圖時間範圍：由今天起算。all 無上界（回 null，呼叫端改用 limit 防爆）
export function agendaRange(preset: AgendaPreset, todayIso: string): [string, string | null] {
  if (preset === 'all') return [todayIso, null];
  const days = preset === '30d' ? 30 : preset === '90d' ? 90 : 365;
  return [todayIso, addDays(todayIso, days)];
}
