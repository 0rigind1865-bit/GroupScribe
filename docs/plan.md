# GroupScribe 專案計劃 v4

> 2026-07-16 v3 重整定稿；2026-07-25 v3.1 驗收更新（見 F 節）；**2026-07-25 v4：第一性原理審查（45 條發現）收斂進 B / D / E / H 節**。本檔為唯一 canonical 計劃（取代先前所有版本；歷史見 git log 與 README）。
> 重整原則：**一次做對、不回頭改**——schema 一次到位（管理者只重跑一次）、UI 殼先建好再掛新頁面、每步完成即凍結。
> 草稿經三方獨立評審（返工陷阱／YAGNI 與完整性／獨立可執行性）修正後定稿。
> **要知道「下一步做什麼」直接看 H 節的執行批次；要知道「為什麼」看 B 節定案決策；
> 要知道「憑什麼這樣判」看 [`principles.md`](principles.md)（訊號與噪音第一性原理＋八題檢查表）。**

## A. 現況（已完成並驗證）

| 範圍 | 內容 |
|---|---|
| MVP | 沉默式 LINE bot 記錄（文字/圖/PDF）、低資訊過濾、向量索引、@提及時間加權問答附來源、txt 匯入、unsend 同步刪除、密碼登入 Dashboard |
| Phase 1 | 結構化抽取引擎（events/tasks、跨訊息指代、去重更新、needs_confirmation 流程）、月曆視圖、待辦視圖、Tailwind v4 改版 |
| Phase 2（步驟 0–5 完成 2026-07-17） | 群組名稱/頭貼/分類/生命週期、公告決議(notes)抽取與視圖、月曆四視圖切換＋週/日時間軸(auto-degrade)＋議程時間範圍、跨群今日面板、(admin) route group 殼＋導覽切換器＋手機 RWD |
| Phase 3（2026-07-19～07-25，計劃外增量，詳見 F 節） | 設定頁（進群告知編輯/開關）、匯入貼上＋提取狀態面板＋即時進度、抽取過期/陳舊項目忽略、**群組理解 profile**（AI 逐群歸納產業/術語/成員/案子並注入抽取與回答 prompt——決策 7(a) 預留的「產業詞彙提示」之自動化實現）、AI 用量自記帳＋預算進度條、檔案頁三層（類型/內容/專案篩選＋五種排序分組＋AI 依上下文歸專案）、全站多選批次操作、抽取引擎跨進程原子認領防重 |
| Phase 4（2026-07-25） | **LIFF v1＋v2**（成員唯讀入口→可確認/修正/忽略，三重把關）、**成員四分頁**（今天/月曆/待辦/公告，?tab= MPA 零 client JS）、**群組理解隨用隨新**（抽取到新東西且逾 7 天自動重新歸納）＋新增「觀察與建議」段、項目同時段照片（±10 分鐘配對）、管理員綁 LINE 帳號免密碼進後台、UI 改版 A/B/C（深色模式、五格底部 Tab、收件匣）——詳見 G 節 |
| 驗證 | 「中山北路案 10/20＋幾點到＋1500」情境端到端通過；真實群組 webhook 即時入庫＋抽取運作中；Phase 2 各步瀏覽器截圖驗證；2026-07-25 七代理逐條驗收：MVP 7/7、Phase 1 6/6、Phase 2 步驟 0–6 全數、定案決策遵循全數通過（file:line 證據）；**2026-07-25 六代理第一性原理審查：45 條發現，骨架 keep 11 條、fix 19 條、build 15 條（見 H 節）** |
| 營運 | **正式部署（2026-07-19 上線）：自架 Debian NAS（Docker，restart=always）＋ Tailscale Funnel 固定 HTTPS**——always-on、不用買網域、與既有 Nextcloud 同機共存。本機 dev＋ngrok 僅開發用（勿與正式同接一個 LINE channel）。**⚠ 資料主權的誠實描述**：自架的是**應用層**（容器在自己機器），資料本體（Postgres／向量／Storage 媒體原檔）仍在 Supabase 雲端，且**目前零備份、單點**——備份與匯出見 D 表「營運韌性」（H 節第四批）。要做到真正資料落地，需依「架構」段抽換 Provider 為自有 Postgres＋pgvector＋本地 LLM |

技術棧：Next.js 15 全端單一服務、Supabase（Postgres＋pgvector＋Storage）、Gemini（純 REST 零 SDK）、Tailwind v4。架構：core 平台無關、connectors/providers 可抽換。測試環境：任一 bot 在內的群組皆可；測試訊息需含具體資訊（貼圖、「好」「收到」會被低資訊過濾擋掉）。

## B. 定案決策（不再重議）

1. **雙入口架構**：群組 = 資料主權/consent/刪除邊界（資料層永遠 keyed on group_id）；跨群組聚合 = 管理者專屬入口的查詢層 overlay，永不外流給群成員。理由：現有全部資料表天生以 group_id 為界，consent 與刪除以群組為單位，是既成事實而非新約束。
2. **已砍（YAGNI）**：多使用者權限系統、workspace/組織層、多租戶、泛用 JSONB 記錄表、SOP 獨立表（embeddings 已涵蓋全文語意檢索）。重議觸發條件：(a) 服務第二家公司 → 多租戶；(b) 非管理者要能「編輯」→ RBAC。觸發前不重議。
   視覺化類已砍（理由一律中性、不依產業，見決策 7）：訊息活動熱力圖（死群/活群由 groups_view 的 message_count＋last_at＋left_at 涵蓋）、金額趨勢圖（結構化金額不存在；且聊天記錄中的報價 ≠ 開票 ≠ 入帳，財務真相在會計系統）、待辦負載圖（清單本身即負載視圖；重議條件＝open tasks 規模大到列表掃不動，屬用量觸發）、事件地點地圖（location 為自由文字、geocoding 需外部 API 違反極簡；重議條件＝出現結構化地點需求）。
3. **LIFF 雙階段（v1＋v2 皆已於 2026-07-25 完成）**：
   - **v1 唯讀**：群成員以 LIFF 入口 `/g/[groupId]` 看自己群組的整理。
   - **v2 成員可操作**：成員可**確認/修正/忽略**自己群組的事件/待辦/公告——把 AI 抽取的待確認工作量分散給最清楚狀況的人。這**不是**被砍的全套 RBAC，權限規則只有一條「A 群成員只能動 A 群資料」：身份＝LIFF ID token（伺服器端驗證）、範圍＝寫入端點三重把關（session→成員資格→group_id 綁進查詢）。刪除群組資料與跨群聚合視圖永遠 admin-only。
   - **「新增」刻意不做**（v2 實作時定案）：成員想加東西，在群組講一句話 bot 就會記錄——那才是本產品的主路徑；另開手動建立入口會讓脈絡脫離對話、弱化核心價值。需求真的出現再補。
   - **成員資格判定（v4 翻案）**：原設計「由 `messages(group_id, sender_id)` 推導（發過言＝成員）」**不足且不安全**——(a) txt 匯入訊息沒有 sender_id（實測全庫 9980 則僅 72 則有），純推導幾乎沒人進得來；(b) 更嚴重：發過言的人**退群/被踢後仍永久保有讀寫權**。**定案：LINE 群成員 API（`GET /v2/bot/group/{gid}/member/{uid}`）為權威、404 即拒絕；messages 推導降為 API 網路失敗時的備援**（快取 10 分鐘）。此改判一併自然關閉「bot 已離開群組」的入口。
   - **硬約束：LINE Login channel 必須與 Messaging API channel 建在同一個 LINE Provider 底下，userId 才一致**（規劃書 4.1）。
4. **撞期偵測（v4 解耦，前置已成立）**：原前置＝「事件確認流程被實際使用（start_time 有值、事件被人確認）」**兩者皆已成立**（抽取規則明確填時間；收件匣與 LIFF v2 確認流程已上線）。原本把撞期紅字推給「跨群聚合視圖家族」、而家族又 gated on「今日面板用一陣子後評估」，形成兩層連鎖、實質無限期延後。**定案：與聚合家族解耦**——今天畫面與月曆日視圖對同日時間重疊的事件直接標紅，純查詢層零 schema。
5. **群組分類用自由文字 `category`**（理由：單人使用、enum 需改 schema 而 schema 變更成本高，有分類習慣後再收斂）；**記錄類型只新增一張 `notes` 表以 kind 區分**（理由：公告/決議欄位同構，各建表是重複建設；全文檢索已由 embeddings 涵蓋）。
6. **notes 枚舉值（現在定案，避免不同 session 各自發明）**：`kind` ∈ `announcement`（公告）/ `decision`（決議）；`status` ∈ `active` / `ignored`（比照 events）。
7. **產業無關原則**：本產品目標是「所有有通訊群組工作流的團隊」，功能的取捨與形態只能以**資料模型、用量觸發、通用管理場景**為依據，**不得以開發者本人所處的產業或個人習慣為依據**——dogfooding 的那個群組只是首個驗證場景，如同 LINE 只是首個 Connector。具體約束：(a) 抽取 prompt 的範例詞彙保持跨產業通用，產業特化詞彙屬示例、不得成為規則（未來若需要，做「產業詞彙提示」設定，延後）；(b) UI 不寫死任何產業術語（著色/分類依資料欄位或通用啟發式，不依特定行業關鍵字）；(c) 評估功能時的 persona 是「用群組工作的團隊管理者」，不是特定行業。
   - **已由 `groups.profile` 落地（Phase 3）**：AI 逐群從該群自己的紀錄歸納產業/術語/成員/案子，注入抽取與回答 prompt——這正是 (a) 預留的「產業詞彙提示」的自動化正解，未硬編任何行業。
8. **沉默的定義與送達契約（v4 新增，本次審查最大產出）**：第一性原理的後半句是「在**對的時刻**給對的人」。現況送達 100% 靠人主動開頁面（Dashboard／LIFF／@提及問答），**只有對的人、沒有對的時刻**——捕捉到的知識沒人想起來開頁面就等於沒送達，迴路斷在最後一哩；而此項在 v3 的 D 延後表裡根本不存在，不是被延後，是缺席。
   - **釐清**：「沉默式」指 **bot 不插嘴群組對話**（不主動在群組發言、不回應非 @ 的訊息），**不等於**永不主動交付。bot 本來就會回 @提及、進群時會發告知。
   - **定案形態（使用者 2026-07-25 拍板）**：**1:1 私訊、每個人自己決定訂不訂閱、群組永遠零聲量**。優於「群組日摘預設關」——沉默契約完整保留，且 consent 落到個人層級（誰想收誰自己開），不必由管理者代所有人決定。
   - **已查證的硬約束（勿再重新發現）**：(a) LINE 1:1 push **要求對方已加 bot 好友**，只是群成員不夠；(b) `liff.getFriendship()` 可查 `friendFlag`，但前提是 **LINE Login channel 與官方帳號（Messaging API channel）在 console 明確「連結」**——同 Provider 不夠——且 LIFF 需 `profile` scope。故訂閱流程必須是：LIFF 開關 → `getFriendship()` false 就先引導加好友 → 訂閱才生效；push 回 403（封鎖/解除好友）時自動停用該訂閱。
9. **已確認資料是權威（v4 新增）**：人確認過的 `events`/`tasks`/`notes` 是全系統信度最高的知識——它經過人背書，優於原始對話片段。
   - **推論一**：@提及回答必須優先採信結構化資料，向量檢索的聊天片段降為佐證。否則會出現「人把時間從 15:00 改成 14:00，@bot 問還是答 15:00」——人的確認勞動對 AI 零回報，迴路斷在出口端。
   - **推論二**：抽取 prompt 的既有項目清單要標示「已確認／待確認」，已確認值為權威，僅在對話出現明確變更（改期、更正）時才 update；否則舊聊天片段會把人剛修正的欄位蓋回去。
   - **推論三**：人按「忽略」是最便宜的負向訊號，必須回饋——近 30 天被忽略的項目要餵進 prompt 標明「人已否決，勿再建立」，否則話題重現時 AI 會重建、迫使人重複勞動。

## C. 近期執行計畫（步驟 0–5 全部完成 2026-07-17；下一波見 D 延後清單）

排序原則：(1) schema 一次到位——管理者只重跑一次 schema.sql；(2) UI 殼先於新頁面——之後加頁面只是掛進殼；(3) 便宜高價值先行。

### 步驟 0｜地基（schema＋介面，一次到位）

schema.sql 追加（全部冪等）：

```sql
create table if not exists groups (
  group_id text primary key,
  name text,                -- LINE summary API 取得；null 表示尚未取得或取不到
  picture_url text,
  category text,            -- 自由文字分類；null = 未分類
  left_at timestamptz,      -- bot 被移出群組的時間（leave 事件），回補時跳過
  updated_at timestamptz not null default now()
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  kind text not null,                     -- announcement / decision
  title text not null,
  body text,
  pinned boolean not null default false,
  status text not null default 'active',  -- active / ignored
  needs_confirmation boolean not null default true,
  source text not null default 'ai',
  source_message_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_group_status on notes (group_id, status);

-- groups_view 改為 left join（欄位有變動，必須 drop 重建，不能 create or replace）
drop view if exists groups_view;
create view groups_view as
  select m.group_id, g.name, g.picture_url, g.category, g.left_at,
         count(*)::int as message_count, max(m.created_at) as last_at
  from messages m left join groups g on g.group_id = m.group_id
  group by m.group_id, g.name, g.picture_url, g.category, g.left_at;

alter table groups enable row level security;
alter table notes enable row level security;
```

介面：`MessagingConnector` 加 `resolveGroupSummary?(groupId): Promise<{ name?: string; pictureUrl?: string } | undefined>`（types.ts）；LINE 實作 `GET /v2/bot/group/{id}/summary`，in-memory 快取比照 `resolveSenderName`（line.ts）。

已砍欄位（評審裁定）：`notes.date`（有日期的是 event 不是 note；「何時決議」由 created_at 涵蓋）、`groups.channel_id`（messages 已帶可推導、零消費者）、`groups.last_synced_at`（updated_at 已涵蓋語意）。

驗證：管理者到 Supabase SQL Editor 重跑 schema.sql → Table Editor 看到 `groups`、`notes` 兩表即過；`npm run typecheck` 過。

### 步驟 1｜群組名稱/頭貼（＋群組生命週期）

- webhook 收訊時 lazy upsert `groups`（該群 name 為空才打 summary API 一次）
- **upsert 紀律（防互相覆寫）**：webhook 只 upsert `{group_id, name, picture_url, updated_at}`；分類更新只 upsert `{group_id, category, updated_at}`；禁止 read-modify-write 整列寫回——PostgREST upsert 只 SET payload 內欄位，兩者不互踩
- **回補（併入 POST /api/process）**：掃 `groups_view` 中 name 為空者（以 messages 推導為基準——純匯入群、歷史群在 groups 表可能根本沒列）；404（bot 不在群/自訂 group_id）仍 upsert 空列標記「已嘗試」（name null＋updated_at 有值），下次回補跳過，顯示退回 group_id。README 端點說明同步更新
- **leave 事件**：line.ts parseEvents 加 `leave` → ingest 標 `groups.left_at`（回補跳過已離開的群，總覽可區分死群）
- **group/delete 連動刪 `groups` 列**（groups 從此步開始有資料，刪除邊界必須涵蓋）
- 顯示：總覽卡片、匯入頁 datalist 等處改用 name（null 退回 group_id）；**datalist 的 option `value` 必須維持 group_id、name 只放 label**，否則匯入送錯值

驗證：`curl -X POST /api/process`（帶登入 cookie）觸發回補 → 總覽頁 hash 變真實群組名稱；不必等新訊息進來。

### 步驟 2｜UI 殼一次到位（route group＋導覽列＋全域切換＋RWD）

- **建 `src/app/(admin)/` route group**：nav＋群組切換器放 `(admin)/layout.tsx`，page/calendar/tasks/import（及未來 notes、files）全搬入；root layout 只留 html/body/globals.css。URL 不變。**理由：殼若放 root layout，未登入的 /login 頁會內含全部群組名稱（洩漏），且未來 LIFF `/g/` 必須拆殼重構——route group 讓 /login 與 /g/ 天然在殼外**
- `(admin)/layout.tsx` 撈 groups 前先 `dbConfigured()` guard（未設定時不炸）
- 切換器：client component（usePathname＋useSearchParams，**外包 `<Suspense>`**），groups 清單由 layout（server）傳入；從第一天就依 category 以 optgroup 分組（null 顯示「未分類」）——步驟 3 只補資料，不回頭改
- **切換群組時參數白名單**：只保留 view 參數（如 month），**丟棄 entity 參數（event、task、q）**——否則會把 A 群的詳情 id 帶進 B 群
- **順手一行（LIFF 前置）**：calendar/tasks 詳情查詢加 `.eq('group_id', group)`，杜絕跨群讀取
- 導覽維持 MPA（`<a>`／切換器用 `location.assign`），layout 每次整頁重渲染、groups 清單不過期；nav 連結做成陣列常數，未來加頁＝加一行
- 手機版：nav 漢堡或水平捲動（擇簡）；月曆 md 以上保留 7 欄格線、md 以下改當日/當週議程列表（同一份 byDay 資料，不改查詢）；詳情卡表單 `flex-col md:flex-row`、輸入 `w-full`；TaskRow 按鈕群 RWD
- 刪除各頁重複的 group-select GET form

驗證（375px 逐頁）：無橫向捲動、nav 可操作、月曆呈議程列表、切換群組後 event/task/q 參數被清掉。此步完成後「殼」凍結。

### 步驟 3｜群組分類

- 總覽卡片加 category 編輯（input＋datalist 既有分類＋儲存）→ `POST /api/group/update`，**用 upsert 不用 update**（匯入群可能沒有 groups 列，update 會靜默無效）
- 總覽依 category 分區顯示；切換器 optgroup 自動生效（步驟 2 已備）

驗證：對含匯入群在內的群組設定分類 → 總覽分區與切換器分組正確。

### 步驟 4｜notes 記錄類型（公告/決議）

- extract.ts：prompt 加公告/決議抽取規則＋`create_note`/`update_note` 操作；`RefMaps` 加 notes 代號表（N1…）；既有 notes（active）餵入 prompt 供 update 去重
- **明文定案：notes 抽取 forward-only、不回補**——重置 extracted_at 游標會讓 events/tasks 重複建立（既有清單只餵近 14 天＋待確認，更舊的事件不在 prompt 裡）。驗證一律用新訊息
- `/notes` 頁掛進殼（仿 tasks 分區：待確認/有效/已忽略；pinned 置頂）
- `POST /api/notes/update`（confirm/ignore/save）
- group/delete 連動刪 notes
- 測試：`tests/core.test.ts` 的 parseOps 加 create_note/update_note 變體（壞 kind、未知 N ref 丟棄、無更新欄位丟棄）；離線驗證用 `npx tsx scripts/extract.ts <groupId>`（不需 ngrok）

驗證：群組貼「以後到場一律提前 30 分鐘」→ `/notes` 出現待確認公告；confirm/ignore/save 各操作一次。

### 步驟 2.5｜月曆視圖切換（月/週/日/議程，Google Calendar 式）

使用者需求：月曆要能切換月/週/日/議程視圖，手機也要能看整月全貌（現況被斷點強制成議程列表）。經三方設計評估定案。

**核心原則：四個視圖在 UX 層，渲染只有兩個原語**——`monthGrid` 月格線 ＋ 一支「議程列表渲染器」（week/day/agenda 都餵它不同日期集合，不各自造元件，符合「不做只有一個實作的抽象」）。

**視圖定案**（初版一律列表式；後於步驟 2.6 讓時間軸以 **auto-degrade 形態回歸**——把「事件多無 start_time」變成時間軸的設計前提而非否決理由）：

| 視圖 | 桌機 | 手機 |
|---|---|---|
| month | 現有 7 欄文字格線（原封不動） | 7 欄**圓點格線**（aspect-square、日期＋≤3 彩點 emerald/amber 沿用 chip＝已確認/待確認＋「＋N」溢出），點某天→日視圖 |
| week | grid-cols-7 每欄一天直向 chip | 直向堆疊 7 個日區塊（列表式） |
| day | 單日 chip 列表（byDay.get(date)） | 同桌機 |
| agenda | 該月有事件日子的卡片列表 | 現有 md:hidden 列表升為獨立視圖，桌機手機共用 |

手機月視圖拿掉現在的 `hidden md:block` 硬斷點 → 手機終於能看整月。

**URL 狀態**：統一 `?date=YYYY-MM-DD`（單一日期錨點）＋ `?view=month|week|day|agenda`（預設 month）。向後相容：date 優先、無 date 但有舊 `month` → `${month}-01`、都無 → today。導航步長全在 server component 純 UTC 運算（避台北跨日）：month/agenda ±1 月、week ±7 天、day ±1 天。視圖切換器＝標題列 4 個 `<a>`（複用 .btn，當前段 aria-current 加底色，手機 grid-cols-4、桌機 inline，零 client state）。「今天」鈕保留 group＋view、date=today。詳情回跳 `back` 改帶 `view+date`。

**複用/新增**：複用 monthGrid、byDay、chip 樣式、.btn、?event= 詳情卡。grid.ts 新增純函式 `addDays(iso,n)`、`weekDays(iso)`（週日起、對齊 monthGrid 的 getUTCDay 0=Sun），供單測。抽一支議程列表渲染器（agenda/day/week 三處共用）。group-switcher 的 `KEEP_PARAMS` 由 `['month']` 改 `['view','date']`（丟 event）。**砍**：跨日長條、拖拉建立/改期、now 紅線（資料撐不起）。~~小時時間軸~~ → 改於步驟 2.6 以 auto-degrade 形態回歸（翻案記錄，勿再砍）。

**用戶已拍板**：四視圖一次做齊（含週視圖，列表式）；預設視圖＝month。

**Commit 切分**（各自 typecheck＋375px 手測）：
1. URL 狀態地基（?view=＋?date=、向後相容 ?month=）＋視圖切換器＋今天鈕＋議程渲染器＋month（桌機文字格線／手機圓點格線）＋day＋agenda＋group-switcher 白名單改 view/date＋grid.ts 加 addDays
2. week 視圖（grid.ts 加 weekDays；桌機 grid-cols-7、手機直向 7 塊）

**優先序**：步驟 5（今日跨群面板）仍最高。此步是真能力缺口（手機看不到整月），插到步驟 3/4 之前。

### 步驟 2.6｜週/日時間軸 + 議程時間範圍（翻案 2.5 的「不做時間軸」）

使用者兩點新需求：(1) 週/日視圖要小時刻度時間軸；(2) 議程要能選時間範圍、看到跨月/跨年的遠期行程。經三方設計評估定案。**翻案關鍵：不是推翻「資料稀疏」的理由（理由仍成立），而是把稀疏當時間軸的設計前提——auto-degrade。**

**A. 時間軸（auto-degrade）**：不做比例高度/固定工期方塊（無 ends_at＝假資訊）。兩區：
- 上「未定時間」區：`start_time===null` 事件（多數），flex-wrap 堆 EventChip——**永遠渲染**（＝現行列表，零改動零風險）。
- 下「小時刻度軸」：`start_time` 有值的事件依 (日,小時) 落格、同格 flex-col 堆疊——**僅當可視範圍內至少一筆 timed 事件才畫**，否則整段收合。無手動 toggle（auto-degrade 已涵蓋）。
- grid：`grid-template-columns: auto repeat(N, minmax(0,1fr))`（首欄小時標籤、N 欄放日），`grid-auto-rows: minmax(3rem,auto)`（同格多筆自動長高、週視圖 7 欄同小時列對齊）。外層 `overflow-y-auto`+`max-h` 保險。
- 小時範圍**動態聚焦**（否決固定 0–24）：純函式從 timed 事件算 [min,max]±1、clamp[0,24]、撐最小窗；無 timed → null → 不畫軸。
- **單一原語 `TimeGrid days={string[]}`**：日視圖傳 `[dateIso]`（N=1）、週視圖傳 `weekDays(dateIso)`（N=7），完全共用。

**手機週降級（定案）**：時間軸＝「日視圖（全尺寸）＋週視圖桌機」。手機週維持現行直向 7 塊列表（沿用 month 的 `hidden md:grid`／`md:hidden` 分流）。理由：375÷7≈53px/欄低於觸控目標、橫捲與縱捲打架、LIFF webview 差、MPA 非手勢滑動不可靠。

**B. 議程時間範圍**：`?range=30d|90d|1y|all`（**預設 90d**）。選項：未來 30 天／90 天（預設）／1 年／全部（gte today、`.limit(200)` 防爆、超量提示）。**否決「本月」**（議程正是掙脫月邊界）。錨點用「今天」非 ?date=（未來向從現在算）。議程模式工具列的 ←/→＋今天鈕**換成範圍選擇器**（分段控制），標題顯示實際起訖。跨月加**月份 sticky 標頭**。`KEEP_PARAMS` 加 `range,from,to`。自訂 `?from=&to=`（含回看過去）＝**待拍板**（分岔 1）。

**C. 新增純函式（grid.ts＋單測）**：`parseHour(t)→number`、`hourRange(hours,pad,minSpan)→[n,n]|null`、`splitTimed(evs)→{timed,undated}`（null 判斷是全案關鍵）、`agendaRange(preset,todayIso)→[start,end|null]`。(日,小時) 分組留元件內 reduce 不抽。

**D. Commit 切分**（各 typecheck＋375px 驗證）：
1. 議程時間範圍（最便宜、補「看不到遠期」真缺口）：agendaRange＋議程查詢改範圍＋範圍選擇器＋月份 sticky 標頭＋KEEP_PARAMS。驗證：預設看未來 90 天跨月標頭；選「全部/一年」→ 2027 遠期事件現身。
2. 日視圖時間軸＋TimeGrid＋parseHour/hourRange/splitTimed＋測試。驗證：全 null 天＝純列表無軸；有 timed 天→軸只涵蓋實際小時；同小時多事件同格堆疊；375px 單欄可用。
3. 桌機週時間軸（md:grid），手機週不動。驗證：桌機 7 欄軸刻度對齊；375px 週仍直向列表。

**優先序**：步驟 5（今日面板）仍最高。議程範圍（commit 1）便宜有感、可與步驟 5 同批或插前。時間軸（commit 2/3）投報比最低（資料撐不起），auto-degrade 讓成本近零故仍做，但排最後。

### 步驟 5｜總覽今日面板（跨群議程）

三方視覺化評估一致的唯一近期項——管理者每天第一眼要的是**議程**，不是圖：目前「今天要去哪、這週有什麼場」散在 N 個群的月曆裡，要切 N 次群組才拼得出來，是計劃中最大的日常摩擦。

- 總覽頁頂部加「今日＋未來 7 天」面板：`events`（starts_at 今日～+7、active）＋`tasks`（due_at ≤ +7、open）＋待確認計數，**全群聚合**按日排序、標群組名（步驟 1 後有名可標），點擊跳該群的 calendar/tasks
- 渲染是列表不是圖表：純查詢層、零 schema、零殼變更、零依賴（admin-only 天然成立——總覽頁在 (admin) 殼內，符合定案決策 1）
- 免費彩蛋：同日跨群事件在列表天然相鄰＝最小可行的撞期提示，紅字標註等聚合視圖家族再說

驗證：兩個群各建一筆本週事件 → 總覽面板同列可見、連結正確帶 group。

### 步驟 6｜項目連結（Obsidian 式 backlinks）

使用者要 Obsidian 那種「看到各項之間怎麼互相連結」的能力（graph view／backlinks 面板）。三方獨立評審一致收斂到同一結論：**我們沒有手寫 `[[]]`，唯一可靠的邊是抽取引擎已寫入的 `source_message_ids`——它撐得起 backlink 列表，撐不起關係圖。** 誠實接受這件事，就得到最省、最合骨架的設計。

#### 1. 連結語意（定案：只做一種，砍兩種）

| 連結 | 決定 | 理由 |
|---|---|---|
| **共享來源訊息**（兩項目的 `source_message_ids` 相交） | ✅ **做，唯一的邊** | 確定性、可解釋（＝同一段對話談成的一件事），正是 Obsidian backlink 的本質。零成本、產業無關。 |
| 項目 ↔ 來源訊息（反查引用某訊息的所有項目） | ✅ 同一查詢的副產品 | `source_message_ids` 反查即得，確定性同級。 |
| embeddings 語意相似 | ❌ 砍 | 向量是 message/media 粒度、為問答調時間衰減（`indexer.ts` 只收 message/media，項目根本沒被 index）；語意近 ≠ 同一件事，弱訊號會淹沒硬訊號。 |
| 時間鄰近 | ❌ 砍 | 工作群同時段夾雜大量無關訊息，建立時間近推不出關聯。 |

**查詢寫法**（supabase-js ↔ Postgres 陣列運算子，皆帶 `group_id` 防跨群）：

- 找與項目 X 共享來源訊息的其他項目：`db.from(t).select(...).eq('group_id', g).overlaps('source_message_ids', X.source_message_ids).neq('status','ignored')`，再於 JS 濾掉自己。等價 SQL：`where group_id = $g and source_message_ids && ARRAY[...]::uuid[] and status <> 'ignored'`（`&&` ＝重疊）。三表各查一次（`Promise.all`）後合併。
- **空陣列先短路**：X 的 `source_message_ids` 為空時 overlaps 恆假、也無意義，直接回 `[]`。
- 排序：按「與 X 共享的訊息則數」（intersection 長度）由多到少——越多＝越可能同一件事。一行 JS，不引任何東西。確定性關係不需要相似度分數。
- （反向：找引用某訊息 `mId` 的所有項目 → `.contains('source_message_ids', [mId])`，對應 `@>`。步驟 6b 才用到。）

#### 2. 呈現形態（定案：不騎牆）

- ✅ **(a) 詳情卡「相關項目」反向連結區**——**主線，本步驟實作**。三張同構詳情卡（calendar/tasks/notes）在既有「來源訊息」區下方，多一區以 chip 列出共享來源訊息的其他事件/待辦/公告，著色依類型（事件 emerald／待辦 sky／公告決議 purple），點 chip 換 query param 跳各自詳情（維持 MPA）。無關聯就整區不渲染。**這就是 Obsidian backlinks 面板的等價物。**
- 🔜 **(b) 案件脈絡頁**——延後（見 D 表）。完整「單群訊息 timeline＋每則衍生項目」成本高一階、長對話手機滑不完，累積量夠再做，且主軸應以「項目」而非逐則訊息。
  - **(6b 輕量版)** 來源訊息每列右側掛「這則訊息還衍生了哪些項目」的 chips——可選增量，與 (a) **共用同一批已抓資料**（`relatedItems` 回傳含 `sourceMessageIds`，依 message.id 過濾即得），近零成本。**預設先不做**（見要求 7 分岔 1）：多數項目只有 1–2 則來源訊息時，per-message chips 與 (a) 幾乎重複、徒增卡片雜訊；待「相關項目」被用起來且多來源項目常見再補。
- ❌ **(c) 自刻關係圖**——**砍**。理由要說清楚：(i) 我們只有**一種邊**，單邊的圖不值得自刻；(ii) 硬約束禁用圖表庫（d3/vis/cytoscape/react-flow），不引庫得自算 force-directed 物理模擬，成本最高；(iii) 手機優先＋MPA 下縮放拖曳體驗差、節點一多就糊，375px 是災難；(iv) 沒有手寫 `[[]]`，圖沒有 Obsidian 那種人工語意可看。列表已完整表達同一資訊。唯一值得的退化形式是「以單一項目為中心的單層放射鄰居 SVG」，但它與 (a) 的 chip 列表資訊等價、只是更好看——延後到確有視覺需求再議。**使用者 2026-07-19 確認：backlink 列表足夠，關係圖先擱著。**

#### 3. Schema 變更

**零 schema。** `&&`/`@>` 在以 `group_id`（既有 `events_group_date`／`tasks_group_status`／`notes_group_status` 索引）收窄後的單群數十~數百列上做 seq scan，成本可忽略。GIN 索引屬過早優化：單群項目破千或查詢變慢再對三表各加 `create index ... using gin (source_message_ids)`——事後可加、不動資料，屬 schema 變更需管理者手動重跑。已在 `links.ts` 留 `ponytail:` 註解記帳（見步驟 6 debt）。

#### 4. 複用點與新增檔案

- **新增** `src/core/links.ts`：純資料 helper `relatedItems(db, groupId, sourceIds, self) → RelatedItem[]`（三表 overlap 查詢＋排除自己＋按共享則數排序，href 一併建好）。零新 RPC、零 API route，Server Component 直接讀。
- **新增** `src/app/(admin)/related-items.tsx`：presentational `<RelatedItems items>`，渲染「相關項目」chip 區；三頁共用。
- **複用**：既有詳情卡「來源訊息」區結構與位置、`EventChip`／`NoteRow` 的語意色盤、`?event=`／`?task=`／`?note=` 詳情 URL 與 `<a>` 導覽、`group_id` 防跨群條件。三詳情卡各只加 import＋一句 `relatedItems(...)`＋一個 `<RelatedItems>`。

#### 5. Commit 切分與端到端驗證

1. **共用 helper + 事件卡**：`links.ts` + `related-items.tsx` + calendar 詳情卡接上。驗證：開一個與某待辦/公告共享來源訊息的事件 → 「相關項目」區出現對應 chip、點擊正確跳轉；無共享的事件 → 該區不出現。
2. **tasks + notes 卡**（同構，近乎複製）。驗證：三種項目互為 backlink 皆可雙向點達；跨群不外洩（切到 B 群開 A 群項目 → 查不到）。
3.（可選，見分岔 1）**6b 輕量版** per-message chips：三頁來源訊息查詢補選 `id`，每則訊息列掛該訊息衍生的其他項目 chips。驗證：一則訊息衍生多項目時，各列 chips 正確。

> 實作註記（2026-07-19）：commit 1–2 已合併為單一功能 commit（三卡同構，避免過度細碎，合 CLAUDE.md）。typecheck ＋ `next build` 通過；對真實 Supabase 的唯讀資料探測被沙箱權限攔（載入密鑰＋對外連線），未於此環境跑，查詢路徑與既有正向查詢（同 client／同 `group_id` 條件／同三表）完全同構。

#### 6. 與正式部署／LIFF 的優先序

**部署 > backlink > LIFF。** 部署是「讓已完成的 6 個視圖能被手機隨時使用」，卡在決策不是工程（Dockerfile/fly.toml 已備），解鎖的價值遠大於第 6 個視圖的錦上添花；且是 LIFF 的前置。backlink 零 schema、單 commit、風險低，最適合當「部署後第一個增量」，但因不阻塞、可與部署任一順序並行。LIFF 需 LINE 審核＋實機驗證，獨立戰線，排最後、勿與 backlink 綁。

#### 7. 需使用者拍板的分岔（其餘皆採務實預設）

- **分岔 1 — 6b per-message chips 現在做還是延後？** 預設：**延後**（多來源項目尚不常見時與 (a) 重複、增雜訊）。若你已預期單一訊息常衍生多項目、想要「一則訊息 → 多項目」的正向脈絡，回一句即補上（約 15 行、共用現有查詢）。
- **分岔 2 — 先出這個 backlink，還是先把正式部署做完？** 預設：backlink 已實作可先用；但若你近期就要手機隨時看/推進 LIFF，**建議把部署插到 backlink 之前**收尾。這是排程/業務決策，非工程，交你定。

（其餘已直接採預設不問：只走共享訊息硬連結、砍 embeddings/時間鄰近、砍 graph、零 schema、排除 ignored 項目、按共享則數排序。）

## D. 延後項目與觸發條件

| 項目 | 前置條件 | 備註 |
|---|---|---|
| ~~正式部署（固定網址）~~ | ✅ **已完成（2026-07-19）** | NAS Docker＋Tailscale Funnel，見 A 表營運行 |
| ~~LIFF 入口 `/g/[groupId]`~~ | ✅ **v1＋v2 已完成（2026-07-25）** | v1：ID token 伺服器驗證＋HMAC session、行程/待辦/公告三片。成員資格採兩層——先 messages 推導，查不到問 LINE 群成員 API（**必要修正**：全庫 9980 則只有 72 則帶 sender_id，純推導幾乎沒人進得來）。v2：成員可確認/修正/忽略，`/api/liff/item` 三重把關（session→成員資格→group_id 綁進查詢），edited_by 記錄修改者。**「新增」刻意不做**：成員在群組講一句 bot 就會記錄，另開手動入口會讓脈絡脫離對話 |
| **跨群事件聚合視圖家族**（月曆／時程視圖）<br>（撞期標紅已於 v4 解耦出去，見 B.4） | 以今日面板的實際使用決定是否值得蓋完整版 | admin-only、純查詢層——三種皮吃同一個查詢（`events` across groups），觸發時一起評估、按需做皮。**時程視圖＝「專案甘特圖」的正確形態，理由來自資料模型而非產業**：`events` 只有單日 starts_at、沒有工期欄位，任何產業的抽取結果都是離散事件點，甘特工期 bar 沒有對應物。故列＝群組（依 category 篩選）、標記＝事件點、同群相鄰事件（≤3 天）墊淡色叢聚底條、今日垂直基準線、同日多列警示＝撞期；著色依資料欄位（未來 events.kind）或群組色，**不寫死任何產業關鍵字**（決策 7）；CSS grid 自刻不引圖表庫。**升級為真甘特（工期 bar／相依線）的觸發**：events 需要 ends_at 或 projects 實體誕生——皮不得反過來索求已延後的骨架 |
| ~~檔案牆 `/files`~~ | ✅ **已完成並大幅超出原規劃（2026-07-24）** | 原規劃僅縮圖牆；實做含類型/內容/專案三層篩選、五種排序分組、AI 依上下文歸專案、批次操作 |
| 通訊錄 | 需求明確化（按人去重、生命週期不同） | 先由 notes 承接。**注意勿與「人物身分對應」混談**——已浮現的痛（LIFF 成員判定、assignee 對人）是身分對應問題，不是聯絡簿問題，兩者已獨立成項 |
| ~~媒體內容進抽取~~ | ✅ **觸發已滿足（v4）→ 移入 H 節第二批** | 原觸發「events/tasks 抽取品質穩定」已由 v3.1 七代理驗收宣告成立。現況：`extract.ts` 候選硬過濾 `.eq('type','text')`，報價單/規格表等高密度載體只進向量索引、永不變成事件或待辦；`core/media.ts` 的 ±10 分鐘時間窗配對正是此缺口的臨時代償，本項落地後由 AI 判定的 source_ref 取代之 |
| Obsidian 式案件脈絡頁 | events/tasks/notes 累積量夠（**backlink 已由步驟 6 (a) 先行交付**；本頁指完整脈絡頁與 6b per-message chips） | 含「案件歷程時間軸」形態：單群 events＋notes＋媒體縮圖按時間混排成垂直 timeline（詢價→報價→執行→結案），單群視角成立、未來可複用給 LIFF |
| 案件實體套件（projects 表＋生命週期階段＋金額/收款狀態＋人員派工）<br>**2026-07-27 收斂評估：維持延後，見下方結論** | **（v4 改為可測）第二個「寫入案名」的功能出現時，即建最小 projects 表（canonical 案名一欄）**——原條件「上列多個延後項共同索求時一次評估」不可測，導致條件永遠不會被正式觸發、碎片卻持續累積（缺陷本身） | 金額趨勢、收款追蹤、真甘特、人員衝突視圖的共同地基。**⚠ 按新標準已觸發**：案名詞彙現已散在三處且無 canonical——`media_assets.project`（自由文字，migration 007）、`groups.profile` 歸納的「進行中的案子」、抽取 title 的「案名 動作」慣例。下一批排一次收斂評估（前兩者應吃同一份清單） |
| 人物身分對應（暱稱／assignee ↔ LINE userId）<br>（v4 由「txt 暱稱↔userId 對應」更名擴充） | 第二個跨來源查人需求出現時建正式對應表 | **第一個需求已來過並被 workaround 吸收**：LIFF 成員判定改用 LINE 群成員 API（因匯入訊息無 sender_id）。殘餘缺口：`tasks.assignee` 是自由文字暱稱、與 userId 無對應，故 LIFF 成員看到的是全群平鋪清單、沒有「我的待辦」。**最小版（不必建表）**：用 ID token 的 displayName 對 assignee 做寬鬆比對，命中者置頂標「可能與你有關」 |
| ~~語音訊息進捕捉（v4 新增）~~ | ✅ **已完成（2026-07-27）** | audio 走既有媒體管線：`MessageType` 加 `audio`、connector 不再丟棄、`kind=audio`（text 欄位，零 migration）、Gemini 依 mime 換轉寫 prompt（逐字稿放 `ocr_text` 走既有索引與抽取路徑，下游零改動）。**mime 正規化**：LINE 回 `audio/x-m4a`，Gemini 不認，送 AI 前換成 `audio/mp4`（Storage 仍存原始 Content-Type）。**轉寫失敗也已達成捕捉**——原檔進 Storage、檔案頁可播放，積壓數在設定頁可見。影片維持排除 |
| **主動送達（1:1 訂閱制日摘）** | ✅ **已定案（B.8）→ H 節第三批** | 每個人在 LIFF 自行訂閱、私訊送達、群組零聲量。硬約束（加好友、channel 連結）見 B.8 |
| **營運韌性**（備份/匯出、漏收可見化、登入強化） | ✅ **已定案 → H 節第四批** | 知識庫目前零備份單點（見 A 表營運行）；webhook 漏收永久靜默流失且無人會知道；管理入口在公開 HTTPS 上、無失敗節流且 cookie 為不可撤銷的固定雜湊 |

### D-1. 案件實體收斂評估（2026-07-27 執行，結論：維持延後）

D 表要求「下一批排一次收斂評估」，資料如下：

（案名已去識別化，分岔的形態與真實情況一致）

| `media_assets.project`（結構化） | `groups.profile` 的「進行中的案子」（AI 每週歸納的自由文字） |
|---|---|
| 中山北路案（15 檔） | 中山北路**九月底**案 |
| 新莊倉庫（1 檔） | 新莊倉庫**與現場整理** |
| 大同商辦（7 檔） | 大同商辦（7/29 起） |
| 未分類（14 檔） | 另外三個大型專案（皆無對應檔案） |

**同案不同名確實已發生**（前兩列），但**建表的觸發條件仍未滿足**：真正「寫入案名」的結構化功能
只有 `media_assets.project` 一個，profile 是 AI 歸納的敘述文字、不是案名欄位。按 v4 訂的可測條件
（「第二個寫入案名的功能出現時」）計數是 1，不是 2。

**改採零 schema 的收斂**（D 表原話「前兩者應吃同一份清單」的最小實現）：`core/files.ts` 的分類 prompt
已經帶了 `【群組背景】`，補一條規則要求案名與背景裡的「進行中的案子」用同一個講法。兩份清單自然收斂，
不必先蓋骨架——**皮不得反過來索求已延後的骨架**（D 表甘特圖那列訂的紀律，同樣適用於此）。

**下次該建表的訊號**（比原條件更可測）：出現第二個寫入案名的欄位／功能，或需要「依案子跨表查詢」
（例如「這個案子的所有事件＋待辦＋檔案＋金額」）——後者無法靠 prompt 收斂，那才是 projects 表的本體價值。

## E. 設計約束（不做、但不擋路）

- 聚合類查詢一律放管理入口；元件不假設「單群以外」的可見範圍（詳情查詢一律帶 group_id 條件）
- schema 變更集中批次（管理者需手動重跑）；**增量 migration（supabase/migrations/00N）上線驗證後必須回寫 schema.sql——schema.sql 是新裝機的唯一真相**（v3.1 驗收發現 004/006/007 漏回寫，已補）
- 新功能先問：單群視角成立嗎？不成立的（跨群）自動歸管理 overlay
- 新視圖一律掛進步驟 2 的殼（`(admin)/` route group）
- **（v4）捕捉的失敗必須可見**——pending 媒體積壓與 webhook 漏收都曾靜默流失，且無人會發現。任何捕捉環節的失敗都要有計數、健康指標或自動重試，不得只留一行 console.error
- **（v4）人的確認勞動必須有回報**——確認/修正/忽略的訊號要回饋進 AI 的 prompt 與輸出（見 B.9）；讓人做白工的設計等同背叛「零額外輸入」

## F. v3.1 驗收記錄（2026-07-25）

**結論：MVP＋Phase 1＋Phase 2 正式宣告完成。** 七個獨立驗收代理逐條對照程式碼（每條 file:line 證據）：A 表全部聲明屬實、B 定案決策全數遵循（已砍項目無偷做、無圖表庫、產業無關成立、刪除邊界涵蓋新欄位）、D 延後項全部健康（觸發條件未到）。

**v3 定稿後一週的計劃外增量（Phase 3）**：見 A 表 Phase 3 行。性質上多為 UX 摩擦修復與費用治理，兩項有架構意義：
- **群組理解 profile**＝決策 7(a)「產業詞彙提示」的自動化實現（以群組自身紀錄逐群學習，未寫死任何行業）——產業無關原則的正解落地。
- **media_assets.project**＝案件實體的前身，已在 D 表標註收斂義務。

**驗收發現並已修復的紀律缺口**：(1) 程式碼預設模型改為 `gemini-3.5-flash-lite`（2.5-flash 已不開放新專案，僅存在 env 的預設會讓新環境開箱即壞）；(2) migrations 004/006/007 回寫 schema.sql（E 節新增此紀律）。

**營運備忘**：正式站 NAS `/opt/groupscribe`；模型由 `GEMINI_MODEL` env 控制；Gemini 用量與封鎖狀態看 /settings 用量卡（權威數字在 ai.studio/spend）；migration 006/007 需在 Supabase SQL Editor 執行後，用量記帳與檔案專案分類才生效。

**下一波候選（依 D 表觸發條件）**：跨群聚合視圖家族（今日面板已上線，用一陣子後評估是否值得蓋完整版）；媒體內容進抽取（Gemini 已恢復可用，34 個媒體待 `POST /api/process` 解析，解析後 vision_summary 可進抽取 prompt、也讓檔案專案分類更準）；案件實體套件（`media_assets.project` 已是其前身，收斂義務見 D 表）。

## G. UI/UX 改版與 LIFF（2026-07-25 補記）

v3.1 之後依「UI/UX 方向提案」執行，全部完成並上線：

- **A 視覺 token**：深色模式（跟隨系統，Tailwind utility 整表 remap，零頁面改動）、手機觸控 ≥44px、狀態色左邊條（事件綠/待辦藍/公告紫/待確認琥珀）、emoji 全面換 inline SVG、空狀態一律附下一步。
- **B 手機殼**：五格底部 Tab（今天/收件匣/月曆/待辦/更多）＋頂欄改為群組 context（頭像＋群組名，整塊可點切換）＋`/more` 頁；桌面 nav 加 active 標記；換頁保留 `?group`。
- **C 收件匣 `/inbox`**：三表待確認合流成一條把關流水線（來源引文→AI 整理結果→忽略/修改/確認），複用既有單筆 update 路由零新 API。**這是 needs_confirmation 流程的正確形態**——原本散在三頁。
- **今天畫面**：統計三數字＋日期大字軌（事件與待辦混排、逾期歸今天標紅、跨群 chip）；群組管理移出到 `/groups`（低頻管理不佔每日視線）。
- **項目照片**：`core/media.ts` 以來源訊息 ±10 分鐘時間窗配對同時段圖片/PDF，顯示於三張詳情卡、收件匣、LIFF。UI 誠實標「同時段」不斷言為附件。**升級路徑**＝媒體內容進抽取後改由 AI 判定 source_ref（見 D 表）。
- **管理員綁 LINE 帳號**（`ADMIN_LINE_USER_ID`）：LIFF session 驗證後一併發 admin cookie，從 LINE 一點即進管理版免密碼。**已知代價（使用者確認接受）**：LINE 帳號等同後台鑰匙。

- **LIFF 成員四分頁**（今天/月曆/待辦/公告，`?tab=` MPA 零 client JS，成員底部 Tab server 渲染）：第一性依據——成員是群組知識的第一消費者，單群視角的頁面成員都該有（B.1 只鎖跨群聚合）。月曆＝月格線圓點＋當月事件日軌；待辦＝全部進行中＋最近完成；公告＝全部有效。
- **群組理解隨用隨新**：`extractGroup` 抽到新東西且 profile 逾 7 天即自動重新歸納（fire-and-forget、每週上限一次控費用），並在 prompt 新增「**觀察與建議**」段（從對話模式給管理者可行建議，每點須附依據）。實測命中：測試群「燈架每次都拖到最後」→ AI 自動歸納出「備料常拖延，建議設定固定前置期限」。

新增 migrations：007（`media_assets.project`）、008（三表 `edited_by`）；皆已回寫 schema.sql（E 節紀律）。

## H. 第一性原理審查與執行批次（2026-07-25）

### 審查方法與根原則

6 個代理（5 個面向＋1 個完整性批評者）逐條對照程式碼與本規劃書，每條發現須附 file:line 或 plan 段落證據，共 **45 條**（keep 11／fix 19／build 15）。

**審查的根**：工作群組的知識（承諾、行程、決定、檔案）天生埋在對話流裡會流失；本產品唯一的存在理由是「**零額外輸入地捕捉它，並在對的時刻給對的人**」。凡不服務這條的功能都可疑；凡這條需要而沒有的都是缺口。B.1（資料主權以群組為界）與 B.7（產業無關）為硬約束。

**最大結構性發現**：迴路斷在「送達」——見 B.8，已定案並排入第三批。

### 通過檢驗的（keep，骨架是對的）

- **B.1 資料主權邊界**：`/g` 逐群過 `isGroupMember`、成員頁四查詢全帶 `.eq('group_id')`、寫入端點 group_id 綁進查詢；LIFF 無任何跨群聚合面。
- **B.2 已砍項目無偷做**：熱力圖/金額趨勢/負載圖/地圖全數未回歸，理由（尤其「聊天報價 ≠ 開票 ≠ 入帳，財務真相在會計系統」）直接命中第一性；無圖表庫依賴。
- **@提及即答的形態正確**：檢索發生在對話所在地、零額外輸入，成員「回看歷史」不需在 LIFF 重造搜尋介面。
- **匯入的手動抽取閥**：斷點全程可見（提取狀態面板＋即時 pending 計數），是刻意的成本閘門，非知識死角。
- **群組理解 profile 機制本體**：從群組自身資料歸納、可迭代、產業無關、雙端注入——形態正確，唯一缺口是觸發時機（Phase 4 已補）。
- **schema/migration 手動重跑、`/api/reindex` 手動**：罕見且伴隨人為決策，自動化無意義。

### 第一批 · 成員體驗修補（使用者指定優先）✅ 已完成 2026-07-25

修剛蓋好的東西，全部是小改動、直接影響已上線功能的可信度。

1. **LIFF 待確認項目加來源引文**（P0）——v2 的存在理由是「把把關工作分散給最清楚狀況的人」，但成員只看到 AI 結果、看不到 AI 從哪句話整理，只能盲目蓋章，回流的確認品質不可信。複用 `(admin)/inbox/page.tsx` 的引文查詢（單群一次 `.in('id', srcIds)` 撈 messages），在動作列上方顯示 1–2 則。
2. **成員判定反轉**（P1，安全）——`src/core/liff.ts` `isGroupMember` 改 LINE API 為權威（見 B.3）；退群/被踢者不再永久保有讀寫權，一併關閉「bot 已離開群組」的入口。
3. **入口曝光**（P0）——已建成的成員入口目前觸及率趨近於零：`DEFAULT_NOTICE`（`src/core/ingest.ts`）全文無 LIFF 連結、@回答（`src/core/query.ts`）也沒有，只能靠管理者口頭轉貼。兩處各補一行連結。
4. **LIFF 待辦加「完成」鈕**（P1）——「任務做完了」這個知識天生在做的人身上；目前 done/reopen 鎖在管理版，每筆完成都要等管理者關單，open 清單持續腐化。`/api/liff/item` 加 `action=done`，落在既有單條權限規則內。
5. **兩個入口互相接起來**（P2，順手）——LIFF 空狀態與頁尾提示「要查舊資料，在群組 @我 提問」。

### 第二批 · AI 迴路與捕捉補洞 ✅ 已完成 2026-07-26（含對抗式審查 21 條確認發現的修復）

1. **@回答注入已確認資料**（P0，B.9 推論一）——`query.ts answer()` 目前只走向量檢索，人的修正對輸出零影響。
2. **pending 媒體自動重試＋計數可見**（P0，E 節新約束）——`/api/process` 全 codebase 無呼叫者、只能手動 curl；34 個媒體積壓已久且 UI 無任何顯示。做法：webhook `after()` 末尾順手重試 2–3 筆（遇 429 即停），設定頁顯示 pending 計數；`media_assets` 補存原始 mime（重跑時目前硬猜 `image/jpeg`，PNG/WebP 會壞）。
3. **媒體內容進抽取**（P0，D 表觸發已滿足）——已解析媒體以「[圖片] vision_summary」併入新訊息串、允許 source_ref 指向媒體訊息，取代 `core/media.ts` 的 ±10 分鐘啟發式。
4. **被忽略的項目不再復活**（P1，B.9 推論三）。
5. **「好」拍板的決定進抽取**（P1）——低資訊過濾把確認語吃掉：候選訊息 `.eq('is_low_info', false)` 讓「好/OK/收到」永遠不是【新訊息】，而前文脈絡又被 prompt 明令不得建立項目。整類「提議＋確認」成立的決定系統性死亡。做法：批次時間窗內的低資訊訊息一併進【新訊息】區（同批認領），prompt 加一條允許依前文建立。
6. **unsend 及於抽取產物**（P1）——進群告知承諾「收回的訊息會同步刪除對應紀錄」，但 `handleUnsend` 只刪 messages/embeddings/媒體，內容已固化在 events/tasks/notes 的 title/body 裡。做法：三表 `.contains('source_message_ids',[id])` 反查，移除該 id 並標 `needs_confirmation=true`＋註記「來源已收回」浮進收件匣由人裁決（**不自動刪**，避免誤殺已人工確認的知識）。
7. **抽取 prompt 標示確認狀態**（P2，B.9 推論二）。

### 第三批 · 送達層（1:1 訂閱制，B.8 定案）✅ 已完成 2026-07-26

1. 訂閱 migration：`push_subscriptions`（`group_id` ＋ `line_user_id` ＋ `enabled`；主鍵為兩者複合）。
2. LIFF 訂閱開關 ＋ `liff.getFriendship()` 檢查與加好友引導（硬約束見 B.8）。
3. 每日摘要端點 ＋ NAS cron；內容＝該群今日事件＋到期待辦＋LIFF 連結。
4. push 回 403（封鎖/解除好友）自動停用該訂閱。
5. 管理員的訂閱多一段「待確認 N 件」——同一套機制，`ADMIN_LINE_USER_ID` 只是另一個訂閱者。
6. 收件匣積壓提醒（P1）——把「記得去確認」這個隱形手動也消掉。

**前置（使用者需在 LINE Developers console 操作）**：把 LINE Login channel 與官方帳號**連結**，否則 `getFriendship()` 不可用。

### 第四批 · 營運韌性 ✅ 已完成 2026-07-26

1. **NAS 每日備份**（P1）——知識庫目前零備份單點；`pg_dump` 直連 Supabase Postgres ＋ Storage 原檔 rsync 到 NAS（機器已 always-on、零新硬體），README 記還原步驟。**需要 Supabase 資料庫直連密碼**（非 service role key）。
2. **webhook 漏收可見化**（P1）——LINE 拿不到歷史，停機期間掉的訊息永久消失且無人會知道。做法：部署紀律加「LINE console 開啟 webhook redelivery」（去重索引已備），設定頁顯示「最後收到 webhook 時間」，靜默超過 N 小時在今天畫面警示。
3. **登入強化**（P2）——正式站在公開 HTTPS 上：`/api/login` 無失敗節流可無限暴力嘗試；cookie ＝ `SHA-256(ADMIN_PASSWORD)` 固定值，外洩即長期有效且改密碼前無法撤銷。改為 HMAC 簽章帶過期（比照既有 `gs_liff` 作法，零新依賴）＋ in-memory 失敗節流。
4. **抽取認領改租約制**（P2）——目前認領時就寫死 `extracted_at`，回滾只在 LLM 失敗的 catch 裡；抽取跑在 webhook `after()` 內，部署重啟或 crash 會讓該批最多 50 則訊息被永久視為已抽取、無操作產出、無痕跡可查。做法：先寫 `claimed_at`、成功套用後才寫 `extracted_at`，`/api/extract` 順手回收逾時未完成的認領。
5. **`groups_view` 快取**（P2）——它是 messages 全表 `count(*) group by`，而 layout 每次導覽都查一次；現在無感，破十萬則後每一下點擊都付一次全表聚合。先包 60 秒快取，量續增再改為 `groups` 表增量維護欄位。

### 維持延後（留在 D 表，勿在上述批次中順手做）

~~語音訊息進捕捉~~（✅ 2026-07-27）、~~成員「我的」待辦（人物身分對應最小版）~~（✅ 2026-07-27）、
~~LIFF 檔案片~~（✅ 2026-07-27）、~~案件實體收斂評估~~（✅ 2026-07-27，結論見 D-1：維持延後）、
~~匯入完成後自動接續抽取~~（由 30 天時間窗取代）。

**仍延後**：人工修正 few-shot 學習迴路（E 節「人的確認勞動必須有回報」——但目前確認樣本太少，
沒有足夠訊號可餵回 prompt；等新資料在新門檻下累積一陣再看）、`memberJoined` 對新成員告知
（consent 的單位其實是人不是群，但需節流避免刷屏）、離群群組的資料生命週期決策點、
檔案 AI 專案分類自動化（現為手動按鈕，費用可控是刻意的）。

### 匯入抽取時間窗（2026-07-26，migration 010）

「匯入完成後自動接續抽取」**已由更省的做法取代**：匯入只把**近 30 天**的訊息排入抽取隊列，更早的
入庫時直接寫 `extracted_at`＝視同已處理。**理由**——去年的「星期三來搬東西」抽成今天的待辦是噪音，
而整批歷史送 LLM 是這個系統最貴的一筆帳；歷史的價值在**群組理解與問答**，那條路走的是向量索引，
不需要抽取。既有 4,811 則匯入訊息已依同政策回填（索引照舊，問答不受影響）。
政策常數 `EXTRACT_WINDOW_DAYS` 在 `core/importer.ts`，測試 `inExtractWindow` 守住邊界。

### 執行結果（2026-07-26 全數完成）

四批全部落地並部署。**唯一的人工前置：在 Supabase SQL Editor 執行 `migrations/008` 與 `009`**
（008＝edited_by、009＝push_subscriptions／last_webhook_at／claimed_at）。所有依賴新欄位的功能
都有降級路徑，未跑之前系統照常運作，只是訂閱摘要、修改者記錄、抽取租約保護尚未生效。

**部署後實測**（正式站）：
- 登入強化：新 HMAC cookie 可登入、**舊格式（密碼固定雜湊）確實失效**、錯密碼 9 次後鎖 10 分鐘
- 備份腳本在 NAS 實跑：9980 則訊息／4558 筆向量／36 個媒體原檔全部匯出（65MB），JSON 可解析；
  cron 04:15 備份、07:30 推摘要皆已安裝
- 抽取回歸情境：未解析媒體排在最前面時，後方文字訊息仍正確抽出，全部候選都被認領（不卡隊頭）

**過程教訓（值得留給未來的 session）**：第二批第一版寫壞了四個地方，其中兩個是 HIGH——
未解析媒體「不認領」會讓整群抽取永久停擺；unsend 連動因為三張表共用一句 select 而全部 400，
整段是**靜默的死碼**（commit 訊息宣稱做到了，實際一行都沒執行）。兩者都是部署前的對抗式審查
才抓到的。**結論：宣稱「已修復」之前必須有可觀察的證據，光靠讀碼與型檢不夠。**