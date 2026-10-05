import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GRACE_DAYS, paidStatus, PLAN_LIMITS, planLines, planPrice, PUBLIC_PLANS } from '../src/org/plans';
import { hasSeat } from '../src/org/digest-seats';
import { addDays } from '../src/core/date';

// 方案（商業計劃第 4 節）：到期暫停、每日提醒名額、方案文案單一來源。

test('addDays：跨月、跨年、閏年', () => {
  assert.equal(addDays('2026-10-04', 14), '2026-10-18');
  assert.equal(addDays('2026-12-25', 14), '2027-01-08');
  assert.equal(addDays('2028-02-20', 14), '2028-03-05');
});

// ── 付費到期：paid_until 是最後一個已付費的日子；再寬限 14 天，第 15 天起暫停 ──

test('paidStatus：到期日當天還算有效', () => {
  assert.deepEqual(paidStatus('starter', '2026-10-04', '2026-10-04'), { state: 'active', paidUntil: '2026-10-04' });
});

test('paidStatus：過期隔天進寬限期，寬限期最後一天仍可用', () => {
  assert.equal(GRACE_DAYS, 14); // 服務條款第三節寫的是 14 天，改這裡要一起改條款
  assert.deepEqual(paidStatus('team', '2026-10-04', '2026-10-05'), { state: 'grace', paidUntil: '2026-10-04', lastDay: '2026-10-18' });
  assert.equal(paidStatus('team', '2026-10-04', '2026-10-18').state, 'grace');
});

test('paidStatus：寬限期過了 → expired（AI 暫停）', () => {
  assert.deepEqual(paidStatus('starter', '2026-10-04', '2026-10-19'), { state: 'expired', paidUntil: '2026-10-04', lastDay: '2026-10-18' });
});

test('paidStatus：免費、內部方案、沒填到期日、格式不對 → 不管', () => {
  assert.equal(paidStatus('free', '2026-01-01', '2026-10-04').state, 'none');
  assert.equal(paidStatus('internal', '2026-01-01', '2026-10-04').state, 'none');
  assert.equal(paidStatus('team', null, '2026-10-04').state, 'none');
  assert.equal(paidStatus('team', '', '2026-10-04').state, 'none');
  assert.equal(paidStatus('team', '2026/01/01', '2026-10-04').state, 'none');
  assert.equal(paidStatus(undefined, '2026-01-01', '2026-10-04').state, 'none');
});

// ── 每日提醒名額：算人、不算訂閱；已佔名額的人多訂一個群不多佔 ──

test('hasSeat：還有空位 → 可以；滿了 → 新的人不行', () => {
  assert.equal(hasSeat(['U1', 'U2'], 'U3', 3), true);
  assert.equal(hasSeat(['U1', 'U2', 'U3'], 'U4', 3), false);
});

test('hasSeat：已經佔名額的人再訂別的群照樣可以（同一人訂三個群只算一人）', () => {
  assert.equal(hasSeat(['U1', 'U2', 'U3'], 'U2', 3), true);
  assert.equal(hasSeat(['U1', 'U1', 'U1'], 'U2', 2), true); // 重複的人只算一次
});

test('hasSeat：降級後超額的既有訂閱者不受影響，但新的人進不來；不限＝一律可以', () => {
  const many = ['U1', 'U2', 'U3', 'U4', 'U5'];
  assert.equal(hasSeat(many, 'U5', 3), true);
  assert.equal(hasSeat(many, 'U6', 3), false);
  assert.equal(hasSeat(many, 'U6', null), true);
});

test('名額依方案遞增，內部方案不限', () => {
  assert.deepEqual(
    PUBLIC_PLANS.map((id) => PLAN_LIMITS[id].subscribers),
    [3, 10, 30],
  );
  assert.equal(PLAN_LIMITS.internal.subscribers, null);
});

// ── 方案文案：只從 plans.ts 產生，不承諾方案裡沒有的東西 ──

test('planLines／planPrice：數字來自 PLAN_LIMITS', () => {
  assert.deepEqual(planLines('free'), ['1 個群', '每月 1,500 次 AI 呼叫', '每日提醒 3 人']);
  assert.deepEqual(planLines('team'), ['10 個群', '每月 20,000 次 AI 呼叫', '每日提醒 30 人', '優先支援']);
  assert.equal(planPrice('free'), '免費');
  assert.equal(planPrice('team'), 'NT$2,190 / 月');
});

test('沒有任何方案寫「考勤」：考勤是加購，升級方案不會打開它', () => {
  for (const id of PUBLIC_PLANS) assert.doesNotMatch(planLines(id).join(), /考勤/, id);
});

const ROOT = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

test('方案頁與首頁介紹不再自己寫一份方案內容', () => {
  for (const f of ['src/app/o/[org]/(admin)/upgrade/page.tsx', 'src/app/ui/intro.tsx']) {
    const src = read(f).replace(/^\s*\/\/.*$/gm, ''); // 註解可以提（例如「認領第 N+1 個群」）
    assert.match(src, /planLines\(/, `${f} 沒有用 planLines()`);
    assert.doesNotMatch(src, /\d個群|\d 個群|20,000|6,000|1,500/, `${f} 又寫死了方案數字`);
    assert.doesNotMatch(src, /Team 方案|· 考勤'/, `${f} 又把考勤寫進方案`);
  }
});

test('付費到期超過寬限期＝停 AI（併進既有的停權判斷）；改方案後清額度快取', () => {
  assert.match(read('src/core/quota.ts'), /suspended: isSuspended\(ss, se\) \|\| paid\.state === 'expired'/);
  assert.match(read('src/app/api/platform/plan/route.ts'), /forgetOrgBudget\(orgId\)/);
});

test('訂閱 API 只在開啟時檢查名額', () => {
  assert.match(read('src/app/api/liff/subscribe/route.ts'), /if \(on && !\(await canSubscribe\(groupId, uid\)\)\)/);
});
