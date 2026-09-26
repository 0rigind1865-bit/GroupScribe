// 依 key 合批的 debounce（B7）：同一個 key 連續被呼叫時，安靜 quietMs 後才執行一次；
// 但從第一次呼叫起最多等 maxMs（持續有訊息的群也要定期整理）。
// 計時器可注入，測試不必真的等。
type Clock = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (t: unknown) => void;
};
const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
};

export function createDebouncer(
  run: (key: string) => unknown,
  opts: { quietMs: number; maxMs: number },
  clock: Clock = realClock,
): (key: string) => void {
  const pending = new Map<string, { timer: unknown; first: number }>();
  return (key) => {
    const now = clock.now();
    const prev = pending.get(key);
    if (prev) clock.clearTimeout(prev.timer);
    const first = prev?.first ?? now;
    const wait = Math.max(0, Math.min(opts.quietMs, first + opts.maxMs - now));
    const timer = clock.setTimeout(() => {
      pending.delete(key);
      Promise.resolve()
        .then(() => run(key))
        .catch((e) => console.error('合批工作失敗', key, e));
    }, wait);
    pending.set(key, { timer, first });
  };
}
