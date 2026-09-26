// G4 webhook 先落地：原始事件拆列、落地失敗走舊路徑
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { landWebhook, rawEventRows, shouldFallback } from '../src/core/webhook-store';

const body = {
  destination: 'Uxxx',
  events: [
    { type: 'message', webhookEventId: '01HABC', deliveryContext: { isRedelivery: false }, message: { type: 'text', id: '1', text: 'hi' } },
    { type: 'join', webhookEventId: '01HDEF', deliveryContext: { isRedelivery: true } },
    { type: 'video-without-id' },
  ],
};

test('rawEventRows：每個原始 event 一列，帶出 webhookEventId 與 isRedelivery', () => {
  const rows = rawEventRows(body, 'ch1');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { channel_id: 'ch1', webhook_event_id: '01HABC', is_redelivery: false, payload: body.events[0] });
  assert.equal(rows[1].is_redelivery, true);
  assert.equal(rows[2].webhook_event_id, null);
  assert.deepEqual(rawEventRows(null, 'ch1'), []);
});

test('shouldFallback：有錯就走舊路徑', () => {
  assert.equal(shouldFallback(null), false);
  assert.equal(shouldFallback({ code: '42P01', message: 'relation "webhook_events" does not exist' }), true);
});

test('landWebhook：表不存在或丟例外 → fallback；成功 → landed；空批不碰資料庫', async () => {
  const rows = rawEventRows(body, 'ch1');
  const errDb = { from: () => ({ upsert: async () => ({ error: { code: '42P01', message: 'no table' } }) }) };
  assert.equal(await landWebhook(rows, errDb), 'fallback');
  const throwDb = { from: () => ({ upsert: async () => { throw new Error('network'); } }) };
  assert.equal(await landWebhook(rows, throwDb as never), 'fallback');
  let upserts = 0;
  const okDb = { from: () => ({ upsert: async () => (upserts++, { error: null }) }) };
  assert.equal(await landWebhook(rows, okDb), 'landed');
  assert.equal(await landWebhook([], okDb), 'landed');
  assert.equal(upserts, 1);
});
