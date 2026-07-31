// 核心邏輯自我檢查：npm test
// 涵蓋三段會壞的邏輯：txt 匯入解析、低資訊過濾、時間加權排序（驗收標準的關鍵路徑）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLineExport, inExtractWindow } from '../src/core/importer';
import { fmtDate, isRevised, needsReview } from '../src/core/date';
import { isLowInfo, mimeOfKind } from '../src/core/ingest';
import { rankHits } from '../src/core/query';
import { parseOps, type RefMaps } from '../src/core/extract';
import {
  monthGrid,
  addDays,
  weekDays,
  agendaRange,
  parseHour,
  hourRange,
  splitTimed,
} from '../src/app/(admin)/calendar/grid';

const SAMPLE = `[LINE] 工作群的聊天記錄
儲存日期：2026/07/10 12:00

2026/07/01（三）
上午9:30\t阿華\t早安
下午5:02\t阿華\t報價出來了
含稅 48000
下午5:03\t小明\t[照片]
2026/07/02（四）
14:10\t小明\t收到
`;

test('parseLineExport：日期行、上午/下午、24 小時制、多行續行', () => {
  const p = parseLineExport(SAMPLE);
  assert.equal(p.length, 4);
  assert.equal(p[0].at.getHours(), 9);
  assert.equal(p[0].sender, '阿華');
  assert.equal(p[1].text, '報價出來了\n含稅 48000'); // 續行接回上一則
  assert.equal(p[1].at.getHours(), 17); // 下午5點 → 17
  assert.equal(p[3].at.getDate(), 2); // 第二個日期行生效
  assert.equal(p[3].at.getHours(), 14); // 24 小時制
  assert.equal(p[3].sender, '小明');
});

test('待確認 badge：分辨「AI 新抽」與「AI 已更新」，已忽略的不再喊確認', () => {
  const t0 = '2026-07-27T03:00:00Z';
  // 剛抽出來的：created 與 updated 幾乎同時
  assert.equal(isRevised({ created_at: t0, updated_at: '2026-07-27T03:00:10Z' }), false);
  // AI 依後續對話改過：差超過一分鐘
  assert.equal(isRevised({ created_at: t0, updated_at: '2026-07-27T04:00:00Z' }), true);
  assert.equal(isRevised({ created_at: null, updated_at: t0 }), false);

  assert.equal(needsReview({ needs_confirmation: true, status: 'open' }), true);
  assert.equal(needsReview({ needs_confirmation: false, status: 'open' }), false);
  // 忽略本身就是人做過的判斷，不該再喊待確認（ignore 只改 status、不清 needs_confirmation）
  assert.equal(needsReview({ needs_confirmation: true, status: 'ignored' }), false);
});

test('mimeOfKind：語音要送 audio/mp4——LINE 回 x-m4a，Gemini 不認', () => {
  assert.equal(mimeOfKind('audio'), 'audio/mp4');
  assert.equal(mimeOfKind('pdf'), 'application/pdf');
  assert.equal(mimeOfKind('image'), 'image/jpeg');
  // gemini.ts 以 mime.startsWith('audio/') 切換到轉寫 prompt，這個前綴不能斷
  assert.ok(mimeOfKind('audio').startsWith('audio/'));
});

test('inExtractWindow：匯入只有近 30 天排隊抽取，更早的當群組理解素材', () => {
  const now = new Date('2026-07-26T00:00:00Z').getTime();
  const d = (iso: string) => new Date(iso);
  assert.equal(inExtractWindow(d('2026-07-25T00:00:00Z'), now), true);
  assert.equal(inExtractWindow(d('2026-06-27T00:00:00Z'), now), true); // 第 29 天，仍在窗內
  assert.equal(inExtractWindow(d('2026-06-25T00:00:00Z'), now), false); // 第 31 天，窗外
  assert.equal(inExtractWindow(d('2025-04-09T00:00:00Z'), now), false);
});

test('isLowInfo：貼圖、短回應過濾，實質內容放行', () => {
  assert.equal(isLowInfo('收到'), true);
  assert.equal(isLowInfo('好的！'), true);
  assert.equal(isLowInfo('[貼圖]'), true);
  assert.equal(isLowInfo(''), true);
  assert.equal(isLowInfo('報價 48000 含稅'), false);
  assert.equal(isLowInfo('好，那就約週五出貨'), false);
});

test('parseOps：合法操作通過、壞操作丟棄不毀整批', () => {
  const refs: RefMaps = {
    msgs: new Map([
      ['M1', 'uuid-m1'],
      ['M2', 'uuid-m2'],
    ]),
    events: new Map([['E1', 'uuid-e1']]),
    tasks: new Map([['T1', 'uuid-t1']]),
    notes: new Map([['N1', 'uuid-n1']]),
  };
  const ops = parseOps(
    {
      operations: [
        { op: 'create_event', title: '中山北路案 到場', date: '2026-10-20', source_refs: ['M1', 'M99'] }, // M99 未知→忽略該 ref
        { op: 'update_event', ref: 'E1', time: '15:00', source_refs: ['M2'] },
        { op: 'create_event', title: '沒日期的事件' }, // 缺 date → 丟棄
        { op: 'create_event', title: '壞日期', date: '10/20' }, // 格式錯 → 丟棄
        { op: 'update_event', ref: 'E9', time: '10:00' }, // 未知 ref → 丟棄
        { op: 'update_event', ref: 'E1' }, // 無更新欄位 → 丟棄
        { op: 'create_task', title: '寄合約給客戶', assignee: '小明', due_date: '2026-07-18' },
        { op: 'create_task', title: '壞期限', due_date: '下週五' }, // 期限格式錯 → 保留但 due=null
        { op: 'update_task', ref: 'T1', due_date: '2026-07-25' },
        { op: 'create_note', kind: 'announcement', title: '到場一律提前 30 分', source_refs: ['M1'] },
        { op: 'create_note', kind: '公告', title: '壞 kind' }, // kind 非枚舉 → 丟棄
        { op: 'create_note', title: '缺 kind' }, // 缺 kind → 丟棄
        { op: 'update_note', ref: 'N1', body: '補充說明' },
        { op: 'update_note', ref: 'N9', body: 'x' }, // 未知 ref → 丟棄
        { op: 'nonsense' }, // 未知操作 → 丟棄
      ],
    },
    refs,
  );
  assert.equal(ops.length, 7);
  assert.deepEqual(ops[0], {
    op: 'create_event',
    title: '中山北路案 到場',
    date: '2026-10-20',
    time: null,
    location: null,
    note: null,
    sourceIds: ['uuid-m1'],
  });
  assert.deepEqual(ops[1], { op: 'update_event', id: 'uuid-e1', time: '15:00', sourceIds: ['uuid-m2'] });
  assert.equal((ops[3] as any).due, null); // 壞期限被清掉、任務本身保留
  assert.deepEqual(ops[4], { op: 'update_task', id: 'uuid-t1', due: '2026-07-25', sourceIds: [] });
  assert.deepEqual(ops[5], {
    op: 'create_note',
    title: '到場一律提前 30 分',
    kind: 'announcement',
    body: null,
    sourceIds: ['uuid-m1'],
  });
  assert.deepEqual(ops[6], { op: 'update_note', id: 'uuid-n1', body: '補充說明', sourceIds: [] });
});

test('parseOps：非預期輸出回空陣列', () => {
  const refs: RefMaps = { msgs: new Map(), events: new Map(), tasks: new Map(), notes: new Map() };
  assert.deepEqual(parseOps(null, refs), []);
  assert.deepEqual(parseOps('文字', refs), []);
  assert.deepEqual(parseOps({ operations: '不是陣列' }, refs), []);
});

test('monthGrid：月首偏移、天數、補位', () => {
  // 2026-10：10/1 是週四 → 前面補 4 格；31 天 → 35 格恰好 5 週
  const oct = monthGrid(2026, 10);
  assert.equal(oct.length, 5);
  assert.equal(oct[0][3], null);
  assert.deepEqual(oct[0][4], { day: 1, iso: '2026-10-01' });
  assert.deepEqual(oct[4][6], { day: 31, iso: '2026-10-31' });
  // 2026-02：2/1 是週日、28 天 → 4 週整、無補位
  const feb = monthGrid(2026, 2);
  assert.equal(feb.length, 4);
  assert.deepEqual(feb[0][0], { day: 1, iso: '2026-02-01' });
  assert.deepEqual(feb[3][6], { day: 28, iso: '2026-02-28' });
});

test('addDays：跨月、跨年、UTC 無時區偏移', () => {
  assert.equal(addDays('2026-07-17', 1), '2026-07-18');
  assert.equal(addDays('2026-07-31', 1), '2026-08-01'); // 跨月
  assert.equal(addDays('2026-07-01', -1), '2026-06-30');
  assert.equal(addDays('2026-12-31', 7), '2027-01-07'); // 跨年
  assert.equal(addDays('2026-07-17', -7), '2026-07-10');
});

test('weekDays：週日起、含指定日、跨月不補 null', () => {
  // 2026-07-17 是週五 → 該週日 7/12 起
  const w = weekDays('2026-07-17');
  assert.equal(w.length, 7);
  assert.deepEqual(w, ['2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18']);
  // 跨月週：2026-08-01 是週六 → 該週日 7/26 起，橫跨 7 月與 8 月
  assert.deepEqual(weekDays('2026-08-01'), [
    '2026-07-26', '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01',
  ]);
});

test('agendaRange：未來向範圍、all 無上界', () => {
  assert.deepEqual(agendaRange('30d', '2026-07-17'), ['2026-07-17', '2026-08-16']);
  assert.deepEqual(agendaRange('90d', '2026-07-17'), ['2026-07-17', '2026-10-15']);
  assert.deepEqual(agendaRange('1y', '2026-07-17'), ['2026-07-17', '2027-07-17']);
  assert.deepEqual(agendaRange('all', '2026-07-17'), ['2026-07-17', null]);
});

test('parseHour：容忍 HH:MM 與 HH:MM:SS', () => {
  assert.equal(parseHour('14:30:00'), 14);
  assert.equal(parseHour('09:00'), 9);
  assert.equal(parseHour('00:15'), 0);
});

test('hourRange：聚焦有事件時段、撐最小窗、空回 null', () => {
  assert.equal(hourRange([]), null);
  assert.deepEqual(hourRange([9, 14]), [8, 16]); // 9-1 .. 14+1+1
  const r = hourRange([10]); // 單事件撐最小窗 6
  assert.equal(r![1] - r![0], 6);
  const [lo, hi] = hourRange([23])!;
  assert.ok(lo >= 0 && hi <= 24); // clamp
});

test('splitTimed：依 start_time 是否 null 分兩堆', () => {
  const evs = [
    { start_time: '14:00', id: 'a' },
    { start_time: null, id: 'b' },
    { start_time: '09:30', id: 'c' },
  ];
  const { timed, undated } = splitTimed(evs);
  assert.deepEqual(timed.map((e) => e.id), ['a', 'c']);
  assert.deepEqual(undated.map((e) => e.id), ['b']);
});

test('rankHits：最新狀態型問題偏重新資訊，一般問題照相似度', () => {
  const now = Date.UTC(2026, 6, 10);
  const day = 86_400_000;
  const hits = [
    { similarity: 0.95, created_at: new Date(now - 10 * day).toISOString(), chunk_text: '舊報價 52000' },
    { similarity: 0.7, created_at: new Date(now - 1 * day).toISOString(), chunk_text: '新報價 48000' },
  ];
  assert.match(rankHits(hits, '最新報價多少', now)[0].chunk_text, /48000/);
  assert.match(rankHits(hits, '當初的合約條件', now)[0].chunk_text, /52000/);
});

test('fmtDate：期限一律 M/D（週X），跨年才補年份', () => {
  // 三個頁面曾經三種寫法（2026-08-13 / 8/13（週四）/ 08/13），統一由這支產生
  assert.equal(fmtDate('2026-08-13', '2026-07-31'), '8/13（週四）');
  assert.equal(fmtDate('2027-01-05', '2026-07-31'), '2027 1/5（週二）');
});
