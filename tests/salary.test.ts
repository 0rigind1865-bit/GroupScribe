import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeDay, computeMonth, determineDayType, effectiveMinutes } from '../src/attend/salary';
import { DEFAULT_RULES as R } from '../src/attend/rules-default';

// 黃金測試：月薪 30000 → 時薪 125。預期值以舊 Attendance-System 邏輯手算為準（計畫第八節）。
const SALARY = 30000;

test('平日 10h 跨午休：淨 9h = 8h 正常 + 1h OT×4/3 → 加給 166.67', () => {
  const r = computeDay('09:00', '19:00', 'normal', SALARY, R);
  assert.equal(r.netHours, 9);
  assert.equal(r.restHours, 1);
  assert.equal(r.normalHours, 8);
  assert.equal(r.overtimeHours, 1);
  assert.equal(r.pay, 166.67);
});

test('平日 12h 跨午+晚休：淨 10.5h → 2h×4/3 + 0.5h×5/3 → 437.50', () => {
  const r = computeDay('08:00', '20:00', 'normal', SALARY, R);
  assert.equal(r.netHours, 10.5); // 12h − 午休 1h − 晚休 0.5h
  assert.equal(r.pay, 437.5);
});

test('休息日 9h：2×4/3 + 6×5/3 + 1×8/3 → 1916.67', () => {
  const r = computeDay('08:00', '18:00', 'rest_day', SALARY, R);
  assert.equal(r.netHours, 9);
  assert.equal(r.overtimeHours, 9); // 休息日全部屬加班性質
  assert.equal(r.pay, 1916.67);
});

test('例假日 8h：一日工資 + 補休折現 → 2000.00', () => {
  const r = computeDay('09:00', '18:00', 'regular_off', SALARY, R);
  assert.equal(r.netHours, 8);
  assert.equal(r.pay, 2000);
});

test('例假日 10h：2000 + 2h×2×125 → 2500.00', () => {
  const r = computeDay('08:00', '19:30', 'regular_off', SALARY, R);
  assert.equal(r.netHours, 10); // 11.5h − 午 1h − 晚 0.5h
  assert.equal(r.pay, 2500);
});

test('國定假日 6h：保底一日工資 → 1000.00', () => {
  const r = computeDay('10:00', '17:00', 'holiday', SALARY, R);
  assert.equal(r.netHours, 6);
  assert.equal(r.pay, 1000);
});

test('國定假日淨 9.5h：1000 + 1.5×4/3×125 → 1250.00', () => {
  const r = computeDay('09:00', '20:00', 'holiday', SALARY, R);
  assert.equal(r.netHours, 9.5); // 11h − 午 1h − 晚 0.5h
  assert.equal(r.pay, 1250);
});

test('邊界：06:00–06:30 全在早餐休息 → 淨 0h、無薪', () => {
  const r = computeDay('06:00', '06:30', 'normal', SALARY, R);
  assert.equal(r.netHours, 0);
  assert.equal(r.restHours, 0.5);
  assert.equal(r.pay, 0);
});

test('無效打卡（下班早於上班）→ 0', () => {
  const r = computeDay('18:00', '09:00', 'normal', SALARY, R);
  assert.equal(r.netHours, 0);
  assert.equal(r.pay, 0);
});

// ── determineDayType 優先序 ──

test('補班日落在週六 → normal（強制平日）', () => {
  // 2026-02-14 是週六
  assert.equal(determineDayType('2026-02-14', 'workday_override', R), 'normal');
});

test('國定假日撞週日 → regular_off（對齊舊制優先序）', () => {
  // 2026-10-25 光復節是週日
  assert.equal(determineDayType('2026-10-25', 'national', R), 'regular_off');
});

test('國定假日撞週六 → rest_day', () => {
  // 2026-10-10 國慶日是週六
  assert.equal(determineDayType('2026-10-10', 'national', R), 'rest_day');
});

test('平常週末（無假日資料）→ 正確判定，不再全算平日（舊制 bug 修正）', () => {
  assert.equal(determineDayType('2026-07-25', undefined, R), 'rest_day'); // 週六
  assert.equal(determineDayType('2026-07-26', undefined, R), 'regular_off'); // 週日
  assert.equal(determineDayType('2026-07-27', undefined, R), 'normal'); // 週一
});

test('平日國定假日 → holiday', () => {
  assert.equal(determineDayType('2026-01-01', 'national', R), 'holiday'); // 元旦是週四
});

// ── effectiveMinutes 重疊窗 ──

test('休息時段部分重疊只扣重疊分鐘', () => {
  const { netMinutes, breakMinutes } = effectiveMinutes('12:30', '14:00', R.breaks);
  assert.equal(breakMinutes, 30); // 只有 12:30–13:00 重疊
  assert.equal(netMinutes, 60);
});

// ── computeMonth 彙總 ──

test('月彙總：平日 9h + 休息日 9h → 月薪 + 166.67 + 1916.67', () => {
  const m = computeMonth(
    [
      { date: '2026-07-27', inTime: '09:00', outTime: '19:00' }, // 週一
      { date: '2026-07-25', inTime: '08:00', outTime: '18:00' }, // 週六
      { date: '2026-07-28', inTime: null, outTime: null }, // 沒打卡的日子不計
    ],
    SALARY,
    R,
  );
  assert.equal(m.base, 30000);
  assert.equal(m.extra, +(166.67 + 1916.67).toFixed(2));
  assert.equal(m.total, 32083.34);
  assert.equal(m.days.length, 2);
  assert.equal(m.hourlyRate, 125);
});
