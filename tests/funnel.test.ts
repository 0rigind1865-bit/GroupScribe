// L1 漏斗：觸點來源白名單、liff.state 拆解、寫入失敗不擋路
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liffStatePath, logFunnel, parseLiffEntry } from '../src/core/funnel';
import { safeNext } from '../src/http';

test('parseLiffEntry：src 只收白名單，其他一律 null', () => {
  assert.deepEqual(parseLiffEntry({ src: 'notice' }), { g: null, src: 'notice' });
  assert.deepEqual(parseLiffEntry({ src: 'digest', g: 'C123' }), { g: 'C123', src: 'digest' });
  assert.equal(parseLiffEntry({ src: 'evil' }).src, null);
  assert.equal(parseLiffEntry({}).src, null);
  assert.equal(parseLiffEntry({ src: ['answer', 'x'] }).src, 'answer');
});

test('parseLiffEntry：第一次開 LIFF 時 query 包在 liff.state 裡', () => {
  assert.deepEqual(parseLiffEntry({ 'liff.state': '?g=Cabc&src=answer' }), { g: 'Cabc', src: 'answer' });
  assert.deepEqual(parseLiffEntry({ 'liff.state': '/g?src=notice' }), { g: null, src: 'notice' });
  assert.deepEqual(parseLiffEntry({ 'liff.state': '/g' }), { g: null, src: null });
  assert.equal(parseLiffEntry({ g: '  ' }).g, null);
});

test('logFunnel：表還沒建（insert 回 error）或直接丟例外，都不往外丟', async () => {
  const errDb = { from: () => ({ insert: async () => ({ error: { message: 'relation "funnel_events" does not exist' } }) }) };
  assert.equal(await logFunnel({ line_user_id: 'U1', step: 'liff_open', source: null }, errDb), false);
  const throwDb = { from: () => ({ insert: async () => { throw new Error('network'); } }) };
  assert.equal(await logFunnel({ line_user_id: 'U1', step: 'liff_open', source: null }, throwDb as never), false);
  const okDb = { from: () => ({ insert: async () => ({ error: null }) }) };
  assert.equal(await logFunnel({ line_user_id: 'U1', step: 'liff_open', source: 'notice' }, okDb), true);
});

// ── 深連結與回跳：已登入的人點 LIFF 深連結，要到連結指的那一頁 ──

test('liffStatePath：拆出 liff.state 裡的站內路徑（含 query）', () => {
  assert.equal(liffStatePath({ 'liff.state': '/o/acme/inbox?group=C123&src=digest' }), '/o/acme/inbox?group=C123&src=digest');
  assert.equal(liffStatePath({ 'liff.state': '/a/expense' }), '/a/expense');
  assert.equal(liffStatePath({ 'liff.state': '/g?src=notice' }), '/g?src=notice');
});

test('liffStatePath：只有 query、根路徑、沒帶 → null（交給 parseLiffEntry／原本的落地邏輯）', () => {
  assert.equal(liffStatePath({ 'liff.state': '?g=Cabc&src=answer' }), null);
  assert.equal(liffStatePath({ 'liff.state': '/' }), null);
  assert.equal(liffStatePath({ 'liff.state': '/?src=notice' }), null);
  assert.equal(liffStatePath({}), null);
});

test('safeNext：擋開放跳轉', () => {
  assert.equal(safeNext('/o/acme/inbox?group=C1'), '/o/acme/inbox?group=C1');
  for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'evil.com', '/o/x\n', '', null, 42, '/' + 'a'.repeat(600)])
    assert.equal(safeNext(bad), '', String(bad));
  assert.equal(liffStatePath({ 'liff.state': '//evil.com/x' }), null);
});
