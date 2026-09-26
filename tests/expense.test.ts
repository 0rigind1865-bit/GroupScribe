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

// ── v2 欄位（migration 023）的向後相容寫入 ──
import { isMissingColumn, stripV2, withV2Fallback } from '../src/expense/store';

test('isMissingColumn：Postgres 42703、PostgREST PGRST204、訊息比對；其他錯誤不算', () => {
  assert.ok(isMissingColumn({ code: '42703', message: 'column "pay_method" does not exist' }));
  assert.ok(isMissingColumn({ code: 'PGRST204', message: "Could not find the 'pay_method' column of 'expenses'" }));
  assert.ok(!isMissingColumn({ code: '23505', message: 'duplicate key' }));
  assert.ok(!isMissingColumn(null));
});

test('withV2Fallback：欄位不存在時拿掉 v2 欄位重寫一次；其他錯誤不重試', async () => {
  const seen: object[] = [];
  const r = await withV2Fallback({ amount: 1, pay_method: '現金', lat: 1 }, async (row) => {
    seen.push(row);
    return { error: 'pay_method' in row ? { code: 'PGRST204', message: 'x' } : null };
  });
  assert.equal(r.error, null);
  assert.deepEqual(seen, [{ amount: 1, pay_method: '現金', lat: 1 }, { amount: 1 }]);
  let n = 0;
  await withV2Fallback({ amount: 1 }, async () => (n++, { error: { code: '23505' } }));
  assert.equal(n, 1);
  assert.deepEqual(stripV2({ a: 1, source: 'web', photo_path: 'p' }), { a: 1 });
});

// ── 自訂分類（X2-4）──
import { normalizeCategories } from '../src/expense/categories';

test('normalizeCategories：一行一個、去空白去重、雜支一定在', () => {
  assert.deepEqual(normalizeCategories('交通\n  餐飲 \n交通\n\n'), ['交通', '餐飲', '雜支']);
  assert.deepEqual(normalizeCategories('雜支\n交通'), ['雜支', '交通']); // 自己排的位置要尊重
  assert.deepEqual(normalizeCategories(''), ['雜支']);
  assert.equal(normalizeCategories(Array.from({ length: 30 }, (_, i) => `類${i}`).join('\n')).length, 20);
  assert.equal(normalizeCategories('這是一個超過十個字的分類名稱')[0].length, 10);
});

test('parseReceipt：用公司自訂分類；不在清單裡歸雜支', () => {
  assert.equal(parseReceipt({ amount: 10, category: '機票' }, '2026-09-26', ['機票', '雜支'])?.category, '機票');
  assert.equal(parseReceipt({ amount: 10, category: '餐飲' }, '2026-09-26', ['機票', '雜支'])?.category, '雜支');
});

// ── 員工網頁記一筆（X2-1）＋地點（X2-7）──
import { parseExpenseForm } from '../src/expense/mine';

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const CATS = ['交通', '雜支'];

test('parseExpenseForm：金額或分類不合法 → null', () => {
  assert.equal(parseExpenseForm(form({ amount: '0', category: '交通' }), CATS, '2026-09-26'), null);
  assert.equal(parseExpenseForm(form({ amount: '120', category: '機票' }), CATS, '2026-09-26'), null);
});

test('parseExpenseForm：日期沒填用今天、付款方式白名單、座標要成對且在範圍內', () => {
  const r = parseExpenseForm(form({ amount: '1,200', category: '交通', pay_method: '信用卡', lat: '25.03', lng: '121.56' }), CATS, '2026-09-26');
  assert.equal(r?.amount, 1200);
  assert.equal(r?.spent_on, '2026-09-26');
  assert.equal(r?.pay_method, '代墊');
  assert.deepEqual([r?.lat, r?.lng], [25.03, 121.56]);
  const half = parseExpenseForm(form({ amount: '5', category: '雜支', lat: '25', lng: '' }), CATS, '2026-09-26');
  assert.deepEqual([half?.lat, half?.lng], [null, null]);
  const bad = parseExpenseForm(form({ amount: '5', category: '雜支', lat: '200', lng: '121' }), CATS, '2026-09-26');
  assert.deepEqual([bad?.lat, bad?.lng], [null, null]);
});

// ── 統計（X2-5）──
import { pivot } from '../src/expense/query';

test('pivot：交叉加總、列欄依合計排序、可指定列順序', () => {
  const rows = [
    { amount: 100, m: '2026-08', c: '餐飲' },
    { amount: 300, m: '2026-09', c: '交通' },
    { amount: 50, m: '2026-09', c: '餐飲' },
    { amount: 10, m: '2026-09', c: '' },
  ];
  const p = pivot(rows, (r) => r.m, (r) => r.c);
  assert.deepEqual(p.rows, ['2026-09', '2026-08']);
  assert.deepEqual(p.cols, ['交通', '餐飲', '（未填）']);
  assert.equal(p.cell('2026-09', '餐飲'), 50);
  assert.equal(p.cell('2026-08', '交通'), 0);
  assert.equal(p.rowTotal('2026-09'), 360);
  assert.equal(p.colTotal('餐飲'), 150);
  assert.equal(p.total, 460);
  assert.deepEqual(pivot(rows, (r) => r.m, (r) => r.c, (a, b) => a.localeCompare(b)).rows, ['2026-08', '2026-09']);
});

// ── 文字／語音記帳（X2-6）：寧可漏記不要誤記 ──
import { parseTextExpense } from '../src/expense/text';
import { EXPENSE_CATEGORIES } from '../src/expense/receipt';

test('parseTextExpense：品項＋金額要中，分類猜得出來', () => {
  assert.deepEqual(parseTextExpense('午餐 120', EXPENSE_CATEGORIES), { item: '午餐', amount: 120, category: '餐飲' });
  assert.deepEqual(parseTextExpense('停車費150元', EXPENSE_CATEGORIES), { item: '停車費', amount: 150, category: '停車過路' });
  assert.deepEqual(parseTextExpense('計程車 $350', EXPENSE_CATEGORIES), { item: '計程車', amount: 350, category: '交通' });
  assert.deepEqual(parseTextExpense('膠帶 1,200', EXPENSE_CATEGORIES), { item: '膠帶', amount: 1200, category: '材料耗材' });
  assert.equal(parseTextExpense('郵資 8元', EXPENSE_CATEGORIES)?.category, '雜支'); // 看不出分類但寫了「元」：記、歸雜支
  assert.equal(parseTextExpense('午餐120', EXPENSE_CATEGORIES)?.amount, 120); // 沒空格也行：品項認得
  assert.equal(parseTextExpense('測試 $456', EXPENSE_CATEGORIES)?.amount, 456); // 看不出分類但寫了 $：記
});

test('parseTextExpense：不是花費的句子不能中', () => {
  for (const t of ['明天 3 點開會', '明天 3', '會議室 3', '開會 2 點', '第 3', '上次報價多少？', '分機 123', '3 個人', '好', '120', '週五 10', '電話 0912345678 請回電', '測試456', '測試 456', '房號 305', '明天早上13.到現場'])
    assert.equal(parseTextExpense(t, EXPENSE_CATEGORIES), null, t);
});

test('parseTextExpense：公司自訂分類——品項等於分類名就直接用', () => {
  assert.equal(parseTextExpense('機票 5000', ['機票', '雜支'])?.category, '機票');
  assert.equal(parseTextExpense('午餐 120', ['機票', '雜支'])?.category, '雜支'); // 公司沒有「餐飲」這類
});

// ── 電子發票 QR 解析（從 Snaptab 搬來，尚未接掃描）──
import { parseInvoiceCodes, rocDateToISO } from '../src/expense/invoice';

// 左碼：字軌 10＋民國日期 7＋隨機碼 4＋銷售額 8（16 進位）＋總計 8（16 進位）＋買方 8＋賣方 8＋驗證 24 ＝ 77 字
const head = 'AB12345678' + '1150926' + '1234' + '00000064' + '00000069' + '00000000' + '12345678' + 'x'.repeat(24);

test('發票 QR：左碼取號碼、日期、含稅總額與品項（數量 >1 標 ×n）', () => {
  const d = parseInvoiceCodes({ data: `${head}:**********:2:2:1:咖啡:1:50:麵包:2:25` });
  assert.equal(d?.invoiceNo, 'AB12345678');
  assert.equal(d?.rocDate, '1150926');
  assert.equal(d?.total, 105);
  assert.deepEqual(d?.items, ['咖啡', '麵包×2']);
  assert.equal(d?.complete, true);
  assert.equal(rocDateToISO('1150926'), '2026/09/26');
});

test('發票 QR：品項接續到右碼；不是發票左碼 → null', () => {
  const d = parseInvoiceCodes({ data: `${head}:**********:2:3:1:咖啡:1:50` }, { data: '**:麵包:2:25' });
  assert.deepEqual(d?.items, ['咖啡', '麵包×2']);
  assert.equal(d?.complete, false); // 整張 3 項、只拿到 2 項
  assert.equal(parseInvoiceCodes({ data: 'https://example.com' }), null);
});

// ── Snaptab 全功能移植：計算機、AI 分類 ──
import { evaluate, tap } from '../src/expense/calc';
import { classifyNote } from '../src/expense/classify';

test('計算機 evaluate：先乘除後加減、除以 0 忽略、結尾運算子略過、四捨五入兩位', () => {
  assert.equal(evaluate('120+35×2'), 190);
  assert.equal(evaluate('100÷0+5'), 105);
  assert.equal(evaluate('120+'), 120);
  assert.equal(evaluate('10÷3'), 3.33);
  assert.equal(evaluate(''), 0);
});

test('計算機 tap：不能用運算子開頭、連按換掉、前導 0 被取代、= 換成結果、最長 18 字', () => {
  assert.equal(tap('', '+'), '');
  assert.equal(tap('12+', '×'), '12×');
  assert.equal(tap('0', '5'), '5');
  assert.equal(tap('12+0', '7'), '12+7');
  assert.equal(tap('12+3', '='), '15');
  assert.equal(tap('123', 'del'), '12');
  assert.equal(tap('1'.repeat(18), '2'), '1'.repeat(18));
});

test('AI 分類：預設分類靠概念、自訂分類靠名稱、看不出來回 null', () => {
  const cats = ['交通', '餐飲', '住宿', '停車過路', '材料耗材', '雜支'];
  assert.equal(classifyNote('工班便當 12 個', cats), '餐飲');
  assert.equal(classifyNote('中油加滿', cats), '交通');
  assert.equal(classifyNote('國道過路費', cats), '停車過路');
  assert.equal(classifyNote('買螺絲跟膠帶', cats), '材料耗材');
  assert.equal(classifyNote('機票 台北高雄', ['機票', '雜支']), '機票');
  assert.equal(classifyNote('今天天氣很好', cats), null);
});

// ── 離線暫存（瀏覽器 localStorage 用假的代替）──
import { enqueue, flushOutbox, readOutbox, MAX_PENDING } from '../src/expense/outbox';

test('離線暫存：滿了不收、補送成功才移除、送失敗就停在原處保留順序', async () => {
  const mem = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  for (let i = 0; i < MAX_PENDING; i++) assert.ok(enqueue({ client_id: `c${i}`, fields: { amount: '1' }, at: i }));
  assert.equal(enqueue({ client_id: 'over', fields: {}, at: 99 }), false);
  let n = 0;
  const left = await flushOutbox(async () => ++n <= 3); // 前 3 筆成功、第 4 筆失敗
  assert.equal(left, MAX_PENDING - 3);
  assert.equal(readOutbox()[0].client_id, 'c3');
  delete (globalThis as any).localStorage;
});

// ── CSV 匯出（員工 App 與後台共用）──
import { toCsv } from '../src/expense/csv';

test('toCsv：新到舊、含時間與付款方式、表尾小計只列 >0 的付款方式、逗號跳脫', () => {
  const base = { vendor: '', project: 'A 案', invoice_no: '', place_name: '', reimbursed: false, photo: null, person: '小明' };
  const csv = toCsv(
    [
      { ...base, id: '1', amount: 100, category: '餐飲', note: '便當, 飲料', pay_method: '代墊', spent_on: '2026-09-25', spent_at: '2026-09-25T04:30:00.000Z' },
      { ...base, id: '2', amount: 50, category: '交通', note: '', pay_method: '公司卡', spent_on: '2026-09-26', spent_at: null },
    ],
    { includePerson: true },
  );
  const lines = csv.replace('﻿', '').split('\r\n');
  assert.equal(lines[0], '日期,時間,分類,店家,用途,金額,付款方式,發票號碼,案場,地點,報帳狀態,人');
  assert.match(lines[1], /^2026\/09\/26,,交通/); // 新的在前
  assert.match(lines[2], /^2026\/09\/25,12:30,餐飲,,"便當, 飲料",100,代墊/);
  assert.ok(lines.includes('合計,,,,,150'));
  assert.ok(lines.includes('代墊請款,,,,,100'));
  assert.ok(!lines.some((l) => l.startsWith('現金')));
});
