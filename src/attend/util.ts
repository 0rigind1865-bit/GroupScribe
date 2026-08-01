// 考勤共用純函式：距離、日界。無 IO、可單測。

/** 兩點球面距離（公尺）。移植舊系統 GS/Utils.gs 的 haversine。 */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000; // 地球半徑（公尺）
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 打卡時刻 → 工作日（Asia/Taipei 日界）。寫入時算好落庫，查詢一律用 work_date 不重推。 */
export function workDate(d: Date): string {
  return d.toLocaleDateString('sv', { timeZone: 'Asia/Taipei' }); // sv locale = YYYY-MM-DD
}

/** 打卡時刻 → 台北時區 HH:MM（顯示與薪資計算用） */
export function taipeiHm(d: Date): string {
  return d.toLocaleTimeString('sv', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' });
}

/** YYYY-MM 合法性（月查詢參數驗證） */
export const isYm = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

/** YYYY-MM 位移 n 個月 */
export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
