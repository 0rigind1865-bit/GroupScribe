# Snaptab 舊資料搬進群記報帳（步驟說明，尚未執行）

> 2026-09-26 夜間計劃 X2 待決項。**這份只是步驟，沒有寫程式、也沒有讀過 Firestore 正式資料。**
> 要不要搬、搬給誰（哪家公司、哪個員工），由 jielin 決定。

## 1. 資料在哪、長什麼樣

- Firebase 專案 `snaptab-wh`，Firestore 三個 collection（依 Snaptab `lib/types.ts`）：
  - `expenses`：一筆花費
  - `events`：案場（＝群記報帳的「專案」）
  - `categories`：自訂分類
- 收據照在 Firebase Storage（`photoUrl` 是下載網址）

## 2. 欄位對照

| Snaptab `expenses` | 群記 `expenses` | 備註 |
|---|---|---|
| `amount` | `amount` | 整數 |
| `timestamp`（毫秒） | `spent_on` | 轉台北日期 `YYYY-MM-DD` |
| `category`（分類 id） | `category` | 用 `categories` 把 id 換成名稱；預設 id：fuel→交通、meal→餐飲、park／toll→停車過路、stay→住宿、misc→雜支 |
| `note` | `note` | |
| `eventName` | `project` | |
| `paymentMethod` | `pay_method` | 代墊／公司卡／現金，值相同 |
| `invoiceNo` | `invoice_no` | |
| `location.lat／lng／placeName` | `lat／lng／place_name` | |
| `reimbursed`＋`reimbursedAt` | `reimbursed_at` | 未報帳＝null |
| `photoUrl` | `photo_path` | 要先把照片下載再上傳到群記的 Storage（`expense/<org_id>/…`） |
| `createdBy`（Firebase 匿名 uid） | `line_user_id`、`person_name` | **對不起來**：Snaptab 用匿名登入，沒有 LINE 身分。搬的時候要指定「這些全算某一位員工的」 |

`org_id` 填你要搬進去的公司；`source` 填 `'snaptab'`。

## 3. 建議做法（需要時再請 Claude 寫腳本）

1. 在 Firebase Console → Firestore → 匯出，或用 `firebase` CLI 把三個 collection 匯成 JSON（你自己操作，需要你的 Google 帳號登入）。
2. 把 JSON 放到本機（不要 commit 進 repo）。
3. 請 Claude 寫一支一次性腳本 `scripts/import-snaptab.ts`：讀 JSON → 依上表轉換 → 產生一份 SQL `insert`（照片另外下載上傳）。
4. **先在 staging 或用 `begin; … rollback;` 試跑**，確認筆數與金額合計對得上，再正式貼。

## 4. 要你先決定的

- 搬進哪家公司、算在哪位員工名下？
- 已報帳的舊資料要不要搬（只搬未報帳的最省事）？
- 照片要不要搬（不搬就只留金額與文字）？
