import assert from 'node:assert/strict';
import { test } from 'node:test';
import { composeDigest, sectionLines, type DigestSection } from '../src/core/digest';

// 每日摘要：一個人一天一則，訂了好幾個群就合成一則（推播按收件人次計費）。

const today = '2026-10-05';
const sec = (name: string, o: Partial<DigestSection> = {}): DigestSection => ({
  groupId: `G-${name}`,
  name,
  events: [],
  tasks: [],
  pending: 0,
  inboxUrl: null,
  url: `https://liff.line.me/x?g=G-${name}&src=digest`,
  ...o,
});
const ev = (title: string, time: string | null = '09:00:00', location: string | null = null) => ({ title, time, location });
const tk = (title: string, dueAt = today, assignee: string | null = null) => ({ title, dueAt, assignee });

test('只有一個群有事：格式與合併前一樣（群名標題＋詳細內容連結）', () => {
  const r = composeDigest([sec('工地A', { events: [ev('進場', '08:00:00', '新莊')], tasks: [tk('交估價單', '2026-10-03', '雅婷')] })], today, null);
  assert.deepEqual(r?.included, ['G-工地A']);
  assert.equal(
    r?.text,
    [
      '【工地A】今日摘要',
      '',
      '📅 今日行程',
      '・進場（08:00 · 新莊）',
      '',
      '✅ 到期待辦',
      '・交估價單（逾期 10/03 · 雅婷）',
      '',
      '詳細內容 👉 https://liff.line.me/x?g=G-工地A&src=digest',
    ].join('\n'),
  );
});

test('全部沒事 → null（不打擾）；沒事的群不出現在合併訊息裡', () => {
  assert.equal(composeDigest([sec('A'), sec('B')], today, null), null);
  const r = composeDigest([sec('A'), sec('B', { tasks: [tk('x')] })], today, null);
  assert.deepEqual(r?.included, ['G-B']);
  assert.match(r!.text, /^【B】今日摘要/); // 只剩一個群有事 → 用單群格式
});

test('好幾個群：一則訊息、標題寫群數、依群名排序、每段附自己的連結', () => {
  const r = composeDigest(
    [sec('B 倉庫', { tasks: [tk('盤點')] }), sec('A 工地', { events: [ev('吊掛')] }), sec('C 辦公室')],
    today,
    'https://liff.line.me/x?src=digest',
  );
  assert.deepEqual(r?.included, ['G-A 工地', 'G-B 倉庫']);
  const t = r!.text;
  assert.match(t, /^今日摘要・2 個群\n\n【A 工地】\n📅 今日行程\n・吊掛（09:00）\n👉 https:\/\/liff\.line\.me\/x\?g=G-A 工地/);
  assert.ok(t.indexOf('【A 工地】') < t.indexOf('【B 倉庫】'));
  assert.doesNotMatch(t, /C 辦公室/);
  assert.doesNotMatch(t, /還有 \d+ 個群/);
});

test('太長放不下：前面的群照常列出，其餘收成一行「還有哪些群」＋群組列表連結；只有列出的算已送', () => {
  const many = Array.from({ length: 5 }, (_, i) => sec(`群${i + 1}`, { tasks: Array.from({ length: 6 }, (_, j) => tk(`待辦${j}`.padEnd(40, '．'))) }));
  const r = composeDigest(many, today, 'https://liff.line.me/x?src=digest', 900)!;
  assert.ok(r.text.length <= 900, `超過上限：${r.text.length}`);
  assert.ok(r.included.length >= 1 && r.included.length < 5);
  const rest = many.slice(r.included.length).map((s) => s.name);
  assert.match(r.text, new RegExp(`還有 ${rest.length} 個群今天也有事：${rest.join('、')}\\n全部 👉 https://liff\\.line\\.me/x\\?src=digest$`));
});

test('第一個群再長也一定放（只寄一行「還有哪些群」沒有用）', () => {
  const r = composeDigest([sec('A', { tasks: [tk('x'.repeat(300))] }), sec('B', { tasks: [tk('y')] })], today, null, 100)!;
  assert.deepEqual(r.included, ['G-A']);
  assert.match(r.text, /還有 1 個群今天也有事：B$/);
});

test('sectionLines：每類最多 6 筆，其餘寫「還有 N 筆」；沒時間寫時間未定', () => {
  const lines = sectionLines(sec('A', { events: [ev('無時間', null)], tasks: Array.from({ length: 9 }, (_, i) => tk(`t${i}`)) }), today);
  assert.equal(lines[1], '・無時間（時間未定）');
  assert.equal(lines.filter((l) => l.startsWith('・t')).length, 6);
  assert.equal(lines.at(-1), '・還有 3 筆');
});

test('sectionLines：待確認只在有筆數時出現，附收件匣連結', () => {
  assert.deepEqual(sectionLines(sec('A', { pending: 2, inboxUrl: 'https://x/inbox' }), today), ['⚠️ 2 筆待你確認\n去確認 👉 https://x/inbox']);
  assert.deepEqual(sectionLines(sec('A'), today), []);
});
