# DIT 狀態機盤點 — as-built 與目標設計

- **建立**：2026-07-27（R9）
- **維護方式**：本文件是**持續維護**的清單，不是一次性報告。動到任何一台機器就更新對應段落。
- **⚠ 實際維護狀況（2026-08-28 誠實標註）**：上面那條規則在 R9 之後**沒有被遵守**。本文件的
  §2 內容基本停留在 2026-07-28，而 R9.1／R10／R11／R11.2／R12 都動過機器。
  本次只重讀並改寫了 **DSM-4**（見下），其餘各節**未經重讀**，狀態如下：
  - **DSM-4** — 已對 HEAD `034fa43` 重讀，可信。
  - **DSM-1／2／3／11／12** — R9 當時為真，其後未複核。DSM-1 至少已知有變（R12 DW-02 給 sync
    pipeline 補了逐檔隔離、M8 修了 worker 的 byte-total 早退）。
  - **DSM-5…DSM-10** — §1 表格只有一行狀態字，從來沒有 as-built 段落。**不是「已審查無問題」，
    是「從未展開」**；DSM-5 端點能力尤其已被 R8 Provider Openness 大幅改寫。
  - R10–R12 新增的機器（來源側寫探索、session map 縮放層級、來源優先導覽）**尚未編號納入**。
- **方法**：每一條狀態與轉移都從現行原始碼讀出，各自附 `file:line`。文件推導出來的內容不列入。
- **同型先例**：`D:\AIWork\Prism\docs\design\PRISM_STATE_MACHINES_2026-07-26.md`。兩個專案的缺陷型態高度重疊，本文件沿用其缺陷分類法與「先確立機器再挑元件」的順序。
- **上游**：[`docs/rounds/r9-session-browser-and-fsm/PSM_R9_WORKCARDS_v0.1.md`](../rounds/r9-session-browser-and-fsm/PSM_R9_WORKCARDS_v0.1.md)（RC-1…RC-5）

---

## §0 怎麼讀

每台機器分三段：**as-built**（今天的行為，含缺陷——這才是實際出貨的契約）、**缺陷**、**目標**。

缺陷分類（沿用 Prism legend，加一條 DIT 自己的）：

| 類別 | 意思 |
|---|---|
| **[1-way]** | 轉移只有單向，反向不可達 |
| **[dead-end]** | 可達但使用者無法離開的狀態 |
| **[split-brain]** | 同一件事實由兩份獨立狀態各自擁有，且可能不一致 |
| **[untracked]** | 現實中會發生、但機器沒有對應狀態的情況 |
| **[leak]** | 某條路徑忘了清除的瞬時旗標 |
| **[fail-whole]** | 集合中單一元素失敗導致整批失敗（DIT 新增；RC-1a 就是這一型） |

---

## §1 機器清單

| ID | 機器 | 唯一擁有者 | 健康度 | R9 是否動到 |
|---|---|---|---|---|
| DSM-1 | Session 載入（blob → 文件） | `pipeline` 批次判定 + `session.worker` | ✅ R9 修復 | ✔ |
| DSM-2 | 解析診斷／提示層級 | `diagnostics: Diagnostic[]` + `error` | ✅ R9 修復 | ✔ |
| DSM-3 | 阻斷面（彈窗） | `core/surface/blockingSurface` 仲裁 | ✅ R9 修復 | ✔ |
| DSM-4 | Session 索引／瀏覽 | `activeSource` + `browseState` + `indexEntries` + `browseGeneration` | ✅ R9 新增，R9.1／R11／R11.2／R12 改寫（本節 2026-08-28 已重讀） | ✔ |
| DSM-5 | 端點能力 | `EndpointStatus` | ✅ **房規範本** | — |
| DSM-6 | 講解批次工作 | `AnnotationJobController` | ✅ sound | — |
| DSM-7 | 隱私同意閘門 | `pendingPrivacyReviewer`（模組層）+ `privacyReview` | ⚠ resolver 不在 state 內 | 部分（表面已納入 DSM-3） |
| DSM-8 | 講解快取還原 | `cacheLoadGeneration` + `cacheReady` | ⚠ `cacheReady` 有三個寫入點 | — |
| DSM-9 | 逐步播放 | `replayTimer`（模組層）+ `isPlaying` | ⚠ timer 不在 state 內 | — |
| DSM-10 | 工作區檢視 | `primaryView` + 抽屜/地圖 boolean | ⚠ 與 DSM-3 重疊 | 部分 |
| DSM-11 | 首次導覽閘門 | `welcomeOpen` + IndexedDB 旗標 | ✅ R9 納入仲裁 | ✔ |
| DSM-12 | 快照模式 | `snapshotMode` | ✅ sound（單一寫入者，以不變式守門） | — |

---

## §2 R9 修復的四台機器

### DSM-1 · Session 載入 ✅

**as-built** — [`pipeline.ts`](../../src/core/pipeline.ts)、[`jsonlStream.ts`](../../src/core/ingest/jsonlStream.ts)、[`session.worker.ts`](../../src/core/ingest/session.worker.ts)

逐檔：

```
[*] --> scanning
scanning --> recognized    : 有 adapter 認領第一行
scanning --> unrecognized  : 沒有 adapter 認領（不是例外，是結果值）
recognized --> parsed
recognized --> parse_failed: 串流/解碼失敗（逐檔隔離）
```

批次（[`pipeline.ts` 的 `buildSessionDocumentFromParsedFiles`](../../src/core/pipeline.ts)）：

```
collecting --> ok            : >=1 檔解析成功，且頂層 sessionId 只有一個
collecting --> ok_partial    : 另有無法辨識/讀取失敗的檔案 → 照常載入，回報被略過的
collecting --> no_main       : 解析成功的全在 subagents/ 底下 → 具名 fatal
collecting --> multi_session : 頂層 sessionId 超過一個 → 具名 fatal
collecting --> empty         : 一個檔案都沒有 → 具名 fatal
```

**R9 之前的缺陷（已修）**
- **[fail-whole] RC-1a** — 逐檔偵測失敗會拋例外並讓整批失敗。真實 `<id>/subagents/` 目錄裡就有 `agent-<id>.meta.json` 旁檔，於是**選任何一個真實 session 資料夾都必定失敗**。adapter 層對壞行寬容、檔案層卻全有全無，同一條資料流兩段採相反策略。
- **[untracked] RC-1b** — 沒有「這批檔案沒有主檔」這個狀態。`files.find(非 subagents) ?? files[0]` 會靜默把子代理檔當成主檔。真實佈局是 `<id>.jsonl` 與 `<id>/` **並排**，主檔不在資料夾內；這個假設從未對真實資料驗證過，唯一的素材是本專案自己產生的 fixture。

**不變式（測試釘住）** — [`pipeline.test.ts`](../../src/core/pipeline.test.ts)
1. 只要有一個檔案解析成功，無法辨識的檔案就只能是 `warn`，不得是 `fatal`。
2. 只有子代理檔時，結果必為具名的 `NO_MAIN_TRANSCRIPT`，不得靜默升格。
3. 每個檔案的診斷都帶著自己的 `path`。

### DSM-2 · 解析診斷／提示層級 ✅

**as-built** — [`core/diagnostics/contracts.ts`](../../src/core/diagnostics/contracts.ts)、文案在 [`i18n/diagnosticCopy.ts`](../../src/i18n/diagnosticCopy.ts)

| 層級 | 觸發 | 表面 | 離開方式 |
|---|---|---|---|
| `info` | 政策已處理的已知狀況（壓縮標記、略過的噪音） | 總覽計數，不打斷 | 下次載入 |
| `warn` | 可復原的降級（略過的檔案、配對失敗、輸入過大） | 可關閉的橫幅，細節可展開 | 使用者關閉或下次載入 |
| `fatal` | 沒有東西可呈現 | 經 DSM-3 的阻斷面，同時說明成因**與**下一步 | 明確確認 |

**R9 之前的缺陷（已修）**
- **[not a machine] RC-3** — `warnings: string[]` 不分級，`warnings.length > 0` 就強制彈不可跳過的 modal。一份只含 2 行 `stop_hook_summary` 的純對話因此被攔下來（作者實測 `68466cc1`）。
- **[split-brain] RC-5** — 失敗有兩個擁有者：同步路徑寫 `error`、worker 路徑寫 `sessionLoadError`，UI 兩處都要顯示。

**不變式**
1. 診斷永遠不攜帶成句的文字，只有 `code` + 插值；文案表是唯一來源。
2. 未列表的 code 降級成通用文案 + code，**永遠不退回原始例外訊息**。
3. 每個 `fatal` code 都必須同時有 title 與 body（[`diagnosticCopy.test.ts`](../../src/i18n/diagnosticCopy.test.ts) 斷言）——沒有復原路徑的阻斷面就是死路。

### DSM-3 · 阻斷面 ✅

**as-built** — [`core/surface/blockingSurface.ts`](../../src/core/surface/blockingSurface.ts) + [`components/useBlockingSurface.ts`](../../src/components/useBlockingSurface.ts)

```
[*] --> closed
closed --> open   : 想開，且沒有更高優先的表面想開
closed --> queued : 想開，但有更高優先的表面開著
queued --> open   : 上面那個不再想開
open --> closed   : 明確動作
open --> closed   : Escape/backdrop —— 僅限 policy = escapable
```

優先序（高到低）：`fatal-notice` › `privacy-review` › `welcome` › `session-browser` › `settings` › `session-map` › `structure-drawer`。系統發起的排在使用者發起的之前。

**設計要點**：仲裁**不引入新的可變狀態**。「誰想開」由既有領域狀態推導（[`store/surfaceSelectors.ts`](../../src/store/surfaceSelectors.ts)），排隊是優先序的自然結果。沒有 queue 陣列，就沒有 queue 會殘留——這正是本輪在修的缺陷型態，不該用同型的手段去修。

**R9 之前的缺陷（已修）**
- **[split-brain] RC-4** — 6 個表面各自持有 boolean、各自 `showModal()`。三個靠手動互清假裝互斥，另外三個完全不在互清網內；首次啟動遇到 fatal 會有兩個 dialog 同時進 top layer。
- **[說謊的角色]** — `PrivacyReview` 是 `<section role="dialog" aria-modal="true">`：不在 top layer、不畫 backdrop、不讓背景失效。宣稱擋著，其實沒有。

**MUST NOT**（每一條都對應曾經出貨過的行為，或是它的直接反面）
1. `<dialog>` 帶靜態 `open` 屬性（會讓 `if (!dialog.open) showModal()` 永遠為偽，表面悄悄退化成非模態，而 store 層測試依然全綠）。
2. 同時開啟兩個阻斷面。
3. `action-only` 的表面被 Escape 或 backdrop 關掉。
4. 元件自行決定關閉政策——政策是呼叫端的資料。

### DSM-4 · Session 索引／瀏覽 ✅（R9 新增；R9.1／R11／R11.2／R12 改寫）

> **重讀 2026-08-28**（`feat/r12-source-first-navigation` HEAD `034fa43`）：本節原本停在 R9 的五行
> 狀態圖。其後 **R9.1 改掉了一個狀態名**、**R11 補了兩條當時根本不存在的路徑**、**R11.2 加了世代
> 守衛**、**R12 在前面多接了一整級**——四輪都沒有回填本節。以下取代原圖；原圖的 `no_directory`
> 已不是這台機器的狀態名，不要再照它施工。
>
> **值得記一筆的對照**：`BrowseState` 型別上方的程式碼註解（`sessionStore.ts:115-130`）**一直是對的**
> ——它早就寫 `closed` 而不是 `no_directory`，也留著改名的理由。走樣的只有這份設計文件。
> 註解跟著被改的那一行一起被看見，獨立的設計文件不會。本節因此只當**展開版**（並行語意、
> resume 分支、缺口修補的來由），簡版契約以那段註解為準；兩者衝突時，相信程式碼旁邊那份。

**as-built** — 型別 [`sessionStore.ts:131`](../../src/store/sessionStore.ts)、轉移
`sessionStore.ts:858-1016`、仲裁 [`surfaceSelectors.ts:17`](../../src/store/surfaceSelectors.ts)、
掃描 [`core/index/`](../../src/core/index)、UI
[`SessionBrowserDialog.tsx`](../../src/components/SessionBrowserDialog.tsx)、
[`SessionLoadActions.tsx`](../../src/components/SessionLoadActions.tsx)

R12 M2 之後這台機器是**兩級**的：先選來源系統，才談目錄。兩級各有自己的狀態，不共用。

**Level 1 — 來源選擇**（`activeSource: SourceId | null`）

```
[*] --> activeSource=null
activeSource=null --chooseSource(s)--> activeSource=s      : sessionStore.ts:858
activeSource=s --clearSource()------->  activeSource=null   : sessionStore.ts:866-869
```

`clearSource()` **不只是回上一頁**：它同時 `browseState="closed"`、清空 `indexEntries` 與
`indexDiagnostics`、遞增 `browseGeneration`。理由寫在程式碼註解裡——那批條目屬於掃描當下被選中的
那套系統，換了選擇還留在畫面上就是 wrong-target display。但**記住的目錄 handle 不清**：那是位置
記憶，刻意留著（`sessionStore.ts:860-865`）。

**Level 2 — `BrowseState`**（六個值，`sessionStore.ts:131`）

```
closed --pickAndIndexDirectory--> picking            : sessionStore.ts:871-877
picking --取消(DirectoryPickCancelledError)--> indexed  (若 indexEntries 非空)
picking --取消--------------------------------> closed   (若 indexEntries 為空)  : :884
picking --非取消的失敗--> index_failed                 : :887
picking --取得 handle--> indexing --ok--> indexed      : runIndex :483 → :496-501
picking/indexing --失敗--> index_failed                : :899 / :916 / :964 / :973
index_failed --使用者按重試--> picking
indexed --refresh--> indexing
indexed --choose--> loading --成功或失敗--> indexed     : loadIndexEntry :988-1016
任何狀態 --closeBrowser()--> closed                    : :977-982
```

**最後一條轉移是這台機器存在的理由**：載入失敗必須回到清單，而不是回到空白的 app
（`sessionStore.ts:1011-1013` 的 `finally`）。

**`closed` 不是 `no_directory`——改名是修一個缺陷，不是換個字。** R9.1 RC-A 的原話留在
`sessionStore.ts:126-129`：`closed` 是唯一讓瀏覽器整個消失的值（`selectSurfaceWants()` 只在
`browseState !== "closed"` 時掛載對話框），因此它只能由**使用者的意思**抵達——關閉、初始、或在系統
選擇器按取消。**任何失敗都不得落在這裡。** 舊名 `no_directory` 讓「還沒選目錄」與「失敗了但還沒有
任何條目」看起來像同一件事，於是失敗可以無聲退場。這條是本機器的不變式，不是命名品味。

**resume 路徑（R9.1 RC-A + R12 M2，原圖完全沒有）** — `resumeLastDirectory()`，`sessionStore.ts:920-976`

```
resumeLastDirectory()
  ├─ 不支援 FSA ─────────────> picking      : :921-932（R11 M3，見下）
  ├─ 這套來源沒有記住的 handle ─> 退化成 pickAndIndexDirectory()  : :944-946
  └─ 有 handle → picking → restoreDirectorySource()（在使用者手勢內重新要權限）
        ├─ DirectoryPermissionError → index_failed + INDEX_PERMISSION_LOST : :955-962
        │     └─ 副作用：**只**丟掉這套來源的記憶，另一套的位置不動
        └─ 其他失敗 ────────> index_failed  : :963-965
      取得 source → runIndex() → indexed（或 index_failed :972-974）
```

三件事在原圖裡看不出來，但都是刻意的：

1. **handle 在模組載入時就先讀好**（`sessionStore.ts:443-457`）。`showDirectoryPicker()` 與
   `requestPermission()` 都必須發生在使用者手勢裡，點擊路徑上不能再等 IndexedDB。讀出來的診斷
   存進 `pendingHandleNotices`，由下一次 `runIndex` 併進 `indexDiagnostics`（`:492-500`）——
   模組載入時還沒有任何介面可以顯示訊息。
2. **那次讀取是合併，不是覆寫**（DW-21，`sessionStore.ts:445-456`）。順序即優先權：這個 session
   裡剛選的一定比啟動時讀到的新，已有值的鍵不被覆蓋。原本的整包取代會在冷啟動時把使用者剛選的
   資料夾蓋掉，而且**下次重載又會自己好**，所以沒有人會回報它。
3. **權限沒拿到 vs 授權之後才失敗，是兩件事，不共用一個 catch**（RC-A）。前者丟掉記憶並回報
   `INDEX_PERMISSION_LOST`；後者只是一次普通的索引失敗。

**R11 M3 補的兩條缺口** — 都不是「改善」，是原本**根本不存在**的路徑：

- **失敗出口**：`indexFileList()`（webkitdirectory 後備）原本沒有 catch，`runIndex` 一丟例外就
  永遠停在 `indexing`——而且它前面沒有 picker 步驟可以失敗回去。現在有 try/catch 落到
  `index_failed`（`sessionStore.ts:907-918`）。
- **入口**：不支援 FSA 時 `resumeLastDirectory` 原本把 `browseState` 設成 `"closed"`，而
  `selectSurfaceWants()` 只在 `!== "closed"` 時掛載對話框——`<input type="file" webkitdirectory>`
  就住在那個對話框裡，於是**它從來沒有掛載過**。R11 M3 的註解記下了這個盲點：舊註解宣稱「UI 會開
  `<input>`」是假的。現在設 `"picking"`，對話框開著並顯示「等你選資料夾」（`sessionStore.ts:921-932`）。

**世代守衛（R11.2 C6）——這台機器唯一的並行機制**，`browseGeneration`，`sessionStore.ts:425`、
理由註解 `:414-424`

挑選／索引是跨多個 `await` 的流程（`buildSessionIndex` 逐檔掃描，幾百個 session 要一段時間），而
`closeBrowser()` 只把 `browseState` 寫回 `"closed"`，**從不取消背景中還在跑的那次索引**。索引完成時
它的續行會毫無防備地把狀態又寫回 `"indexing"`／`"indexed"`——對話框在使用者關掉之後自己重新彈出，
而且因為索引其實已經跑完，它重新出現時落在 `"indexed"`，看起來像是「沒有經過索引中」。

規則（每一個進入點都遵守）：

| 動作 | 對 `browseGeneration` 做什麼 | 出處 |
|---|---|---|
| `pickAndIndexDirectory` / `indexFileList` / `resumeLastDirectory` | `++` 認領一個新世代 | `:875` / `:911` / `:921` |
| `clearSource` / `closeBrowser` | `++` 使所有飛行中的世代作廢 | `:867` / `:980` |
| `loadIndexEntry` | **只讀不加**（`const generation = browseGeneration`）——它不開新一輪瀏覽，只想知道自己 await 期間有沒有人關掉 | `:997` |
| 每個 `await` 之後的 `set()` | 先 `if (browseGeneration !== generation) return;` | `:482,487,491,882,890,898,903,915,953,967,972,1013` |

**不變式**：這台機器裡任何在 `await` 之後才發生的 `set()`，都不得在未比對世代的情況下寫入。
新增一條非同步路徑而漏了這個比對，就是把 R11.2 C6 那個「對話框自己彈回來」的缺陷放回去。

**與 DSM-3 的關係**：本機器不自己決定要不要顯示。`selectSurfaceWants()` 只讀
`browseState !== "closed"`（`surfaceSelectors.ts:17`），實際顯示與否由 DSM-3 的優先序仲裁決定。

**量出來的設計值**（不是猜的）：表頭掃描取頭尾各 128 KB。實測 83 個帶標題紀錄的真實檔案，標題行位置的中位數在**距檔尾 7.5 KB**（標題是後來追加的），但也有落在檔頭 60 KB 處的；頭尾各 64 KB 只涵蓋 81/83，各 128 KB 涵蓋 83/83，全目錄總讀取量約 25 MB。

**分類的偏誤方向是固定的**：七條規則中只有第 6 條（「所有 prompt 都是機器代打的固定句」）是啟發式。原則是**寧可漏判機器，不可誤判真人**，落在三處：機器語句用精確比對而非前綴比對；斜線指令算「人出手過一回合」而不是看淨化後還剩幾個字；掃描讀不到任何完整行時回報「無法判定」，而不是「沒有真人訊息」或「不是 Claude Code」。分類是徽章、篩選預設全開，誤判時使用者仍看得到、點得到。

實測 109 個真實 session：108 判為對話、1 判為機器（7 行的空 session，判定正確），**啟發式規則一次都沒觸發**。過程中抓到兩個誤傷並修正——一個 51 則回覆的 `/doctor` 工作階段（斜線指令淨化後無字），一個附截圖的真人 prompt（單行 132 KB 跨過檔頭邊界被丟掉）。兩者各有回歸測試。

---

## §3 尚未修復的機器（既有債，非 R9 造成）

以下皆為 R9 之前就存在的狀況，本輪**刻意不動**，記錄於此並登在 [`docs/BACKLOG.md`](../BACKLOG.md)。

- **DSM-7 [untracked]** — `pendingPrivacyReviewer` 是模組層變數而非 state。同意閘門的「有沒有人在等」因此無法被選擇器觀察，也不會隨 state 快照一起被測試看到。表面已在 R9 納入仲裁，但 resolver 的歸屬未動。
- **DSM-8 [split-brain 傾向]** — `cacheReady` 有三個寫入點（發布、還原完成、失敗）。`cacheLoadGeneration` 的世代守衛是**對的**，值得保留為範本；問題只在 `cacheReady` 這個布林。
- **DSM-9 [untracked]** — `replayTimer` 是模組層變數。「正在播放」在 state（`isPlaying`）與模組（timer 是否存在）各有一份，兩者靠 `pause()` 手動同步。
- **DSM-10 [overlap]** — `primaryView` 與抽屜/地圖 boolean 部分重疊：地圖既是「檢視」又是「阻斷面」。R9 只解決了後者。

---

## §4 跨機器發現

**F1 — 「我們把抵達好狀態這件事模型化了，然後就停手了。」** R9 之前，DIT 的四台核心機器都缺失敗側的狀態：載入沒有部分成功、沒有缺主檔；診斷沒有層級；阻斷面沒有仲裁。DSM-5（`EndpointStatus`）是反例，它連 `cors-blocked`／`auth-missing`／`proxy-missing` 都列了——證明這件事在本 codebase 裡做得到。

**F2 — 對外部格式的假設，必須用外部資料驗證。** RC-1b 的根源不是程式錯，是**用自己產生的 fixture 驗證自己對別人格式的假設**。R9 的做法是拿真實的 140 個檔案跑一次，並把量測結果寫進文件（頭尾大小、標題位置分布）。任何新增的 adapter 或索引器都應照辦。

**F3 — 修 leak 不可以用會 leak 的手段。** DSM-3 刻意不引入 queue 陣列、`SESSION_SCOPED_INITIAL_STATE` 刻意只留一份清單並用測試對照執行期鍵集合。新增一份可變狀態去管理另一份可變狀態，只是把缺陷往後推一輪。

**F4 — 有些機器不可能被行程內測試斷言**（Prism F7 的同一條）。vitest 跑 node 環境，看不到 top layer、backdrop、遮蔽與可點擊性。R9 用兩層補：元件層斷言 `showModal` 真的被呼叫（這正是 Prism 出事的那一點），其餘交給 §5 的手動驗收與真瀏覽器實測。渲染層的機器（地圖、版面）繼承同樣的限制。

**F5 — transition test 撞得出函式層測試撞不到的東西。** 寫 DSM-4 的第一條轉移測試時撞出一個既有洩漏：`startSessionLoad` 在 `try` 之外，建構 Worker 失敗（CSP／`file://`／不支援 module worker）會讓進度條永遠停在「讀取中」。這條路徑沒有任何函式層測試會經過。
