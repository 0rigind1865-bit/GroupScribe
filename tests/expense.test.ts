// 報帳（X1）：AI 讀出的收據欄位正規化
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, parseDate, parseReceipt } from '../src/expense/receipt';

test('parseAmount：去逗號與單位；0、負數、亂字 → null', () => {
  assert.equal(parseAmount('1,280元'), 1280);
  assert.equal(parseAmount('NT$ 350'), 350);
  assert.equal(parseAmount(99.6), 100);
  assert.equal(parseAmount(0), null);
  assert.equal(parseAmount('-50'), null);
  assert.equal(parseAmount('約三百'), null);
  assert.equal(parseAmount(null), null);
});

test('parseDate：西元、斜線、民國年；壞日期 → null', () => {
  assert.equal(parseDate('2026-09-25'), '2026-09-25');
  assert.equal(parseDate('2026/9/5'), '2026-09-05');
  assert.equal(parseDate('113/09/25'), '2024-09-25');
  assert.equal(parseDate('113年9月25日'), '2024-09-25');
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('昨天'), null);
});

test('parseReceipt：壞日期用訊息日期、未知分類歸雜支、發票號只收兩碼英文＋八碼數字', () => {
  const r = parseReceipt({ amount: '1,280元', date: '亂寫', vendor: ' 全家 ', category: '加油', invoice_no: 'ab-12345678' }, '2026-09-26');
  assert.deepEqual(r, { amount: 1280, spent_on: '2026-09-26', vendor: '全家', category: '雜支', invoice_no: 'AB12345678' });
  assert.equal(parseReceipt({ amount: 100, invoice_no: '123' }, '2026-09-26')?.invoice_no, '');
  assert.equal(parseReceipt({ amount: 100, category: '餐飲' }, '2026-09-26')?.category, '餐飲');
});

test('parseReceipt：不是收據（null）或金額讀不出來 → null', () => {
  assert.equal(parseReceipt(null, '2026-09-26'), null);
  assert.equal(parseReceipt('收據', '2026-09-26'), null);
  assert.equal(parseReceipt({ amount: 0 }, '2026-09-26'), null);
});

// ── 清單／加總／匯出共用的純邏輯 ──
import { isMonth, nextMonth, sumBy } from '../src/expense/query';
import { receiptReply } from '../src/expense/record';

test('月份：格式檢查與跨年', () => {
  assert.ok(isMonth('2026-09'));
  assert.ok(!isMonth('2026-13'));
  assert.ok(!isMonth(undefined));
  assert.equal(nextMonth('2026-12'), '2027-01');
  assert.equal(nextMonth('2026-09'), '2026-10');
});

test('sumBy：依 key 加總，金額大的先，空 key 歸「（未填）」', () => {
  const rows = [
    { amount: 100, category: '餐飲' },
    { amount: 50, category: '餐飲' },
    { amount: 300, category: '交通' },
    { amount: 20, category: '' },
  ];
  assert.deepEqual(sumBy(rows, (r) => r.category), [
    ['交通', 300, 1],
    ['餐飲', 150, 2],
    ['（未填）', 20, 1],
  ]);
});

test('receiptReply：日期、分類、金額千分位、店家', () => {
  const t = receiptReply({ amount: 1280, spent_on: '2026-09-05', vendor: '全家', category: '餐飲', invoice_no: '' });
  assert.match(t, /^🧾 記好了：9\/5 餐飲 \$1,280（全家）/);
  assert.doesNotMatch(receiptReply({ amount: 5, spent_on: '2026-09-05', vendor: '', category: '雜支', invoice_no: '' }), /（/);
});
