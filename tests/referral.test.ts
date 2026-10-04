import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addDays, newRefCode, normalizeRefCode, referrerDaysFor, settleCredit, summarizeReferrals } from '../src/org/referral';
import { isPaidPlan, PLAN_LIMITS, REFERRAL } from '../src/org/plans';

// 推薦獎勵（migration 029）：付費才發、發的是天數。

test('newRefCode：6 碼、不含容易念錯的 0/O/1/I/L，產生的碼自己驗得過', () => {
  for (let i = 0; i < 200; i++) {
    const c = newRefCode();
    assert.match(c, /^[A-Z2-9]{6}$/);
    assert.doesNotMatch(c, /[01OIL]/);
    assert.equal(normalizeRefCode(c), c);
  }
});

test('normalizeRefCode：小寫與前後空白可以，其餘一律空字串', () => {
  assert.equal(normalizeRefCode(' abc234 '), 'ABC234');
  assert.equal(normalizeRefCode('ABC23'), ''); // 太短
  assert.equal(normalizeRefCode('ABC2345'), ''); // 太長
  assert.equal(normalizeRefCode('ABC10O'), ''); // 字母表外
  assert.equal(normalizeRefCode("AB'--;"), '');
  assert.equal(normalizeRefCode(null), '');
  assert.equal(normalizeRefCode(['ABC234']), '');
});

test('addDays：跨月、跨年、閏年', () => {
  assert.equal(addDays('2026-10-04', 30), '2026-11-03');
  assert.equal(addDays('2026-12-15', 30), '2027-01-14');
  assert.equal(addDays('2028-02-15', 30), '2028-03-16');
});

const today = '2026-10-04';

test('settleCredit：付費方案有到期日 → 天數加上去、歸零', () => {
  assert.deepEqual(settleCredit({ plan: 'starter', paidUntil: '2026-11-04', creditDays: 30 }, today), {
    plan: 'starter',
    paidUntil: '2026-12-04',
    creditDays: 0,
  });
});

test('settleCredit：到期日已過 → 從今天起算，獎勵不被過去的日子吃掉', () => {
  assert.equal(settleCredit({ plan: 'team', paidUntil: '2026-09-01', creditDays: 30 }, today).paidUntil, '2026-11-03');
});

test('settleCredit：免費、內部方案或沒填到期日 → 原樣存著（同一個物件，呼叫端靠它判斷不用寫入）', () => {
  for (const st of [
    { plan: 'free', paidUntil: null, creditDays: 30 },
    { plan: 'internal', paidUntil: '2027-01-01', creditDays: 30 },
    { plan: 'starter', paidUntil: null, creditDays: 30 },
    { plan: 'starter', paidUntil: '2026-11-04', creditDays: 0 },
  ]) {
    assert.equal(settleCredit(st, today), st);
  }
});

test('referrerDaysFor：領滿上限後推薦人拿 0', () => {
  assert.equal(referrerDaysFor(0), REFERRAL.rewardDays);
  assert.equal(referrerDaysFor(REFERRAL.maxRewards - 1), REFERRAL.rewardDays);
  assert.equal(referrerDaysFor(REFERRAL.maxRewards), 0);
});

test('summarizeReferrals：作廢的不算；天數只算已發的', () => {
  assert.deepEqual(
    summarizeReferrals([
      { status: 'signed_up', referrer_days: 0 },
      { status: 'rewarded', referrer_days: 30 },
      { status: 'rewarded', referrer_days: 0 }, // 超過上限
      { status: 'void', referrer_days: 30 },
    ]),
    { signedUp: 3, paid: 2, earnedDays: 30 },
  );
});

test('isPaidPlan：只有 starter／team；internal 與 free 不算', () => {
  assert.deepEqual(Object.keys(PLAN_LIMITS).filter(isPaidPlan), ['starter', 'team']);
});

// ── 定案守門：商業計劃第 4 節「Free 不做推薦解鎖」 ──
const ROOT = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

test('推薦只動天數：不改群數上限與 AI 額度', () => {
  const src = read('src/org/referral.ts');
  assert.doesNotMatch(src, /max_groups|monthly_ai_calls/, '推薦獎勵碰到了方案額度——免費方案不能靠推薦解鎖');
});

test('建立組織時只記推薦、不發獎勵；獎勵只在改方案之後結算', () => {
  assert.doesNotMatch(read('src/app/api/org/create/route.ts'), /settleReferrals/);
  assert.match(read('src/app/api/platform/plan/route.ts'), /await settleReferrals\(orgId\)/);
});

test('推薦連結不用登入就打得開（middleware 排除 r/）', () => {
  assert.match(read('src/middleware.ts'), /\|r\/\|/);
});
