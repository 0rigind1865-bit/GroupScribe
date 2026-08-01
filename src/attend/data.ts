import { getDb } from '@/db';
import { monthStatuses, type DayPunch, type DayStatus } from './abnormal';
import { taipeiHm, workDate } from './util';

// 考勤讀取路徑的唯一收口：打卡紀錄 + pending 補卡 → 每日狀態。
// 呼叫端保證 employee 已通過授權（本人或該 org 管理員）；查詢一律綁 org_id。

export type PunchRow = {
  id: string;
  type: 'in' | 'out';
  punched_at: string;
  work_date: string;
  location_name: string | null;
  source: 'gps' | 'adjustment';
  note: string | null;
};

export async function monthData(
  orgId: string,
  employeeId: string,
  month: string, // YYYY-MM
): Promise<{ days: DayStatus[]; rows: PunchRow[] }> {
  const db = getDb();
  const from = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const to = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;

  const [{ data: rows }, { data: pend }] = await Promise.all([
    db
      .from('punch_records')
      .select('id, type, punched_at, work_date, location_name, source, note')
      .eq('org_id', orgId)
      .eq('employee_id', employeeId)
      .gte('work_date', from)
      .lte('work_date', to)
      .order('punched_at'),
    db
      .from('adjustment_requests')
      .select('requested_at')
      .eq('org_id', orgId)
      .eq('employee_id', employeeId)
      .eq('status', 'pending'),
  ]);

  const punches: DayPunch[] = ((rows ?? []) as PunchRow[]).map((r) => ({
    date: r.work_date,
    type: r.type,
    time: taipeiHm(new Date(r.punched_at)),
    source: r.source,
    locationName: r.location_name,
    note: r.note,
  }));
  const pendingDates = new Set(
    ((pend ?? []) as { requested_at: string }[]).map((r) => workDate(new Date(r.requested_at))),
  );

  const today = workDate(new Date());
  return { days: monthStatuses(month, today, punches, pendingDates), rows: (rows ?? []) as PunchRow[] };
}
