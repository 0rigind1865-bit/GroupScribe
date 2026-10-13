# GroupScribe（群記）架構導覽

> 給新加入的人：10 分鐘看懂這個專案在做什麼、程式怎麼流、資料放哪、權限怎麼守、怎麼部署。
> 2026-10-10 依程式碼盤點整理。細節以程式與 README 為準；標 ⚠ 的是尚未驗證、或文件與程式對不上的地方。
> 設計決策「為什麼」請看 `docs/plan.md`（B 節定案、E 節約束）與 `docs/principles.md`；介面細節看 README「介面架構」。本文件不重複那些內容。

---

## 1. 一句話

群記是一個安靜待在 LINE 群組裡的助理：**收訊息 → 存進 Supabase → 交給 Gemini 讀圖／PDF／語音並建向量索引 → 抽出行程、待辦、公告 → 管理員在「把關」頁確認後才算數**。
同一個 Next.js 服務上另外掛兩個多租戶模組：**考勤**（GPS 打卡＋勞基法薪資）與**報帳**（員工 1:1 私訊收據、打字或語音記帳）。

規模（2026-10-09）：`src/` 238 檔、約 2.5 萬行；API route 46 支；頁面 41 個；測試 20 支；259 個 commit（2026-07-31 起）。

**最重要的前提：整個系統跑在單一個長期運行的容器裡。** 很多鎖與快取只存在記憶體（§10.2）。多實例或會自動休眠的平台會讓它壞掉。

---

## 2. 只看 5 個檔案

| 順序 | 檔案 | 看什麼 |
|---|---|---|
| 1 | `README.md` | 產品、自架與部署、介面架構（路由表、身分列、元件對照）、考勤、客戶上手流程 |
| 2 | `src/core/ingest.ts`（先看 30 行的 `src/app/api/webhook/line/route.ts`） | webhook 之後發生的所有事：事件分派、未認領群、個人筆記、媒體處理、@ 問答、報帳掛勾、建索引 |
| 3 | `src/core/extract.ts` | 產品核心：抽取 prompt、租約與原子認領、去重，以及「AI 只提供線索，人做決定」怎麼落實 |
| 4 | `src/org/orgs.ts`（配合 `src/middleware.ts`） | 多租戶隔離與授權的唯一入口：`gsAccess`、`moduleAccess`、`requireModule` |
| 5 | `supabase/schema.sql` | 資料模型。⚠ 只寫到 migration 020，021 之後要搭配 `supabase/migrations/` 看 |

備選：`src/app/o/[org]/routes.tsx`（介面全貌）、`docs/principles.md`（為什麼這樣設計）、`src/core/quota.ts`（AI 費用煞車）、`src/org/surfaces.ts`（一個人有哪些身分）。

---

## 3. 技術棧

| 項目 | 內容 |
|---|---|
| Next.js 15.5（App Router） | `output:'standalone'`；Edge middleware；`after()`（回 200 之後再做事）；`instrumentation.ts`。dev 寫 `.next-dev`，可用 `NEXT_DIST_DIR` 覆寫，避免弄壞正式 `.next` |
| React 19、TypeScript 5.9 strict、Tailwind v4 | 預設 server component；client component 只用在 LIFF、地圖、換頁、導覽、報帳 App |
| Supabase | **只在伺服端用 service role**（`src/db.ts`），前端不直連、沒有 anon key。Postgres＋pgvector（`vector(768)`、HNSW cosine、RPC `match_embeddings`）。私有 Storage bucket `media`，讀取一律產生 1 小時簽名網址 |
| Google Gemini | 直接打 REST，沒裝 SDK（`src/providers/gemini.ts`）。`generateContent` 處理文字、JSON 模式與 Vision（圖片、PDF、語音都用 inline_data）；`batchEmbedContents` 產 768 維向量。預設 `gemini-3.5-flash-lite`＋`gemini-embedding-001` |
| LINE | Messaging API 直接 fetch（`src/connectors/line.ts`）；LIFF SDK v2 從 CDN 載；LINE Login 走 OAuth code flow |
| 其他依賴 | `quickjs-emscripten`（薪資自訂腳本沙箱）、`jsqr`（掃發票 QR）；CDN 載 Leaflet＋OpenStreetMap 圖磚（打卡地圖，**不是 Google Maps**） |
| 測試 | Node 內建 `node:test`，`npm test`＝`tsx --test tests/*.test.ts`；`npm run typecheck`。沒有 lint；⚠ repo 內沒有 CI 設定 |
| 時區 | 伺服器要設 `TZ=Asia/Taipei`（txt 匯入用伺服器時區解讀時間） |

---

## 4. 目錄地圖

### 4.1 頂層

| 路徑 | 職責 |
|---|---|
| `src/` | 全部應用程式碼 |
| `supabase/` | `schema.sql` 新裝機基底；`migrations/` 增量 SQL（002–034） |
| `tests/` | 單元測試＋守門測試；`fixtures/golden/` 三份跨行業抽取回歸題目 |
| `scripts/` | 營運與開發 CLI、品牌素材產生器。**不進 Docker 映像** |
| `docs/` | 計劃、設計原則、商業計劃、夜間執行紀錄、法務草稿、品牌圖、截圖 |
| `public/` | `brand/`、`shots/`、`expense-sw.js`（報帳頁離線快取 Service Worker） |
| `Dockerfile`、`.dockerignore` | 兩階段 standalone 容器（§10.1） |
| `fly.toml` | ⚠ Fly.io 設定，推論目前沒在用；但註解記錄的不變條件（不可自動停機、單一實例）適用任何部署 |
| `.next*` | 建置輸出：`.next` 給 start、`.next-dev` 給 dev、`.next-verify` 驗證用、`.next-old` 殘留 |

### 4.2 `src/`

| 路徑 | 職責 |
|---|---|
| `core/` | 平台無關的核心：事件分派與落地、切塊建向量、結構化抽取、問答、群組理解、檔案分類、合批排程、AI 額度、設定、每日摘要、LINE 身分驗證 |
| `connectors/` | 訊息來源插件，目前只有 `line.ts` |
| `providers/` | AI 插件，目前只有 `gemini.ts`（同時實作 LLM、Vision、Embedding 三介面） |
| `org/` | 多租戶：授權唯一入口 `orgs.ts`、模組開關、身分清單 `surfaces.ts`、方案 `plans.ts`、推薦獎勵、連結產生器 `href.ts` 的 `oh()` |
| `attend/` | 考勤：每日打卡判定、薪資引擎（結構化規則＋QuickJS 沙箱）、規則版本、台灣假日、五語系 |
| `expense/` | 報帳：收據正規化、文字／語音記帳解析、分類、CSV、發票 QR、離線暫存。大多是純函式 |
| `app/` | Next.js 頁面、API、共用 UI（§4.3） |
| `db.ts`、`http.ts`、`middleware.ts`、`instrumentation.ts` | Supabase 單例；反向代理後可用的 redirect／publicBase／防開放跳轉；cookie 簽章驗證與改寫；啟動時的 webhook 補處理輪詢 |

### 4.3 `src/app/`

| 路徑 | 給誰 |
|---|---|
| `api/` | 46 支 route handler（§6.4） |
| `o/[org]/` | **管理端**。`(admin)/` 群組助理、`attend/` 考勤、`expense/` 報帳；`routes.tsx` 是全站唯一路由表 |
| `g/` | 群組成員在 LINE 裡看的版本（LIFF）；`liff-init.tsx` 是 LIFF 開機 |
| `a/` | 員工在 LINE 裡用的：打卡、紀錄、補卡、加入公司、我的報帳 |
| `ui/` | 共用元件：導覽外框、狀態元件、官網區塊、報帳元件；狀態色只有 `tone.ts` 的 ok／warn／err／neutral |
| `about/`、`privacy/`、`terms/` | 官網、隱私權政策、服務條款（後兩者標為草稿）。**`/about` 才是官網；`/` 是依身分分流的路由器** |
| `start/`、`login/`、`claim/[groupId]/`、`invite/[slug]/`、`go/[key]/`、`r/[code]/`、`platform/` | 自助建組織、登入、群組認領、管理員邀請、身分切換跳轉、推薦連結、平台總控台 |

---

## 5. 一則訊息的旅程

### 5.1 入口：驗簽 → 先落地 → 回 200 → 背景處理

```
LINE 平台 POST /api/webhook/line
→ src/app/api/webhook/line/route.ts  POST()
→ src/connectors/line.ts verifyWebhook()     HMAC-SHA256（LINE_CHANNEL_SECRET），失敗 401
→ src/core/ingest.ts getChannelId()
→ src/core/webhook-store.ts landWebhook()    upsert webhook_events（webhook_event_id 去重）
→ 立刻回 200；以下在 after() 裡執行：
   → app_settings.last_webhook_at 心跳（設定頁靜默 >6 小時會警示）
   → processPendingWebhooks()
        → rpc claim_webhook_events(50)       skip locked、10 分鐘租約、最多重試 5 次
        → line.ts parseEvents() → ingest.ts handleEvent() → 標 processed_at
        → src/core/schedule.ts scheduleExtract(groupId)
另一條路：src/instrumentation.ts → 正式環境且 WEBHOOK_WORKER=1 時，每 60 秒輪詢補處理
```

### 5.2 `handleEvent` 依事件分派（`src/core/ingest.ts`）

- **follow** → 把 1:1 聊天室當成 `dm:<userId>` 這個群，歸到本人所屬的 org；不屬於任何公司只回說明、不記錄。
- **join** → upsert `groups`、補群名頭貼 → 沒公司認領：只回認領連結（`/claim/<gid>?t=<HMAC>`）；已認領：發隱私告知、寫 `consent_log`。7 天沒人認領的群由每日 `/api/digest` 自動退出。
- **leave** → 寫 `groups.left_at`。
- **unsend** → 刪 embeddings、Storage 原檔、messages；引用到它的 events／tasks／notes 改回「待確認」。
- **message** → `handleMessage`（§5.3）。

### 5.3 一則訊息：`handleMessage`

1. 1:1 私訊：只有問句（句尾問號或「查／找」開頭）才當成被 @。
2. 群還沒被認領：完全不落地。
3. 取發言者名稱、補群名。
4. `isLowInfo()` 標記「好」「收到」、貼圖 → insert `messages`（23505＝LINE 重送或媒體重試：該抓的媒體還沒有 asset 才繼續，只補媒體）。
5. 被 @ → `src/core/query.ts answer()` → reply，尾端附 LIFF 連結。
6. 圖片／PDF／語音 → `processMedia()`：抓檔（LINE 回 202 轉檔中就查準備狀態、最多等 12 秒）→ Storage `media/<groupId>/<messageId>` → insert `media_assets` → `analyzeAsset()` → Gemini Vision → 建索引 → `status=done`。抓檔到建 asset 之前失敗丟 `MediaFetchError`，整個 webhook 事件留在隊列等租約到期重抓（沒有 pending asset 可給重試接手）；解析失敗才留 pending 給 `retryPendingMedia()`。1:1 收據走 `recordReceipt()`；語音逐字稿交給 `recordTextExpense()`，沒記成一筆就把逐字稿 reply 給本人（`heardReply()`）。
7. 1:1 文字且不是問句 → `recordTextExpense()`，記到就回一句。1:1 的回覆走 `notify()`：reply 失敗（token 過期）改 push；重試路徑補記成功也 push（`pushDm()`）。
8. 有資訊量的文字 → `indexText('message')` → embed → insert `embeddings`。

### 5.4 抽取（合批後才跑）

```
scheduleExtract(gid)          群組安靜 45 秒才跑；一直有人講話最多每 3 分鐘跑一次（src/core/debounce.ts）
→ retryPendingMedia(gid)      每輪最多 3 筆；同檔最多重試 3 次；撞 429 就停
→ extractGroup(gid)           記憶體 running 鎖 → aiScope → 反覆 extractBatch 直到一批不滿 50 則
   → 撈未抽取且沒有效租約的 50 則 → 原子認領（messages.claimed_at）
   → 篩進 prompt 的訊息（低資訊只放行「好／OK」類確認語）＋前文 20 則
   → 既有 events/tasks/notes 各最多 60 筆（標 ✓已確認 或 ⚠待確認）＋近 30 天被忽略的當負面樣本
   → 改用 M/E/T/N 短代號（LLM 會抄錯 UUID）→ 注入群組理解 getProfile()
   → getLLM().generateJson() → parseOps() 驗證 → 濾過期與陳舊 → dropDupes()
   → 寫入：新增照寫；update 一律 needs_confirmation=true、edited_by='ai'
   → finishClaim() 寫 extracted_at（LLM 失敗則回滾認領，下次自動補抽）
   → 群組理解超過 7 天自動重跑 profileGroup()
```

手動匯入與 `/api/extract` 不經合批，直接呼叫 `extractGroup`。

### 5.5 記帳分支（`src/expense/`，只收 1:1 私訊）

- **收據照**：同一次 Vision 呼叫順便回收據欄位 → `parseReceipt()` 正規化 → 重複檢查（有發票號比號碼；沒有就比同人同日同店同金額）→ upsert `expenses`（onConflict `media_asset_id`，重試不重複記）。
- **文字／語音逐字稿**：`parseTextExpense()` 規則式（品項＋金額、單價×數量）→ 規則看不懂才 `expenseByAi()` 問 AI 並判斷是不是記帳 → 單價／總價都說得通時 `eachPriceByAi()` 用常識挑 → `classifyNote()` 本地關鍵字分類（免費）→ 猜專案、地點 → `withV2Fallback()` upsert → 回覆附 `/a/expense` 連結。
- **網頁記帳**（不走 webhook）：`src/app/a/expense/` → `src/app/api/liff/expense/*`，身分由 `src/expense/mine.ts` 反查。

### 5.6 問答（`src/core/query.ts`）

把問題 embed → 範圍：群組只查本群；1:1 查「本人筆記＋`myGroups()`」（是否還在群裡以 LINE 群成員 API 為準）→ 每群 `match_embeddings`＋`confirmedFacts()`（已確認項目是權威資料）→ `rankHits()` 相似度×時間衰減（問「最新」半衰期 7 天，一般 60 天）→ 前 8 筆 → 注入群組理解 → `generate()`。

### 5.7 所有 AI 呼叫的共同關口

```
src/core/quota.ts aiScope(groupId, fn)
→ orgOfGroup() → orgAiBudget()   讀 org_settings 的方案、到期日、停權、月額度＋org_usage 本月用量
→ 停權／到期超過寬限／額度用完：丟 QuotaError（訊息照存，只暫停整理）
→ 否則把 orgId 放進 AsyncLocalStorage
→ src/providers/gemini.ts post()   所有 Gemini 呼叫的唯一出口
   → refreshSettings()（30 秒 TTL）→ fetch → bump_usage（全站按日）＋ bump_org_usage（按 org 按月）
```

呼叫 `aiScope` 的地方：`core/{extract,indexer,query,ingest,profile,files}.ts`、`expense/record.ts`。

### 5.8 不在 webhook 路徑上的觸發點

| 功能 | 怎麼觸發 |
|---|---|
| 檔案分類 `core/files.ts` | 只由檔案頁按鈕 → `/api/files/classify`（控制費用，不自動跑） |
| 群組理解 `core/profile.ts` | 抽取時自動（超過 7 天），或 `/api/profile` 手動 |
| txt 匯入 `core/importer.ts` | `/api/import`；只有近 30 天的訊息排進抽取，更早只建索引 |
| 每日摘要 `core/digest.ts` | cron 打 `/api/digest`；一人一天一則 1:1 推播 |

---

## 6. 身分與權限

### 6.1 Cookie

| Cookie | 代表誰 | 怎麼取得 | 簽章金鑰／效期 |
|---|---|---|---|
| `gs_auth` | 平台擁有者 | `/api/login` 密碼；或 `ADMIN_LINE_USER_ID` 那個帳號走 LINE 登入時一併發 | `ADMIN_PASSWORD`；30 天 |
| `gs_liff` | 任何 LINE 使用者 | LIFF：`liff-init.tsx` 拿 ID token → `/api/liff/session`。電腦：`/api/auth/line` OAuth → callback | `SESSION_SECRET`（沒設依序退回 LINE_CHANNEL_SECRET、ADMIN_PASSWORD）；7 天 |
| `gs_oauth_state`、`gs_next` | LINE Login 流程 | `/api/auth/line` | 10 分鐘 |
| `gs_surface`、`gs_last_*`、`gs_back_*` | 記住上次身分 | `/go/[key]` | 1 年／12 小時 |
| `gs_ref`、`lang`、`theme` | 推薦碼、語系、外觀 | `/r/[code]`、`/api/attend/lang`、`/api/theme` | — |

### 6.2 三層驗證

1. **middleware**（`src/middleware.ts`）只驗簽章與效期，**不查 DB**；沒登入就改寫到 `/login`。
2. **server component**：`visibleModules`、`moduleGate`、`requireModule` 查 `org_members`、`org_settings.modules`、`org_members.modules`。**每一頁都要自己呼叫 `requireModule`**，layout 的檢查只算 UX（偽造 RSC 請求可以跳過 layout，2026-09-26 實測）。
3. **API**：`gsAccess`、`moduleAccess`、`activeEmployee`、`isGroupMember`，而且每個查詢再綁 `org_id` 或 `group_id`。

非成員一律 404，不透露 org 是否存在。**所有表都開了 RLS 但沒有任何 policy**；service role 會略過 RLS，所以租戶隔離完全靠應用層——這就是守門測試存在的理由。

### 6.3 路由分群

| 路由 | 給誰 | 驗證 |
|---|---|---|
| `/o/[org]/(admin)/…` 群組助理 | 平台擁有者；被授權 `gs` 模組的管理員 | middleware → `o/[org]/layout.tsx` `visibleModules` → `(admin)/layout.tsx` `moduleGate('gs')` → 每頁 `requireModule`。API 走 `gsAccess` |
| `/o/[org]/attend/…`、`/o/[org]/expense/…` | 被授權該模組的管理員 | 同上，各自 layout `moduleGate`；API 用 `moduleAccess(slug, 模組)` |
| `/a`、`/a/records`、`/a/adjust`、`/a/join` | 員工（五語系） | middleware 不攔。`liffUser()`，身分來自 `employees`；打卡／補卡 API 用 `activeEmployee` |
| `/a/expense` | 員工或有報帳權限的管理者 | `liffUser`＋`myExpenseIdentity`，沒身分 404 |
| `/g`、`/g/[groupId]` | 群組成員（含外部協力） | `liffUser`＋`isGroupMember`（LINE 群成員 API 為準，快取 10 分鐘） |
| `/` | 所有人 | 身分路由器：一種身分直接進；多種顯示選單或記住上次；沒登入跑 LIFF 開機 |
| `/login`、`/start`、`/claim/[groupId]`、`/invite/[slug]`、`/r/[code]` | 管理員、新客戶、認領者、被邀請者、推薦訪客 | 密碼或 LINE 登入；`liffUser`；HMAC token（邀請 72 小時） |
| `/platform` | 平台擁有者 | `isPlatformOwner()`，否則 404 |
| `/about`、`/privacy`、`/terms` | 公開 | middleware 放行 |

**陷阱**：公開路由要加進 `src/middleware.ts` 的 `matcher` 放行清單，否則會被改寫成 `/login` 並回 200 HTML——看起來像成功。新增公開路由要同時改 matcher 與 api-guard 白名單。

### 6.4 API 依驗證方式分組

- **`gsAccess`**：`events/update`、`tasks/update`、`notes/update`、`batch`、`extract`、`process`、`reindex`、`profile`、`files/classify`、`group/{claim,delete,update}`、`import`、`settings`。
- **`moduleAccess`**：考勤 `attend/{employee,export,finalize,location,location/search,review,rules}`；報帳 `expense/{categories,export,update}`。
- **員工 LIFF**：`attend/{punch,adjust}`（`activeEmployee`）、`attend/join`（`liffUser`＋加入碼）。
- **成員 LIFF**：`liff/{item,subscribe}`（`liffUser`＋`isGroupMember`）、`liff/session`（驗 ID token）。
- **報帳 LIFF**：`liff/expense/{add,categories,mine,nearby,project}`（`myExpenseIdentity`）。
- **登入／組織／平台**：`login`、`auth/line`、`auth/line/callback`、`org/create`、`org/invite`、`platform/plan`。
- **營運**：`webhook/line`（LINE 簽章）、`digest`（`CRON_SECRET` 或 gs_auth）、`health`（公開）。

---

## 7. 資料庫

### 7.1 資料表（依用途）

- **訊息與知識**（以 `group_id` 為鍵，群組是資料主權與刪除的邊界）：`channels`、`messages`（低資訊旗標、抽取游標、租約）、`media_assets`、`embeddings`（768 維、記 model_id）、`consent_log`、`groups`（`org_id` 是**群組屬於哪家公司的唯一依據**）、`groups_view`、`events`／`tasks`／`notes`（`needs_confirmation`、`source_message_ids`、`edited_by`）、`task_claims`、`push_subscriptions`。
- **租戶與方案**：`orgs`（預設 `main`、`unclaimed`）、`org_members`（role、modules）、`org_settings`（模組、方案、上限、到期、停權、進群告知、加入碼、報帳分類）、`org_usage`、`referrals`。
- **全站與營運**：`app_settings`（只有 id=1：心跳、AI 模型、免費層上限）、`api_usage`、`webhook_events`、`funnel_events`、`schema_migrations`（由 `scripts/migrate.sh` 建）。
- **考勤**：`employees`、`punch_locations`、`punch_records`（只存有效的卡）、`adjustment_requests`（核准後才寫成打卡）、`holidays`、`salary_rule_sets`（只增不改）、`payroll_snapshots`。
- **報帳**：`expenses`、`expense_projects`。
- **RPC**：`match_embeddings`、`bump_usage`、`bump_org_usage`、`claim_webhook_events`、`default_org_id`。

### 7.2 Migration 索引

| 編號 | 主題 |
|---|---|
| 002–005 | groups／notes 重建；進群告知；群組理解 `groups.profile`；一次性清理 |
| 006–011 | `api_usage` 用量；`media_assets.project`；`edited_by`；摘要訂閱＋抽取租約＋心跳；linter 修正；AI 設定欄位 |
| **012** | **多租戶地基**：`orgs`、`org_members`、`org_settings`；groups／channels 加 `org_id` |
| 013–014 | 考勤五表；薪資規則與月結快照 |
| 015–019 | 模組開關；`unclaimed` org；方案欄位；`org_usage`；個人筆記排除 `dm:%` |
| 020–021 | embeddings 的 group_id 索引；漏斗事件 |
| 022–023 | 報帳 v1、v2（付款方式、照片、座標、地點、自訂分類） |
| 024 | `webhook_events` 先落地＋`claim_webhook_events()` |
| 025–030 | 內容表加 `org_id` 觸發器（為 RLS 鋪路，程式未讀）；停權；`spent_at`／專案／分類圖示；按模組授權；推薦獎勵；申請核銷 |
| ⚠ 031–033 | 缺號，git 歷史也查不到 |
| 034 | `task_claims` |

### 7.3 要知道的事

- ⚠ **`schema.sql` 只回寫到 020**，021–034 的表與欄位不在裡面（違反 `docs/plan.md` E 節）。新裝機：先跑 `schema.sql`，再用 `scripts/migrate.sh` 補 021 之後。
- **向後相容鐵則**：migration 還沒跑時程式也要能動。實作例：`expense/store.ts withV2Fallback`、`org/module-ids.ts isMissingModulesColumn`、`core/quota.ts isSuspended`、`core/webhook-store.ts shouldFallback`。
- 媒體沒有 `group_id` 欄位，經 `messages` 間接歸屬。
- Storage 路徑 `media/<groupId>/<messageId>`；網頁上傳的收據走 `expenses.photo_path`。

---

## 8. 環境變數（只列名稱）

| 變數 | 用途 |
|---|---|
| `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` | Supabase；service role 會略過 RLS，只能在伺服端 |
| `LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN` | 驗 webhook 簽章；reply／push／抓媒體／群成員 API |
| `LINE_LOGIN_CHANNEL_SECRET`、`LIFF_ID` | 管理員 LINE Login；LIFF app（前段＝Login channel ID）。**Login channel 必須和 Messaging API 在同一個 Provider 下**，否則 userId 對不上 |
| `LINE_BOT_BASIC_ID` | 上手卡「加好友」按鈕 |
| `SESSION_SECRET` | `gs_liff`、認領 token、邀請 token 的 HMAC 金鑰；middleware 與 liff.ts 必須一致 |
| `ADMIN_PASSWORD`、`ADMIN_LINE_USER_ID` | 平台擁有者密碼（同時是 `gs_auth` 金鑰，改密碼＝全部登出）；哪個 LINE 帳號是擁有者 |
| `CRON_SECRET` | `/api/digest?key=`（沒設退回 ADMIN_PASSWORD） |
| `APP_BASE_URL` | 對外網址：認領連結、分享預覽、OAuth redirect_uri（代理沒轉發 host 時必設） |
| `DEFAULT_ORG_SLUG` | 預設 org（預設 `main`） |
| `GEMINI_API_KEY`、`GEMINI_MODEL`、`EMBEDDING_MODEL_ID` | Gemini 金鑰與模型（模型優先序：DB `app_settings` → 環境變數 → 程式預設；金鑰永遠不進 DB） |
| `LLM_PROVIDER`、`VISION_PROVIDER`、`EMBEDDING_PROVIDER`、`CONNECTOR` | 選插件，目前各只有 gemini／line |
| `GOOGLE_MAPS_API_KEY`、`PLACES_MONTHLY_CAP` | Google Places API（打卡地點搜尋、報帳附近地點；伺服器代理，金鑰不出伺服器）；每月上限 |
| `DEMO_MODE`、`WEBHOOK_WORKER` | 示範群組放行（截圖用）；正式環境開 webhook 補處理輪詢 |
| `TZ` | `Asia/Taipei` |

`scripts/*.ts` 大多自己解析 `.env.local`，所以**會連到正式庫**（`extract-eval.ts` 例外）。`scripts/migrate.sh` 另需 `SUPABASE_DB_URL` 或 `SUPABASE_ACCESS_TOKEN`；`scripts/backup.sh` 用 `BACKUP_DIR`、`KEEP_DAYS`。

---

## 9. 測試與守門

全部 `npm test`，不連 DB、不打外部 API。內容是純函式測試、**掃原始碼的守門測試**、用 react-dom/server 渲染元件。

### 9.1 守門測試（不得為了讓它過而改它的判斷邏輯）

| 測試 | 守什麼 |
|---|---|
| `routes.test.ts` | `src/app/o` 與 `core/links.ts` 不得有缺 `/o/<slug>` 前綴的絕對連結；`oh()` 行為 |
| `colors.test.ts` | `src/app` 用到的色彩 class 在 `globals.css` 深色區塊都要有對照；indigo／teal 不得復活 |
| `i18n.test.ts` | 五語系 key 一致、參數不漏、不得空翻譯 |
| `api-guard.test.ts`（28 項） | 群組助理 API 必須呼叫 `gsAccess`；考勤／報帳 API 不得直接用 `orgAdminAccess`；管理端每頁要 `requireModule`；成員頁不得出現「後台」、`ADMIN_LINE_USER_ID`、userId；除根 layout 外不得含 `dangerouslySetInnerHTML`（連註解都算）；收件匣「全選」不得超出本公司 |
| `answer-scope.test.ts` | 問答每個查詢都綁 `group_id`；`match_embeddings` 要帶 `p_group_id`；1:1 的範圍只能從 `myGroups` 來 |

README 說「三支」（routes、colors、i18n）；`docs/identity-switcher-plan.md` R5 列五支（加 api-guard、answer-scope）。以五支為準。

### 9.2 其他測試

`core`（匯入解析、低資訊過濾、parseOps、dropDupes、rankHits…）、`expense`（29 項）、`attend`／`salary`（薪資黃金測試）／`sandbox`、`surfaces`＋`identity-bar`（七種角色）、`plans`（方案數字不得寫死）、`digest`、`debounce`、`webhook`、`funnel`、`referral`、`onboarding`、`eval`（三行業各 30 則回歸題目，不得有舞台技術）。

---

## 10. 部署與維運

### 10.1 容器

- `Dockerfile` 兩階段：builder `npm ci` → `npm run build`；runner 只複製 `.next/standalone`、`.next/static`、`public/`，`HOSTNAME=0.0.0.0`，跑 `node server.js`。HEALTHCHECK 每 60 秒打 `/api/health` 並**檢查 body 的 `ok`**（只看 200 會把登入頁當健康）。
- `.dockerignore` 排除 `node_modules`、`.next`、`.git`、`.env*`、`docs`、`tests`、`scripts`、`supabase`、`*.md`、`.claude`。**app 程式碼不得 import 這些資料夾**（本機 build 會過、容器 build 會 Module not found；台灣假日 JSON 因此搬進 `src/attend/`）。`.env*` 不進映像，用 `--env-file` 給。`scripts/` 不在容器裡，`migrate.sh`／`backup.sh` 在主機上跑。

### 10.2 單一長跑容器的前提：存在記憶體裡的狀態

多實例會失效、重啟會清空：`extract.ts` 並發鎖（跨進程靠 DB 租約）、`schedule.ts` 合批計時器（重啟時未到期的會遺失，等下一則訊息或手動抽取）、`ingest.ts`／`quota.ts`／`settings.ts`／`org/orgs.ts`／`liff.ts`／`line.ts` 各種 30 秒～10 分鐘快取、`auth.ts` 登入失敗節流、`liff/expense/nearby` 的 Places 月上限計數、`liff/expense/add` 離線補送去重。所以：不可自動停機、不可多實例。

### 10.3 正式環境實況（2026-10）

- 正式站＝自架 Debian NAS 上的 Docker 容器（`/opt/groupscribe`），對外經 Tailscale Funnel 固定 HTTPS；LINE webhook、LIFF Endpoint、Login Callback 都指向它。MacBook 另有一份備用，版本可能落後。
- 部署：`git archive HEAD` 解開 → rsync `src/ public/ supabase/ scripts/`（`--delete`）＋根層設定檔（`package.json`、`package-lock.json`、`next.config.mjs`、`postcss.config.mjs`、`tsconfig.json`、`Dockerfile`）→ `docker build` → `docker rm -f` → `docker run --env-file .env.local` → **`docker image prune -f`**。
  - 每次 build 會留下約 1.3GB 的懸空映像；2026-10-09 累積 171 個把 54G 系統碟塞滿、build 失敗。prune 已納入標準步驟。
  - 改 `.env.local` 後要 `rm -f`＋`run` 重建；`docker restart` 不會重讀 env-file。
  - 重啟那幾秒的 webhook 會漏接（不可回補）。build 失敗時 `&&` 中斷、舊容器照跑。
- cron（主機 root）：04:15 `scripts/backup.sh`（PostgREST 匯出 JSON＋逐檔下載媒體到 `/opt/groupscribe-backups`，預設保留 30 天）；07:30 打 `/api/digest`。
- Migration：NAS 沒有 DB 直連，DDL 貼 Supabase SQL Editor 執行。
- Tailscale Funnel 對 LINE 的 webhook 驗證偶爾 TLS 失敗；LINE 後台開 Webhook redelivery（程式有去重）。長期解法是 Cloudflare Tunnel（需自有網域）。

### 10.4 維運入口

| 入口 | 驗證 | 做什麼 |
|---|---|---|
| `GET /api/health` | 公開 | ping DB，回 `{ok}`（200／503） |
| `POST /api/process` | `gsAccess` | 本 org 卡在 pending 的媒體重新解析（最多 20 筆） |
| `POST /api/reindex` | `gsAccess` | 刪本 org 向量後全部重建（換 embedding 模型後要跑）。⚠ org slug 只從 Referer 取，curl 要帶 `Referer: …/o/<slug>/…` |
| `GET/POST /api/extract` | `gsAccess` | GET 未抽取則數；POST 手動抽取 |
| `POST /api/digest` | `?key=CRON_SECRET` 或 gs_auth | 每日摘要＋退出未認領超過 7 天的群 |
| 管理端設定頁 | 管理員 | webhook 心跳、Gemini 用量、LINE 推播額度、AI 模型（只有平台擁有者能改；`embedding_model` 沒有 UI，要手動 SQL 再 reindex） |

### 10.5 `scripts/`

`ask.ts`（不經 LINE 直接問答）、`extract.ts`（手動抽取）、`dedupe.ts`（預設只列出，`--apply` 才改）、`new-org.ts`（建租戶）、`seed-owner.ts`（指定 owner，取代已移除的登入後門）、`seed-demo.ts`、`seed-holidays.ts`、`migrate.sh`、`backup.sh`、`shots.ts`（截圖）、`intro-*.mjs`／`mark-dive*.mjs`（品牌素材）。⚠ `extract-eval.ts` 還不能跑（檔頭 TODO）。

---

## 11. 鐵則（濃縮，附出處）

**多租戶與權限**
- org 連結一律 `oh(slug, path)`（`src/org/href.ts`；routes.test 守門）。
- 群組助理 API 一律過 `gsAccess`；考勤／報帳 API 一律 `moduleAccess`，不准直接用 `orgAdminAccess`（`src/org/orgs.ts`；api-guard 守門）。
- 管理端每頁自己呼叫 `requireModule`，layout 只算 UX。
- 用 id 操作的端點再確認該項目的 `group_id` 屬於本 org。
- 員工與報帳身分一律從 LIFF session 反查，絕不信表單值（`src/attend/auth.ts`、`src/expense/mine.ts`）。
- 成員資格以 LINE 群成員 API 為準，發言紀錄只是備援。
- 問答一律綁 `group_id`（answer-scope 守門）。跨群聚合只放管理端。
- 群組屬於哪家公司唯一依據 `groups.org_id`。

**AI 與資料品質**
- AI 只提供線索：AI 改過的一律重設為需確認，已確認的值不得被舊對話蓋回去（`extract.ts`、`docs/plan.md` B.9）。
- 假陽性比假陰性貴；寧可漏記，不要誤記（`docs/principles.md`、`src/expense/text.ts`）。
- 所有 AI 入口先過 `aiScope`；所有 Gemini 呼叫只走 `post()`。
- 金鑰只走環境變數，絕不進程式碼或 DB。
- 產業無關：不得用開發者自己的產業當設計依據；範例與測試資料跨行業（`docs/plan.md` B.7、`tests/eval.test.ts`）。
- 語音轉寫提示裡不得放帶金額的例句（會被抄進逐字稿）。

**資料庫與相容**
- 增量 migration 上線後必須回寫 `schema.sql`（⚠ 021–034 未做）。
- 向後相容：migration 沒跑時程式也要能動。
- upsert 只寫自己負責的欄位（補群名時絕不碰人工設定的分類）。
- 時區 Asia/Taipei；月曆計算用 UTC。

**UI**
- 加一頁＝在 `routes.tsx` 加一行；共用元件放 `src/app/ui`；狀態色只有四種。
- 頁面不得有 `dangerouslySetInnerHTML`；身分列連結一律 `/go/…`；返回鍵用寫死路徑；方案數字一律來自 `PLAN_LIMITS`。

**部署與協作**
- 單一長跑實例，不可自動停機。程式不得 import 被 `.dockerignore` 排除的資料夾。
- 本機 dev 連的是正式庫；webhook 補處理只在正式環境開。
- 一律繁中；改完自動 commit；`git push` 要等使用者明確指示。不新增 npm 依賴（QuickJS 是唯一例外，理由在 `src/attend/sandbox.ts` 檔頭）。
- `ponytail:` 註解（全庫 43 則）＝刻意的簡化或延後，各自寫了上限與升級路徑；`grep -rn "ponytail:" src` 可列全部。

---

## 12. 已知不一致與待辦

1. `schema.sql` 未回寫 021–034；新裝機要另外說明（§7.3）。
2. migrations 031–033 缺號。
3. README 說守門測試已「變成 CI」，但 repo 內沒有 CI 設定；守門測試「三支／五支」兩種說法。
4. `fly.toml` 推論沒在用；`Dockerfile` 與 `next.config.mjs` 的註解仍寫「Fly.io 部署用」。
5. `app_settings` 的進群告知欄位、`org_settings` 的 AI 欄位（`gen_model` 等），程式都沒讀。
6. `/api/reindex` 與 `GET /api/extract` 只從 Referer 取 org。
7. `.dockerignore` 沒排除 `.next-dev`、`.next-verify`、`.next-old`、`design-board`、`intro-versions`，會被帶進 build context（只影響速度）。
8. 線上付款（PAYUNi）尚未串接，升級方案由平台擁有者手動改（`upgrade/page.tsx`）。
