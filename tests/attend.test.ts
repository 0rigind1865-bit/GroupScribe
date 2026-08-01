import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayInOut, monthStatuses, type DayPunch } from '../src/attend/abnormal';
import { distanceMeters, workDate } from '../src/attend/util';

// ── 每日狀態判定（移植舊 checkAttendance 的規格，不含其 bug）──

const p = (date: string, type: 'in' | 'out', time: string, source: 'gps' | 'adjustment' = 'gps'): DayPunch => ({
  date,
  type,
  time,
  source,
});

test('完整上下班 = 正常', () => {
  const days = monthStatuses('2026-07', '2026-07-31', [p('2026-07-01', 'in', '09:00'), p('2026-07-01', 'out', '18:00')], new Set());
  assert.equal(days[0].status, 'STATUS_PUNCH_NORMAL');
  assert.equal(days[0].abnormal, false);
});

test('只有上班卡 = 未打下班卡（異常）', () => {
  const days = monthStatuses('2026-07', '2026-07-31', [p('2026-07-01', 'in', '09:00')], new Set());
  assert.equal(days[0].status, 'STATUS_PUNCH_OUT_MISSING');
  assert.equal(days[0].abnormal, true);
});

test('只有下班卡 = 未打上班卡（異常）', () => {
  const days = monthStatuses('2026-07', '2026-07-31', [p('2026-07-01', 'out', '18:00')], new Set());
  assert.equal(days[0].status, 'STATUS_PUNCH_IN_MISSING');
});

test('無卡 = 未打上下班卡', () => {
  const days = monthStatuses('2026-07', '2026-07-31', [], new Set());
  assert.equal(days[0].status, 'STATUS_PUNCH_BOTH_MISSING');
});

test('pending 補卡申請 = 審核中（不算異常）', () => {
  const days = monthStatuses('2026-07', '2026-07-31', [], new Set(['2026-07-01']));
  assert.equal(days[0].status, 'STATUS_REPAIR_PENDING');
  assert.equal(days[0].abnormal, false);
});

test('補卡來源的完整日 = 補卡通過', () => {
  const days = monthStatuses(
    '2026-07',
    '2026-07-31',
    [p('2026-07-01', 'in', '09:00', 'adjustment'), p('2026-07-01', 'out', '18:00')],
    new Set(),
  );
  assert.equal(days[0].status, 'STATUS_REPAIR_APPROVED');
});

test('今天只有上班卡 = 進行中（不算異常；舊制跳過今天的同義修正）', () => {
  const days = monthStatuses('2026-07', '2026-07-15', [p('2026-07-15', 'in', '09:00')], new Set());
  const today = days.find((d) => d.date === '2026-07-15')!;
  assert.equal(today.status, 'STATUS_TODAY_OPEN');
  assert.equal(today.abnormal, false);
});

test('未來日不產出；當月只到今天', () => {
  const days = monthStatuses('2026-07', '2026-07-15', [], new Set());
  assert.equal(days.length, 15);
  assert.equal(days[days.length - 1].date, '2026-07-15');
});

test('dayInOut：第一張上班卡、最後一張下班卡', () => {
  const days = monthStatuses(
    '2026-07',
    '2026-07-31',
    [
      p('2026-07-01', 'in', '09:00'),
      p('2026-07-01', 'in', '09:05'), // 重複打卡
      p('2026-07-01', 'out', '12:00'),
      p('2026-07-01', 'out', '18:00'),
    ],
    new Set(),
  );
  assert.deepEqual(dayInOut(days[0]), { inTime: '09:00', outTime: '18:00' });
});

// ── 地理與日界 ──

test('distanceMeters：台北 101 → 市府站約 750m（±10%）', () => {
  const d = distanceMeters(25.033964, 121.564468, 25.041171, 121.565228);
  assert.ok(d > 700 && d < 900, `got ${d}`);
});

test('distanceMeters：同點 = 0', () => {
  assert.equal(distanceMeters(25, 121, 25, 121), 0);
});

test('workDate：台北日界（UTC 前一日 16:00 之後算隔天）', () => {
  assert.equal(workDate(new Date('2026-07-14T16:30:00Z')), '2026-07-15'); // 台北 00:30
  assert.equal(workDate(new Date('2026-07-14T15:30:00Z')), '2026-07-14'); // 台北 23:30
});
