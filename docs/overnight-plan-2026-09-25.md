# 夜間無人值守執行計劃（2026-09-25 晚 → 09-26 早）

> 目的：jielin 睡覺期間，由 agent 在**無人干預**下推進 `docs/business-plan.md` 第 2.1 節「階段一」剩下的**純程式碼**項目，醒來時看到：一串乾淨的 commit、全綠的測試、一份早晨報告、一包待貼的 migration SQL。
> 本檔是唯一的執行依據。**上下文被壓縮或不確定下一步時，先重讀本檔第 1 節與第 5 節（進度區），不要憑記憶。**

---

## 0. 目標與邊界

### 0.1 成功長什麼樣（醒來驗收）

1. `git log` 多出若干個繁中 commit，一個任務一個（或一組相關任務一個）。
2. `npm test`、`npm run typecheck`、`npm run build` 三個都綠。
3. 第 5 節進度區每個任務都有狀態（✅／⏭ 跳過＋原因／❌ 失敗＋原因）。
4. 第 6 節早晨報告寫好：做了什麼、要 jielin 做什麼（依順序）、要貼的 SQL 檔清單。
5. 正式站（NAS）與正式資料庫**完全沒被動過**。

### 0.2 絕對不做（紅線，違反任一條＝立刻停手、寫進報告）

| # | 不做 | 原因 |
|---|---|---|
| R1 | `git push` | CLAUDE.md：push 要用戶明確指示 |
| R2 | 部署到 NAS（rsync／ssh／docker） | 部署會漏收 webhook，要用戶在場 |
| R3 | 對正式 Supabase 跑 migration、INSERT／UPDATE／DELETE | 沒有 staging（S1 未做）；只寫 migration 檔，早上給 SQL |
| R4 | 在本機 dev server 點任何送出／確認／刪除按鈕 | `.env.local` 連的是正式庫，點了就是改正式資料 |
| R5 | 修改或刪除守門測試（routes／colors／i18n／api-guard／answer-scope）讓它通過 | 守門測試是紀律本身，失敗要修程式 |
| R6 | 呼叫會花錢或對外發訊息的 API（Gemini 大量呼叫、LINE push） | 無人監看的支出與外部副作用 |
| R7 | 新增 npm 依賴 | ponytail 原則；NAS 部署也要多同步檔案 |
| R8 | 做本檔沒列的功能、「順手」重構 | 防漂移；看到值得做的事寫進報告「建議」欄 |
| R9 | 改 `.env.local`、讀出或印出任何金鑰 | 金鑰安全 |

### 0.3 允許的事

- 讀寫 repo 內檔案、新增 migration 檔（編號從 `021` 接續）。
- 跑 `npm test`、`npm run typecheck`、`npm run build`、`npx tsx` 本機腳本（不連外的）。
- 本機 dev server **只看畫面**（GET 頁面、截圖），驗證版面。
- `git add` ＋ `git commit`（CLAUDE.md 已預先授權）。
- 對正式庫做**唯讀** SELECT 來確認欄位名稱（例如 `information_schema`），但不得寫入。

---

## 1. 執行規則（防漂移，每個任務都照做）

1. **開始任務前**：重讀本檔該任務卡＋第 5 節進度區，在進度區把狀態改成 `⏳ 進行中` 並寫開始時間。
2. **先讀懂再動手**：打開任務卡列出的每個檔案，grep 所有呼叫者，確認計劃寫的行號還對（行號可能已漂移，以實際程式為準）。
3. **只做任務卡「範圍」內的事**。發現計劃錯了或做不到 → 照第 3 條處理，不要自己擴大範圍。
4. **完成標準全部打勾才算完成**。每張卡的「完成標準」是硬條件。
5. **每個任務結束跑三件事**：`npm test`、`npm run typecheck`、（該任務有動 UI 或路由時）`npm run build`。任一失敗就修，修不好就退回（`git checkout -- .` 只退本任務未 commit 的變更）。
6. **commit**：繁中訊息，格式 `<類型>：<簡述>`，結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。**commit 前 `git status` 看一眼，不要把 `.env*`、截圖暫存、scratchpad 檔 commit 進去。**
7. **回寫進度**：在第 5 節更新狀態、commit hash、一句話結果；「決策紀錄」表記下任何自行判斷。進度區的更新跟著該任務的 commit 一起進。
8. **卡住規則**：同一個問題試 3 次還不行 → 標 `⏭ 跳過`，寫下卡在哪、試過什麼，**退回未完成的變更**，換下一個任務。不要在一個任務上耗掉整晚。
9. **需要用戶決定的事**：不要停下來等。選計劃裡寫的預設；沒有預設就選「最小、可逆」的做法，寫進決策紀錄與早晨報告。
10. **每完成 3 個任務**：重讀第 0.2 節紅線一次，確認沒有漂移。
11. **結束條件**（任一成立就收尾寫報告）：所有任務處理完；或連續 3 個任務被跳過；或測試出現無法定位的全域失敗。

### 行號與事實的查法

- 計劃裡的「檔案:行號」來自 2026-09-23 的 business-plan，可能已漂移。**永遠以 grep 結果為準。**
- 動 UI 前讀 `README.md` 的「介面架構」章節：加頁面＝在 `src/app/o/[org]/routes.tsx` 加一行；連結用 `oh(slug, path)`；共用元件在 `src/app/ui/`；狀態色只有 ok/warn/err/neutral。
- 功能決策不得以 jielin 的產業（舞台技術）為依據；範例文字、fixture 要跨行業。

---

## 2. 任務總表（依順序執行）

分三層。**A 層一定要做完才碰 B 層；C 層有時間才做。**

| 順序 | 代號 | 名稱 | 層 | 需 migration | 風險 |
|---|---|---|---|---|---|
| 1 | A9 | 健康檢查端點＋Docker HEALTHCHECK＋webhook 靜默警示 | A | 否 | 低 |
| 2 | P1 | PWA 最低基礎（manifest、icon、theme-color） | A | 否 | 低 |
| 3 | G7 | 進群告知改三段＋「本群由認領組織管理、可匯出」 | A | 否 | 低 |
| 4 | G8 | 新租戶前 7 天抽取一律需確認 | A | 否 | 低 |
| 5 | A7 | 新租戶零資料上手卡 | A | 否 | 低 |
| 6 | L1 | LIFF 開啟事件落表＋觸點 source＋單群深連結 | A | 021 | 中 |
| 7 | G3 | 內容表加 org_id＋trigger＋backfill＋`transfer_group()` | B | 022 | 中 |
| 8 | B7 | 抽取合批 debounce | B | 否 | 中 |
| 9 | G4 | webhook 先落地再回 200 | B | 023 | 高 |
| 10 | G5 | Connector 金鑰收成函式（只重構介面） | B | 否 | 中 |
| 11 | A6 | 移除 callback 自動種子（改 migration 種子） | B | 024 | 中 |
| 12 | A8 | 方案降級語意與 suspended | C | 025 | 中 |
| 13 | E1 | 跨行業抽取回歸集（腳本＋fixture，不跑） | C | 否 | 低 |
| 14 | A10 | 設計夥伴一頁合約模板（文件） | C | 否 | 低 |
| 15 | X1 | 報帳模組 v1：私訊發票照 → 自動記一筆＋管理頁＋CSV 匯出 | D | 有 | 中 |
| 16 | X2 | 報帳模組 v2：Snaptab 其餘功能完整搬家 | D | 有 | 中 |

**D 層（報帳，jielin 2026-09-25 指定要做完）**：A 層做完就做 D 層，**優先於 B、C 層**。X1 做完才碰 X2。規格來源：另一個專案 `/Users/linjie/Documents/GitHub/Snaptab`（只讀，不改那個 repo）。

**明確不在今晚範圍**：S1 staging、Supabase 升 Pro、LINE console 設定、G6 分享卡（要先在 LINE Console 啟用 shareTargetPicker，無法驗證）、B 階段二所有項目、CLA／商標／寄信。

**migration 編號規則**：實際編號依完成順序從 `021` 往上排；跳過的任務不佔號。上表編號只是預估。

---

## 3. 任務卡

### 1. A9 健康檢查

- **目標**：外部監控（UptimeRobot）與 Docker 能知道服務活著；webhook 長時間沒進來時看得見。
- **範圍**：
  - 新增 `src/app/api/health/route.ts`：GET 回 `{ ok: true }`＋DB 可達性（對一張小表做 `select id limit 1`，逾時 3 秒算失敗→回 503）。不回任何金鑰或內部資訊。
  - `api-guard.test.ts` 的白名單加入 health（這是合法擴充白名單，不是改測試邏輯；在 commit 訊息講明）。
  - `middleware.ts`：確認 `/api/health` 不需登入即可存取。
  - `Dockerfile` runner 階段加 `HEALTHCHECK`：用 `node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`（slim 映像沒有 curl）。
  - webhook 靜默警示：**不做私訊推播**（R6）。只在設定頁／今天頁已有的心跳顯示處，靜默 >6 小時時改用 warn 色＋文字提醒。若已存在類似顯示就只調門檻。
- **完成標準**：
  - [ ] `npm run build` 成功，`.next` 內有 health 路由
  - [ ] dev server 下 `curl localhost:3000/api/health` 回 200 與 `ok:true`
  - [ ] api-guard 測試綠
  - [ ] Dockerfile 有 HEALTHCHECK 且語法正確（`docker` 不在本機時只做目視檢查，報告註明）

### 2. P1 PWA 基礎

- **目標**：管理者可「加到主畫面」，有正確 icon 與主題色。
- **範圍**：`src/app/manifest.ts`（Next 原生 metadata route，不手寫 json）＋ `public/brand/` 既有圖轉出 192／512 icon（用 macOS 內建 `sips`，不裝套件）＋ `layout.tsx` 加 `viewport` 匯出含 `themeColor`（亮／暗兩色）。`start_url` 設 `/`、`display: standalone`、名稱「群記」。
- **不做**：service worker、離線、推播。
- **完成標準**：
  - [ ] build 成功；dev server `GET /manifest.webmanifest` 回合法 JSON
  - [ ] icon 檔存在且尺寸正確（`sips -g pixelWidth` 驗證）
  - [ ] middleware 放行 manifest 與 icon（未登入可取得）

### 3. G7 進群告知三段

- **目標**：告知文像「自我介紹」而非隱私聲明，並明寫「本群整理由認領的公司管理、可匯出」。
- **範圍**：只改 `src/core/ingest.ts` 的 `DEFAULT_NOTICE`（及 1:1 個人筆記的告知若有共用段落）。三段：①我是誰、會做什麼（一句話＋@我 提問）②誰看得到（本群由認領此群的公司管理，管理者可查看與匯出整理結果；成員可從下方連結看自己群的整理）③隱私（移出即停止、收回同步刪除、可要求刪除）。租戶自訂文字（`org_settings.join_notice_text`）行為不變。
- **注意**：LINE 單則文字上限 5000 字，但越短越好，目標 ≤ 250 字。不得寫「符合 LINE 規範」（business-plan K1）。
- **完成標準**：
  - [ ] 既有測試綠；若 core.test 有斷言告知文內容就同步更新（這不是守門測試）
  - [ ] 字數 ≤ 250（在 commit 訊息附字數）
  - [ ] 文案含「管理」「匯出」兩個概念

### 4. G8 新租戶前 7 天全需確認

- **目標**：新公司前 7 天抽出來的東西都先進收件匣，避免假陽性直接變成「事實」（principles 規則一）。
- **範圍**：`src/core/extract.ts` 寫入 events/tasks/notes 時，若群組所屬 org 的 `orgs.created_at` 在 7 天內 → `needs_confirmation = true`。org 建立時間由既有查詢取得，**不加 migration**。1:1 個人筆記（`dm:` 群）不套用（本人自己記的）。
- **完成標準**：
  - [ ] 抽出一個純函式（例如 `forceConfirm(orgCreatedAt, now, groupId)`）並加單元測試：6 天前→true、8 天前→false、dm 群→false
  - [ ] 測試與 typecheck 綠

### 5. A7 新租戶上手卡

- **目標**：新公司第一次進後台，不是一句「把 bot 加進群組」，而是三步引導＋即時狀態。
- **範圍**：今天頁（`src/app/o/[org]/(admin)/page.tsx`）零群組／零訊息時的空狀態：
  - 步驟 1：加群記好友（按鈕連 `https://line.me/R/ti/p/@<LINE_BOT_BASIC_ID>`，env 未設時隱藏此鈕）
  - 步驟 2：把群記邀進工作群（文字說明）
  - 步驟 3：到群裡點認領連結（接 A5 既有流程）
  - 狀態列：「已收到 N 則，整理中」（有群但訊息少時顯示；N 用既有 groups_view 資料）
  - 註明「群記是未認證官方帳號（灰色盾牌），這是正常的」
  - 註明「前 7 天整理出的項目會先請你確認」（呼應 G8）
- 用 `src/app/ui/` 既有元件（Empty／Banner），不新刻樣式；文字走既有 i18n 機制（若今天頁有用 i18n，五語系 key 都要補，`i18n.test` 會擋）。
- `.env.example` 加 `LINE_BOT_BASIC_ID`（值留空、附註解）。
- **完成標準**：
  - [ ] build＋三支守門測試綠
  - [ ] dev server 截圖：用一個零群組的 org 看空狀態（若正式庫沒有零群組的 org，改用元件層級的判斷分支程式碼審查＋說明，**不得為了截圖去建 org**，R3）
  - [ ] 手機寬度（375px）不破版

### 6. L1 LIFF 開啟事件

- **目標**：知道成員從哪個觸點打開 LIFF，止損線（開啟率 <20%）才量得到。
- **範圍**：
  - migration：`funnel_events(id bigserial, org_id uuid null, group_id text null, line_user_id text null, step text not null, source text null, at timestamptz default now())`＋`(step, at)` 索引。開 RLS、不寫 policy（照既有表慣例，先 grep 確認慣例）。
  - `/api/liff/session` 建 session 成功時 insert 一列 `step='liff_open'`；`source` 從請求帶來的 query（`src=notice|answer|digest`）取，白名單外一律存 null。**寫入失敗只 console.warn，不影響登入**（表可能還沒建）。
  - 三個觸點的 LIFF 連結加 `?src=`：進群告知、@回答附的連結、每日提醒。
  - 單群深連結：`?g=<groupId>` 開 LIFF 時直接進該群頁（先確認 LIFF 端現在怎麼處理 query，liff.state 的轉址行為要實測程式碼路徑）。
- **完成標準**：
  - [ ] migration 檔存在，SQL 可重跑（`create table if not exists`、`create index if not exists`）
  - [ ] 單元測試：source 白名單解析函式
  - [ ] 表不存在時登入仍成功（程式碼路徑審查：錯誤被吞並 warn）
  - [ ] build＋測試綠

### 7. G3 內容表 org_id

- **目標**：為日後 RLS 與轉移鋪路，內容表各自帶 `org_id`。
- **範圍**：一支 migration：
  - messages／events／tasks／notes／embeddings／media_assets／push_subscriptions 加 `org_id uuid null`（先 grep schema 確認這些表名與 group_id 欄位都存在；media_assets 若無 group_id 就經 message_id 取）。
  - 一個共用 trigger function：insert 時若 `org_id` 為 null，從 `groups.org_id` 帶入。
  - backfill 用 UPDATE ... FROM groups（寫成可重跑）。
  - `transfer_group(gid text, new_org uuid)`：upsert groups 列（K2 修正 (2)：匯入群可能沒有 groups 列）＋更新上述各表 org_id，全在一個函式內。
  - **應用程式碼本任務不讀這個欄位**（只鋪路）。既有 A5 認領流程若是直接 UPDATE groups，改呼叫 `transfer_group` 的 rpc——**但 migration 沒跑前 rpc 會失敗**，所以採「先試 rpc，函式不存在（錯誤碼 PGRST202 / 42883）時退回舊寫法」。
- **完成標準**：
  - [ ] migration 可重跑（`add column if not exists`、`create or replace`、`drop trigger if exists`）
  - [ ] 報告註明：大表 backfill 可能跑較久，建議離峰貼
  - [ ] 認領流程的退回邏輯有單元測試或清楚的程式碼審查說明
  - [ ] 測試與 typecheck 綠

### 8. B7 抽取合批 debounce

- **目標**：同一群連續來訊息時，不要每批 webhook 都呼叫一次抽取；等 45 秒沒新訊息再抽（省 AI 費用的最大槓桿）。
- **範圍**：新增（或放進既有 worker 模組）一個 per-group 計時器：`scheduleExtract(gid)` 重設該群計時器，到期才 `retryPendingMedia` → `extractGroup`。最長等待上限 3 分鐘（持續有訊息時也要抽）。webhook route 改呼叫它。
- **已知天花板**（寫 `ponytail:` 註解）：計時器在記憶體，容器重啟時未到期的會掉——下次訊息或既有補抽機制會接手（先 grep 確認有沒有定期補抽；沒有的話在報告寫明風險）。
- 手動匯入、`/api/extract` 手動觸發**不經過** debounce。
- **完成標準**：
  - [ ] 純邏輯單元測試（用可注入的 clock 或 `node:test` 的 mock timers）：連續三次呼叫只觸發一次；超過 3 分鐘上限會強制觸發
  - [ ] 測試與 typecheck 綠

### 9. G4 webhook 先落地（高風險，嚴守完成標準）

- **目標**：webhook 收到就先寫進 DB 再回 200，處理失敗或容器重啟也不會漏。
- **前置**：B7 已完成（處理迴圈要接 debounce）。若 B7 被跳過，本任務仍可做，處理後直接呼叫舊流程。
- **範圍**：
  - migration：`webhook_events(id bigserial, channel_id text, webhook_event_id text unique, is_redelivery bool, payload jsonb, received_at, processed_at, attempts int default 0, error text)`。
  - `connectors/line.ts` 的 parseEvents 保留 `webhookEventId` 與 `deliveryContext.isRedelivery`（新增欄位，不改既有欄位語意）。
  - webhook route：驗簽 → insert（`on conflict do nothing`）→ 回 200 → `after()` 觸發處理一次。**insert 失敗（例如表還沒建）→ 退回現行 `after()` 直接處理的舊路徑**，保證 migration 前部署也不會壞。
  - 處理器 `processPendingWebhooks()`：撈 `processed_at is null and attempts < 5`，逐筆 `handleEvent`，成功標 processed_at，失敗 attempts+1 記 error。
  - 啟動補處理：`src/instrumentation.ts` 在 **production 且 env `WEBHOOK_WORKER=1`** 時才啟動 60 秒輪詢；**dev 預設關閉**（R4：本機 dev 連正式庫，不能讓它偷偷處理正式事件）。
- **完成標準**：
  - [ ] 單元測試：parseEvents 會帶出 webhookEventId／isRedelivery（用假 payload）
  - [ ] 程式碼審查確認三條路徑：表存在→落地；表不存在→舊路徑；重送→冪等不重複
  - [ ] dev server 啟動後 log 中**沒有**輪詢啟動訊息（證明 dev 預設關）
  - [ ] build＋測試綠
  - [ ] 報告寫明部署順序：先貼 migration → 部署 → `.env.local` 加 `WEBHOOK_WORKER=1` → `docker rm -f` ＋ `docker run` 重建

### 10. G5 Connector 金鑰收成函式

- **目標**：日後一家公司一個 LINE 帳號（形態 B）時，不用大改。今晚只改介面，行為完全不變。
- **範圍**：`lineConnector` 單例改成 `createLineConnector(creds)` 工廠；`getConnector(channelId?)` 目前永遠回用 env 金鑰建的那一個（快取）。所有呼叫點改走 `getConnector()`。先 grep 列出所有 `lineConnector` 與 `process.env.LINE_CHANNEL` 使用處。
- **不做**：金鑰進 DB、多 channel 路由。
- **完成標準**：
  - [ ] `grep -rn "lineConnector\b" src` 只剩定義處與 config
  - [ ] 行為不變：既有測試全綠、build 綠
  - [ ] 若呼叫點太多（>20）或牽涉 middleware edge runtime 限制 → 標跳過，寫原因

### 11. A6 移除 callback 自動種子

- **目標**：`ADMIN_LINE_USER_ID` 登入就自動變 main owner 的後門拿掉。
- **範圍**：migration 以 SQL 種入 org_members(owner)——**但 migration 不能讀 env**，所以改成：migration 不動，改在 `scripts/new-org.ts` 旁加一個 `scripts/seed-owner.ts`（帶參數執行，早上由 jielin 跑）；callback 移除自動種子區塊。
- **風險**：jielin 本人若還沒在 org_members 裡，移除後會登不進後台。**必須先唯讀查詢正式庫確認 jielin 的 userId 已在 main 的 org_members**（用 `ADMIN_LINE_USER_ID` 比對，**不要印出 userId 本身**，只印 true/false）。查不到或無法查 → 本任務只寫好程式、**不 commit 移除那段**，改標跳過並在報告說明。
- demo 群拆 org 的部分**今晚不做**（牽涉搬正式資料）。
- **完成標準**：
  - [ ] 唯讀確認結果記在決策紀錄
  - [ ] build＋測試綠

### 12. A8 降級語意（C 層）

- **範圍**：migration 在 `org_settings` 加 `status text default 'active'`（active／suspended）；`aiScope`（B5 的 AI 入口門）遇 suspended 一律擋；後台頂端顯示 suspended 橫幅（用 Banner）。**不做**自動 leaveGroup、自動刪資料、私訊（全是不可逆或對外動作）。
- **完成標準**：單元測試 suspended 會擋 AI；build＋測試綠。

### 13. E1 抽取回歸集（C 層）

- **範圍**：`tests/fixtures/golden/` 三個行業（例如：餐飲門市、室內裝修、補習班——**不要用舞台技術**）各 30 則繁中虛構對話＋期望抽出的 events/tasks/notes JSON；`scripts/extract-eval.ts` 讀 fixture → 呼叫抽取 → 比對算假陽性率。**今晚只寫不跑**（R6）。不加進 `npm test`。
- **完成標準**：`npx tsc --noEmit` 綠；fixture JSON 合法；README 或腳本頂端註明怎麼跑、大約花多少呼叫次數。

### 14. A10 合約模板（C 層）

- **範圍**：`docs/legal/design-partner-agreement.md`，一頁：半價 6 個月、無 SLA、資料歸屬與匯出、LINE 條款變動時的遷移條款（business-plan 第 3、8 節）、終止與刪除。標明「草稿，簽約前請法律專業人士審閱」。
- **完成標準**：文件存在、≤ 1 頁 A4 份量、無宣稱「符合 LINE 規範」。

### 15. X1 報帳模組 v1（D 層）

- **目標**：員工出差先墊錢 → 在 LINE **私訊群記一張收據／發票照片** → 自動變成一筆報帳（金額、日期、店家、分類由 AI 讀）→ bot 回一句「記好了」→ 管理者在網頁看清單、補專案、勾「已報帳」、匯出 CSV。
- **為什麼這樣接（已查過程式，2026-09-25）**：
  - 群記本來就把每張圖丟給 Gemini（`src/providers/gemini.ts` 的 `geminiVision.analyze`），類別裡已有「收據發票」。**同一次呼叫多要幾個欄位**，不多花 AI。
  - 1:1 私訊已是「個人筆記」群（`dm:<userId>`，`src/core/ingest.ts` 的 `ensureDmGroup`）。只收 1:1：私訊給 bot＝本人明確說「這筆我墊的」；群組裡的收據可能是轉傳的報價，誰付的說不準。
  - 模組開關已有（`org_settings.modules`，migration 015）。報帳是第三個模組 `'expense'`。
- **範圍**：
  1. **migration（下一個可用編號）**：
     ```sql
     create table if not exists expenses (
       id uuid primary key default gen_random_uuid(),
       org_id uuid not null references orgs(id) on delete cascade,
       line_user_id text not null,          -- 誰墊的
       person_name text,                    -- 顯示用快照
       media_asset_id uuid unique references media_assets(id) on delete cascade, -- unique：重試不重複記；收回照片即刪（兌現告知）
       spent_on date not null,
       amount int not null check (amount >= 0),
       category text not null default '雜支',
       vendor text not null default '',
       note text not null default '',
       project text not null default '',    -- Snaptab 的「案場」，UI 叫「專案」
       invoice_no text not null default '',
       reimbursed_at timestamptz,           -- null＝還沒報
       created_at timestamptz not null default now(),
       updated_at timestamptz not null default now()
     );
     create index if not exists expenses_org_date on expenses (org_id, spent_on desc);
     alter table expenses enable row level security;
     update org_settings set modules = array_append(modules, 'expense')
     where org_id = default_org_id() and not ('expense' = any(modules));
     ```
  2. **AI 讀收據**：`geminiVision.analyze` 的圖片 prompt 加一個欄位 `"receipt"`：類別是收據發票時回 `{amount, date(YYYY-MM-DD), vendor, category, invoice_no}`，否則 null。`VisionProvider` 回傳型別（`src/core/types.ts`）加選填 `receipt`。正規化抽成純函式 `src/expense/receipt.ts` 的 `parseReceipt(raw, fallbackDate)`：金額去逗號/「元」轉整數、非正數→null；日期不合法或民國年→轉西元、失敗用訊息日期；分類不在清單→「雜支」；發票號只收 `^[A-Z]{2}\d{8}$`。
  3. **分類清單（跨行業，不照搬 Snaptab 的「加油／便當」）**：交通、餐飲、住宿、停車過路、材料耗材、雜支。常數放 `src/expense/receipt.ts`。
  4. **記一筆**：`ingest.ts` 的 `analyzeAsset` 解析完，若 `receipt` 有值 **且** `isDm(groupId)` **且** 該 org 開了 `'expense'` → insert expenses（`on conflict (media_asset_id) do nothing`）。`processMedia` 拿到結果後，若是 1:1 且有 replyToken → 回「🧾 記好了：9/25 餐飲 $320（店家）」＋一句「金額不對請跟管理者說」。重試路徑（`retryPendingMedia`）也會記，但不回覆。insert 失敗（表還沒建）只 `console.warn`，不影響媒體解析。
  5. **員工也能私訊**：現在 `ensureDmGroup` 只認 `org_members`（管理員）。加退路：不是 org 成員時查 `employees`（`status='active'`），且該員工的 org **有開 `'expense'`** 才開個人筆記。沒開報帳的公司行為完全不變（不會突然開始記員工私訊、燒 AI）。
  6. **模組接線**（照 README「介面架構」）：
     - `src/org/module-ids.ts`：`ModuleId` 加 `'expense'`（`enabledModuleIds(null)` 仍回 `['attend']`，`api-guard.test` 既有斷言不能動）
     - `src/app/o/[org]/routes.tsx`：`ModuleId` 型別加 `'expense'`；新增 `EXPENSE_MODULE`（base `/o/<slug>/expense`、ctxParam null），兩個 primary 項：`''` 清單、`/report` 報帳；`moduleOf` 認 `/expense` 前綴；加一個 `moduleById(id)` 取代 `nav.tsx` 的 `modOf` 與 `shell-header.tsx` 的三元判斷
     - `src/org/modules.ts`：模組清單加 `EXPENSE_MODULE`（平台擁有者也看得到）
     - `src/org/surfaces.ts`：`SurfaceId` 加 `'expense'`，org 有開就加「報帳管理」面向（rank 4.5）；平台擁有者的預設 org 模組集合加 `'expense'`
     - `src/app/platform/page.tsx`：有開就多一顆「報帳後台」按鈕
  7. **頁面**：`src/app/o/[org]/expense/layout.tsx`（比照 `attend/layout.tsx`：`orgAdminAccess` ＋模組沒開就 404 ＋ ShellHeader/BottomNav）
     - `expense/page.tsx` 清單：篩選（未報／已報／全部、人、專案、月份），每列：日期、人、分類、店家、金額、專案（可改）、照片縮圖（用 `media_assets` 簽名網址，參考 `src/core/media.ts`）、「已報帳」切換。用 `src/app/ui/` 的 Badge／Empty／Banner／StatGrid，狀態色只用 ok/warn/err/neutral。
     - `expense/report/page.tsx`：選專案或月份 → 依分類加總、依人加總、合計；「匯出 CSV」按鈕。
  8. **API**（都用 `orgAdminAccess`，查詢一律綁 `org_id`）：`src/app/api/expense/update/route.ts`（改金額/分類/店家/專案/備註、切換已報帳、刪除）、`src/app/api/expense/export/route.ts`（CSV，UTF-8 BOM，比照 `api/attend/export` 的 `esc/row` 寫法；欄位照 Snaptab `lib/export.ts`：日期、分類、店家、用途、金額、發票號碼、專案、報帳狀態、人）。`api-guard.test.ts` 白名單加 `'expense/'`（合法擴充，commit 訊息講明它用 `orgAdminAccess` 把關）。redirect 一律 `oh(slug, …)`。
  9. **不用新依賴**（R7）：匯出用 CSV 不用 xlsx。
- **不做（留給 X2）**：網頁上手動記一筆、QR 掃發票、語音、GPS、統計圖、自訂分類、付款方式。
- **完成標準**：
  - [ ] `tests/expense.test.ts`：`parseReceipt` 至少涵蓋 `"1,280元"`→1280、`0`/負數/亂字→null、民國 `113/09/25`→`2024-09-25`、壞日期→用 fallback、未知分類→雜支、發票號格式
  - [ ] 三支守門測試＋全部測試綠；typecheck、build 綠
  - [ ] dev server 只看畫面：`/o/main/expense` 與 `/report` 能開（表還沒建時頁面顯示「請先執行 migration」而不是 500）；手機 375px 不破版
  - [ ] 報告註明：要貼的 migration 檔名；部署後「用員工 LINE 私訊一張收據」的驗收步驟

### 16. X2 報帳模組 v2：Snaptab 完整搬家（D 層）

- **前置**：X1 完成。每個子項獨立 commit，做不到的標 ⏭ 不影響其他子項。
- **子項**（對照 Snaptab 檔案）：
  1. **員工網頁記一筆**（`components/AddView.tsx`）：員工在 LIFF 開「我的報帳」頁（放在打卡面向 `/a` 底下，或 surfaces 加「我的報帳」——選改動最小的），大字金額＋數字鍵盤、分類快選、專案（記住上次）、付款方式、備註、拍照上傳（存 `MEDIA_BUCKET`）。存完金額歸零、專案保留。員工只看得到／改得到**自己的**（身分從 session 反查，絕不信表單傳來的人）。
  2. **我的清單**（`ListView.tsx`、`EditExpenseModal.tsx`、`PhotoLightbox.tsx`）：依專案分組＋小計；已被管理者標「已報帳」的鎖定不能改。
  3. **付款方式**（`lib/types.ts` 的 `PaymentMethod`）：migration 加 `pay_method text default '代墊'`（代墊／公司卡／現金）；報帳頁與 CSV 拆「代墊請款／公司卡核銷／現金」小計。
  4. **自訂分類**（`CategoryManager.tsx`）：org 層級，存 `org_settings` 一個 `expense_categories text[]` 欄位（null＝用預設六類）；管理頁可增刪排序。AI 的分類 prompt 改用該 org 的清單。
  5. **統計**（`AnalyticsView.tsx`）：月份 × 分類、專案 × 人的加總表；圖只用 CSS 長條，不裝圖表套件。
  6. **文字／語音記帳**：1:1 裡傳「午餐 120」或講一段語音 → 同樣記一筆（語音已會轉逐字稿）。只在訊息明顯是「品項＋金額」時觸發（純函式＋單元測試：`午餐 120`、`停車費150元` 要中；`明天 3 點開會` 不能中）。
  7. **地點**（`lib/location.ts`、`PlacePicker.tsx`）：網頁記一筆時用瀏覽器 `navigator.geolocation` 存座標；**不串** Google 反查地名（會花錢，R6），地名手填。
- **需要 jielin 決定、今晚一律跳過並寫進報告**：
  - **QR 掃電子發票**（`lib/invoice.ts`、`QRScanner.tsx`）：Snaptab 用 `jsqr` 套件＝新依賴（R7）。報告裡問：要加 `jsqr`，還是只靠 AI 讀照片？`lib/invoice.ts` 的解析邏輯本身是純程式，可先搬成 `src/expense/invoice.ts`＋測試（不含掃描）。
  - **Snaptab 舊資料搬過來**：資料在 Firebase（專案 `snaptab-wh`），要讀正式 Firestore＝外部存取。只寫一份搬移步驟說明，不寫程式不執行。
- **完成標準**：每個做完的子項都有測試（有邏輯的）或 dev server 畫面確認（純 UI 的）；守門測試＋全部測試＋typecheck＋build 綠。

---

## 4. 收尾（所有任務處理完後）

1. 跑一次完整 `npm test`、`npm run typecheck`、`npm run build`，結果貼進第 6 節。
2. 把新 migration 依編號列在第 6 節，並產生一個合併檔 `scratchpad` 以外、放在 `supabase/migrations/` 的各自檔案即可（不另外合併，避免重複來源）。
3. 更新 `docs/business-plan.md` 對應項目的狀態標記（✅／◐），格式照既有「✅ **已完成 2026-09-26**（…）」寫法。
4. 填第 6 節早晨報告，commit：`文件：夜間執行報告`。
5. **不 push、不部署。**

---

## 5. 進度回寫區（agent 每個任務更新）

**目前狀態**：尚未開始
**最後更新**：—
**起始 commit**：`de67eae`

| 順序 | 代號 | 狀態 | commit | 開始 | 結束 | 一句話結果 |
|---|---|---|---|---|---|---|
| 1 | A9 | ⬜ | | | | |
| 2 | P1 | ⬜ | | | | |
| 3 | G7 | ⬜ | | | | |
| 4 | G8 | ⬜ | | | | |
| 5 | A7 | ⬜ | | | | |
| 6 | L1 | ⬜ | | | | |
| 7 | G3 | ⬜ | | | | |
| 8 | B7 | ⬜ | | | | |
| 9 | G4 | ⬜ | | | | |
| 10 | G5 | ⬜ | | | | |
| 11 | A6 | ⬜ | | | | |
| 12 | A8 | ⬜ | | | | |
| 13 | E1 | ⬜ | | | | |
| 14 | A10 | ⬜ | | | | |
| 15 | X1 | ⬜ | | | | |
| 16 | X2 | ⬜ | | | | |

狀態圖例：⬜ 未開始／⏳ 進行中／✅ 完成／⏭ 跳過（寫原因）／❌ 失敗（寫原因）

### 決策紀錄（自行判斷的事都記這裡）

| 時間 | 任務 | 決定 | 理由 |
|---|---|---|---|
| | | | |

### 發現但沒做的事（R8：不順手做，記下來給 jielin）

- 

---

## 6. 早晨報告（收尾時填寫）

### 一句話

（例：14 項做完 11 項、跳過 3 項；測試全綠；你需要貼 4 段 SQL、改 1 個環境變數、部署一次。）

### 你醒來要做的事（照順序）

1. 看這份報告與 `git log de67eae..HEAD --oneline`
2. 到 Supabase SQL Editor 依序貼：（列出檔案路徑）
3. （若有）執行：（一字不差的指令）
4. 部署（照 NAS 部署流程）
5. `git push`

### 測試結果

- npm test：
- typecheck：
- build：

### 各任務結果

（每項一到兩行）

### 風險與注意

（例：G4 需要 `WEBHOOK_WORKER=1` 才會補處理；B7 計時器重啟會掉）
