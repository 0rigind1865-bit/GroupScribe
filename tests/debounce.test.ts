// B7 抽取合批：用假時鐘驗證「安靜才跑」「最多等多久」「不同群互不影響」
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDebouncer } from '../src/core/debounce';

function fakeClock() {
  let t = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => t,
    setTimeout: (fn: () => void, ms: number) => (timers.set(++seq, { at: t + ms, fn }), seq),
    clearTimeout: (id: unknown) => void timers.delete(id as number),
    async advance(ms: number) {
      t += ms;
      for (const [id, x] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (x.at <= t) {
          timers.delete(id);
          x.fn();
        }
      }
      await new Promise((r) => setImmediate(r)); // 讓 run() 的 promise 跑完
    },
  };
}

test('45 秒內連呼叫 3 次只觸發 1 次，且在最後一次後 45 秒', async () => {
  const c = fakeClock();
  const runs: string[] = [];
  const kick = createDebouncer((k) => void runs.push(k), { quietMs: 45_000, maxMs: 180_000 }, c);
  kick('G1');
  await c.advance(10_000);
  kick('G1');
  await c.advance(10_000);
  kick('G1');
  await c.advance(44_000);
  assert.deepEqual(runs, []);
  await c.advance(1_000);
  assert.deepEqual(runs, ['G1']);
});

test('一直有訊息：從第一次起最多 3 分鐘就強制跑', async () => {
  const c = fakeClock();
  const runs: number[] = [];
  const kick = createDebouncer(() => void runs.push(c.now()), { quietMs: 45_000, maxMs: 180_000 }, c);
  for (let i = 0; i < 10; i++) {
    kick('G1');
    await c.advance(30_000);
  }
  assert.equal(runs[0], 180_000);
});

test('不同群互不影響；run 丟例外不會炸掉', async () => {
  const c = fakeClock();
  const runs: string[] = [];
  const kick = createDebouncer(
    (k) => {
      runs.push(k);
      if (k === 'BAD') throw new Error('boom');
    },
    { quietMs: 45_000, maxMs: 180_000 },
    c,
  );
  kick('G1');
  await c.advance(20_000);
  kick('G2');
  kick('BAD');
  await c.advance(25_000);
  assert.deepEqual(runs, ['G1']);
  await c.advance(20_000);
  assert.deepEqual(runs.sort(), ['BAD', 'G1', 'G2']);
});
