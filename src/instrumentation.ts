// 伺服器啟動掛勾（商業計劃 G4）：定期處理 webhook_events 裡還沒處理完的事件
// （處理到一半容器重啟、或處理失敗等租約過期的）。
//
// 只在正式環境、且 .env 設了 WEBHOOK_WORKER=1 才開：本機 dev 連的是正式庫，
// 不能讓開發機偷偷處理正式事件（夜間計劃 R4）。
// register() 也會在 edge runtime 跑：import 必須包在 NEXT_RUNTIME === 'nodejs' 的 if 裡，
// 編譯 edge 版時整段才會被刪掉（寫成提早 return 不行，node:crypto 會被打包進 edge 而 build 失敗）。
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_WORKER === '1') {
      const { startWebhookPoller } = await import('./core/webhook-poller');
      startWebhookPoller(60_000);
    }
  }
}
