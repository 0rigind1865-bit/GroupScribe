import { processPendingWebhooks } from './webhook-store';

// 由 src/instrumentation.ts 在正式環境啟動（WEBHOOK_WORKER=1）
export function startWebhookPoller(everyMs: number) {
  console.log(`webhook 補處理輪詢啟動（每 ${everyMs / 1000} 秒）`);
  const tick = () => processPendingWebhooks().catch((e) => console.error('webhook 補處理失敗', e));
  setTimeout(tick, 5_000); // 開機先掃一次：重啟前沒處理完的
  setInterval(tick, everyMs);
}
