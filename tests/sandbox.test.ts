import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeMonthHybrid, runDayScript, type ScriptDayInput } from '../src/attend/sandbox';
import { DEFAULT_RULES as R } from '../src/attend/rules-default';

// 沙箱五案例（計畫第八節）：正常腳本、丟例外回退、無窮迴圈中斷、超記憶體、schema 不符回退。

const input: ScriptDayInput = {
  date: '2026-07-27',
  dayType: 'normal',
  weekday: 1,
  punches: [
    { type: 'in', time: '09:00' },
    { type: 'out', time: '19:00' },
  ],
  inTime: '09:00',
  outTime: '19:00',
  netMinutes: 540,
  breakMinutes: 60,
  hourlyRate: 125,
  monthlySalary: 30000,
  rules: R,
};

test('正常腳本：固定加班費 100/日', async () => {
  const r = await runDayScript(
    `({ pay: 100, normalHours: 8, overtimeHours: 1, breakdown: [{ label: '固定加班費', hours: 1, amount: 100 }] })`,
    input,
  );
  assert.ok('result' in r);
  assert.equal(r.result.pay, 100);
});

test('腳本可讀 ctx（netMinutes → 時薪比例）', async () => {
  const r = await runDayScript(
    `({ pay: (ctx.netMinutes / 60) * ctx.hourlyRate * 0.1, normalHours: 8, overtimeHours: 0, breakdown: [] })`,
    input,
  );
  assert.ok('result' in r);
  assert.equal(r.result.pay, 112.5); // 9h × 125 × 0.1
});

test('丟例外 → error（呼叫端回退）', async () => {
  const r = await runDayScript(`throw new Error('boom')`, input);
  assert.ok('error' in r);
  assert.match(r.error, /boom/);
});

test('while(true) → interrupt 中斷，不掛機器', async () => {
  const t0 = Date.now();
  const r = await runDayScript(`while(true){}; ({pay:0,normalHours:0,overtimeHours:0,breakdown:[]})`, input);
  assert.ok('error' in r);
  assert.ok(Date.now() - t0 < 3000, '應在中斷預算內結束');
});

test('吃記憶體 → memory limit 擋下', async () => {
  const r = await runDayScript(`const a=[];while(true){a.push('x'.repeat(1e6))}`, input);
  assert.ok('error' in r);
});

test('schema 不符（pay 為字串）→ error', async () => {
  const r = await runDayScript(`({ pay: 'lots', normalHours: 0, overtimeHours: 0, breakdown: [] })`, input);
  assert.ok('error' in r);
});

test('sanity cap：天價 pay 擋下', async () => {
  const r = await runDayScript(`({ pay: 9e9, normalHours: 0, overtimeHours: 0, breakdown: [] })`, input);
  assert.ok('error' in r);
});

test('computeMonthHybrid：腳本失敗回退結構化規則且記錄錯誤', async () => {
  const m = await computeMonthHybrid(
    [{ date: '2026-07-27', inTime: '09:00', outTime: '19:00' }], // 平日淨 9h
    30000,
    R,
    `throw new Error('customer bug')`,
  );
  assert.equal(m.days[0].pay, 166.67); // 回退第一層的黃金值
  assert.equal(m.scriptErrors.length, 1);
  assert.match(m.scriptErrors[0].error, /customer bug/);
});

test('computeMonthHybrid：無腳本 = 純結構化規則、無錯誤', async () => {
  const m = await computeMonthHybrid([{ date: '2026-07-25', inTime: '08:00', outTime: '18:00' }], 30000, R, null);
  assert.equal(m.days[0].pay, 1916.67);
  assert.deepEqual(m.scriptErrors, []);
});
