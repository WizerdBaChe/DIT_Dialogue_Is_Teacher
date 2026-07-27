# DIT 狀態機盤點 — as-built 與目標設計

- **建立**：2026-07-27（R9）
- **維護方式**：本文件是**持續維護**的清單，不是一次性報告。動到任何一台機器就更新對應段落。
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
| DSM-4 | Session 索引／瀏覽 | `browseState` + `indexEntries` | ✅ R9 新增 | ✔ |
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

### DSM-4 · Session 索引／瀏覽 ✅（R9 新增）

**as-built** — [`core/index/`](../../src/core/index)、[`components/SessionBrowserDialog.tsx`](../../src/components/SessionBrowserDialog.tsx)

```
no_directory --pick--> picking --cancel--> no_directory
                       picking --取得目錄--> indexing --ok--> indexed
                                             indexing --fail--> index_failed --retry--> picking
indexed --refresh--> indexing
indexed --choose--> loading --成功或失敗--> indexed
```

**最後一條是這台機器存在的理由**：載入失敗必須回到清單，而不是回到空白的 app。

**量出來的設計值**（不是猜的）：表頭掃描取頭尾各 128 KB。實測 83 個帶標題紀錄的真實檔案，標題行位置的中位數在**距檔尾 7.5 KB**（標題是後來追加的），但也有落在檔頭 60 KB 處的；頭尾各 64 KB 只涵蓋 81/83，各 128 KB 涵蓋 83/83，全目錄總讀取量約 25 MB。

**分類的偏誤方向是固定的**：五條規則中只有第 3 條（「所有 prompt 都是機器代打的固定句」）是啟發式。它用精確比對而非前綴比對——真人在機器句後面加了字仍是真人。分類是徽章、篩選預設全開，誤判時使用者仍看得到、點得到。

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
