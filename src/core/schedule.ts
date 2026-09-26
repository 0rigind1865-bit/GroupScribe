import { createDebouncer } from './debounce';
import { extractGroup } from './extract';
import { retryPendingMedia } from './ingest';

// 抽取合批（商業計劃 B7）：抽取 prompt 的輸入幾乎與新訊息數無關（profile＋既有項目＋否決清單固定塞），
// 所以把呼叫數從「每批 webhook 一次」壓到「每陣訊息一次」是最便宜的毛利槓桿。
// 群組安靜 45 秒才整理；一直有人講話時最多每 3 分鐘整理一次。
// 手動匯入與 /api/extract 不經過這裡（使用者在等結果）。
// 1:1 收據的即時回覆在 handleEvent 當下就做了（replyToken 會過期），不受這裡延後影響。
//
// ponytail: 計時器在記憶體，容器重啟時還沒到期的會掉——訊息已落地（extracted_at 為 null），
// 該群下一則訊息或手動 POST /api/extract 會接手。要零遺漏再做啟動時掃一次未抽取的群。
export const scheduleExtract = createDebouncer(
  async (gid) => {
    await retryPendingMedia(gid).catch((e) => console.error('媒體重試失敗（下次再試）', gid, e));
    await extractGroup(gid).catch((e) => console.error('抽取失敗（留待下次補抽）', gid, e));
  },
  { quietMs: 45_000, maxMs: 180_000 },
);
