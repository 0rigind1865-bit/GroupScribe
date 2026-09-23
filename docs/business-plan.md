# GroupScribe 多租戶商業化計劃（定稿版）

> 基準日 2026-09-23。本版以合成計劃為底，依對抗式驗證結果修正：K1（LINE 條款依據）、K4（定價與發票）、K6（LIFF 前提）三條被駁回已改寫；K5（AI 成本）標「未查證」並改為有備援的寫法；K2、K3、K7、K8 成立，證據已寫進對應段落。引用格式：程式碼「檔案:行號」；外部事實附網址與查閱日期；查不到的標「未查證」。

## 0. 一頁結論

| 題 | 一句話決定 | 與合成版的差異 |
|---|---|---|
| **1. 技術** | 不換棧、不做 RLS 大改：沿用「單一 GroupScribe 官方帳號＋`groups.org_id` 為隔離邊界」（supabase/migrations/012_orgs.sql:28-33），階段一約 25 人日補齊「群組助理開放給 org_members＋19 支 API／5 頁補 org 綁定＋app_settings 遷 org_settings＋拆鑰＋webhook 先落地」，並把「Connector 金鑰收成 per-channel 函式（G5）」與「抽取合批＋per-org 預算煞車（B5/B7）」提前進階段一。 | G5、B5、B7 從階段二提前（K1、K5 修正） |
| **2. 行銷** | 賣給「用 LINE 群跑工作的 5–50 人團隊」不分行業；定價改三層 Free（1 群）／Starter NT$690（3 群）／Team NT$2,190（10 群），成員永遠免費；前 10 家用「設計夥伴一頁合約（半價 6 個月）」，通路是跨行業熟人示範、LINE Notify 難民內容、bot 進群自帶曝光；第一家不得是同業。**「能否開發票」列為成交前置問題，示範後量「願付最高價」而非「990 是否成交」。** | 入門價由 990 下修至 690、中階 2,490→2,190（K4 修正） |
| **3. App** | 不做原生 App、不做包殼：成員留在 LIFF，管理端補 PWA 基礎；理由改為「成本／審核風險與 LIFF 觸點足夠」，不再引用 99.4% 當「員工不想裝 App」的證據。**分享按鈕與開啟率量測目前不存在，必須先補（L1、G6），止損線才有意義。** | 理由改寫、補量測前置項（K6 修正） |
| **4. 畫面** | 骨架對、不重做：P0 是「隔離類（別人的資料出現在你頁面）」與「新租戶零資料上手卡」；接著今天頁砍時間軸表格、待辦卡四鈕收斂、LIFF 卡片點擊展開、進群告知改三段；順手修 `/g` 空狀態文案（src/app/g/page.tsx:35 仍寫「發過訊息才出現」，判定早已改為群成員 API，src/core/liff.ts:88-96）。 | 加 U12 文案修正（K6 附帶） |

**明天早上第一件事（零工程成本、當天做完）**
1. 在 repo 加 CLA（cla-assistant）——之後收任何 PR 前必須有，否則永遠無法雙授權。
2. 送件「GroupScribe」文字商標（第 9／42 類）。
3. 寫信給 LINE 技術夥伴信箱（dl_tw_technology_partner@linecorp.com，來源 https://tw.linebiz.com/partner-offer/tech-partner/ ，2026-09-23 查閱）。**問題改題（K1 修正）**：不問「Provider 規範」，改問「以單一官方帳號被邀進多家公司的群組，並將群內整理結果（訊息、userId、顯示名稱）提供給該群所屬公司之管理員，是否構成 LINE 官方帳號 API 使用條款 5.5(6) 之『提供予 Operator 以外第三人』；進群告知＋隱私政策＋租戶契約是否足以豁免；Group information 24 小時保存限制（User Data Policy 3.2.3／3.2.8）對群組名稱／頭像快取如何適用」。
4. 到 Supabase 專案設定確認目前區域，寫進隱私頁；區域一旦有外部租戶就不能再搬。
5. 建第二個 Messaging API channel＋第二個 Supabase Free 專案當 staging。
6. **（新增，零成本）** 在正式庫跑一次唯讀 SQL：`api_usage.calls` ÷ 同期 `messages` 非低資訊則數，得到「呼叫／訊息比」——這是 K5 成本假設唯一缺的數字，決定 Free 層與半價會不會虧錢。

**接下來三個週末（階段 1a，約 12 人日）**：把「第二個 org 的管理員登入群組助理時不可能看到第一個 org 的任何東西」做完（第 2.1 節），然後才邀第一家設計夥伴上 Free。

---

## 目錄

0. 一頁結論
1. 目標客群與定位
2. 技術架構與遷移路徑（2.0 不動的骨架／2.1 階段一／2.2 階段二／2.3 階段三）
3. LINE 帳號形態（形態 A 為 Beta 預設；合規依據修正）
4. 商業模式與定價（修正版）
5. 行銷與 GTM（前 10 個付費客戶）
6. App 決策（修正版）
7. UI 改善清單
8. 風險與對策
9. 里程碑與可量測指標
10. 需要使用者拍板的分岔
附錄：關鍵主張驗證表

---

## 1. 目標客群與定位

**定位一句話**：「你的團隊已經在 LINE 群裡把事情講完了，GroupScribe 負責記住。」（README.md:3，不改。）加三個限定詞：不用換工具、不用開帳號、不用教員工。

**文案禁區（K8 成立，附加建議）**：不賣「群內摘要」——台灣 LINE 社群（OpenChat）自 2023-11-06 已有免費 AI 訊息摘要（https://line-tw-official.weblog.to/archives/25515573.html ），日本 LY 的「Agent i in chat」2026 年內在一般聊天室提供任務整理與摘要（https://www.lycorp.co.jp/ja/news/release/020594/ ，2026-07-02）；摘要是平台級 commodity。賣點鎖在官方不會做的三件事：**跨群管理者總覽、待辦／事件有引文可回溯、人審核後才成為事實**。README.md:217 的「每日摘要推播」文案改稱「每日待辦／事件提醒」，避免與平台同名硬碰。

**Persona（依 docs/plan.md B.7：只以資料模型與管理場景定義）**

| Persona | 可觀測條件 | 他付錢買什麼 | 畫面 |
|---|---|---|---|
| P1 群組管理者（付費決策者） | 同時在 3–20 個工作群、每天要答「誰負責／幾號／講好了什麼」、沒有 IT | 跨群今天頁＋收件匣把關＋點回原話 | `/o/[slug]` |
| P2 群組成員（免費） | 只在自己的群、不想註冊 | 「我的待辦」＋訂閱每日提醒 | `/g` LIFF |
| P3 外部協力者（同群的別家公司，免費） | 只該看到本群 | 無；但他是擴散節點 | `/g` 單群 |
| P4 自架者（開源漏斗） | 有 IT、資料不能出公司 | 免費；未來買自架支援年費 | README 自架路徑 |

**市場前提**：LINE 台灣 MAU 2,200 萬、每日活躍群組 1,000 萬（https://www.ctee.com.tw/news/20250623701739-430502 ，2025-06-23）。**但（K6 修正）「工作塞進 LINE」不是純正面資產**：面試趣 2025-08 調查顯示 63.7% 用 LINE 談公事，其中僅 59.1% 能接受、已用 Teams/Slack 者 44.3% 完全不能接受 LINE（https://news.nextapple.com/life/20250823/8719AC31DA8E592CAE3EF1CE4749A000 ，樣本數未揭露）。因此文案要把「群組零聲量、只私訊訂閱者、bot 不會在群裡講話」當成對抗 LINE 疲勞的賣點明寫，並保留桌面／外部瀏覽器管理端路徑。

**不做誰（前 10 家階段）**
- 要求自家品牌 bot 名稱／頭像的客戶（形態 B，第 3 節）。
- 要求資料落地／本地 LLM 的客戶 → 指向 README 自架路徑。
- OpenChat 社群（Messaging API 不能進 OpenChat，https://developers.line.biz/zh-hant/docs/messaging-api/overview/ ，2026-09-23 查閱）；群裡已有其他 bot 的團隊（一群只能一個官方帳號，https://developers.line.biz/en/docs/messaging-api/group-chats/ ）。
- B2C 行銷客服型 OA 客群——文案明講「不是客服機器人」。
- 單一租戶 >50 群或 >10 萬則／月：超過方案上限不接（共用 Gemini 金鑰撞 429 會停全站媒體重試，src/core/ingest.ts:259-264）。
- 需要 SOC 2／資安問卷的中大型企業：提供自架。

**產業分散紀律**：前 10 家付費客戶橫跨 ≥3 個行業，第一家不得是開發者本人的同業；考勤模組作為加購、不進主訊息與定價頁主欄。

---

## 2. 技術架構與遷移路徑

### 2.0 不動的骨架（K2 成立，high）

- `orgs / org_members / org_settings`（supabase/migrations/012_orgs.sql:28-58）、`orgAdminAccess()`（src/org/orgs.ts:52-58）、`assertGroupInOrg()`（src/org/orgs.ts:71-74，目前零呼叫者）、`orgGroups()`（src/org/orgs.ts:61-68）。
- **歸戶零搬資料的證據**：群組助理所有表以 `group_id` 為鍵——messages（supabase/schema.sql:16-33）、embeddings（:48-59）、consent_log（:61-66）、groups 主鍵（:70-77）、notes（:79-93）、events/tasks（:130-161）、push_subscriptions（:235-243）；media_assets 經 message_id 間接歸屬且 Storage 路徑以 `${groupId}/${messageId}` 為前綴（src/core/ingest.ts:330-335），bucket 私有（schema.sql:126）、讀取皆走 createSignedUrls 1 小時（src/core/media.ts:59、src/app/o/[org]/(admin)/files/page.tsx:84-87、src/app/g/[groupId]/page.tsx:197）。org 唯一判定來源是 `groups.org_id`（groups_view，schema.sql:295-301；orgs.ts:61-73）。所以 `UPDATE groups SET org_id=…` 即整群換戶。
- **三個精度修正（K2 附帶，納入階段一）**：(1) `channels.org_id` 也存在（012:29）但無程式讀取（ingest.ts:73-83）——`transfer_group()` 明定以 `groups.org_id` 為唯一真相，形態 B 若上線需同時校驗 channel；(2) 匯入路徑只插 messages、不建 groups 列（src/core/importer.ts:65-70），認領／轉移必須用 upsert 而非 UPDATE；(3) `api_usage` 無 group_id（schema.sql:196），用量歷史不隨群轉移——這是計費面，B5 加 org_id 後解決。
- 考勤模組的授權範本：`orgAdminAccess(slug)` → 403 ＋每個查詢 `.eq('org_id', ...)`（src/app/api/attend/employee/route.ts:14-15）。群組助理照抄。

### 2.1 階段一：現在 → 第一個付費客戶（約 25 人日，分 1a／1b）

**1a：安全開放第二個 org（≈12 人日；做完才邀第一家設計夥伴上 Free）**

| # | 要改什麼 | 檔案／表 | 人日 |
|---|---|---|---|
| A1 | 群組助理開放給 org_members：`visibleModules` 對 org 成員依 `org_settings.modules` 回模組（src/org/modules.ts:19-25）；middleware 拿掉「gs_liff 只放行 /attend」（src/middleware.ts:103-116）；`surfaces.ts:69` 讓 org_members 拿到「群組管理」面向 | src/org/modules.ts、src/middleware.ts、src/org/surfaces.ts | 1 |
| A2 | 19 支群組助理 API 補 org 綁定：共用 helper `gsAccess(form)` → `orgAdminAccess` → `{org, groupIds}`；帶 group_id 者走 `assertGroupInOrg`；以 id 操作者改 `.eq('id').in('group_id', groupIds)`；`reindex`（src/app/api/reindex/route.ts:13 目前刪全庫 embeddings）改逐 org | src/app/api/**（白名單：webhook/login/liff/auth/digest/attend） | 2 |
| A3 | 5 個頁面跨群聚合補範圍：layout 徽章（(admin)/layout.tsx:28-33）、今天頁（(admin)/page.tsx:51-75）、收件匣 `filt()`（inbox/page.tsx:43-67）、groups 頁（groups/page.tsx:27-28）、files 頁（files/page.tsx:77）——先 `orgGroups()` 取 ids 再 `.in('group_id', ids)` | src/app/o/[org]/(admin)/* | 1 |
| A4 | 守門測試第四支：靜態掃描 `src/app/api/**/route.ts`，白名單外每支必 import `orgAdminAccess`／`gsAccess`；仿 tests/routes.test.ts:55-72。加規則：抽取／回答 prompt 的資料來源只能是本群查詢 | tests/api-guard.test.ts | 0.5 |
| G1 | **app_settings id=1 全面遷 org_settings**：進群告知、模型、預算、`last_webhook_at` 改讀寫 org_settings（欄位已建但無人讀，src/org/orgs.ts:76-80）；改 src/core/ingest.ts:133-139、src/app/api/settings/route.ts:14-40、src/core/settings.ts:40-44、webhook 心跳、settings/page.tsx:39-58 | 上列 5 檔 | 1.5 |
| G2 | 金鑰不再互借：LIFF session 簽章改獨立 `SESSION_SECRET`（src/core/liff.ts:25-27、src/middleware.ts:54-57 目前借 `LINE_CHANNEL_SECRET ?? ADMIN_PASSWORD`）；`/api/digest` 的 `?key` 改 `CRON_SECRET`（src/app/api/digest/route.ts:9-14） | 上列 3 檔 | 0.5 |
| A5 | 「未認領」歸戶：新 org `slug='unclaimed'`；`default_org_id()`（012_orgs.sql:23-26）改回 unclaimed。**未認領群不落地訊息、不抽取、不索引**，`@bot` 只 reply 固定文字「請管理員到後台認領此群」（reply 免費，src/core/ingest.ts:300-312）；未認領 7 天 bot 自動 leaveGroup。歸戶介面：平台擁有者在 `/o/main/groups` 每列「所屬組織」下拉。**認領／轉移一律 upsert groups 列（K2 修正 (2)）** | migrations/015、src/core/ingest.ts:110-118、extract.ts、indexer.ts、groups/page.tsx | 1.5 |
| A6 | 租戶一的資料手術：`scripts/split-main.ts` 一次性——demo 群搬到獨立 `demo` org；`ADMIN_LINE_USER_ID` 由 migration 種進 org_members(owner)，移除 callback 自動種子（src/app/api/auth/line/callback/route.ts:49-57）；`scripts/new-org.ts` 取代 README.md:260-262 的手動 SQL | scripts/、migrations/015、callback route | 1 |
| A11 | 模組開關 `org_settings.modules text[] default '{gs}'` | src/org/modules.ts、migration 015 | 0.5 |
| G3 | **org_id 欄位先加、不寫 policy**：messages/events/tasks/notes/embeddings/media_assets/push_subscriptions 加 `org_id`，insert trigger 從 groups 帶入，backfill 一支 SQL；建 `transfer_group(gid, org)` 函式（以 groups.org_id 為唯一真相，K2 修正 (1)）。**注意**：此後轉移從單列 UPDATE 變成跨 6–7 表批次 UPDATE，大群可達數十萬列——仍非搬檔案，但要在背景跑 | migration 015 | 0.5 |
| G5 | **（由階段二提前，K1 修正）** Connector 留門：`lineConnector` 由模組單例改 `lineConnector(creds)` 工廠＋`getConnector(channelId)`，只重構介面不做功能（12 處呼叫點：src/connectors/line.ts:7,18,157；src/core/liff.ts:22,26,35,100；auth/line 兩檔；ingest.ts:9-10,72-77；digest.ts:21-22,54；middleware.ts:57；三頁）。理由：形態 A 的條款風險（5.5(6)）與 Provider 規範無關，若 LINE 認定適用，形態 B 是唯一與條款結構一致的路徑，此時金鑰收成函式不能還沒做 | 上列 12 檔 | 1 |
| K3-1 | **（K3 附帶）** `embeddings` 加 `(group_id)` btree 索引（schema.sql:58-59 目前無；match_embeddings 以 where group_id 後過濾 HNSW，schema.sql:120）——零風險單行 migration | migration 015 | 0.1 |
| S1 | staging：第二個 Supabase Free 專案＋第二個 Messaging API channel＋`.env.staging`；所有 migration 先在 staging 跑 | 設定 | 0.5 |
| — | 檢查項：Group information 24 小時保存限制（User Data Policy 3.2.3／3.2.8）對 `groups.name/picture_url` 與成員快取（src/core/liff.ts:88-118，10 分鐘 in-memory）的適用性——**未查證**，列入第 0 節第 3 項詢問信 | — | 0.2 |

**1b：收第一筆錢之前（≈13 人日）**

| # | 要改什麼 | 檔案／表 | 人日 |
|---|---|---|---|
| A7 | 新租戶零資料上手卡：bot 加好友 QR／連結（env `LINE_BOT_BASIC_ID`）、「邀進群組」三步、「已收到 N 則，整理中」即時狀態；標明「未認證官方帳號（灰盾）」 | (admin)/page.tsx:141-148 | 1 |
| A8 | 方案欄位與硬上限：`org_settings` 加 `plan`、`status`、`max_groups`、`max_subscribers`、`monthly_extract_cap`、`paid_until`；超過拒絕歸戶並顯示升級文案；**降級語意**：Free 超保存期→只留索引；`suspended`（逾期 14 天）→停抽取與索引、bot 續留 30 天後 leaveGroup、資料再留 60 天後刪除，全程 1:1 私訊 org owner | migration 016、api/group/update、(admin)/layout.tsx | 1 |
| B5→ | **（由階段二提前，K5 修正）** per-org 用量與預算煞車：`api_usage` 加 `org_id`＋呼叫類別（AsyncLocalStorage 帶 org；supabase/migrations/006_api_usage.sql:5-27、src/providers/gemini.ts:21-40）；超額（`org_settings.monthly_budget_usd` 或 `monthly_extract_cap`）先停抽取與 vision、保留落地與索引；平台級 `PLATFORM_MONTHLY_CAP_USD` 警報。理由：目前唯一煞車是 Gemini 回 429（gemini.ts:47），Free 永久免費在無封頂下等於開放式支出 | migration 016、gemini.ts、settings/page.tsx:53-59 | 2 |
| B7→ | **（由階段二提前，K5 修正）** 抽取合批 debounce 30–60 秒：抽取 prompt 固定塞 profile＋既有項目 ≤60×3（MAX_EXISTING，src/core/extract.ts:11）＋否決清單＋前文 20 則，輸入與新訊息數幾乎無關；現況每批 webhook 事件就對群呼叫一次 extractGroup（src/app/api/webhook/line/route.ts:35-38），只有 running 鎖期間（extract.ts:182-195）才天然合批。把呼叫數壓到訊息「陣」數是最便宜的毛利槓桿。**Batch API 50% 折扣不適用**（目標 24 小時完成，https://ai.google.dev/gemini-api/docs/batch-api ） | src/core/worker.ts、extract.ts | 1 |
| A9 | 營運底線：Supabase 升 Pro（US$25/月；Free 一週不活動暫停＝漏 webhook，https://supabase.com/pricing ，2026-09-23 查閱）；LINE console 開 redelivery；`GET /api/health`＋UptimeRobot；Dockerfile 加 HEALTHCHECK；`org_settings.last_webhook_at` 靜默 >6 小時私訊該 org 管理者 | Dockerfile、src/app/api/health/route.ts | 0.5 |
| G4 | **webhook 先落地再回 200**：新表 `webhook_events(channel_id, webhook_event_id 唯一, is_redelivery, payload, processed_at, error)`；route 只做「驗簽→同步 insert→200」；冪等鍵用 `webhookEventId` 並以 `deliveryContext.isRedelivery` 辨識（https://developers.line.biz/en/docs/messaging-api/receiving-messages/ ，2026-09-23 查閱；parseEvents 目前忽略這兩欄，src/connectors/line.ts:25-31）；處理改由 `instrumentation.ts` 啟動的同容器輪詢迴圈取代 `after()` | migration 016、webhook route、src/core/worker.ts | 2 |
| L1 | **（新增，K6 修正）** LIFF 開啟事件落表：`/api/liff/session`（src/app/api/liff/session/route.ts:8-25 目前不寫任何紀錄）建 session 時寫 `funnel_events(org_id, group_id, line_user_id, step='liff_open', source, at)`；`source` 由觸點帶 query（告知文／@回答／每日提醒，三處目前只放 LIFF 首頁 URL：src/core/ingest.ts:10,25-41,310-312、src/core/digest.ts:119-120）；加單群深連結 `https://liff.line.me/{LIFF_ID}?g=<groupId>`。沒有這項，第 6 節止損線永遠觸發不了 | liff/session route、ingest.ts、digest.ts、migration 016 | 0.5 |
| G6 | LIFF 群組頁「把它拉進你的其他群」按鈕：`liff.shareTargetPicker()` 送 Flex 卡（加好友＋邀請三步＋`?ref=<orgId>`）；**前提未做**：全案無 shareTargetPicker 呼叫（`grep -rln share src` 只命中 links.ts、related-items.tsx），需在 Console 啟用並同意資訊使用協議、LINE ≥10.3.0、單次最多 5 則（https://developers.line.biz/en/reference/liff/ ，2026-09-23 查閱）；漏斗步驟寫入 funnel_events：告知→開啟→分享→新群 join→歸戶→第 2 群→付費 | src/app/g/[groupId]/page.tsx、src/app/ui/share-card.tsx | 1.5 |
| G7 | 進群告知改三段（DEFAULT_NOTICE 在 src/core/ingest.ts:13），租戶可在 `org_settings.join_notice_text` 署名；**明寫「本群整理由認領的組織管理，可匯出」**（第 8 節混合群條款風險） | src/core/ingest.ts | 0.3 |
| G8 | 新租戶前 7 天抽取門檻再高一級（`needs_confirmation` 全開），上手卡明說「前幾天需要你確認幾筆」（docs/principles.md 規則一） | src/core/extract.ts | 0.2 |
| E1 | 跨行業抽取回歸集：`scripts/extract-eval.ts`＋`tests/fixtures/golden/`（≥3 行業各 30–50 則）；上第一個非同業租戶前跑一次記錄假陽性率 | scripts/、tests/fixtures | 1 |
| A10 | 法務最低配：`/privacy`、`/terms`、設計夥伴一頁合約模板。隱私頁明列 Supabase 區域＋DPA（https://supabase.com/legal/customer-resources/data-processing-addendum ）、Gemini **一律付費 Tier**（免費層內容會被 Google 用於改進產品且人工可審閱，https://ai.google.dev/gemini-api/terms ，2026-09-23 查閱）、30 天刪除、72 小時通報 SOP。**對外文件不得宣稱「已符合 LINE 規範」，只寫「走 LINE 官方 Messaging API」（K1 修正）** | src/app/privacy、src/app/terms、docs/legal | 1 |
| P1 | PWA 最低基礎：`public/manifest.json`＋icons＋`viewport`＋theme-color（目前全無：src/app/layout.tsx:4、無 public/） | src/app/layout.tsx、public/ | 0.5 |
| U2/U3/U12 | 今天頁時間軸移出主畫面、待辦卡四鈕收斂、`/g` 空狀態文案修正（第 7 節） | (admin)/page.tsx:231-267、tasks/page.tsx:20-72、src/app/g/page.tsx:35 | 1.6 |

**階段一不做**：per-tenant LINE 金鑰（只做函式留門）、RLS policy、in-memory 鎖全面落 DB、`groups_view` 增量計數、付款頁、自助建 org、租戶匯出、i18n、搬離 NAS。

**時程換算（本人有正職）**：25 人日在「每週 1 人日」下約 6 個月、「每週 2 人日」約 12–13 週。**只承諾 1a 在 90 天內完成**，1b 隨第一家設計夥伴的回饋並行。

### 2.2 階段二：→ 10 個付費客戶（約 14 人日，逐項依觸發做）

| # | 觸發 | 要改什麼 | 人日 |
|---|---|---|---|
| B1 | 第一筆付款入帳當週 | 搬離家用 NAS：Hetzner CX22（€3.79/月）或 Fly.io shared-cpu 1GB（2026-10-01 起 US$8.78/月，https://fly.io/pricing-update/ ）；NAS 改跑離站備份 cron | 0.5 |
| B2 | 首次匯入 >5 萬則 | **（K3 附帶）** 匯入改背景工作＋進度＋可續傳：src/core/importer.ts:64-97 目前在單一 HTTP 請求內循序 200 則/批 insert＋embedding，gemini.ts:118-131 每 50 筆一次呼叫無重試；txt 無訊息 ID、重匯會重複入庫（importer.ts:63）。30 天窗外訊息已直接標已抽取（importer.ts:41-45），不會觸發抽取風暴 | 1 |
| B3 | 第 3 個客戶 | 認領碼取代平台下拉：設定頁產生一次性認領碼（複製 `attend_join_code` 模式，src/app/a/join/page.tsx:9-10,33-46）→ 群裡發「@bot 認領 XXXX」→ `transfer_group()`；群內所有人看得到誰認領了；先認領者得 | 1.5 |
| B4 | 第 3 個客戶 | 自助建 org：LINE Login 後無 org（callback:59-68 目前導 `?error=noorg`）→「建立組織」頁；同一 LINE userId 只能建 1 個 Free org | 1.5 |
| B6 | 任一租戶訂閱者 > 10 人，或 `/message/quota/consumption` 實測逼近方案免費則數 | per-org 推播計數（src/core/digest.ts:21-70），方案上限。**真實約束是「方案免費則數 ÷ 每月推播天數」而非單價（K7 附帶）**：輕／中用量超額不能加購只能升級；平台 OA 升高用量 2026-11-01 起 NT$1,400／6,000 則、加購前 5 萬則每則 0.2 元（https://tw.linebiz.com/column/LINEOA-2026-Price-Plan/ ，2026-09-23 查閱） | 1 |
| B8 | 任一客戶要求，或第 5 個客戶 | 租戶匯出（JSON＋媒體 zip）與租戶級刪除；`suspended` 的 leaveGroup 排程 | 2.5 |
| B9 | **總訊息量破 10 萬則或 groups_view 查詢 >200ms**（K3 修正：原「百萬則」改為專案自己的痛點，docs/plan.md:397） | `groups` 加 `message_count/last_at` trigger 取代 groups_view 全表聚合（012_orgs.sql:69-75）；`embeddings` 加 `(source_id, chunk_idx)` 唯一鍵 | 1 |
| B10 | 第 5 個客戶，或首家要求線上刷卡 | **收款走 PAYUNi 統一金流（使用者 2026-09-23 定案）**：個人會員即可申請、免設定費年費、信用卡＋LINE Pay＋ATM＋超商一次到位。訂閱扣款做法：PAYUNi 沒有內建「定期定額」，但有「信用卡 Token（約定）」API（`credit_bind_query` / `credit_bind_cancel`，https://github.com/payuni/PHP_SDK ，2026-09-23 查閱），所以由我們自己的 cron 每月用 Token 走信用卡幕後 API 扣款，`org_settings.paid_until` 順延；扣款失敗 3 次→`suspended`。已知數字：國內卡 2.8%（合作通道 2.4%）、LINE Pay 處理費 0.2%、撥款 T+7、個人會員信用卡月額度初始 20 萬（可逐步調到 100 萬；達 8 成先填調額申請書）（https://site-now.app/payuni-review/ ；https://help.teachify.com/zh-tw/article/teachify-payuni-ezvjgt/ ）。**未查證**：個人會員能否開通 Token 約定功能（可能需審核或商業會員），申請時第一句就問；發票仍不能由 PAYUNi 代開（個人無統編），見分岔 1 | migration 016、src/app/api/billing/**、cron | 2 |
| B11 | 第 3 個客戶 | `ADMIN_PASSWORD` 降 break-glass（`isPlatformOwner()` 不再對任意 org 回 owner，src/org/orgs.ts:32-34,55）；登入節流改表 | 1 |
| B12 | 第 3 個客戶 | 鎖落 DB：`pg_try_advisory_xact_lock(hashtext(group_id))`＋既有 `claimed_at` 租約（src/core/extract.ts:245-260）；`media_assets` 加 `attempts/claimed_at`（src/core/ingest.ts:214-236） | 1.5 |
| B13 | 第 3 個客戶 | LINE channel secret 雙值驗簽與 token 輪替流程 | 0.5 |
| B14 | 群組數 > 100 | `/g` 首頁候選縮小（src/app/g/page.tsx:20-24、src/core/liff.ts:94-126） | 1 |
| B15 | 第 5 個客戶 | 角色 owner/admin/viewer、稽核日誌 `audit_log` | 2 |

### 2.3 階段三：→ 100 個客戶（不排程，只列觸發與正確做法）

- **RLS 第二道牆**（觸發：第一份客戶資安問卷要求 DB 層隔離，或守門測試第二次抓到漏寫）：用階段一已加的 `org_id` 欄位寫 policy。**不用 `set_config('app.org_id')`**——唯一 client 是 supabase-js／PostgREST（src/db.ts:11-19），每個 REST 呼叫是獨立交易；正解是 per-org 短效 JWT（claim 帶 org_id，policy 用 `auth.jwt()->>'org_id'`）並讓請求路徑不再用 service role（https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac ，2026-09-23 查閱）。**RLS 是隔離議題不是效能議題（K3 附帶）**：階段一的應用層 helper＋守門測試是「第二個租戶上線」的必要條件，RLS 是第二道牆，兩者觸發條件不同。
- **web／worker 分離＋pg-boss**（觸發：抽取延遲 p95 > 5 分鐘或單實例 CPU 飽和）：以 group_id 為 singleton key、以 org 公平排程。
- **形態 B（客戶自有 OA）**（觸發：LINE 對 5.5(6) 的答覆為「適用」，或 ≥3 家為白牌願付 NT$4,900+/月）：channels 加 `bot_user_id`、加密金鑰欄（Supabase Vault）、webhook 以 `body.destination` 查表驗簽；翻案 schema.sql:11「金鑰絕不進 DB」；G5 已在階段一留門，剩約 7–9 人日。
- **法人化 → LINE Certified Provider → 模組市集**（觸發：付費 ≥20 或營收足以負擔法人固定成本；或個人網路銷售勞務當月達 NT$5 萬須辦稅籍登記，見第 4 節）。
- **i18n 擴到群組助理**（觸發：第一個非繁中租戶付費）。
- **每租戶獨立 Supabase 專案／Ollama provider**（觸發：客戶要求且願付 Enterprise 價；src/core/config.ts:14 目前只有 gemini）。
- **第二個 Connector**（觸發：LINE 平台風險實現或明確市場需求）。

---

## 3. LINE 帳號形態：形態 A（單一 GroupScribe 官方帳號）為 Beta 預設，形態 B 留門

**決定**：Free／Starter／Team 一律共用 GroupScribe 自己的 Messaging API channel＋LIFF／Login channel；形態 B 在階段三作為 Enterprise 加購，**或在 LINE 答覆不利時成為全面路徑**。

**合規依據（K1 被駁回，修正如下）**

| | 原本 | 修正後 | 理由 |
|---|---|---|---|
| Provider 規範 | 「Certified Provider 簡報規定 Channel 須建於同一公司 Provider 下；本計劃解讀該條只管客戶自己的 OA」 | **維持**：LINE 台灣〈Provider 及 Channel 設定說明〉（https://tw.linebiz.com/manual/line-official-account/line-porvider-and-channel-intro/ ，2026-09-23 查閱）主詞是「系統整合商／官方帳號經銷商」、客體是「提供官方帳號服務的客戶」；形態 A 的租戶沒有取得任何 OA，GroupScribe 自己就是 Service Provider。LINE Developers 的 best practices（https://developers.line.biz/en/docs/line-developers-console/best-practices-for-provider-and-channel-management/ ）也只規範委外開發情境 | 查無任何官方條文禁止「一個產品 bot 被邀進多家公司的群」 |
| 條款依據 | 「OA API 條款 4.3 的 Operator 角色本就給代管者用」 | **刪除**。4.3 的 Operator 是「Customer 指定管理 Customer 自己服務的人」——那是形態 B（租戶＝Customer、GroupScribe＝Operator）的法律結構。形態 A 中 GroupScribe 是 Customer，租戶既非 Customer 也非 Operator，4.3 不適用 | 用錯條文背書 |
| 真正的風險 | 未提及 | **新增**：LINE 官方帳號 API 使用條款（台灣，2024-11-26 生效，https://terms2.line.me/official_account_api_terms_tw ）5.5(6)「Information 不得提供或公開揭露予 Operator 以外之任何第三人」（無「用戶同意即可」例外文字）；LINE User Data Policy（https://terms2.line.me/LINE_Developers_user_data_policy?lang=en ）3.4 同旨、3.2.3／3.2.8 Group information 不得保存超過 24 小時。形態 A 的核心行為正是把群成員的訊息、userId、顯示名稱整理後交給租戶管理員——租戶對 Customer 而言是第三人 | 這才是形態 A 可能被否定的條文 |
| 市場先例 | 「TaskLine 以單一 bot 進多家公司群收費」 | **降級為「市場慣例」**：TaskLine（https://taskline.jp/ ，2026-09-23 查閱）確為同構，但頁面無營運法人、無 LINE 認證標示、/terms 與 /tokushoho 皆 404，只能證明有人這樣做，不能證明 LINE 允許 | 證據力不足 |

**對決策的影響**
1. 形態 A 仍可作 Beta 預設（免費層、示範、設計夥伴 Free 期），但 **LINE 書面答覆是「形態 A 進入收費階段」的前置閘門**：答覆前可收設計夥伴的錢，但合約要明寫「若平台規範要求改為客戶自有官方帳號，由 GroupScribe 協助遷移、不另收費」。
2. 第 0 節第 3 項的詢問信必須問 5.5(6) 與 24 小時保存限制，不是問 Provider 規範。
3. G5（金鑰收成 per-channel 函式）提前到階段一必做，不只是留門。
4. 對外文件不得宣稱「已符合 LINE 規範」。

**仍成立的理由**
- 零金鑰改動；形態 B 要每客戶自開 Messaging API＋Login channel＋LIFF 並自填 webhook——對「沒有 IT 的群組管理者」是直接流失。
- userId 以 Provider 為界（https://developers.line.biz/en/docs/messaging-api/getting-user-ids/ ，2026-09-23 查閱）：形態 A 下 `org_members / employees / push_subscriptions` 以 `line_user_id` 為鍵（schema.sql:235-244,271-278,310-323）與 `surfaces.ts` 多面向切換原封不動；形態 B 下同一人在兩家是兩個 userId。
- reply 免費、只有 1:1 push 計費（K7 成立，見第 4 節）。
- 擴散只在形態 A 成立：P3 在客戶群已是這個 bot 的好友。

**其他已知風險**
- 未認證帳號（灰盾）接受度：**未查證**，前 3 家設計夥伴訪談必問。
- `GET /group/{gid}/member/{uid}` 對未認證帳號是否可用：官方未標限制，正式站已在用；staging channel 建好後實測。
- 未認領群零落地、7 天退群（A5）：同時解決陌生群燒費、隱私、條款曝險。

---

## 4. 商業模式與定價（K4 被駁回，修正版）

**計價單位**：每組織固定月費、以群組數分級；成員數不限。硬上限＝降級不加價。

| | 原本 | 修正後 | 理由 |
|---|---|---|---|
| 價格帶 | Team NT$990（5 群）／Business NT$2,490（20 群） | **Free NT$0（1 群）／Starter NT$690（3 群）／Team NT$2,190（10 群）／Enterprise 洽談** | 唯一同構標竿 TaskLine 的階梯是 Free ¥0（1 群、7 天保存、AI 30 次/月）／Basic ¥2,980（3 群）／Pro ¥9,800（10 群）（https://taskline.jp/ ，2026-09-23 查閱；以 0.21–0.22 匯率粗估約 NT$650／NT$2,100，匯率未逐日查證）。990 起跳比標竿高約五成、無台灣依據 |
| 依據 | 「MIC 2025 價格敏感度高於資安」 | **降級**：該調查樣本主體是 200–1,000 人、資本額 1–10 億企業（https://ec.ltn.com.tw/article/breakingnews/5018863 ，2025-04-21），不能推論 5–50 人團隊；且六到七成企業雲端預算持平 | 用錯客群的證據 |
| 發票 | 「≥2/3 客戶要求發票才翻案」 | **預設多數付費客戶會要求統一發票**：Ragic 把發票綁在轉帳＋人工報價流程（https://www.ragic.com/intl/zh-TW/doc-kb/92/pricing-changes-with-switching-plans-or-the-number-of-users ）；無發票的 SaaS 訂閱在以發票核銷的公司被視為憑證不完整（https://go.commeet.co/blog/費用管理/saas-subscription-expense-reimbursement/ ）；雲市集買賣雙方皆須公司登記（https://botsup.cc/zh-TW/research/taiwan-tcloud-subsidy-application-guide-2026 ，2026-04-15） | 被動立場改主動 |
| 第一個要量的數字 | 「990 是否成交」 | **示範後「願付最高價」（van Westendorp 四題或直接問）＋「要不要發票」** | 付費意願無台灣直接資料——**未查證**，只能實測 |

| 方案 | 月費（未稅） | 群組 | 每日提醒訂閱者 | 抽取上限 | 保存 | 備註 |
|---|---|---|---|---|---|---|
| Free | NT$0 | 1 群 | 3 人 | **每月 300 次抽取呼叫（A8 `monthly_extract_cap`，K5 備援）** | 90 天後只留索引 | 每 LINE userId 限 1 個；不做推薦解鎖 |
| Starter | NT$690 | 3 群 | 10 人 | 方案內不限，超 `monthly_budget_usd` 降級 | 無限 | 入門 |
| Team | NT$2,190 | 10 群 | 30 人 | 同上 | 無限＋匯出＋稽核日誌 | 主力 |
| Enterprise | 洽談（≥NT$4,900） | 不限 | 不限 | — | — | 自有 OA（形態 B）、白牌告知文、DPA 客製 |
| 考勤加購 | 另訂 | — | — | — | — | 不進主定價頁 |
| 設計夥伴（前 10 家） | 上列半價 6 個月，第 7 個月起原價；年繳 10 個月價 | ≤10 群 | | | | 換每月 30 分鐘回饋；Beta 明寫無 SLA；**明寫平台規範變動時的遷移條款（第 3 節）** |

**單位經濟（K5 未查證，改有備援寫法）**
- 已確認：gemini-3.5-flash-lite 標準 $0.30/$2.50 per 1M、輸出價含 thinking tokens（https://ai.google.dev/gemini-api/docs/pricing ，2026-09-23 查閱）；預設 thinking On (minimal)、無 off（https://ai.google.dev/gemini-api/docs/thinking ）；程式碼未設 thinking_level 與 maxOutputTokens（src/providers/gemini.ts:68-72）；抽取為主的結構成立（src/core/extract.ts:449-484）。
- **未查證**：每租戶每月成本。合成版「US$1–16」把呼叫次數估低——現況接近「每則非低資訊訊息≈一次呼叫」，中租戶（2 萬則/月）更可能 US$20–35。README.md:93-94「一萬則 <US$0.05」寫於 2026-07-31（ed990dd），預設模型隔天才改 3.5-flash-lite（d722c52），且設定頁有「免費層每日上限」欄位（011_ai_settings.sql:9），極可能是免費層數字；**免費層依 Google 條款不能承載租戶資料**。
- **驗證方式**：第 0 節第 6 項——一次唯讀 SQL（`api_usage.calls` ÷ 同期非低資訊 messages），零成本、開發者本人在正式庫執行；第一個客戶上線後用 per-org api_usage（B5→）實測一個月。
- **備援**：不論實測結果，A8 的 `monthly_extract_cap`（Free）與 `monthly_budget_usd`（付費）封頂＋B7 合批進階段一；以悲觀值計（Starter 租戶 US$8/月≈NT$260），Starter 毛利仍 >60%；Team 租戶 US$35≈NT$1,130，毛利 ≈48%，**Team 價若實測落在此區間要上調或以合批壓下**。
- 固定成本：Supabase Pro US$25＋主機 US$4–9＋LINE 高用量 NT$1,400（僅在訂閱者超過免費 200 則/月才升）≈ NT$2,500–2,800/月 → **4 個 Starter 或 2 個 Team 打平**。

**K7 成立（high）**：reply 不計費、push 按送達人數計、免費額度歸官方帳號（https://developers.line.biz/en/docs/messaging-api/pricing/ 、https://tw.linebiz.com/column/LINEOA-2026-Price-Plan/ ，皆 2026-09-23 查閱；程式碼 src/connectors/line.ts:99-103,150-166、src/core/ingest.ts:300-311、src/core/digest.ts:33-54）。附帶：reply token 約一分鐘有效（**未逐字查證**），若 LLM 回答逾時須改走 push 才產生費用——@回答要維持快速或改回「稍後私訊」。

**收款**：前 3 家銀行轉帳＋收據，不寫付款程式；第 4 家起接 PAYUNi（B10）——先用它的「整合式支付頁」收單月／單年，Token 約定扣款等個人會員確認可開通再上。PAYUNi 個人會員月額度 20 萬，以 2,190 計約 90 家內不會卡住。**法人化客觀觸發線**：個人透過網路銷售勞務當月銷售額達 NT$5 萬須於次月底前辦稅籍登記（https://www.etax.nat.gov.tw/etwmain/tax-info/network-transaction-taxtation-area/press/PEwQK1V 、https://law-out.mof.gov.tw/LawContent.aspx?id=GL010768 ）——以 2,190 計約 23 家、690 計約 72 家；「打平」階段尚未觸發，但也開不出統一發票。**未查證**：稅籍登記後的小規模營業人能否自願申請使用統一發票、以及成本——向所轄國稅局電話詢問，零成本。

**AGPL 與託管**（Plausible 模式，https://plausible.io/blog/open-source-saas ，2022-06-22）：自架版功能完整、免費、不閹割；託管賣營運價值；第三條收入線「自架＋年度支援」等有 IT 的客戶出現再開；CLA＋商標保留雙授權與品牌。

---

## 5. 行銷與 GTM（前 10 個付費客戶）

**核心訊息**：不賣「AI 轉型」也不賣「摘要」，賣具體漏掉的事——「上週傳的估價單在哪」「誰說要去現場」。三個不用：不用換工具、不用開帳號、不用教員工。信任句：程式碼公開、進群告知後沉默、成員只看自己的群、一鍵整包刪除、走官方 API 不碰個人帳號（2026-04 有台灣用戶因非官方自動發訊被強制登出，https://weken.news/articles/line-openchat-bot-messaging-api-not-supported ）。**對抗 LINE 疲勞（K6 修正）**：明寫「bot 不在群裡講話、提醒只私訊給訂閱的人、管理端可在電腦上看」。

| 通路 | 做法 | 成本 | 時程 | 預期 |
|---|---|---|---|---|
| C1 跨行業熟人示範 | 列 20 個「用 LINE 群跑工作」的熟人團隊（≥3 行業、第一家非同業），一對一 15 分鐘示範，當場開 Free；**示範結束問兩題：願付最高價、要不要發票**；兩週後談設計夥伴合約 | 0 元、每家 1 小時 | 1a 完成後第 1–6 週 | 20 → 8 試用 → 3–4 付費 |
| C2 LINE Notify 難民 | Notify 2025-03-31 終止（https://notify-bot.line.me/closing-announce ）；社群回文＋一篇「Notify 停了之後，群組裡的事怎麼不漏」 | 0 元、每週 2 小時 | 第 2–12 週 | 每月 5–10 試用 |
| C3 bot 進群自帶曝光 | 告知文三段（G7）＋@回答尾端單群深連結（L1）＋G6 分享按鈕；GroupScribe 自己的 OA 當落地頁 | 0 元 | **L1、G6 上線後才啟動量測** | 每個付費客戶帶 0.5 個新試用 |
| C4 Threads 短內容 | 每週一則前後對照（去識別化）；不上 Product Hunt（中位數 115 註冊 <3 付費，https://hub.causo.ai/guides/product-hunt-traffic-data-2026 ） | 0 元、每週 1 小時 | 持續 | 品牌與搜尋 |
| C5 GitHub／開源 | README 品質、Issue 回覆 | 0 元 | 持續 | P4 自架者 |
| 不做 | 廣告、代理商分潤、LINE 外掛市集（需法人）、參展 | | | |

**驗證指標（每週看，資料來源 funnel_events）**：示範 → bot 進群（activation 1）→ 7 天內第一筆「確認」（activation 2 ≥60%）→ 第 30 天管理員每週開後台 ≥2 次（retention ≥50%）→ 試用→付費 ≥30%；LIFF 開啟率 >30%、分享按鈕使用率 >5%（**L1、G6 上線前這兩項無法量測**）；新租戶 7 天內忽略率 <40%；跨租戶事件＝0；**前 5 家示範中「要求發票」比例與「願付最高價」中位數**——這兩個數字決定分岔 1 與 Team 定價。任一低於門檻先修產品、不加通路。

---

## 6. App 決策：不做原生、不做包殼；LIFF 為主，PWA 給管理端（K6 被駁回，理由修正）

| | 原本 | 修正後 |
|---|---|---|
| 理由 | 「台灣 16 歲以上 LINE 使用率 99.4% → 員工不想再裝 App；LIFF 已覆蓋身分、觸點、好友狀態、分享」 | 「原生 App 的成本與審核風險高（下述）、LIFF 觸點對成員足夠。99.4%（NCC 113 年，https://commsurvey.ncc.gov.tw/ ）只證明觸點存在，不證明偏好；『不想裝 App』**未查證**（海外 74% 反對強制裝軟體的數據樣本與年份未能查證）。LIFF 目前只覆蓋身分與觸點；好友狀態要 Console 連結 channel；**分享尚未實作**（無 shareTargetPicker、無單群深連結）」 |
| 零安裝 | 「零安裝入口」 | 「零安裝、**非零摩擦**」：首次開啟有 channel consent 畫面（https://developers.line.biz/en/docs/liff/opening-liff-app/ ，2026-09-23 查閱）、外部瀏覽器走 liff.login()（src/app/g/liff-init.tsx:37-50） |
| 止損線 | 「LIFF 開啟率 <20% 或分享率 <2% 則重評」 | **止損線保留，但前置 L1（開啟事件落表）與 G6（分享）必須先做**——目前 /api/liff/session 不落任何紀錄，止損線不可觀測等於不存在 |
| 時效 | 未提 | LIFF 併入 LINE MINI App（https://developers.line.biz/en/news/2025/02/12/line-mini-app/ ，2025-02-12），新 LIFF 建議直接建 MINI App；MINI App 認證需 Certified Provider 法人——**中期需評估，列為第 8 節監測項** |

| 面向 | 形態 | 備註 |
|---|---|---|
| 成員版 `/g`、員工打卡 `/a` | 只靠 LIFF | GPS 在 WKWebView 可用（src/app/a/punch-client.tsx:56-67 已在用）；掃碼 scanCodeV2 |
| 管理端 `/o/[slug]` | 網頁＋最低 PWA（P1，0.5 人日） | 給「不想在 LINE 裡談公事」的管理者一條桌面路徑；不做 Service Worker／Web Push |
| 推播 | LINE 1:1 push（docs/plan.md B.8） | LIFF 不支援 Service Worker／A2HS（https://developers.line.biz/en/docs/liff/differences-between-liff-browser-and-external-browser/ ） |

**原生 App 為什麼是負資產**：Apple US$99/年＋審核 4.2（webview 包殼近乎必拒）＋4.8（LINE Login 為主帳號須配替代登入，與「LINE userId 即身分」衝突）＋IAP 抽 15%；Google 個人帳號每個 App 需 12 位測試者 14 天（https://support.google.com/googleplay/android-developer/answer/14151465 ）；多一道安裝就砍掉 P3 擴散節點。

**觸發重評（任一成立才開這題）**：(1) ≥3 個付費客戶明確要求 LINE 之外的推播或離線；(2) 考勤付費客戶 ≥5 家要求背景地理圍欄或防偽（App Attest／Play Integrity）；(3) 第二個 Connector 上線且該平台無 LIFF 等價物；(4) LINE 強制 LIFF 遷 MINI App 且台灣要求 Certified Provider；(5) **L1 上線 60 天後 LIFF 開啟率 <20%**——此時重評的方向是「傳統 B2B 銷售＋桌面管理端」，不是原生 App。

---

## 7. UI 改善清單

| 優先 | 問題（證據） | 改法 | 八題依據（docs/principles.md） | 人日 |
|---|---|---|---|---|
| **P0 U0** | 隔離類：收件匣／今天頁無 `?group=` 時列全部租戶待確認項目與原文、徽章跨 org、files 頁案名出現在別租戶篩選（inbox/page.tsx:43-67、(admin)/layout.tsx:28-33、files/page.tsx:77）；設定頁改的是全站（settings/route.ts:14-40） | A3＋G1 | 第 1 題、第 8 題（不可逆） | 已計 |
| **P0 U1** | 新租戶零資料只有一句「把 bot 加進群組」（(admin)/page.tsx:141-148） | 上手卡三步＋即時「已收到 N 則」（A7） | 第 7、4 題 | 1 |
| **P1 U2** | 今天頁下半屏「時間軸（最近 100 則）」原始訊息表格（(admin)/page.tsx:231-267） | 移到 `?view=timeline`；主畫面只留搜尋框；時間改 `MM/DD HH:mm` | 規則二（呈現層噪音）、規則三 | 0.5 |
| **P1 U3** | 待辦卡一列四顆同尺寸鈕（tasks/page.tsx:20-72） | 一列只留「圈＋編輯」；批次 checkbox 改「選取」模式才出現 | 第 6、7 題 | 1 |
| **P1 U4** | LIFF 每張卡都有「編輯」鈕 | 點卡片展開才出現編輯／忽略 | 第 1 題 | 0.5 |
| **P1 U8** | LIFF 沒有「拉進其他群」 | G6 分享卡（含 Console 啟用前置） | 第 1 題 | 已計 |
| **P1 U9** | 進群告知是隱私聲明口吻（src/core/ingest.ts:13-22） | G7 三段改寫＋租戶署名＋「本群由認領組織管理」 | 第 1 題 | 已計 |
| **P1 U12（新增，K6）** | `/g` 空狀態文案「發過訊息就會出現」（src/app/g/page.tsx:35）與實際判定（群成員 API，src/core/liff.ts:88-96）不一致，首次使用者被誤導 | 改為「你是 GroupScribe 所在群組的成員，這裡就會出現該群的整理」＋「看不到群組？bot 可能尚未加入或你已退群」 | 第 7 題 | 0.1 |
| **P2 U5** | 月曆議程每筆前 BatchBox（calendar/page.tsx:484-497） | 選取模式才出現 | 第 1、5 題 | 0.3 |
| **P2 U6** | 兩模組時手機頂欄擠面向膠囊＋群組切換器（shell-header.tsx:26-33） | 面向切換移進頭像選單 | 第 7 題 | 0.5 |
| **P2 U10** | 升級提示（新） | 只在觸發點出現（加第 2 群、第 4 位訂閱者） | 第 2 題 | 0.3 |
| **P2 U11** | 用量／預算卡顯示全站數字（settings/page.tsx:53-59） | B5→ 後改本租戶 | 第 7、4 題 | 已計 |
| keep | 收件匣（inbox/page.tsx:153-175）是最直覺的一頁 | 不改；作為 demo 主軸 | — | 0 |
| 不做 | 整體視覺改版、深色以外主題、i18n 擴到群組助理、桌面版重排 | 沒有客戶要求 | | |

---

## 8. 風險與對策

| 風險 | 嚴重度 | 對策 | 監測 |
|---|---|---|---|
| 跨租戶漏寫 `.eq()`（RLS 開了但零 policy，schema.sql:168-177,304-306） | 高 | A2–A4 helper＋守門測試進 CI；每季用第二個測試 org 打遍每個端點；階段三 RLS（per-org JWT） | 跨租戶事件＝0 |
| **LINE 條款 5.5(6)／User Data Policy 3.4 認定形態 A 為「提供第三人」（K1 修正後的主風險）** | 高 | 第 0 節第 3 項書面詢問；G5 提前；設計夥伴合約明寫遷移條款；對外不宣稱「符合 LINE 規範」；答覆不利 → 形態 B 全面化（約 7–9 人日） | LINE 書面答覆；任何官方通知 |
| Group information 24 小時保存限制對 groups.name/picture_url 快取的適用 | 中 | **未查證**，併入詢問信；若適用，改為每次讀取即時取或 24 小時 TTL | 同上 |
| 單一 `ADMIN_PASSWORD`／`ADMIN_LINE_USER_ID` 後門（src/core/auth.ts:8-14、liff.ts:52-59） | 高 | G2 拆鑰＋A6 移除自動種子；B11 降 break-glass | — |
| LINE 平台自帶群組 AI（K8 成立，medium） | 高 | 台灣 2026 計畫只列「AI 對話幫手（OA）」與「旅遊助手」（https://www.linecorp.com/en/pr/news/global/20251028/ 、https://www.lycorp.co.jp/en/story/20260218/taiwan_converge2025.html ），未提 Agent i；日本 Agent i 是「群內、公開、使用者逐一 opt-in」形態，無管理者跨群視圖／審核佇列／引文；差異化放這三件事 | **每季查一次 LINE 台灣官方 blog／新聞稿**；一旦台灣一般群組推出摘要／待辦即啟動「重心移到跨群管理與營運模組」 |
| AI 成本高於推導（K5 未查證） | 中 | 第 0 節第 6 項零成本算比例；A8 封頂＋B7 合批＋B5→ per-org 預算皆在階段一；付費 Tier 強制 | 單租戶月 AI ≤ 方案上限×1.2 |
| 付費意願與發票（K4 修正） | 中 | 前 5 家示範量 WTP 與發票需求；Starter 690 起；發票需求 ≥3 家即啟動稅籍登記／B10 | 示範後兩題的統計；線上收款走 PAYUNi 個人會員，不等法人化 | 示範後兩題的統計；PAYUNi 開通與 Token 功能是否核准 |
| 混合群第三方個資：租戶匯出／跨群總覽含外包、客戶的訊息 | 中 | docs/plan.md B.1 群組是 consent 邊界；G7 明寫「本群由認領組織管理、可匯出」；匯出範圍＝該 org 認領群組的群層資料；未認領群零落地（A5） | 匯出請求數 |
| webhook 漏收不可回補 | 高 | G4 先落地再回 200＋webhookEventId 冪等；redelivery 開啟 | 漏收＝0 |
| 家用 NAS 單點 | 中 | 第一筆入帳當週搬 VPS（B1）；Beta 合約無 SLA | 月可用率 ≥99.5% |
| 大量匯入卡死（K3 附帶） | 低 | B2 背景工作（觸發：首次匯入 >5 萬則） | 匯入失敗次數 |
| 免費層／逾期客戶離場 | 中 | A8 降級語意 | — |
| 抽取假陽性摧毀信任（principles 規則一） | 中 | G8＋E1；30 天窗已做 | 新租戶 7 天忽略率 <40% |
| 個資法（2025-11 修正） | 中 | A10 隱私頁＋分處理者清單＋30 天刪除＋通報 SOP | 刪除請求 ≤30 天 |
| 單人營運 | 中 | 自動化、README 即 runbook、每季演練還原；設計夥伴 ≤10 家 | 支援回覆中位數 ≤24h |
| LIFF 併入 MINI App（認證需 Certified Provider） | 低→中 | 現行 LIFF 短期無虞；法人化在階段三；每季查公告 | LINE 公告 |
| AGPL 被拿去開閉源 SaaS | 低 | AGPL §13＋CLA＋商標 | — |
| 對正式庫直接跑 migration | 中 | S1 staging | — |

---

## 9. 里程碑與可量測指標

**90 天（→ 2026-12-22）**
- 第 0 節六件零成本事項完成（CLA、商標、LINE 詢問信【改題版】、區域確認、staging、呼叫／訊息比 SQL）。
- 階段 1a 全部完成並部署（含 G5、embeddings 索引）；守門測試第四支進 CI；租戶一資料手術完成。
- 1b 至少完成 A7、A8、B5→、B7→、A9、A10、G4、L1；U2、U12 完成。
- 3 家設計夥伴上 Free（≥2 家非舞台技術產業、第一家非同業），其中 ≥1 家付費（半價）。
- 指標：跨租戶事件 0；webhook 漏收 0；每租戶 AI 實測成本（取代推導）；activation 2 ≥60%；前 3 家示範的 WTP 與發票需求已記錄；README「一萬則成本」更新為付費層實測。

**6 個月（→ 2027-03-23）**
- 1b 全部完成（含 G6）；B1、B3、B4、B11、B12、B13 依觸發完成；已搬離 NAS。
- 5–8 家付費、MRR ≥ NT$5,000；**LINE 對 5.5(6) 的書面回覆已取得（或已啟動形態 B）**。
- 指標：30 天 retention ≥50%、試用→付費 ≥30%、LIFF 開啟率 >30%、分享使用率 >5%、月可用率 ≥99.5%、毛利 ≥70%（以付費層實測為準）。

**12 個月（→ 2027-09-23）**
- 10–20 家付費、MRR ≥ NT$15,000；續約率 ≥70%；≥3 個行業、無單一行業 >40%。
- B6、B8–B10、B14、B15 依觸發完成；決定是否法人化（發票、Certified Provider、OA 認證）；決定是否開 Enterprise 形態 B。

（里程碑依「本人有正職、每週約 1–2 人日」下修。）

---

## 10. 需要使用者拍板的分岔（最多兩項）

| # | 分岔 | 選項 A | 選項 B | 建議 |
|---|---|---|---|---|
| 1 | **法人化／稅籍登記與收款時機**（K4 修正：台灣 B2B 買方索取統一發票是常態；個人身分只能開收據；當月網路銷售勞務達 NT$5 萬須辦稅籍登記） | 現在辦行號／稅籍登記：可開發票、日後 Certified Provider 有法人身分；固定成本先發生 | 前 3 家以收據處理並事先說明，**示範第一句就問「要不要發票」**；≥2 家要求或當月達 NT$5 萬即辦 | **B**——付費意願是第一個要驗證的假設；但把「發票」從被動翻案條件改成主動量測。**未查證**：小規模營業人能否自願使用統一發票，先打電話問國稅局。**注意：PAYUNi 個人會員只解決「怎麼收錢」，不解決「發票」——兩件事分開看** |
| 2 | **bot 品牌名與告知文署名**（一旦定了不能改） | 顯示名維持「GroupScribe」，告知文可由租戶署名 | 改中性中文名（如「群組小記」） | **A**（與開源社群一致；中文暱稱放告知文第一句），但這是品牌決定 |

其餘分岔本計劃已定：形態 A 為 Beta 預設、LINE 書面答覆為收費閘門；第一個月就收錢（設計夥伴半價 6 個月）；第一筆入帳當週搬 VPS；Free＝1 群永久免費、抽取每月封頂、無推薦解鎖；認領必須在群內可見、先認領者得；未認領群零落地、7 天退群；考勤作為加購不進主訊息；RLS 等階段三且用 per-org JWT。

---

## 附錄：關鍵主張驗證表

| 主張 | 判定 | 對計劃的處置 | 證據 |
|---|---|---|---|
| K1 形態 A 不違反 LINE Provider 規範；4.3 Operator 適用；TaskLine 先例 | **refuted（medium）** | 第 3 節重寫：Provider 規範部分維持；刪 4.3 依據；新增 5.5(6)／User Data Policy 3.4 與 24 小時保存為主風險；詢問信改題；G5 提前；LINE 答覆為收費閘門；對外不宣稱合規 | https://tw.linebiz.com/manual/line-official-account/line-porvider-and-channel-intro/ ；https://developers.line.biz/en/docs/line-developers-console/best-practices-for-provider-and-channel-management/ ；https://terms2.line.me/official_account_api_terms_tw （2024-11-26）；https://terms2.line.me/LINE_Developers_user_data_policy?lang=en （2023-10-01）；https://taskline.jp/ ；README.md:116、docs/plan.md:33,42（皆 2026-09-23 查閱） |
| K2 全表以 group_id 為鍵、org 只掛 groups、媒體私有簽名 URL → 歸戶零搬資料 | **holds（high）** | 證據寫進 2.0；三個精度修正納入 A5／G3／B5→ | supabase/schema.sql:16-33,35-46,48-59,61-66,70-77,79-93,126,130-161,235-243,267-269,295-301；supabase/migrations/012_orgs.sql:4-6,28-33,69-76；src/org/orgs.ts:6-10,61-73；src/core/ingest.ts:73-83,330-335；src/core/media.ts:59；src/app/o/[org]/(admin)/files/page.tsx:84-87；src/app/g/[groupId]/page.tsx:197；src/core/importer.ts:65-70；src/app/api/group/delete/route.ts:23-25 |
| K3 10 客戶內單容器＋groups_view＋in-memory 鎖撐得住；崩點在千萬則 | **holds（medium）** | B9 觸發改「10 萬則或 >200ms」；embeddings (group_id) 索引進 1a；匯入背景工作列 B2；RLS 從效能推論鏈拆出 | supabase/schema.sql:33,58-59,108-123,295-301；docs/plan.md:397；src/core/extract.ts:182-206,245-260；src/core/importer.ts:41-45,63-97；src/providers/gemini.ts:118-131；src/app/api/import/route.ts:5；tests/ 無負載測試；https://ai.google.dev/gemini-api/docs/rate-limits （embedding RPM 未列，未查證） |
| K4 台灣 5–50 人團隊願付 NT$990–2,490、決策者是群組管理者、免採購 | **refuted（medium）** | 第 4 節定價改 Free／690／2,190；MIC 依據降級；發票改預設需求並列成交前置問題；分岔 1 加客觀觸發線（NT$5 萬/月）；「願付最高價」為第一個量測 | https://taskline.jp/ ；https://ec.ltn.com.tw/article/breakingnews/5018863 （2025-04-21）；https://www.ragic.com/intl/zh-TW/doc-kb/92/pricing-changes-with-switching-plans-or-the-number-of-users ；https://go.commeet.co/blog/費用管理/saas-subscription-expense-reimbursement/ ；https://www.etax.nat.gov.tw/etwmain/tax-info/network-transaction-taxtation-area/press/PEwQK1V ；https://law-out.mof.gov.tw/LawContent.aspx?id=GL010768 ；https://botsup.cc/zh-TW/research/taiwan-tcloud-subsidy-application-guide-2026 ；小團隊 WTP／決策者：未查證 |
| K5 AI 成本每租戶 US$1–16、毛利 ≥80%、合批可縮 2–5 倍 | **unverified（medium）** | 第 4 節標未查證；驗證方式＝第 0 節第 6 項 SQL＋B5→ 實測；備援＝A8 封頂、B5→／B7→ 提前進階段一、付費 Tier 強制、悲觀毛利重算 | src/providers/gemini.ts:47,60-63,68-72；src/core/extract.ts:9-11,116-127,181-195,213,449-484；src/app/api/webhook/line/route.ts:33-38；src/core/profile.ts:8-9；supabase/migrations/006_api_usage.sql:5-12；README.md:93-94（ed990dd 2026-07-31）vs d722c52（2026-08-01）；https://ai.google.dev/gemini-api/docs/pricing ；https://ai.google.dev/gemini-api/docs/thinking ；https://ai.google.dev/gemini-api/docs/batch-api ；https://ai.google.dev/gemini-api/terms （皆 2026-09-23 查閱） |
| K6 LIFF 是零安裝入口且已覆蓋身分／觸點／好友／分享；員工不想再裝 App | **refuted（medium）** | 第 6 節理由改寫；新增 L1（開啟事件落表＋深連結）為 G6 前置；U12 文案修正；PWA 桌面路徑明寫；MINI App 時效列監測 | src/app/api/liff/session/route.ts:8-25；src/core/liff.ts:22,88-118；src/app/g/page.tsx:35；src/app/g/liff-init.tsx:37-50；src/core/ingest.ts:9-10,25-41,310-312；src/core/digest.ts:119-120；全案無 shareTargetPicker；https://developers.line.biz/en/docs/liff/opening-liff-app/ ；https://developers.line.biz/en/reference/liff/ ；https://developers.line.biz/en/news/2025/02/12/line-mini-app/ ；https://news.nextapple.com/life/20250823/8719AC31DA8E592CAE3EF1CE4749A000 （2025-08）；「不想裝 App」海外數據未查證 |
| K7 reply 不計費、push 按收件人次、免費額度屬 OA、2026-11-01 高用量 NT$1,400／6,000 則、加購 0.2 元 | **holds（high）** | 證據寫進第 4 節；B6 觸發改以 `/message/quota/consumption` 實測；reply token 逾時風險註記 | https://tw.linebiz.com/column/LINEOA-2026-Price-Plan/ ；https://developers.line.biz/en/docs/messaging-api/pricing/ ；https://tw.linebiz.com/service/account-solutions/line-official-account/ （皆 2026-09-23 查閱）；src/connectors/line.ts:99-103,150-166；src/core/ingest.ts:300-311；src/core/digest.ts:33-54；reply token 有效期未逐字查證 |
| K8 LINE 官方群組 AI 12 個月內不在台灣推等價功能，且不做跨群總覽／審核收件匣／引文 | **holds（medium）** | 第 1 節文案禁區＋三個賣點；README.md:217「摘要」改「提醒」；第 8 節每季查台灣公告觸發器 | https://www.lycorp.co.jp/ja/news/release/020594/ （2026-07-02）；https://www.lycorp.co.jp/ja/news/release/020805/ （2026-09-11）；https://ai-revolution.co.jp/media/what-is-lineyahoo-agent-i/ （2026-09-14）；https://www.linecorp.com/en/pr/news/global/20251028/ ；https://www.lycorp.co.jp/en/story/20260218/taiwan_converge2025.html ；https://line-tw-official.weblog.to/archives/25515573.html （2023-11-06）；https://www.bnext.com.tw/article/83090/line-ai-app （2025-05-07）；README.md:217 |
