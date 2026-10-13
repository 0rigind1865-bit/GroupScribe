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

// ── G5：connector 的金鑰由參數傳入 ──
import { createHmac } from 'node:crypto';
import { createLineConnector } from '../src/connectors/line';

test('createLineConnector：驗簽用傳進來的 channelSecret；沒有 secret 一律拒絕', () => {
  const body = '{"events":[]}';
  const sig = createHmac('sha256', 'secret-A').update(body).digest('base64');
  assert.equal(createLineConnector(() => ({ accessToken: '', channelSecret: 'secret-A' })).verifyWebhook(body, sig), true);
  assert.equal(createLineConnector(() => ({ accessToken: '', channelSecret: 'secret-B' })).verifyWebhook(body, sig), false);
  assert.equal(createLineConnector(() => ({ accessToken: '', channelSecret: '' })).verifyWebhook(body, sig), false);
});

// ── 語音原檔：LINE 轉檔中回 202、body 空；舊版把它當成功存了空檔，那則語音就永遠解析失敗 ──
const connector = createLineConnector(() => ({ accessToken: 't', channelSecret: 's' }));

/** 依序回傳準備好的回應；記下打過哪些網址 */
async function withFetch<T>(responses: (() => Response)[], run: () => Promise<T>): Promise<{ result: T; urls: string[] }> {
  const urls: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    urls.push(String(url));
    const next = responses.shift();
    if (!next) throw new Error(`多打了一次：${String(url)}`);
    return next();
  }) as typeof fetch;
  try {
    return { result: await run(), urls };
  } finally {
    globalThis.fetch = real;
  }
}
const bin = (bytes: number[], status = 200) =>
  new Response(Buffer.from(bytes), { status, headers: { 'content-type': 'audio/x-m4a' } });

test('fetchMedia：202 轉檔中 → 查準備狀態 succeeded → 再抓一次拿到原檔', async () => {
  const { result, urls } = await withFetch(
    [() => bin([], 202), () => Response.json({ status: 'succeeded' }), () => bin([1, 2, 3])],
    () => connector.fetchMedia('m1'),
  );
  assert.deepEqual([...result.data], [1, 2, 3]);
  assert.equal(result.mime, 'audio/x-m4a');
  assert.ok(urls[1].endsWith('/message/m1/content/transcoding'));
  assert.equal(urls.length, 3);
});

test('fetchMedia：轉檔失敗、內容是空的、非 200 都丟錯，不回空 Buffer', async () => {
  await assert.rejects(
    withFetch([() => bin([], 202), () => Response.json({ status: 'failed' })], () => connector.fetchMedia('m2')),
    /轉檔失敗/,
  );
  await assert.rejects(withFetch([() => bin([])], () => connector.fetchMedia('m3')), /空的/);
  await assert.rejects(withFetch([() => bin([], 404)], () => connector.fetchMedia('m4')), /404/);
});

test('reply：成功回 ok、失敗（token 過期的 400）回 error，呼叫端才知道要改 push', async () => {
  const ok = await withFetch([() => Response.json({}, { status: 200 })], () => connector.reply('r1', 'hi'));
  assert.equal(ok.result, 'ok');
  const bad = await withFetch([() => Response.json({ message: 'Invalid reply token' }, { status: 400 })], () => connector.reply('r2', 'hi'));
  assert.equal(bad.result, 'error');
});
