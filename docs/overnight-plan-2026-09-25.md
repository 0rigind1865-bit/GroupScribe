# 夜間無人值守執行計劃（2026-09-25 晚 → 09-26 早）

> 目的：jielin 睡覺期間，由 agent 在**無人干預**下推進兩件事：(1) `docs/business-plan.md` 第 2.1 節「階段一」剩下的**純程式碼**項目；(2) 報帳模組（整合 Snaptab，X1／X2，jielin 2026-09-25 指定要做完）。醒來時看到：一串乾淨的 commit、全綠的測試、一份早晨報告、一包待貼的 migration SQL。
> 本檔是唯一的執行依據。**上下文被壓縮或不確定下一步時，先重讀本檔第 0.2 節（紅線）、第 1 節（規則）、第 5 節（進度區），不要憑記憶。**
> v2：已經過 Fable 對抗式審查（21 條發現）修正，修正對照見第 7 節。X1／X2 任務卡由另一個工作階段撰寫，本版原文保留。

---

## 0. 目標與邊界

### 0.1 成功長什麼樣（醒來驗收）

1. `git log de67eae..HEAD` 多出若干個繁中 commit，一個任務（或 X2 的一個子項）一個。
2. `npm test`、`npm run typecheck`、`npm run build` 三個都綠。
3. 第 5 節進度區每個任務都有狀態（✅／◐／⏭ 跳過＋原因／❌ 失敗＋原因）。
4. 第 6 節早晨報告寫好：做了什麼、jielin 要做什麼（依順序、指令一字不差）、要貼的 SQL 檔清單。
5. 正式站（NAS）與正式資料庫**完全沒被寫入過**。

### 0.2 絕對不做（紅線，違反任一條＝立刻停手、寫進報告）

| # | 不做 | 原因 |
|---|---|---|
| R1 | `git push` | CLAUDE.md：push 要用戶明確指示 |
| R2 | 部署到 NAS（rsync／ssh／docker） | 部署會漏收 webhook，要用戶在場 |
| R3 | **任何會寫入正式 Supabase 的動作**。明確禁用工具：`mcp__supabase__apply_migration`、`mcp__supabase__deploy_edge_function`、`mcp__supabase__create_branch`、`mcp__supabase__merge_branch`、`mcp__supabase__reset_branch`、`mcp__supabase__rebase_branch`、`mcp__supabase__delete_branch`。`mcp__supabase__execute_sql` **只准跑以 `select` 開頭、且只查 `information_schema` 或 `count(*)` 的 SQL**。明確禁跑：`scripts/migrate.sh`、`scripts/*.ts` 中任何會讀 `.env.local` 的腳本（例如 `new-org.ts`、`seed-*.ts`、`extract.ts`、`ask.ts`、`dedupe.ts`） | 沒有 staging；`.env.local` 連正式庫 |
| R4 | 在本機 dev server 送出任何會寫庫的表單或 API（確認、忽略、刪除、設定、認領、匯入、報帳切換…）。**唯一例外**：用 `ADMIN_PASSWORD` 登入 `/login`（只設 cookie、不寫庫）。看今天頁時**不帶 `?q=`**（會呼叫付費 embedding） | 本機連正式庫 |
| R5 | 修改或刪除守門測試（`routes`／`colors`／`i18n`／`api-guard`／`answer-scope`）的**判斷邏輯**讓它通過。唯一允許：在白名單陣列加入本計劃新增的公開或自行把關的路由，並在 commit 訊息講明 | 守門測試是紀律本身 |
| R6 | 呼叫會花錢或對外發訊息的 API（Gemini、LINE push／reply、Google 地圖） | 無人監看的支出與外部副作用 |
| R7 | 新增 npm 依賴（X2 的 `jsqr` 也不加，留給 jielin 決定） | ponytail 原則；NAS 部署也要多同步檔案 |
| R8 | 做本檔沒列的功能、「順手」重構 | 防漂移；值得做的事寫進第 5 節「發現但沒做」 |
| R9 | 改 `.env.local`、讀出或印出任何金鑰或 LINE userId | 金鑰與個資安全 |
| R10 | 修改 `/Users/linjie/Documents/GitHub/Snaptab`（只讀）；讀取 Snaptab 的 Firebase／Firestore 正式資料 | 別的專案；外部存取 |

### 0.3 允許的事

- 讀寫本 repo 內檔案；新增 migration 檔（編號見第 2 節規則）；讀 Snaptab repo 的程式碼當規格。
- 跑 `npm test`、`npm run typecheck`、`npm run build`。
- 本機 dev server：GET 頁面、`curl` 本機端點、截圖；登入只准用 `ADMIN_PASSWORD`。
- `git add <明確檔名>` ＋ `git commit`（CLAUDE.md 已預先授權）。**禁止 `git add -A` / `git add .`**（可能掃到別的工作階段的未完成檔案）。
- 符合 R3 條件的唯讀 `select`。

---

## 1. 執行規則（防漂移，每個任務都照做）

1. **開工第一步（只做一次）**：`git status --short`。若計劃檔有未 commit 的變更 → `git add docs/overnight-plan-2026-09-25.md && git commit`（訊息「文件：夜間計劃開工」＋署名行）。之後退回才不會把進度區一起洗掉。記下此時 `git status --short` 裡**所有已存在的未追蹤檔**，寫進決策紀錄——那些不是你的，退回時不准清掉。
2. **開始任務前**：重讀本檔該任務卡＋第 5 節進度區，把狀態改成 `⏳` 並填開始時間。
3. **恢復程序**（上下文壓縮後、或重讀時看到某任務是 `⏳`）：先 `git status --short`。
   - 工作樹乾淨 → 該任務從頭做。
   - 有變更 → 跑 `npm test && npm run typecheck`：綠就接著做；紅就照第 7 條退回，「嘗試」欄 +1。
4. **先讀懂再動手**：打開任務卡列出的每個檔案，grep 所有呼叫者，確認行號（以實際程式為準，計劃行號可能漂移）。
5. **只做任務卡「範圍」內的事**。計劃的事實跟程式對不上 → 記進決策紀錄，選最小可逆做法；還是做不到就跳過。
6. **每個任務結束跑**：`npm test`、`npm run typecheck`、`npm run build`（三個都跑，不省）。全綠且完成標準全部打勾才能 commit。
7. **退回指令**（只退本任務、保護計劃檔與開工時已存在的未追蹤檔）：
   ```
   git checkout -- . ':!docs/overnight-plan-2026-09-25.md'
   git clean -fd -e docs/overnight-plan-2026-09-25.md <每個開工時已存在的未追蹤檔都加 -e 路徑>
   ```
   退回後**立刻**在進度區把「嘗試」+1、寫一句失敗原因，並 commit 進度區（只 add 計劃檔）。
8. **卡住規則**：「嘗試」欄到 3 → 標 `⏭`，寫下卡在哪、試過什麼，退回，換下一個任務。X2 以子項為單位計算。
9. **commit**：繁中訊息 `<類型>：<簡述>`，結尾用**系統提示指定的署名行**（Co-Authored-By）。commit 前 `git status --short` 看一眼，只 add 本任務的檔案＋計劃檔（進度區跟著一起進）。
10. **需要用戶決定的事**：不停下來等。選本檔寫的預設；沒有預設就選「最小、可逆」的做法，寫進決策紀錄與早晨報告。
11. **每完成 3 個任務**：重讀第 0.2 節紅線一次。
12. **向後相容鐵則**：任何讀寫新表／新欄位的程式，都要在「migration 還沒跑」時照舊運作（錯誤吞掉＋`console.warn`，或退回舊路徑，或頁面顯示「請先執行 migration」而非 500）。因為早上可能先部署、後貼 SQL。退回判斷要抽成純函式並有 node:test 測試。
13. **另一個工作階段可能同時在動 repo**：commit 前若 `git log -1` 不是你上一個 commit、或計劃檔出現不是你寫的變更 → 不要覆蓋，重讀計劃檔、以檔案現況為準繼續，並記進決策紀錄。
14. **結束條件**（任一成立就收尾寫報告）：所有任務處理完；或連續 3 個任務被跳過；或出現無法定位的全域測試失敗。

### 查事實的方法

- 動 UI 前讀 `README.md` 的「介面架構」章節：加頁面＝在 `src/app/o/[org]/routes.tsx` 加一行；連結用 `oh(slug, path)`；共用元件在 `src/app/ui/`；狀態色只有 ok/warn/err/neutral。
- 公開路由（不需登入）要同時處理兩處：`src/middleware.ts` 底部的 `matcher` 排除清單、以及 `tests/api-guard.test.ts` 白名單（若是 API）。漏掉 matcher 會被 rewrite 到 `/login` 回 200 HTML，看起來像成功。
- 功能決策不得以 jielin 的產業（舞台技術）為依據；範例與 fixture 要跨行業。
- `docs/business-plan.md` 有兩個 G8（2.1 節表格的「新租戶前 7 天」與 2.4 節的「個人筆記」），本計劃稱前者為 **G8b**。

---

## 2. 任務總表（依順序執行）

執行順序：**A 層 → D 層（報帳）→ B 層 → C 層**。報帳是 jielin 指定要做完的，所以優先於 B、C。X1 做完才碰 X2。

| 順序 | 代號 | 名稱 | 層 | 需 migration | 風險 |
|---|---|---|---|---|---|
| 1 | A9 | ✅ | 1 | （本 commit） | 13:45 | 13:55 | health 端點未登入回 JSON {ok:true}；HEALTHCHECK 未實測（本機無 docker）；心跳警示門檻 24h→6h 改用 Banner |
| 2 | P1 | ✅ | 1 | （本 commit） | 13:56 | 14:02 | manifest.webmanifest 未登入可取、合法 JSON；icon-192 由 mark-512 以 sips 縮出；themeColor 亮暗兩色 |
| 3 | G7 | 進群告知三段、含「管理、匯出」、整體 ≤400 字 | A | 否 | 低 |
| 4 | A7 | 改寫既有上手卡：抽元件＋已認領未發言狀態 | A | 否 | 低 |
| 5 | L1 | LIFF 每次開啟落表＋source＋`?g=` 深連結 | A | 是 | 中 |
| 6 | G8b | **只驗證並記錄**（不寫程式） | A | 否 | — |
| 7 | X1 | 報帳 v1：私訊收據照 → 自動記一筆＋管理頁＋CSV | D | 是 | 中 |
| 8 | X2 | 報帳 v2：Snaptab 其餘功能搬家（逐子項） | D | 是 | 中 |
| 9 | B7 | 抽取合批 debounce | B | 否 | 中 |
| 10 | G4 | webhook 先落地再回 200 | B | 是 | 高 |
| 11 | G3 | 內容表 org_id＋`transfer_group()` | B | 是 | 中 |
| 12 | G5 | line connector 收成工廠（僅 line.ts 內） | B | 否 | 低 |
| 13 | A6 | seed-owner 腳本；有條件移除 callback 自動種子 | B | 否 | 中 |
| 14 | A8 | suspended 狀態擋 AI＋橫幅 | C | 是 | 中 |
| 15 | E1 | 抽取回歸集：fixture＋比對器（不跑） | C | 否 | 低 |
| 16 | A10 | 設計夥伴一頁合約草稿 | C | 否 | 低 |

**migration 編號規則**：每次新增前 `ls supabase/migrations`，取「已存在的最大編號 +1」（目前最大是 `020`，所以第一支是 `021`）。檔名 `0NN_<英文短名>.sql`。SQL 一律可重跑（`if not exists`、`create or replace`、`drop trigger if exists`、backfill 加 `where ... is null`）。本機沒有 psql，SQL 今晚無法執行驗證——這點要寫進報告。

**明確不在今晚範圍**：S1 staging、Supabase 升 Pro、LINE Console 設定、G6 分享卡、demo 群拆 org、B 階段二所有項目、CLA／商標／寄信、X2 的 QR 掃描（需新依賴）與 Snaptab 舊資料搬移。

---

## 3. 任務卡

### 1. A9 健康檢查

- **目標**：外部監控與 Docker 能知道服務活著；webhook 靜默看得見。
- **範圍**：
  - `src/app/api/health/route.ts`：GET → 對一張小表做 `select id limit 1`（3 秒逾時）→ 成功回 `{ ok: true }`，失敗回 503 `{ ok: false }`。不回任何內部資訊。
  - `src/middleware.ts` matcher 排除加 `api/health`；`tests/api-guard.test.ts` 白名單加 `health`（R5 允許的擴充）。
  - `Dockerfile` runner 階段加：
    `HEALTHCHECK --interval=60s --timeout=5s --start-period=30s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>r.json()).then(j=>process.exit(j.ok?0:1)).catch(()=>process.exit(1))"`
  - 心跳警示：只改既有 `settings/page.tsx` 的心跳顯示（先 grep 確認位置），門檻 24h → 6h，超過時用 `Banner tone="warn"`。不做私訊（R6）。
- **完成標準**：
  - [ ] 三件套綠
  - [ ] dev server 未登入 `curl -s localhost:3000/api/health` 回的是 **JSON** 且含 `"ok"`（不是 HTML）
  - [ ] 本機沒有 docker → Dockerfile 只做目視檢查，報告註明「HEALTHCHECK 未實測」

### 2. P1 PWA 基礎

- **現況**：`src/app/icon.png`（256）、`src/app/apple-icon.png`（180）、`public/brand/mark-512.png`（512）已存在。
- **範圍**：
  - `sips -z 192 192 public/brand/mark-512.png --out public/brand/icon-192.png`
  - `src/app/manifest.ts`（Next 原生）：name「群記 GroupScribe」、short_name「群記」、`start_url: '/'`、`display: 'standalone'`、icons 192＋512。
  - `src/app/layout.tsx` 加 `export const viewport`，含 `themeColor`（亮／暗各一，用既有 CSS 色票值）。
  - middleware matcher 排除加 `manifest`。
- **不做**：service worker、離線、推播。
- **完成標準**：
  - [ ] 三件套綠
  - [ ] 未登入 `curl -s localhost:3000/manifest.webmanifest` 回合法 JSON（用 `node -e` 解析通過）
  - [ ] `sips -g pixelWidth public/brand/icon-192.png` 顯示 192

### 3. G7 進群告知三段

- **現況**：實際送出＝`DEFAULT_NOTICE` ＋ `withLiffEntry()` 附的【看整理結果】【提醒訂閱】＋法務連結（`src/core/ingest.ts` 約 74–107 行）。
- **範圍**：改 `DEFAULT_NOTICE`，並允許精簡 `withLiffEntry()` 的附加段以去重。三段：①我是誰、會做什麼、@我 提問 ②誰看得到：本群整理由認領此群的公司管理，管理者可查看與匯出；成員可從下方連結看本群整理 ③隱私：移出即停止、收回同步刪除、可要求刪除。租戶自訂文字行為不變。不得寫「符合 LINE 規範」。
- **完成標準**：
  - [ ] 新增測試：`withLiffEntry(DEFAULT_NOTICE)` 在 `LIFF_ID`、`APP_BASE_URL` 都有假值時的完整輸出 **≤ 400 字**，且含「管理」「匯出」
  - [ ] 三件套綠（既有斷言告知文的測試同步更新，非守門測試）

### 4. A7 上手卡改寫

- **現況**：今天頁已有「三步開始」空狀態卡（`(admin)/page.tsx` 約 158–185 行），但判斷「有沒有群」用的是 `groups_view`（以 messages 為主表）——**已認領但 0 則訊息的群看不到**，所以用戶會一直看到零群組卡。
- **範圍**：
  - 把上手卡抽成 `src/app/ui/onboarding-card.tsx`（純展示元件，props 傳入狀態）。
  - 「有群」改查 `groups` 表（本 org、`left_at is null`、`group_id not like 'dm:%'`）；N 則用 `groups_view.message_count`。三種狀態：零群 → 三步卡；有群但訊息 < 20 → 「已收到 N 則，整理中」＋一句「整理出的項目會先進收件匣請你確認」；其餘 → 不顯示。
  - 步驟 1 按鈕連 `https://line.me/R/ti/p/@<LINE_BOT_BASIC_ID>`，env 未設時隱藏按鈕只留文字。加註「群記是未認證官方帳號（灰色盾牌），這是正常的」。
  - `.env.example` 加 `LINE_BOT_BASIC_ID=`（附註解）。
  - 若今天頁文字走 i18n → 五語系 key 都要補。
- **完成標準**：
  - [ ] node:test 用 `react-dom/server` 的 `renderToStaticMarkup` 測元件：零群狀態含三步文字；env 未設時沒有 `line.me` 連結；有群少訊息狀態含「N 則」
  - [ ] 三件套綠
  - [ ] （可選）用 `ADMIN_PASSWORD` 登入 dev server 截今天頁 375px 寬圖；拿不到零群組 org 就跳過截圖，不得為截圖建資料（R3）

### 5. L1 LIFF 開啟事件＋深連結

- **現況**：`src/app/g/liff-init.tsx` 只在沒有有效 `gs_liff` cookie（TTL 7 天）時才 POST `/api/liff/session`，所以在 session route 落表只量到「登入」。`/`（`src/app/page.tsx`）redirect 時會丟掉 query；`/g/page.tsx` 不讀 searchParams。LINE Console 的 LIFF endpoint 可能設在 `/` 或 `/g`（見 middleware 註解）。
- **範圍**：
  - migration：`funnel_events(id bigserial primary key, org_id uuid, group_id text, line_user_id text, step text not null, source text, at timestamptz not null default now())`＋`(step, at)` 索引。RLS 照既有表慣例（先 grep）。
  - 落表點：`/g/page.tsx` 與 `/g/[groupId]/page.tsx` 每次 server render 時 insert 一列 `step='liff_open'`（有 session 才寫）；**失敗吞掉＋warn**（表可能還沒建）。
  - `source`：從 searchParams `src` 取，白名單 `notice|answer|digest`，其他存 null。白名單解析抽成純函式。
  - 深連結：`/` 與 `/g` 兩處都處理 `?g=<gid>`：本人是該群成員（既有 `isGroupMember`）→ redirect `/g/<gid>?src=<src>`；否則忽略 `g`。`liff-init.tsx` 登入完成後的導向要保留 `location.search`（確認現在怎麼導，保留 `src` 與 `g`）。
  - 三個觸點的 LIFF 連結加 `?src=`：進群告知（`withLiffEntry`）、@回答附連結、每日提醒（`digest.ts`）。
- **完成標準**：
  - [ ] node:test：`parseSource()` 白名單；「insert 回 error 物件時不丟例外」的包裝函式（注入假 db）
  - [ ] migration 檔可重跑
  - [ ] 三件套綠
  - [ ] 決策紀錄寫明深連結處理了哪兩個入口

### 6. G8b 前 7 天全需確認 —— 只驗證、不寫程式

- **原因**：`supabase/schema.sql` 的 events／tasks／notes 三表 `needs_confirmation boolean not null default true`，`extract.ts` 新增時不設此欄、更新時強制 true。也就是「全部都要確認」本來就成立，寫程式是空操作。
- **範圍**：grep 驗證上述事實仍成立（尤其確認沒有任何路徑把新項目寫成 false）→ 寫進決策紀錄。產品意圖由 A7 的文案承接。
- **完成標準**：
  - [ ] 決策紀錄有 grep 證據（檔案:行號）
  - [ ] 若發現有路徑寫 false → 不改，列進「發現但沒做」

### 7. X1 報帳模組 v1（D 層）

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

### 8. X2 報帳模組 v2：Snaptab 完整搬家（D 層）

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

### 9. B7 抽取合批 debounce

- **目標**：同一群連續來訊息時，等 45 秒沒新訊息才抽一次；持續有訊息時最長 3 分鐘強制抽一次。
- **範圍**：新增 `scheduleExtract(gid)`（放 `src/core/` 既有合適模組，或新檔 `src/core/debounce.ts`），到期執行 `retryPendingMedia(gid)` → `extractGroup(gid)`。webhook route 改呼叫它。手動匯入、`/api/extract` 手動觸發**不經過** debounce。計時器用可注入的 `setTimeout`／`now` 以便測試。
- 先 grep 確認有沒有定期補抽（cron／digest 裡順便抽）。寫 `ponytail:` 註解：「計時器在記憶體，容器重啟時未到期的會掉，由 <實際的補抽機制> 接手；沒有補抽機制的話寫明風險」。
- 注意 X1：收據記帳發生在媒體解析（`retryPendingMedia`／`processMedia`），debounce 會讓群組內的媒體重試延後，但 1:1 收據的即時回覆走 `processMedia` 當下的 replyToken，**不能被 debounce 延後**（replyToken 會過期）。改完要確認這條路徑沒變。
- **完成標準**：
  - [ ] node:test（注入假計時器）：45 秒內連呼叫 3 次只觸發 1 次；持續呼叫超過 3 分鐘會強制觸發；不同群互不影響
  - [ ] 三件套綠

### 10. G4 webhook 先落地（高風險，嚴守完成標準）

- **範圍**：
  - migration：`webhook_events(id bigserial primary key, channel_id text, webhook_event_id text unique, is_redelivery boolean, payload jsonb not null, received_at timestamptz default now(), claimed_at timestamptz, processed_at timestamptz, attempts int not null default 0, error text)`＋`where processed_at is null` 部分索引。
  - 存的是 **LINE 原始的每個 event 物件**（不是 parseEvents 之後的結果，因為 parseEvents 會丟掉部分事件類型）。`webhook_event_id` 取原始 event 的 `webhookEventId`，`is_redelivery` 取 `deliveryContext.isRedelivery`。
  - webhook route：驗簽 → 把原始 events 批次 insert（`onConflict: 'webhook_event_id', ignoreDuplicates: true`）→ 回 200 → `after()` 呼叫 `processPendingWebhooks()`。**insert 回 error（例如表還沒建）→ 走現行舊路徑**（直接 parseEvents＋handleEvent）。「要不要走舊路徑」抽成純函式。
  - `processPendingWebhooks()`：用租約認領（比照 `extract.ts` 的 `claimed_at` 做法）：只處理 `processed_at is null and attempts < 5 and (claimed_at is null or claimed_at < now() - 10 分鐘)` 的列，先 update 設 `claimed_at=now(), attempts=attempts+1` 並 `returning`，只處理自己認領到的；對每列 `parseEvents({events:[payload]})` → `handleEvent`；成功設 `processed_at`，失敗寫 `error`。處理完觸及的群走 B7 的 `scheduleExtract`（B7 被跳過就直接呼叫舊流程）。
  - **replyToken 時效**：輪詢補處理的舊事件 replyToken 多半已過期（進群告知、1:1 收據回覆、@回答都用 reply）。補處理時 reply 失敗要吞掉、不算處理失敗，否則會一直重試。
  - `src/instrumentation.ts`：
    ```ts
    export async function register() {
      if (process.env.NEXT_RUNTIME !== 'nodejs') return;
      if (process.env.NODE_ENV !== 'production' || process.env.WEBHOOK_WORKER !== '1') return;
      const { startWebhookPoller } = await import('./core/webhook-worker'); // 路徑依實際
      startWebhookPoller(60_000);
    }
    ```
    dev 預設關閉（R4）。
- **完成標準**：
  - [ ] node:test：`shouldFallback(error)` 純函式；從假的 LINE 原始 payload 取出 `webhookEventId`／`isRedelivery` 的函式
  - [ ] node:test（注入假 db）：insert 回 error → 呼叫舊處理路徑
  - [ ] `npm run build` 綠（證明 instrumentation 沒把 node 模組帶進 edge）
  - [ ] dev server 啟動 log **沒有**輪詢啟動訊息
  - [ ] migration 檔可重跑
  - [ ] 報告寫明部署順序：貼 migration → 部署 → `.env.local` 加 `WEBHOOK_WORKER=1` → `docker rm -f` ＋ `docker run` 重建（`docker restart` 不會重讀 env）

### 11. G3 內容表 org_id＋transfer_group

- **範圍**：一支 migration：
  - 先 grep `supabase/schema.sql` 確認 messages／events／tasks／notes／embeddings／media_assets／push_subscriptions 的實際表名與 group_id 欄位；沒有 group_id 的（如 media_assets）經 message_id 取。（`expenses` 本來就有 org_id，不在此列。）
  - 各表 `add column if not exists org_id uuid`。
  - 共用 trigger function：insert 時 `org_id is null` 就從 `groups.org_id` 帶入（群組列不存在就留 null）。
  - backfill：`update ... set org_id = g.org_id from groups g where t.group_id = g.group_id and t.org_id is null`（每表一句）。
  - `transfer_group(gid text, new_org uuid, set_claimed boolean default true)`：upsert groups 列（匯入群可能沒有 groups 列）→ 設 org_id（`set_claimed` 為 true 時一併設 `claimed_at=now()`，比照現有認領）→ 更新上述各表 org_id。
  - 應用程式：先 grep 列出所有歸戶入口（至少：`api/group/claim/route.ts`、`src/org/orgs.ts` 的 `claimGroup()`、`api/group/update`），改成先呼叫 rpc `transfer_group`；rpc 回「函式不存在」（`PGRST202` 或 `42883`）→ 退回原本寫法。退回判斷抽成純函式。**語意必須與原本寫法一致**（例如 `claimGroup` 的 `ignoreDuplicates`＝已有歸屬就不覆蓋；若 rpc 無法表達就該入口不改，寫進決策紀錄）。
- **完成標準**：
  - [ ] node:test：`isMissingFunction(err)` 純函式（PGRST202、42883、其他錯誤三種情況）
  - [ ] 三件套綠
  - [ ] 報告註明：backfill 對大表較久，建議離峰貼；messages 加 trigger 會讓匯入每批多一次查詢（可接受）

### 12. G5 line connector 工廠

- **現況**：`lineConnector` 只在 `src/connectors/line.ts`、`src/core/config.ts`、`tests/core.test.ts` 出現；`getConnector()` 已在 `config.ts`。
- **範圍**：只把 `line.ts` 內直讀 `process.env.LINE_CHANNEL_*` 的地方收進 `createLineConnector(creds)`；`config.ts` 的 `getConnector()` 用 env 建一次並快取；`tests/core.test.ts` 的 import 同步改（非守門測試）。**`liff.ts`、`middleware.ts` 的 env 讀取不動**。
- **完成標準**：
  - [ ] `grep -n "process.env.LINE_CHANNEL" src/connectors/line.ts` 只剩建立預設 creds 的那一處（或 0 處，改由 config.ts 傳入）
  - [ ] 三件套綠，行為不變

### 13. A6 seed-owner 腳本＋有條件移除自動種子

- **範圍**：
  - 新增 `scripts/seed-owner.ts`：參數 `<orgSlug> <lineUserId>`，upsert org_members(owner)。**今晚不執行**（R3）。頂端註解寫用法。
  - 唯讀檢查（R3 允許的 count）：
    `select count(*) from org_members m join orgs o on o.id = m.org_id where o.slug = 'main' and m.role = 'owner'`
  - 結果 ≥ 1 → 移除 `src/app/api/auth/line/callback/route.ts` 的自動種子區塊，報告請 jielin 確認那一列 owner 是他本人。
  - 結果 = 0、或查不了 → **不移除**，只在該區塊加 `// ponytail: 待 seed-owner 跑過後移除（business-plan A6）`，狀態記 ◐。
- **完成標準**：
  - [ ] 決策紀錄記下 count 結果（只記數字）
  - [ ] 三件套綠

### 14. A8 suspended 狀態（C 層）

- **範圍**：migration `org_settings` 加 `status text not null default 'active'`（check in ('active','suspended')）。B5 的 AI 入口門（grep `aiScope`）遇 suspended 一律擋（含 X1 的收據解析，它走同一個 vision 入口）；後台 layout 顯示 `Banner tone="warn"` 橫幅。**欄位不存在（migration 未跑）→ 視為 active**（比照 `quota.ts` 的 `error ? null` 寫法）。不做自動退群、刪資料、私訊。
- **完成標準**：node:test 測「suspended 擋、active 放、查詢 error 視為 active」；三件套綠。

### 15. E1 抽取回歸集（C 層）

- **現況**：抽取與 DB 耦合（從 messages 撈、寫 events/tasks/notes），沒有「prompt→結果」的純入口。
- **範圍**：只寫 `tests/fixtures/golden/<行業>.json` 三份（例如餐飲門市、室內裝修、補習班，**不要用舞台技術**），各 30 則繁中虛構對話＋期望抽出的項目；`scripts/extract-eval.ts` 只實作「讀 fixture＋比對期望與實際、算假陽性率」的比對器，抽取入口留 `TODO`：註明需先從 extract.ts 抽出純函式，且之後執行時必須讀 `EVAL_SUPABASE_URL` 等專用 env、缺就 `process.exit(1)`，**絕不讀 `.env.local`**。不加進 `npm test`。
- **完成標準**：typecheck 綠；三份 JSON 可被 `JSON.parse`；比對器有一個 node:test（用假的「實際結果」）。

### 16. A10 合約草稿（C 層）

- **範圍**：`docs/legal/design-partner-agreement.md`：半價 6 個月、無 SLA、資料歸屬與匯出、LINE 條款變動時的遷移條款（business-plan 第 3、8 節）、終止與 30 天刪除。首行標明「草稿，簽約前請法律專業人士審閱」。
- **完成標準**：文件存在、約一頁 A4、全文不含「符合 LINE」字樣（grep 驗證）。

---

## 4. 收尾（所有任務處理完後）

1. 跑 `npm test`、`npm run typecheck`、`npm run build`，結果寫進第 6 節。
2. 列出本晚新增的 migration 檔，並排出**建議貼上順序**（小而關鍵的先貼，G3 backfill 最後、離峰）。每段建議先用 `begin; … rollback;` 試跑一次語法。
3. 更新 `docs/business-plan.md` 第 2.1 節表格對應列的狀態（照既有「✅ **已完成 2026-09-26**（…）」格式；G8b 對應 2.1 節表格 G8 那一列，**不是** 2.4 節）。報帳模組不在 business-plan 裡，只寫在本報告。
4. 填第 6 節早晨報告，commit：`文件：夜間執行報告`。
5. **不 push、不部署。**

---

## 5. 進度回寫區（agent 每個任務更新）

**目前狀態**：執行中（任務 3 G7）
**最後更新**：2026-09-26 14:02
**起始 commit**：`de67eae`

| 順序 | 代號 | 狀態 | 嘗試 | commit | 開始 | 結束 | 一句話結果 |
|---|---|---|---|---|---|---|---|
| 1 | A9 | ⬜ | 0 | 13:44|開工|開工時工作樹乾淨、無未追蹤檔；退回時不需額外排除|git status --short 為空 |
| | | | |
| 2 | P1 | ⬜ | 0 | | | | |
| 3 | G7 | ⬜ | 0 | | | | |
| 4 | A7 | ⬜ | 0 | | | | |
| 5 | L1 | ⬜ | 0 | | | | |
| 6 | G8b | ⬜ | 0 | | | | |
| 7 | X1 | ⬜ | 0 | | | | |
| 8 | X2-1 網頁記一筆 | ⬜ | 0 | | | | |
| 8 | X2-2 我的清單 | ⬜ | 0 | | | | |
| 8 | X2-3 付款方式 | ⬜ | 0 | | | | |
| 8 | X2-4 自訂分類 | ⬜ | 0 | | | | |
| 8 | X2-5 統計 | ⬜ | 0 | | | | |
| 8 | X2-6 文字語音記帳 | ⬜ | 0 | | | | |
| 8 | X2-7 地點 | ⬜ | 0 | | | | |
| 9 | B7 | ⬜ | 0 | | | | |
| 10 | G4 | ⬜ | 0 | | | | |
| 11 | G3 | ⬜ | 0 | | | | |
| 12 | G5 | ⬜ | 0 | | | | |
| 13 | A6 | ⬜ | 0 | | | | |
| 14 | A8 | ⬜ | 0 | | | | |
| 15 | E1 | ⬜ | 0 | | | | |
| 16 | A10 | ⬜ | 0 | | | | |

狀態圖例：⬜ 未開始／⏳ 進行中／✅ 完成／◐ 部分完成／⏭ 跳過（寫原因）／❌ 失敗（寫原因）

### 決策紀錄（自行判斷的事都記這裡）

| 時間 | 任務 | 決定 | 理由／證據 |
|---|---|---|---|
| | | | |

### 發現但沒做的事（R8：不順手做，記下來給 jielin）

- 

---

## 6. 早晨報告（收尾時填寫）

### 一句話

（例：16 項做完 12 項、跳過 4 項；測試全綠；你需要貼 5 段 SQL、改 1 個環境變數、部署一次。）

### 你醒來要做的事（照順序，指令一字不差）

1. 看這份報告與 `git log de67eae..HEAD --oneline`
2. 到 Supabase SQL Editor 依序貼：（列出檔案路徑與建議順序）
3. （若有）執行：（指令）
4. 部署（照 NAS 部署流程；G4 要加 `WEBHOOK_WORKER=1` 並 `docker rm -f` ＋ `docker run`）
5. 報帳驗收：用員工 LINE 私訊群記一張收據，看有沒有回「記好了」、`/o/main/expense` 有沒有出現
6. `git push`

### 要你決定的事（最多兩項）

1. X2 的 QR 掃電子發票：加 `jsqr` 套件，還是只靠 AI 讀照片？
2. Snaptab 舊資料要不要搬（搬移步驟說明寫在：＿＿）

### 測試結果

- npm test：
- typecheck：
- build：

### 各任務結果

（每項一到兩行）

### 風險與注意

（至少包含：SQL 今晚未實際執行過；HEALTHCHECK 未實測；B7 計時器重啟會掉；G4 補處理時 replyToken 已過期）

---

## 7. 審查修正對照（v1 → v2）

Fable 對抗式審查共 21 條，全數採納：

| # | 嚴重度 | 問題 | 本版處置 |
|---|---|---|---|
| 1 | 高 | G8 是空操作（needs_confirmation 預設就是 true） | 改為 G8b「只驗證並記錄」 |
| 2 | 高 | 紅線漏掉 Supabase MCP 寫入工具 | R3 列出禁用工具全名、限制 execute_sql、禁跑讀 .env.local 的腳本 |
| 3 | 高 | L1 在 session route 落表只量到登入 | 改在 `/g` 兩頁每次 render 落表 |
| 4 | 高 | 深連結落點未定義，`/` 會丟 query | `/` 與 `/g` 都處理 `?g=` |
| 5 | 高 | 退回指令會洗掉進度區、留半成品 | 開工先 commit 計劃檔；退回加排除與 `git clean` |
| 6 | 高 | instrumentation 會在 edge 跑；雙路徑無租約 | 加 `NEXT_RUNTIME` 守門＋dynamic import；租約認領；存原始 event |
| 7 | 中 | A6 前置檢查在本機做不到 | 改用不需 env 的 count 查詢；不通過就只留註解 |
| 8 | 中 | G7 字數對象不明、段落重疊 | 以完整輸出計 ≤400 字，允許精簡 withLiffEntry，用測試驗 |
| 9 | 中 | A7 已認領未發言的群看不到；描述過期 | 改查 groups 表；改寫既有卡 |
| 10 | 中 | A7 截圖需登入、可能打到付費 API | 登入例外寫進 R4；禁 `?q=`；改用 renderToStaticMarkup 測試 |
| 11 | 中 | E1 無法不碰 DB 跑 | 只寫 fixture＋比對器，抽取入口留 TODO＋專用 env |
| 12 | 中 | 防漂移缺嘗試次數與恢復程序 | 進度表加「嘗試」欄；新增恢復程序（規則 3） |
| 13 | 中 | 完成標準可自我宣告 | 退回判斷一律抽純函式＋node:test；刪掉「或程式碼審查」 |
| 14 | 中 | transfer_group 與三條歸戶路徑不等價 | 加 `set_claimed` 參數、列三個入口、語意不符就不改 |
| 15 | 低 | health 未排除 middleware 會假綠 | matcher 加排除；驗 JSON；HEALTHCHECK 驗 body |
| 16 | 低 | icon 已存在 | 只補 192 與 matcher |
| 17 | 低 | G5 範圍不清 | 只收 line.ts 內，liff/middleware 不動 |
| 18 | 低 | A8 未寫向後相容 | 欄位不存在視為 active |
| 19 | 低 | 署名寫死、0.3 自相矛盾 | 用系統提示署名；0.3 對齊 R3 |
| 20 | 低 | business-plan 兩個 G8 | 改稱 G8b 並明指 2.1 節 |
| 21 | 低 | SQL 貼的順序 | 收尾排建議順序、G3 最後、先 rollback 試跑 |

合併時另外補的（主 agent）：
- 另一個工作階段同時在改本檔（加入 X1／X2）→ 新增規則 13（別覆蓋別人的變更）、禁 `git add -A`、開工時記下既有未追蹤檔並在退回時排除、R10（Snaptab 只讀）。
- X1 與 B7／G4／A8 的交互：B7 不能延後 1:1 收據的即時 reply；G4 補處理時 reply 失敗不算失敗；A8 的 suspended 也擋收據解析。
- X1／X2 任務卡未經本輪 Fable 審查（撰寫時間晚於審查），原文保留。
