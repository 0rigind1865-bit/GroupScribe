# 截圖

主 README 引用的圖放這裡。一律用 demo 資料截，**絕不要用真實群組**——客戶名、金額、員工真名都不能外流。

```bash
npx tsx scripts/seed-demo.ts     # 1. 建立示範資料
npm run dev                      # 2. 起站（.env.local 要有 DEMO_MODE=1，否則成員版進不去）
npx tsx scripts/shots.ts         # 3. 五張一次截完
npx tsx scripts/seed-demo.ts --drop   # 4. 截完清除，免得混進正式資料的跨群視圖
```

只重截其中幾張：`npx tsx scripts/shots.ts today`（比對檔名子字串）。
dev server 不在 3000/3001 時用 `PORT=54119 npx tsx scripts/shots.ts`。

## 現有

| 檔名 | 畫面 | 為什麼是這張 |
|---|---|---|
| `today-mobile.png` | 今天頁 | **最重要的一張**：上方「新莊到貨點收／雅婷」與下方時間軸雅婷那句「我明天下午過去」在同一個畫面裡——一張圖講完整個產品 |
| `inbox-mobile.png` | 收件匣 | 把關流程：同一句話同時生出「事件」與「待辦」，各自附來源引文 |
| `tasks-mobile.png` | 待辦頁 | 待確認獨立一區，且「確認」（琥珀方章）與「完成」（綠圓圈）的視覺區分一目了然 |
| `calendar-agenda.png` | 月曆的議程視圖 | 抽取產出的另一種呈現；預設就是議程而非月格線 |
| `member-liff.png` | 成員版 `/g/DEMO-GROUP` | 員工在 LINE 裡看到的畫面：「我的待辦」置頂、待確認附原始對話 |

**首圖的說明文字必須指向畫面上真的看得到的東西。** 曾經寫成指向「擬交件驗收清單」——
那筆的期限在 7 天視窗外，截圖裡根本沒有它，讀者對不起來就等於在證明產品不準。
換過構圖或改過 demo 資料之後，回頭檢查一次 README 的圖說。

## `scripts/shots.ts` 為什麼要走 CDP

`chrome --headless --screenshot` 三件事做不到：管理後台要 `gs_auth` cookie（CLI 沒得設，
會截到登入頁）、headless 跟隨系統深色（深色機器截出來跟其他圖不一致）、無法指定捲動位置。
改用 CDP 後順便拿到裝置模擬——`mobile: true` 才會套手機版斷點與底部 Tab 列。

尺寸固定為 iPhone 14 的 390×844 @3x。**不截整頁長圖**：`captureBeyondViewport` 會讓
`fixed` 的底部 Tab 列卡在圖片中間。
