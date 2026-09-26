# 無人值守執行計劃：身分切換改版「個人／管理兩層」（2026-09-27 夜）

> 目的：jielin 睡覺期間，由 agent 在**無人干預**下把程式碼對齊設計畫布「身分切換提案 A」，並用對抗式 UX 審查確保**所有角色不用思考就知道這頁在做什麼、要做的事去哪找**。醒來時看到：一串乾淨的 commit、全綠的測試、補齊的畫布、一份早晨報告。
> 本檔是唯一的執行依據。**上下文被壓縮、或不確定下一步時，先重讀第 0.2 節（紅線）、第 0.5 節（優先級）、第 1 節（規則）、第 2 節（設計定案）、第 6 節（進度區），不要憑記憶。**
> 版本：**v2**——已經過 Fable 對抗審查（6 位審查者 95 條發現 → 合併反證後 55 條確認：critical 8、high 23、medium 18、low 6）。發現編號 F1–F55 對照見第 8 節；原始結論在 scratchpad `review-verdict.json`。

---

## 0. 目標與邊界

### 0.1 最終目標（一句話）

使用者打開任何一頁，**3 秒內不用想**就答得出：(1) 我現在是「自己用」還是「在管公司」；(2) 我在哪個工具、哪家公司；(3) 我要做的事在哪裡按。

### 0.2 絕對不做（紅線，違反任一條＝立刻停手、寫進報告）

| # | 不做 | 原因 |
|---|---|---|
| R1 | `git push` | CLAUDE.md：push 要用戶明確指示 |
| R2 | 部署（動 `.next`、重啟 port 3000 的 `npm start`、動 Tailscale） | 正式站在這台 MacBook 上跑 |
| R3 | **任何寫入正式 Supabase 的動作**（`.env.local` 連正式庫）。禁用 `mcp__supabase__*` 寫入工具；`execute_sql` 只准 `select` 且只查 `information_schema` 或 `count(*)`。禁跑 `scripts/*.ts` 中讀 `.env.local` 的腳本（含 `seed-demo.ts`） | 沒有 staging |
| R4 | 在本機 dev server 送出任何表單或寫庫 API；只准 GET。**`/g`、`/g/[groupId]` 在本機一律不開**（GET 會 insert `funnel_events`，並用正式 channel token 打 LINE 群成員 API——F1）。今天頁不帶 `?q=`。登入只准 `ADMIN_PASSWORD` | 本機連正式庫 |
| R5 | 修改守門測試（`routes`／`colors`／`i18n`／`api-guard`／`answer-scope`）的**判斷邏輯**讓它通過 | 守門測試是紀律本身 |
| R6 | 呼叫會花錢或對外發訊息的 API（Gemini、LINE push／reply） | 無人監看的支出 |
| R7 | 新增 npm 依賴 | ponytail 原則 |
| R8 | 做本檔沒列的功能、「順手」重構。例外：第 4 節迴圈裁定為 critical／high 的**導覽問題或權限可見性洩漏** | 防漂移 |
| R9 | 改 `.env.local`；讀出或印出任何金鑰或真實 LINE userId。（`verify-only-local` 不是金鑰，可以出現在指令與報告） | 金鑰與個資 |
| R10 | 刪除畫布上任何畫板；修改**不在第 3 節 C1–C4 清單**的畫板；改 `canvas.json` 裡別人的座標與筆記 | 畫布是 jielin 的成果 |
| R11 | `git add` 或 `git checkout` 這些檔：`.env.example`（開工前就有的變更，不是本計劃的）、`next-env.d.ts`、`tsconfig.json`（**每次 next dev/build 都會自動改寫，diff 一律視為正常，不拿來判斷有沒有人介入**）、`.next-old/` | F33 |
| R12 | 畫布發布衝突以覆蓋解決：**絕不傳 `force`、`overwrite_unread`** | F14 |

### 0.3 允許的事

- 讀寫本 repo；`git add <明確檔名>` ＋ `git commit`（禁止 `git add -A`／`git add .`）。
- `npm test`、`npm run typecheck`、`NEXT_DIST_DIR=.next-verify npm run build`（**build 一律加這個前綴**；`.next-verify` 已在 `.gitignore`；絕不寫 `.next`）。
- 本機 dev server 只用 `.claude/launch.json` 的 `groupscribe-verify`（port 3100、寫 `.next-dev`）。T0 會在它的環境加 `SESSION_SECRET=verify-only-local`（F7）。
- 假身分：scratchpad 腳本以 `SESSION_SECRET=verify-only-local` 呼叫 `src/core/liff.ts` 的 `sessionCookieValue('U-e2e-…')` 簽出 cookie（不讀 `.env.local`），只用來驗「非成員看不到東西」，只打 `/`、`/a`、`/o/*`、`/go/*`。
- 讀寫設計畫布 `https://claude.ai/artifact/YSn38bv2cAhQWHiriUvdJE`，照第 1.2 節流程。
- 用 Workflow／subagent（含 Fable）平行實作與審查（上限見第 4 節）。

### 0.4 醒來驗收（成功長什麼樣）

1. `git log 28335c2..HEAD` 多出若干繁中 commit，**沒有 push**。
2. `npm test`、`npm run typecheck`、`NEXT_DIST_DIR=.next-verify npm run build` 三個都綠。
3. 第 2.4 節表格**七種角色**的 persona 測試全綠。
4. persona 快照（第 1.3 節）與管理側截圖都對照過畫布，差異已修或記成決策。
5. 第 4 節最後一輪：與身分切換相關的發現**沒有 critical／high 未解決**。
6. 畫布補齊 C1–C4，並與程式一致。
7. 第 6 節進度區每個任務都有狀態；第 7 節早晨報告寫好。

### 0.5 優先級與停止線

時間不夠時由上往下砍，**不跳著做**：

| 級 | 內容 | 規則 |
|---|---|---|
| P0 必做 | T0、D1、C1–C3、T1–T8、T9 | 做不完就不收尾，繼續做 |
| P1 應做 | C4、D2–D9 | P0 完成後才做 |
| P2 有時間才做 | D10 | P1 完成後才做 |
| 今晚不做 | 第 6 節「發現但沒做」 | 只記錄 |

---

## 1. 執行規則（防漂移，每個任務都照做）

1. **開工（只做一次）**：`git status --short` 全文貼進第 6 節「開工基準」；commit 本檔（`文件：身分切換改版夜間計劃開工`）。
2. **開始任務前**：重讀該任務卡＋第 6 節，狀態改 `⏳`、填開始時間。
3. **恢復程序**（上下文壓縮後、或看到 `⏳`）：`git status --short` 與開工基準比對。沒有多出本任務的變更 → 從頭做；有 → `npm test && npm run typecheck`，綠就接著做，紅就照第 7 條退回、「嘗試」+1。
4. **先讀懂再動手**：打開任務卡列的每個檔案，grep 所有呼叫者，行號以實際程式為準。
5. **只做任務卡「範圍」內的事**。對不上 → 記進決策紀錄，選最小可逆做法。
6. **每個任務結束**：`npm test`、`npm run typecheck`、`NEXT_DIST_DIR=.next-verify npm run build` 全綠，任務卡「完成標準」全部打勾，才 commit。
7. **退回**（F13）：先 `git status --short` 與開工基準逐行比對；**只**對本任務卡列出的檔案 `git checkout -- <檔名…>`，本任務新建的檔案 `git clean -f -- <檔名…>`；不在任務卡的變更一律不動、寫進決策紀錄。退回後「嘗試」+1、寫一句原因，commit 本檔。
8. **卡住規則**：「嘗試」到 3 → 標 `⏭`、寫卡在哪，退回，換下一個。
9. **commit**：`<類型>：<簡述>`＋系統提示指定的 Co-Authored-By 署名行。只 add 本任務的檔案＋本檔。
10. **需要用戶決定的事**：不停下來等。用第 2 節或決策紀錄的預設；沒有就選最小、可逆，寫進決策紀錄與早晨報告「要你決定」。
11. **每完成 3 個任務**：重讀第 0.2 節、第 0.5 節、第 2 節。
12. **向後相容**：`org_members.modules` 已存在（2026-09-26 確認）；新讀寫仍要容錯。
13. **另一個工作階段**：commit 前與退回前都檢查 `git log -1` 是不是你上一個 commit、本檔有沒有不是你寫的變更；有就不覆蓋，以現況為準並記錄。
14. **結束條件**：P0＋P1（＋能做的 P2）處理完；或連續 3 個任務被跳過；或無法定位的全域測試失敗。
15. **每個程式任務做完**，由另一個 subagent 對照任務卡與第 2 節**只讀**審查 diff；有偏離就修掉再 commit。

### 1.1 查事實

- 動 UI 前讀 `README.md`「介面架構」：加頁面＝`src/app/o/[org]/routes.tsx` 加一行；連結用 `oh(slug, path)`；共用元件在 `src/app/ui/`；狀態色只有 ok/warn/err/neutral；外觀尺寸只在 `src/app/globals.css` 定。
- 權限：每一頁 `requireModule()`、API `moduleAccess()`（2026-09-26 已上線），**不得削弱**。
- 功能決策不得以 jielin 的產業為依據；範例與文案要跨行業（F36：「案場」→「專案」）。
- `src/org/module-ids.ts` 第 1 行註解「routes.tsx 載不進來」已過時：tsx 下可以 import routes.tsx 的 `I` 圖示，**不要複製圖示**（F12）。
- 身分列、選單、首頁的所有 href 一律來自 `surfaces()` 的 `href` 或 `/go/…`，由 `src/app/ui/identity-bar.tsx` 渲染；`shell-header.tsx` 只傳資料不寫路徑（F48，否則 routes 守門測試會紅）。

### 1.2 畫布修改固定流程（F14）

1. `Artifact list scope:files url=…YSn38bv2cAhQWHiriUvdJE`
2. `read path:project/canvas.json`
3. `read` 每張要改的畫板（新畫板不用）
4. 在 scratchpad `canvas-work/project/` 改副本
5. `publish url=… root=<canvas-work> file_path=<canvas.json 絕對路徑> files=<只列自己改／新增的路徑>`；canvas.json 只新增自己的 boards／order／notes 條目，其他原樣保留
6. 被拒 → 重做 1–3、合併後再發，最多 2 次；仍失敗 → 記進報告，程式照本檔第 2 節先行

新畫板一律放在「身分切換提案 A」那一排的下方新列（y ≥ 15600），不動既有座標。

### 1.3 驗證方法（F1、F2：本機只能合法走兩條路）

| 素材 | 涵蓋 | 怎麼做 |
|---|---|---|
| A. 管理側實機截圖 | 平台擁有者（ADMIN_PASSWORD）的 `/o/main/*`、`/o/demo/*`、`/platform`、`/` | `groupscribe-verify`，手機 375／電腦 1280／1024，亮暗各一 |
| B. 非成員實走 | 假 cookie 打 `/`、`/a`、`/?menu=1`、`/go/@admin`、`/o/main` | curl，斷言沒有管理字樣、沒有 500 |
| C. persona 快照 | 2.4 七種角色的身分列＋殼 | scratchpad 腳本用 `renderToStaticMarkup` 渲染純元件（T4），`<link>` 指向 verify server 的 CSS，存成 HTML，Browser pane 開 file:// 截圖 |

`/g` 系列只用 C 與原始碼掃描測試驗。**早晨報告固定列「真機（LINE 內建瀏覽器）待你驗收的畫面清單」**。

---

## 2. 設計定案（單一依據）

### 2.0 設計來源優先序（F8）

- **頁首**（身分列、深色頂欄、語言地球、工具選單）、**更多頁的「切換身分」段**、**首頁選單**：`Id*.dc.html` ＞ 本節 ＞ 其他畫板。
- **頁首以下的內容區**：原畫板為準（加上 C4 的修改）。
- 已知衝突（以 Id 畫板與本節為準，不算差異）：More／AttendMore 的「切換身分」段；8 張 Staff* 的三膠囊；各手機板頂列的「[公司名稱] ▾」；Desktop 系列右側公司名。

### 2.1 三條規則

1. **顏色只說角色**：淺色頂列＝個人；深色頂列（`#1c2420`）＝管理，**手機也是**（jielin 2026-09-27 定案）。**暗色模式**：管理列改用 `var(--accent-tint)`（#173a2e）底，讓它跟個人頁背景 #111613 分得出來（F27；C1 定稿）。
2. **圖示只說工具**，兩個角色共用：時鐘＝打卡／考勤；收據＝報帳；雙對話框＝群組／群組助理；格狀＝平台。工具按鈕的圖示**有底色方塊**，底部膠囊的圖示**沒有**（F10）。
3. **位置說層級**：由左到右 角色開關 → 工具按鈕 → 情境膠囊（群組／員工）；底部膠囊是工具內分頁。

### 2.2 名稱

- 工具：個人側「打卡、報帳、群組」；管理側「群組助理、考勤、報帳」；平台「平台管理」「未認領的群」。不帶「我的／我要／管理」字眼。
- 角色名（五語系、拉丁字母 ≤7 字，F24）：zh 個人／管理；en Me／Admin；ja 個人／管理；vi Tôi／Quản lý；id Saya／Admin。
- 撞名改名（F10）：管理端報帳分頁「報帳」→「加總」、清單頁 h1「報帳」→「收據清單」；員工端報帳分頁「報帳」→「匯出」；打卡底部首格「打卡」→「今天」（TAB_DASHBOARD 五語）。
- 「案場」全改「專案」（F36）。
- 個人側不得出現「群組助理」「打卡系統」（F11）：BACK_TO_GROUPS→「回群組」五語；APP_TITLE→「打卡」五語；單群頁副標「群組工作助理」→「群組」。
- 工具說明（選單每列）：群組助理「群組行程、待辦與收件匣把關」／考勤「員工、補卡審核、報表與薪資」／報帳（管理）「員工代墊的收據、核銷與匯出」／打卡「上下班打卡、補卡申請」／報帳（個人）「記一筆代墊的錢、看自己的報帳單」／群組「看你所在群組的行程、待辦與公告」／平台管理「所有公司、未認領的群、方案」／未認領的群「等管理員認領，7 天沒人要就退群」。

### 2.3 行為

**身分列三態**（F9）：
- (a) 兩個角色都有 → 角色開關＋工具按鈕（有 ▾ 或無 ▾）
- (b) 一個角色、多個工具 → 無開關，工具按鈕有 ▾
- (c) 一個角色、一個工具 →
  - 管理側：**深色列照樣在**，工具標題「<工具> · <公司名>」（無 ▾）＋情境膠囊（畫板 IdAdminAttendSingle）
  - 個人側：整列不渲染（畫板 IdSingleRole）

**語言地球**（F3）：身分列有渲染 → 在身分列最右；不渲染 → 留在姓名列右側。任何角色的個人側都**恰好一顆**。

**角色開關**：目前角色那一格是 `<span aria-current="page">`（不是連結，F31）；另一格連 `/go/@me?from=<key>` 或 `/go/@admin?from=<key>`。整體高 44（格 38＋外框 3×2，F49）。

**跳轉**（T3，F16、F31）：同工具另一邊 → 同公司優先（雙方都有公司時取交集；個人側「群組」無公司只比工具）→ 該角色上次用的（`gs_last_me`／`gs_last_admin`，由每次 `/go/<key>` 寫入）→ 該角色第一個。`from` 與目標同角色 → 302 回 `from` 的 href（不動）。key 不在清單 → `surfaces().landing`，沒有才 `/?menu=1`。

**工具選單**：只列目前角色；管理側依公司分段（多家時），平台一段（含「未認領的群」，F42）；手機＝底部抽屜（`<details>` 零 JS：`summary::before` 做全螢幕遮罩，點遮罩＝收合；面板 `position:fixed` 底部、z-index 40；另有 44px「關閉」列；目前那列點了就關；抽屜容器帶 `data-no-swipe`，F26）；電腦＝按鈕下方 300px 下拉。最底「看全部身分 →」**只在清單 ≥2 時出現**（F6）。

**公司辨識**（F4、F41、F42）：
- 管多家（admin 段 ≥2，或目前公司不在清單裡被補上）→ 工具按鈕「考勤 · 公司A」（手機兩行：上行工具名、下行 11px 公司名可省略號）。
- 只管一家 → 公司名只在選單標題「管理 · 公司A」與 (c) 態的標題。
- 平台擁有者：`surfaces()` 列出**所有租戶**，每家工具以該公司 `org_settings.modules` 為準；`/o/unclaimed/*` 歸平台段，按鈕寫「平台 · 未認領的群」。
- `/o/[org]/layout.tsx` 加 `generateMetadata`：瀏覽器分頁標題帶公司名。

**截斷**（F24）：工具名 max-width 88px 省略號；情境膠囊 max-width 104px；公司名手機只進第二行或選單標題。

**電腦頂欄**（F25）：群記｜角色開關｜工具按鈕｜分頁｜情境膠囊。分頁只放 `primary` 四項＋「更多」（與手機底部同一函式 `bottomItems`）；1024 以下頂欄容器 `overflow-x:auto`。右邊不再有公司名。

**琥珀小點**（F30）：只在個人側、指向「管理」格；有任一公司「收件匣待確認／待審補卡／待啟用員工」就亮；查詢用存在性 `limit(1)`、依 org 合併、最多 3 家、以 uid 快取 60 秒。管理側「個人」格 v1 不亮。

**其他**：
- 個人側有多家公司（員工或報帳）時，姓名下方顯示「公司名 · 部門」（F32，只顯示，不做切換）。
- `/g/[groupId]` 不放身分列；返回連結改 ≥44px 可見（F46）。
- 首頁 `/`（F6、F18、F19、F52）：判斷抽成 `homeMode()`；清單 1 項＋`?menu=1` → 仍渲染一項的選單，不落到「沒有功能」；五語系＋右上語言地球；提示文案依有無角色開關二選一；只有個人段時段標「你的工具」；「上次使用」徽章只在 `?menu=1` 且有 cookie；兜底文案改中性。
- 「更多」頁：刪「切換身分」段；清單 ≥2 才顯示一行「看全部身分 →」。

### 2.4 角色矩陣（persona 測試期待值）

| # | 角色 | 所屬公司 | 身分列 | 工具按鈕 | 看不到的字 |
|---|---|---|---|---|---|
| P1 | 只打卡的外籍員工 | A 員工 | 不渲染（地球在姓名列） | — | 管理、考勤、群組助理、報帳 |
| P2 | 只在群組的外部成員 | — | 不渲染 | — | 打卡、考勤、報帳、管理、後台、群組助理、收件匣、平台、員工 |
| P3 | 員工＋公司開報帳 | A 員工 | (b) 淺色 | 「打卡 ▾」 | 管理、群組助理 |
| P4 | 老闆＋員工＋群組成員 | A 老闆兼員工 | (a) | 有 ▾ | — |
| P5 | 只管考勤的會計（非員工） | A 管理 | (c) 深色 | 「考勤 · A」無 ▾ | 群組助理、報帳、個人 |
| P6 | 只管考勤的會計（也是 B 員工） | A 管理、B 員工 | (a) | 管理側「考勤」無 ▾ | 群組助理 |
| P7 | 管 A、B 兩家＋平台擁有者 | A 全開、B 只報帳 | 視個人側 | 「考勤 · A ▾」，選單三段 | — |

---

## 3. 任務總表與任務卡

| 階段 | # | 任務 | 級 | 依賴 |
|---|---|---|---|---|
| A 準備 | T0 | 開工、基準、verify 環境 | P0 | — |
| A | D1 | 移除 `/g` 對所有人顯示的「後台」段（正式站洩漏，F5） | P0 | T0 |
| B 畫布 | C1 | SPEC v2 | P0 | T0 |
| B | C2 | 新增 7 張 Id 畫板 | P0 | C1 |
| B | C3 | 修改既有 Id 畫板 | P0 | C1 |
| C 程式核心 | T1 | `groupSurfaces` 純函式＋ surfaces 擴充＋persona 測試 | P0 | T0 |
| C | T2 | 名稱／說明／圖示單一來源＋五語系 | P0 | T1 |
| C | T3 | `/go/@me`、`/go/@admin` | P0 | T1 |
| C | T4 | `IdentityBar` 純元件＋渲染測試＋persona 快照腳本 | P0 | T2 |
| C | T5 | 管理端接上 | P0 | T3 T4 C2 C3 |
| C | T6 | 個人端接上 | P0 | T3 T4 C2 C3 |
| C | T7 | 首頁選單 | P0 | T2 T4 |
| C | T8 | 清理與文件 | P0 | T5 T6 T7 |
| E 驗收 | T9 | 視覺驗收（1.3 節三種素材） | P0 | T8 |
| B | C4 | 修改既有非 Id 畫板（C4 清單） | P1 | T9 |
| D 頁內 | D2–D9 | 見下 | P1 | T9 |
| D | D10 | 見下 | P2 | D9 |
| F 審查 | T10 | UX 對抗審查迴圈（第 4 節） | P0 | T9（P1 做完後再跑最後一輪） |
| G | T11 | 收尾與早晨報告 | P0 | T10 |

### T0 開工
- 範圍：規則 1；`.claude/launch.json` 的 `groupscribe-verify` 的 runtimeArgs 加 `SESSION_SECRET=verify-only-local`（F7，commit）；跑三件套記錄基準（預期 130 pass）。
- 完成標準：本檔與 launch.json 已 commit；基準數字與 `git status --short` 寫進進度區。

### D1 移除 `/g` 的「後台」段（F5，正式站洩漏）
- 檔案：`src/app/g/page.tsx`（刪 `adminUnset` 整段含 details）、`tests/`（新增原始碼掃描測試：`src/app/g/**` 不得出現「後台」「ADMIN_LINE_USER_ID」「line_user_id 顯示」）。
- 完成標準：三件套綠；早晨報告「你醒來要做的事」第一項標明這一刀要部署。

### C1 SPEC v2（`scratchpad/canvas-work/SPEC.md`）
- 補：暗色模式管理列規則（F27）；截斷規則（F24）；抽屜關閉、遮罩、z-index（F26）；目前角色格＝span（F31）；角色開關 44 的算法（F49）；(c) 態管理標題；多家公司兩行按鈕；個人側多公司顯示（F32）；小點方向（F30）；五語系短角色名。
- 完成標準：SPEC 每一條都能對應到第 2 節；不與 Id 畫板矛盾（矛盾就在 C3 改畫板）。

### C2 新增 7 張 Id 畫板（F9、F23、F24）
| 檔名 | 尺寸 | 內容 |
|---|---|---|
| IdAdminAttendSingle | 390×844 | (c) 態：深色列「[時鐘] 考勤 · [公司名稱]」＋「全部員工 ▾」，內容照 AttendHome |
| IdAdminGs | 390×844 | 深色列＋「群組助理 ▾」＋「[八個字的群組名] ▾」膠囊，內容照 Main |
| IdAdminMulti | 390×844 | 多家公司：工具鈕兩行（考勤 ▾／[公司 A]），內容照 AttendHome |
| IdMeGroups | 390×844 | 個人 (b)：淺色列「群組 ▾」＋h1 你的群組＋群組卡 ≥60px；另附單身分變體（整列不渲染，只留「群記」小字＋h1）於同板下半或另一板 |
| IdMeExpense | 390×1016 | 個人淺色列「報帳 ▾」＋記一筆頁（h1「記一筆」、日期為副標、「專案」） |
| IdPlatform | 1280×860 | 深色頂欄「群記｜格狀『平台管理』無 ▾｜無分頁」，主欄 880：統計卡＋未認領的群＋所有公司（每家入口用零件 4 工具列，只列該公司開的模組） |
| IdDrawerMe | 390×844 | 個人側淺色抽屜打開（打卡／報帳／群組），含關閉列 |

- 完成標準：格式檢查（format.md）通過；與 SPEC v2 逐字一致；照 1.2 發布成功。

### C3 修改既有 Id 畫板
- IdDrawer：加關閉列；目前那列可點關閉。
- IdHome：提示依有無開關兩種文案（本板畫有開關版，副文註明另一版字樣）；加「平台」段；「打卡」列加「上次使用」徽章並把板名改為「首頁選單（?menu=1）」語意（F19、F51）。
- IdMePunch、IdSingleRole：已打上班卡狀態——「下班」實心、「上班」描邊（F21）；底部首格「今天」（F10）；IdMePunch 姓名下方示範「[公司 A] · [部門]」（F32）。
- IdDesktopMenu：「平台」段加「未認領的群」列（F42）。
- IdAdminAttend：暗色 token 照 C1（F27）。
- 完成標準：照 1.2 發布成功；決策紀錄記下每張改了什麼。

### T1 身分分組純函式（F4、F16、F42）
- 檔案：`src/org/surfaces.ts`、新 `src/org/surface-groups.ts`（純邏輯，不 import DB／React／next）、`src/org/module-ids.ts`（改過時註解）、新 `tests/surfaces.test.ts`。
- 內容：Surface 加 `role: 'me'|'admin'|'platform'`、`orgName?`、個人工具加 `slugs: string[]`（`employees.org_id`／`myExpenseIdentity.org_id` 一次 `in()` 反查）；平台擁有者列出所有租戶（搬 `platform/page.tsx` 的查詢），`unclaimed` 歸平台段；`groupSurfaces(list, current?)`（current 不在清單就補一段）、`counterpart()`、`hasRoleToggle()`、`barState()`（a/b/c）。
- 完成標準：2.4 七種角色各一個測試；對應規則（同公司交集 → 上次 → 第一個）；P6「A 管理＋B 員工」；「密碼擁有者站在清單外公司」；「兩家公司模組不同」；unclaimed 歸平台。

### T2 名稱／說明／圖示單一來源＋五語系（F11、F18、F24、F45）
- 檔案：`src/app/o/[org]/routes.tsx`（`I` 加 `chat`、`grid`）、新 `src/org/surface-meta.tsx`（每個 SurfaceId 的圖示、名稱、說明；直接 import `I`）、`src/attend/i18n/*.json`、`src/app/start/page.tsx`（「<工具> · <公司>」）。
- 五語系新增：角色名、個人側三工具名與說明、「看全部身分」「看全部工具」「關閉」、HOME_TITLE／HOME_HINT_TOGGLE／HOME_HINT_TOOL／LAST_USED／YOUR_TOOLS；改：BACK_TO_GROUPS、APP_TITLE、TAB_DASHBOARD（第 2.2 節）。
- 完成標準：i18n 守門綠；五語系 JSON 全文 grep 不再有「群組助理」「打卡系統」；角色名拉丁字母 ≤7。

### T3 角色跳轉（F6、F31）
- 檔案：`src/app/go/[key]/route.ts`；純函式 `resolveRoleJump()` 放 `surface-groups.ts`。
- 完成標準：測試——同工具同公司優先 → 上次 → 第一個；`from` 同角色 → 回 from；不存在的 key → landing；只接受清單裡有的；`/go/<key>` 依角色寫 `gs_last_me`／`gs_last_admin`（httpOnly、1 年）並照舊寫 `gs_surface`；「只有 groups 的人打 /go/attend:x → 落回 /g 的 href」。

### T4 IdentityBar 純元件（F2、F12、F26、F31、F48、F49）
- 檔案：新 `src/app/ui/identity-bar.tsx`：**同步純元件**，props = `{ groups, currentKey, variant: 'light'|'dark', labels, contextSlot?, rightSlot?, dot?, org? }`；**不 import next/headers、不呼叫 surfaces()**；另寫 async 包裝 `identityBarFor()` 給頁面層取資料。`src/app/globals.css`：`.id-bar` 系列、抽屜、下拉、暗色 remap、`.ctx-pill`。
- 測試：`tests/identity-bar.test.ts`（`.test.ts`＋`createElement`，先 import `tests/react-global.ts`）：2.4 七種角色——該出現的出現、「看不到的字」一個都不在；角色開關 nav 高 44；icon-only 有 aria-label；href 只有 `/go/…`；目前角色是 span。
- persona 快照腳本：`scratchpad/snapshots/render.ts`，七角色 × 手機／電腦 × 亮／暗 × zh／vi，輸出 HTML（不進 repo）。
- 完成標準：以上測試綠；快照腳本跑得出 28 個 HTML。

### T5 管理端接上（F17、F25、F40、F41）
- 檔案：`src/app/o/[org]/shell-header.tsx`、`src/app/o/[org]/nav.tsx`（TopNav 改 primary＋更多）、`src/app/ui/group-switcher.tsx`、`src/app/o/[org]/attend/employee-switcher.tsx`（改 `<details>`，保留月份跟著走）、`src/app/ui/surface-switcher.tsx`（IdentityMenu 退場）、`src/app/platform/page.tsx`、`src/app/o/[org]/layout.tsx`（generateMetadata）、`src/app/globals.css`（`.shell-bar` 手機也深色）。
- 完成標準：素材 A 截圖對照 IdAdminAttend、IdAdminAttendSingle（以假資料快照對照）、IdAdminGs、IdAdminMulti、IdDesktopGs、IdDesktopMenu、IdPlatform；情境膠囊在深色列是透明底白字；1024 寬不溢出；`/o/main` 與 `/o/demo` 的 `<title>` 不同；routes 與 requireModule 守門綠。

### T6 個人端接上（F3、F11、F20、F22、F30、F32、F44）
- 檔案：`src/app/a/shell.tsx`（地球規則）、`src/app/a/page.tsx`、`records/page.tsx`、`adjust/page.tsx`（頁首 h1＋日期；adjust 表單 h2）、`src/app/a/expense/page.tsx`＋`expense-app.tsx`（**最小版五語系**：身分列、四個分頁名、頁首標題、存一筆／拍照／金額／分類／專案／付款方式六個標籤、Empty／未開通文案；其餘記「發現但沒做」）、`src/app/g/page.tsx`（身分列，**本機不開**）、`src/app/g/[groupId]/page.tsx`（副標、返回連結）、新 `src/org/pending.ts`（小點）、未登入開機改 `AttendLiffBoot`（`/a/expense`）。
- 完成標準：快照對照 IdMePunch、IdSingleRole、IdMeGroups、IdMeExpense、IdDrawerMe；七種角色的 AttendShell 輸出都恰好一顆「切換語言」；P1、P2 的禁字測試綠；素材 B：假 cookie 開 `/a` 沒有管理字樣。

### T7 首頁選單（F6、F18、F19、F44、F52）
- 檔案：`src/app/page.tsx`；純函式 `homeMode(listLength, hasUid, menu, hasLast)`。
- 完成標準：照 IdHome；兩種提示文案各一測試；清單 1 項＋`?menu=1` 渲染一項選單；五語系＋地球（back=`/?menu=1`）；未登入開機用 `AttendLiffBoot`；兜底文案中性。

### T8 清理與文件
- 檔案：`src/app/o/[org]/more-list.tsx` 與各模組 more 頁；刪除不再使用的 `SurfaceSwitcher`／`IdentityMenu`；`README.md` 介面架構改寫。
- 完成標準：`grep -rn "SurfaceSwitcher\|IdentityMenu" src` 無結果；全站換身分只有身分列＋首頁選單兩個入口。

### T9 視覺驗收
- 範圍：第 1.3 節三種素材；對照表分「頂列（對 Id 畫板）／內容（對原畫板＋C4）」兩欄；對照清單以 canvas.json 的 title 為準；手機 375、電腦 1280 與 1024、亮暗；vi／id 兩語系各 375 一張；抽屜「點遮罩會關」「開著左右滑不換頁」。
- 完成標準：進度區逐頁記錄 OK／差異與處置。

### C4 修改既有非 Id 畫板（P1，R10 的例外清單）
- More、AttendMore：「切換身分」段改一行「看全部身分 →」。
- ExpenseList／ExpenseReport／ExpenseListDesktop／ExpenseReportDesktop／ExpenseStats*／ExpenseCategories*：分頁「報帳」→「加總」；清單 h1 →「收據清單」。
- StaffExpenseAdd／List／Report／Analytics、DarkStaffExpenseAdd：分頁「報帳」→「匯出」；「案場」→「專案」；拿掉「分類 → 管理」格改小字連結；h1 改頁名、日期降副標（F35、F36、F55）。
- AttendReport、AttendReportDesktop：員工膠囊寫「[員工 B] ▾」（F28）。
- StaffPunch：已打上班卡狀態；底部首格「今天」（F10、F21）。
- 完成標準：照 1.2 發布；每張改了什麼記進決策紀錄。

### D2–D10 頁內修正
| # | 內容 | 發現 | 級 |
|---|---|---|---|
| D2 | 報帳改名（加總／收據清單／匯出）＋「案場」→「專案」（程式與 i18n） | F10 F36 | P1 |
| D3 | 打卡主鈕跟今天最後一筆走（不改 API） | F21 | P1 |
| D4 | 個人報帳頁拿掉公司級動作，改連 `/go/expense:<slug>` | F35 | P1 |
| D5 | 報表膠囊說真話（無 ?emp → redirect 帶第一位）；ALL_OK 補 employees／locations／rules／more | F28 | P1 |
| D6 | 員工清單待啟用排最前 | F29 | P1 |
| D7 | 加入流程：join 返回改 `/a`；未加入／待啟用不畫底部膠囊；records／adjust 用同一個 Empty；組織代號 placeholder 改「[管理員給的代號]」；名字 required | F34 F37 | P1 |
| D8 | 單群頁返回連結 ≥44px 可見（若 T6 已做就勾掉） | F46 | P1 |
| D9 | 首頁兜底文案中性（若 T7 已做就勾掉） | F52 | P1 |
| D10 | 月曆圖例＋異常摘要；打卡定位三狀態（拿掉座標、顯示最近地點距離、定位被拒提示、沒地點時鈕 disabled）；補卡類別改分段鈕 | F38 F39 F54 | P2 |

每個 D 完成標準：三件套綠；有對應畫板的照畫板；commit 訊息寫發現編號。

---

## 4. UX 對抗審查迴圈（Fable，T10）

- **範圍護欄**（F15）：只裁定與「身分列、角色開關、工具選單、首頁選單、更多頁、公司辨識、權限可見性」有關的發現；其他一律記「發現但沒做」。
- **審查者**：Fable，5 個角色視角（外籍員工、群組外部成員、老闆兼員工、只管考勤的會計、管多家公司＋平台擁有者）。
- **素材固定**：第 1.3 節 A＋C 的截圖／HTML、Id 畫板、程式碼。**審查者不得開 dev server、不得操作任何表單**（F1）。
- **判準**：3 秒內答得出第 0.1 節三個問題。
- **推翻**：每條 critical／high 由另一個 Fable 嘗試推翻；反方必須給具體使用情境證明不會發生。雙方相左時主 agent 各記兩句話後裁定，寫進決策紀錄。
- **處置**：設計缺口 → 先照 1.2 改畫布 → 再改程式；實作偏差 → 直接改程式。
- **預算**：每輪最多 10 個 subagent、45 分鐘；最多 3 輪。
- **停止**：一輪沒有新的 critical／high；或 3 輪到頂（剩下的寫進報告）。

---

## 5. 收尾

1. 三件套全綠。
2. 刪 `.next-verify`、停掉本機 dev server、scratchpad 快照不進 repo。
3. 填第 7 節；commit 本檔。

---

## 6. 進度回寫區

### 開工基準

```
2026-09-27 T0 開工（HEAD 28335c2）
 M .env.example        ← 開工前就有，不是本計劃的（R11）
 M next-env.d.ts       ← next dev/build 自動改寫（R11）
 M tsconfig.json       ← 同上
?? .next-old/          ← 上次部署留下的舊 build（R11）
npm test：130 pass / 0 fail；typecheck 綠；build（.next-verify）綠
```

| # | 任務 | 級 | 狀態 | 開始 | 嘗試 | commit | 驗證證據 |
|---|---|---|---|---|---|---|---|
| T0 | 開工 | P0 | ✅ | 09-27 夜 | 0 | （本 commit） | 基準 130 pass；launch.json 加 SESSION_SECRET |
| D1 | /g 後台段 | P0 | ✅ | 09-27 夜 | 0 | （本 commit） | 131 pass；故意加回「後台」測試會紅 |
| C1 | SPEC v2 | P0 | ⏳ | 09-27 夜 | 0 | | workflow canvas-c1-c3 背景執行 |
| C2 | 新增 7 張 Id 畫板 | P0 | ⬜ | | 0 | | |
| C3 | 修改既有 Id 畫板 | P0 | ⬜ | | 0 | | |
| T1 | groupSurfaces | P0 | ✅ | 09-27 夜 | 0 | （本 commit） | 145 pass（+14 persona／對應／安全網測試）；diff 審查見 T2 列 |
| T2 | 名稱／圖示／五語系 | P0 | ✅ | 09-27 夜 | 0 | （本 commit） | 145 pass；i18n 守門綠；五語系無「群組助理／打卡系統」 |
| T3 | 角色跳轉 | P0 | ⬜ | | 0 | | |
| T4 | IdentityBar | P0 | ⬜ | | 0 | | |
| T5 | 管理端 | P0 | ⬜ | | 0 | | |
| T6 | 個人端 | P0 | ⬜ | | 0 | | |
| T7 | 首頁選單 | P0 | ⬜ | | 0 | | |
| T8 | 清理 | P0 | ⬜ | | 0 | | |
| T9 | 視覺驗收 | P0 | ⬜ | | 0 | | |
| C4 | 既有畫板修改 | P1 | ⬜ | | 0 | | |
| D2 | 報帳改名＋專案 | P1 | ⬜ | | 0 | | |
| D3 | 打卡主鈕 | P1 | ⬜ | | 0 | | |
| D4 | 個人報帳公司級動作 | P1 | ⬜ | | 0 | | |
| D5 | 報表膠囊 | P1 | ⬜ | | 0 | | |
| D6 | 待啟用排前 | P1 | ⬜ | | 0 | | |
| D7 | 加入流程 | P1 | ⬜ | | 0 | | |
| D8 | 單群頁返回 | P1 | ⬜ | | 0 | | |
| D9 | 首頁兜底文案 | P1 | ⬜ | | 0 | | |
| D10 | 月曆／打卡狀態／補卡 | P2 | ⬜ | | 0 | | |
| T10 | UX 審查迴圈 | P0 | ⬜ | | 0 | | |
| T11 | 收尾 | P0 | ⬜ | | 0 | | |

狀態：⬜ 未開始／⏳ 進行中／✅ 完成／◐ 部分完成／⏭ 跳過＋原因／❌ 失敗＋原因

### 決策紀錄（自行判斷的事都記這裡）

- 2026-09-27（v2 定稿時）：F47「手機捲動後深色線索消失」今晚不改，列入早晨報告「要你決定」（A 管理列黏頂縮成細帶／B 個人側底部膠囊改淺色）。理由：與 133f41f「手機頂端不黏頂、省空間」的定案衝突，要 jielin 決定。
- 2026-09-27：F20 報帳頁五語系採最小版（見 T6）；非 zh 語系的選單「報帳」說明後加「（中文介面）」字樣。
- 2026-09-27：F30 琥珀小點只在個人側、指向管理；管理側「個人」格 v1 不亮。
- 2026-09-27：暗色模式管理列改用 `var(--accent-tint)` 底（F27），C1 定稿時若截圖對比不足再改為深底＋2px accent 上緣線。

### 發現但沒做的事（R8：記給 jielin）

- F43 考勤「匯出全員薪資 CSV」（export API 接受 emp=all＋總覽入口）。
- F47 手機捲動後的角色線索（見決策紀錄）。
- F53 成員頁 `/g`、`/g/[groupId]` 五語系。
- F37 延伸：加入時自動帶 LINE 顯示名稱。
- 報帳 App 其餘文案五語系（F20 最小版以外）。
- 工具選單列的待處理數字徽章。
- 個人側多家公司的「切換公司」（F32 只做顯示）。

---

## 7. 早晨報告（收尾時填寫）

### 一句話

### 你醒來要做的事（照順序，指令一字不差）

（第一項固定：D1 修的 `/g` 洩漏已在正式站存在，建議先部署。）

### 真機（LINE 內建瀏覽器）待你驗收的畫面清單

### 要你決定的事

### 測試結果

### 各任務結果

### 風險與注意

---

## 8. 審查修正對照（v1 → v2）

| 發現 | 嚴重度 | 摘要 | v2 處理位置 |
|---|---|---|---|
| F1 | critical | 驗證會寫正式庫（/g funnel、LINE API） | R4、1.3、T6、第 4 節 |
| F2 | critical | 個人側與 persona 無法本機渲染 | 1.3 素材 C、T4 純元件＋快照 |
| F3 | critical | 單身分時語言地球消失 | 2.3 地球規則、T6 |
| F4 | critical | 平台擁有者在清單外公司時指錯公司 | 2.3 公司辨識、T1 |
| F5 | critical | /g 對所有人顯示「後台」與 LINE ID（正式站） | D1（P0，最先做） |
| F6 | critical | 看全部身分／menu=1 對單身分是死路 | 2.3、T3、T7 homeMode、T8 |
| F7 | high | 假 cookie 需要金鑰 | T0 SESSION_SECRET、R9 |
| F8 | high | 設計來源優先序矛盾 | 2.0 |
| F9 | high | 單工具管理者無畫板、公司名消失 | 2.3 三態、C2 IdAdminAttendSingle |
| F10 | high | 「報帳」「打卡」撞名 | 2.1、2.2、C3、C4、D2 |
| F11 | high | 個人側出現群組助理／打卡系統 | 2.2、T2、T6 |
| F12 | high | async 元件無法 renderToStaticMarkup | T4 同步純元件、1.1 |
| F13 | high | 退回會洗掉別人的變更 | 規則 7 |
| F14 | high | 畫布發布沒有流程 | 1.2、R12 |
| F15 | high | 審查迴圈無護欄 | 第 4 節 |
| F16 | high | 同公司對應做不到 | T1 slugs／orgName、2.3 跳轉 |
| F17 | high | 膠囊在深色列是白塊 | T5 `.ctx-pill` |
| F18 | high | 首頁沒有五語系與地球 | T2 keys、T7 |
| F19 | high | IdHome 提示對無開關者錯誤 | C3、T7 |
| F20 | high | 報帳 App 全繁中 | T6 最小版、決策紀錄 |
| F21 | high | 打卡主鈕不跟狀態 | C3、C4、D3 |
| F22 | high | 員工端缺 h1 | T6 |
| F23 | high | /g、/platform、/a/expense 無畫板 | C2 |
| F24 | high | 手機管理列放不下 | 2.3 截斷、C1、C2、T2 |
| F25 | high | 電腦頂欄溢出、分頁數不一致 | 2.3 電腦頂欄、T5 |
| F26 | high | 抽屜無法關閉 | 2.3 工具選單、C1、C3、T4 |
| F27 | high | 暗色下角色規則失效 | 2.1、C1、C3 |
| F28 | high | 報表膠囊與內容不符 | C4、D5 |
| F29 | high | 待啟用員工排最後 | D6 |
| F30 | medium | 琥珀小點未定義 | 2.3、T6 pending.ts |
| F31 | medium | 上次用的 cookie 無寫入來源 | 2.3、T3、T4 |
| F32 | medium | 個人側多公司不顯示 | 2.3、C3、T6 |
| F33 | medium | next-env／tsconfig 會被改寫 | R11、.next-verify |
| F34 | medium | 加入流程死路 | D7 |
| F35 | medium | 個人報帳頁有公司級動作 | C4、D4 |
| F36 | medium | 「案場」是特定產業用語 | 2.2、C4、D2 |
| F37 | medium | 加入頁名字與代號 | D7 |
| F38 | medium | 月曆無圖例 | D10 |
| F39 | medium | 打卡定位狀態 | D10 |
| F40 | medium | 員工膠囊用原生 select | T5 |
| F41 | medium | 分頁標題沒有公司名 | 2.3、T5 |
| F42 | medium | 未認領的群被當公司 | 2.3、T1、C3 |
| F43 | medium | 沒有全員匯出 | 發現但沒做 |
| F44 | medium | LIFF 開機畫面中文 | T6、T7 |
| F45 | medium | start 頁兩個一樣的「考勤」 | T2 |
| F46 | medium | 單群頁返回太小 | T6、D8 |
| F47 | medium | 捲動後角色線索消失 | 要你決定 |
| F48 | low | shell-header 直寫路徑會被守門擋 | 1.1、T4 |
| F49 | low | 38 vs 44 | 2.3、T4 |
| F50 | low | 六種 vs 七種 | 0.4 |
| F51 | low | IdHome 缺平台段、標題不一致 | C3、T9 |
| F52 | low | 首頁兜底文案 | T7、D9 |
| F53 | low | 成員頁只有繁中 | 發現但沒做 |
| F54 | low | 補卡類別用 select | D10 |
| F55 | low | 記一筆 h1 是日期 | C4、D10 |

被推翻的 21 條全是重複，已合併進上表對應條目。
