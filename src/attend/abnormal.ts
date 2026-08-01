// 每日打卡狀態判定（純函式；移植舊 GS/Utils.gs checkAttendance / checkAttendanceAbnormal）。
// 與舊制的差異：punch_records 只有有效卡（補卡核准才落地），「審核中」由
// adjustment_requests 的 pending 集合表達，不再混在打卡表裡猜。
// status 值沿用舊 i18n 鍵名（STATUS_*），五語系翻譯直接轉用。

export type DayPunch = {
  date: string; // YYYY-MM-DD（work_date）
  type: 'in' | 'out';
  time: string; // HH:MM（台北時區）
  source: 'gps' | 'adjustment';
  locationName?: string | null;
  note?: string | null;
};

export type DayStatus = {
  date: string;
  punches: DayPunch[];
  status:
    | 'STATUS_PUNCH_NORMAL'
    | 'STATUS_PUNCH_IN_MISSING'
    | 'STATUS_PUNCH_OUT_MISSING'
    | 'STATUS_PUNCH_BOTH_MISSING'
    | 'STATUS_REPAIR_PENDING'
    | 'STATUS_REPAIR_APPROVED'
    | 'STATUS_TODAY_OPEN'; // 今天、已打上班卡未打下班卡：進行中不算異常
  abnormal: boolean; // 需要補卡的日子（首頁異常清單的過濾條件）
};

/**
 * 整月每日狀態。
 * @param month YYYY-MM
 * @param todayIso YYYY-MM-DD（判定範圍只到今天；未來日不產出）
 * @param punches 該月有效卡（已含 work_date/HH:MM）
 * @param pendingDates 該月有 pending 補卡申請的日期集合
 */
export function monthStatuses(
  month: string,
  todayIso: string,
  punches: DayPunch[],
  pendingDates: Set<string>,
): DayStatus[] {
  const byDate = new Map<string, DayPunch[]>();
  for (const p of punches) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p]);

  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const out: DayStatus[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    if (date > todayIso) break; // 未來日不判定

    const day = (byDate.get(date) ?? []).sort((a, b) => a.time.localeCompare(b.time));
    const hasIn = day.some((p) => p.type === 'in');
    const hasOut = day.some((p) => p.type === 'out');
    const isToday = date === todayIso;

    let status: DayStatus['status'];
    if (hasIn && hasOut) {
      // 有補卡來源的完整日：標示為補卡通過（讓月曆用不同顏色呈現，對齊舊 UI）
      status = day.some((p) => p.source === 'adjustment') ? 'STATUS_REPAIR_APPROVED' : 'STATUS_PUNCH_NORMAL';
    } else if (pendingDates.has(date)) {
      status = 'STATUS_REPAIR_PENDING';
    } else if (isToday) {
      status = 'STATUS_TODAY_OPEN'; // 今天還沒下班/還沒上班：進行中
    } else if (hasIn) {
      status = 'STATUS_PUNCH_OUT_MISSING';
    } else if (hasOut) {
      status = 'STATUS_PUNCH_IN_MISSING';
    } else {
      status = 'STATUS_PUNCH_BOTH_MISSING';
    }

    const abnormal =
      status === 'STATUS_PUNCH_IN_MISSING' ||
      status === 'STATUS_PUNCH_OUT_MISSING' ||
      status === 'STATUS_PUNCH_BOTH_MISSING';
    out.push({ date, punches: day, status, abnormal });
  }
  return out;
}

/** 當日成對工時的取法：第一張上班卡、最後一張下班卡（移植舊 pickInOutPunches 語意） */
export function dayInOut(day: DayStatus): { inTime: string | null; outTime: string | null } {
  const ins = day.punches.filter((p) => p.type === 'in');
  const outs = day.punches.filter((p) => p.type === 'out');
  return { inTime: ins[0]?.time ?? null, outTime: outs.length ? outs[outs.length - 1].time : null };
}
