# DIT 全專案深度審查（Deep Project Health Review）

日期：2026-08-03  
審查模式：`code-review-deep-checklist` Mode B（whole-project architecture health）  
分支：`feat/r9.1-uat-remediation`  
審查基準 commit：`92d00e3`  
審查性質：findings-only；本文件是可再次審查、可直接拆成施工工作的交付物。本輪沒有修改 `src/`。

## 1. 結論先行

目前的資料管線在 Node 測試、TypeScript 型別檢查與 production build 都是綠的，但不能把這個結果解讀成「可直接交付」。本次審查找到 3 個 release-blocking findings、8 個 should-fix findings，以及 4 個 consider findings；其中前 3 個會讓使用者拿不到 session、讓合法輸入從清單消失，或使靜態 HTML 快照違反「零網路請求」契約。

最重要的落差集中在四條邊界：

1. **IO／來源判定**：後備資料夾入口的 rejection 沒有收斂到 `index_failed`；放大檔頭後沒有重新判定 adapter；`pr-link` 已被 adapter 收到卻在 normalize 丟失。
2. **快照／渲染執行環境**：snapshot mode 仍會由 `App` 觸發 `dit.config.json` 的 `fetch`，與 R6 的 `EX-INV-1`／使用者指南所承諾的 no-network snapshot 不一致。
3. **UI 與狀態機**：`showModal()` 的 catch 對所有 runtime 例外都降級成普通 `open` dialog；Settings 的 focus effect 在另一個高優先 modal 活躍時仍會把 focus 拉回背景按鈕。
4. **映射語意／UX**：R9.1 PSM 明確要求保留並產生 `milestone` station，現行型別與 distiller 卻移除了它；Session Map 顯示分類名稱，但沒有消費 R9.1 宣稱的分類 definition table；部分 map/fishbone 目標 fallback 仍未回報。

### Release recommendation

先完成 `F-01`、`F-02`、`F-03` 與對應 `WC-01`～`WC-04`，再進行真實瀏覽器驗收。若未處理，建議不要把此分支標成「R9.1 完成」或合併到 `main`。

## 2. 審查範圍、方法與證據

### 2.1 實際讀取的規格與設計來源

- `docs/RPD_DIT_v0.1.md`：FR/NFR、Span Tree 草案、adapter 容錯、offline／large-session 目標。
- `docs/PSM_DIT_v1.0.md`：Span Tree v0.2、SourceAdapter／batch contract、R sequence、測試與 UAT 邊界。
- `docs/architecture.md`：raw file → adapter／worker → normalize → denoise → distill → validate → viewModel → Zustand → React，以及 worker atomic publish、map projection cap。
- `docs/design/DIT_STATE_MACHINES.md`：DSM-1 session load、DSM-2 diagnostics、DSM-3 blocking surface、DSM-4 browser、DSM-12 snapshot 與已知 debt。
- `docs/design/DIT_TEXT_RENDERING.md`：untrusted agent text、reader／snapshot 兩條渲染路徑、Markdown／LaTeX 目前只做 design note 的範圍裁決。
- `docs/rounds/r9-session-browser-and-fsm/`：R9 UAT、RCA、原始 defect root causes。
- `docs/rounds/r9.1-uat-remediation/`：R9.1 PSM work cards、UAT 與 handoff。
- `docs/ACCEPTANCE.md`、`docs/PROGRESS.md`、`docs/USER_GUIDE.md`：驗收狀態、已知限制、對外 UX 承諾。

### 2.2 基線命令

執行目錄：`D:\AIWork\DIT_Dialogue_Is_Teacher`  
Runtime probe：`node v24.14.1`、`npm 11.11.0`、`npx 11.11.0`、local `vite 5.4.21`。

| Gate | 結果 | 解讀 |
|---|---:|---|
| `npm.cmd test` | 48 files / 373 tests passed | 資料／函式與部分 jsdom surface 測試綠；不代表真實 browser rendering、top-layer、Firefox/Safari 或 visual layout 綠。 |
| `npm.cmd run typecheck` | exit 0 | 型別邊界目前可編譯；型別不能保證 `prLinks` runtime preservation 或狀態轉移完整。 |
| `npm.cmd run build` | exit 0 | main build 與 snapshot build 都產出；不能證明 snapshot 真的無 request，也不能證明畫面尺寸／focus／modal 視覺正確。 |
| `git diff --check` | exit 0 | 本文件新增後的 artifact gate；relative report links 另以 49 links read-only check 驗證，全部 resolve。 |

測試執行時另有 Vite toolchain warnings：`vite:react-babel` 的 esbuild option deprecated，以及 `optimizeDeps.esbuildOptions` deprecated；目前使用 `oxc`，esbuild option 被忽略。這不是本次 release blocker，但應納入 toolchain hygiene work。

### 2.3 審查限制

本輪沒有啟動 dev server、沒有用真實瀏覽器點擊流程、沒有取得 Firefox/Safari 執行環境，也沒有執行 R5 benchmark；`benchmark:r5` 目前只是接收外部 `metrics.json` 的 renderer，repo 內沒有本輪可直接產生該 metrics 的 browser runner。因此所有 visual、top-layer、focus、Network panel 與 responsive 結果都必須看作 **unverified**，不能用上述綠色 gate 代替。

## 3. 需求／契約 traceability

| 契約／需求 | 實作位置 | 本次判定 |
|---|---|---|
| RPD FR-1、NFR：Claude `.jsonl`、壞行 skip + diagnostic | `core/adapters/*`、`core/ingest/jsonlStream.ts` | adapter line-level 多數符合；source detection 在第一個非空壞行時提前終止，見 `F-12`。 |
| PSM §2.3：單行損壞不應讓整體失敗；R9：file-level isolation | `core/ingest/session.worker.ts`、`core/pipeline.ts` | worker／batch 方向正確；後備 browser index 的 store boundary 漏接，見 `F-01`。 |
| PSM §2.1：Span Tree v0.2；breaking change 要升 `SCHEMA_VERSION` 並記 ADR | `types/spanTree.ts`、`docs/PSM_DIT_v1.0.md` | 文件寫 v0.2，實碼仍 `0.1`，且 marker 語意已改；見 `F-09`。 |
| PSM §2.2／R9.1 M3：outcome 是 semantic slot；marker 不可成為 outcome；保留並產生 milestone station | `denoise.ts`、`distill.ts`、`sessionMap.ts` | marker 修正已實作；milestone contract 與實碼相反，見 `F-09`。 |
| DSM-3：一個 active blocking surface、原生 `showModal()`、background blocked | `surface/blockingSurface.ts`、`useBlockingSurface.ts` | 仲裁器正確集中；runtime catch 會靜默破壞 top-layer invariant，見 `F-06`。 |
| R6 EX-INV-1／EX-INV-3：snapshot self-contained、no network、file:// | `App.tsx`、`configFile.ts`、`snapshot.tsx`、`vite.snapshot.config.ts` | build 產物存在；startup fetch 仍可能發生，見 `F-03`。 |
| R9.1 M2／RC-C：subagent identity 以 content 為準；minimap 同投影 | `pipeline.ts`、`sessionMap.ts`、`ReaderMinimap.tsx` | 內容判定與 current dot 同投影已有改善；visual／real-file 結果仍待手動驗證。 |
| R9.1 M4／RC-B：named degradation 走 Diagnostic，不污染 fallback channel | `sessionIndexer.ts`、`diagnosticCopy.ts` | filename degradation 已改正；exception detail 仍直出 UI，見 `F-05`。 |
| R9.1 M8／M9：density／category definition 要可被使用者理解且單一來源 | `ReaderMinimap.tsx`、`categoryDefinitions.ts`、`OverviewView.tsx`、`SessionMapDialog.tsx` | minimap caption 有；Session Map 沒有真正 consume definitions，見 `F-10`。 |

## 4. 核心單元的 plain-language intent tests

這些不是新增測試，而是每個邊界在再次審查時應能用白話回答的驗證意圖。

| Core unit | Plain-language intent test | 現有證據／缺口 |
|---|---|---|
| DirectorySource／SessionIndexer | 「我選一個目錄，任何單一檔案壞掉都不能讓整個清單消失；可判定的 session 必須被列出，不可判定的要明說。」 | `sessionIndexer.test.ts` 有 per-file unreadable、oversized line、subagent pairing；store fallback rejection 缺測，見 `F-01`。 |
| Adapter／JSONL stream | 「檔案裡混進一兩行壞 JSON，仍要把其他行讀出來並留下診斷；來源判定不應因第一行偶然損壞就放棄整檔。」 | line parse tests 有；first-line detection failure 仍會整檔 unrecognized，見 `F-12`。 |
| Normalize／Denoise／Distill | 「adapter 已辨識出的 session metadata、event identity 與語意標記，往下游後仍然存在；壓縮標記不能假裝是結果。」 | marker regression 有；`prLinks` preservation 與 milestone contract 缺一致性測試，見 `F-04`、`F-09`。 |
| ViewModel／Fishbone／SessionMap | 「使用者點 map 上的節點，應跳到那一個節點的真正卡片；找不到對應項目時要說明失配，不能偷偷跳到第一項。」 | session map 有 projection cap／focus tests；仍有 silent first-target fallbacks，見 `F-11`。 |
| Zustand store／DSM-1～DSM-3 | 「每一個 async failure 都會落到可見且可恢復的 state；同一時間只有一個 blocking surface，focus 在 active surface 裡。」 | transition tests 有挑目錄與 fatal queue；fallback path、focus arbitration、real showModal 缺口見 `F-01`、`F-06`、`F-07`。 |
| React reader／disclosures | 「只用鍵盤與 assistive technology，也能知道一個區塊是否收合並把它打開／關掉。」 | `parts.test.ts` 只測摘要純函式；Thinking／IO／Group DOM semantics 未驗，見 `F-08`。 |
| Export／Snapshot | 「把 HTML 拿到沒有 dev server 的機器上雙擊，看到同一份資料、沒有 hidden load control、沒有任何 request。」 | template injection／build tests 有；App startup fetch、browser Network 與 file:// 尚未在本輪驗證，見 `F-03`。 |

## 5. 優先 findings

### F-01 — [Blocker] WebKit directory fallback 沒有可達入口與 indexing failure 狀態出口

**Severity**：blocker  
**Confidence**：high；由 source-level control flow 直接驗證，且與 R9.1 UAT §F 已記錄的 B5 風險相吻合。  
**Plain-language intent test**：使用者在沒有 File System Access API 的環境，選一個 unreadable 或沒有 `.jsonl` 的目錄後，畫面必須離開 `indexing`，顯示原因與 retry；不能永遠顯示讀取中，也不能無聲返回。

**Evidence**：

- [`SessionBrowserDialog.tsx:64-69`](../../src/components/SessionBrowserDialog.tsx#L64) 對空的 filtered file list 直接 `return`；對非同步 `indexFileList` 使用 `void`。
- [`sessionStore.ts:780-782`](../../src/store/sessionStore.ts#L780) 的 `indexFileList` 沒有 catch，直接 await `runIndex`。
- [`sessionStore.ts:403-415`](../../src/store/sessionStore.ts#L403) 的 `runIndex` 先把 state 設成 `indexing`，`buildSessionIndex` reject 時不會自行恢復。
- 目前只有 FSA `pickAndIndexDirectory` 與 `resumeLastDirectory` 兩條路徑有 `index_failed` catch；這不涵蓋 WebKit fallback。
- [`SessionLoadActions.tsx:39-40`](../../src/components/SessionLoadActions.tsx#L39) 的 folder-first button 只呼叫 `resumeLastDirectory()`；[`sessionStore.ts:784-788`](../../src/store/sessionStore.ts#L784) 在不支援 FSA 時直接把 `browseState` 設回 `closed` 並 return。
- fallback trigger 位於 [`SessionBrowserDialog.tsx:59-61`](../../src/components/SessionBrowserDialog.tsx#L59)，實際 `<input webkitdirectory>` 位於 [`SessionBrowserDialog.tsx:145-156`](../../src/components/SessionBrowserDialog.tsx#L145)；但兩者都在 dialog 未 active 時不會 mount／不能被呼叫。目前沒有另一個 `openSessionBrowser` action 讓這個入口可達，因此 fallback 環境可能連選取目錄都做不到。

**Impact**：Firefox/Safari 或任何 fallback path 的使用者可能看不到可選目錄的入口、看到永久 indexing、保留舊清單，或什麼都沒發生；這直接破壞 folder-first 主入口的可達性與可恢復性。`UAT_R9.1_v1.0.md` 已承認該路徑沒有 browser-level evidence，但現行程式碼仍沒有 fallback entry/failure boundary。

**Required implementation contract**：

- `indexFileList` 必須在 store boundary catch 所有 `runIndex` failure，設 `browseState: "index_failed"`、清除 progress、寫入 typed diagnostic。
- `onFallbackFiles` 遇到零個可索引檔案時，必須有明確 `INDEX_EMPTY`／具名提示與可再次選取的 UI，不得 no-op。
- 不支援 FSA 時，folder-first button 必須能直接開啟 fallback file input 或 browser surface；不能只把 state 設回 `closed` 後結束。
- 需保留既有 indexed list 的 semantics：新的 index failure 不能刪除上一份已有效 session。

### F-02 — [Blocker] Indexer 擴大 head window 後沒有重新判定 adapter

**Severity**：blocker  
**Confidence**：high；靜態追蹤 `isClaudeCode` 的生命週期即可證明。  
**Plain-language intent test**：一份合法 Claude transcript 的第一筆 JSON record 大於 128 KiB、但小於 1 MiB 時，Session browser 仍必須列出它，不可因第一個 window 只拿到半行而把它排除。

**Evidence**：

- [`sessionIndexer.ts:185-190`](../../src/core/index/sessionIndexer.ts#L185) 在第一次 128 KiB head window 上計算 `isClaudeCode`。
- [`sessionIndexer.ts:202-207`](../../src/core/index/sessionIndexer.ts#L202) 發現 oversized straddling 後重新讀到 1 MiB、feed 完整 record，但沒有重新執行 `detectAdapter`。
- [`sessionIndexer.ts:220`](../../src/core/index/sessionIndexer.ts#L220) 把舊的 `isClaudeCode` 回傳。
- [`sessionIndexer.ts:295-305`](../../src/core/index/sessionIndexer.ts#L295) 在 head scan usable 且舊判定為 false 時直接 `continue`，所以 valid file 從清單消失。
- 現有 regression fixture 的第一行是一般大小的 assistant record，不能覆蓋「第一行本身 oversized 且要靠第二次讀取才能被 detect」的案例。

**Impact**：真實含 screenshot/base64 的大型首筆 user record 可能在 browser list 中被誤刪；這是錯誤結果，不是單純 counts 不精確。

**Required implementation contract**：

- 把 adapter detection 放在每次 head window 最終確定後，或在 head expansion 後明確重算。
- 增加一個第一行 200 KiB、adapter 只有完整 JSON 才能認領的 fixture；assert entry exists、`kind` 與 title 都正確。
- 同時保留「第一行大過 1 MiB 時 `unknown/insufficient-signal`」的既有保守行為。

### F-03 — [Blocker] Snapshot mode 仍觸發 `dit.config.json` fetch，違反 no-network snapshot contract

**Severity**：blocker（export/privacy invariant）  
**Confidence**：high for code path；actual browser Network result remains unverified.  
**Plain-language intent test**：在 `file://` 開啟匯出的 snapshot、DevTools Network 保持開啟，頁面載入與切換 Overview／Reader／Map／Settings 都不得產生任何 request。

**Evidence**：

- [`App.tsx:30-40`](../../src/App.tsx#L30) 無條件呼叫 `loadPersistedConfig()`。
- [`sessionStore.ts:986-1008`](../../src/store/sessionStore.ts#L986) 的 `loadPersistedConfig` 沒有 snapshot guard；若 config 有 `activePreset`，還會進一步呼叫 `setProvider`，可能觸發 endpoint status fetch。
- [`configFile.ts:41-49`](../../src/core/config/configFile.ts#L41) 明確執行 `fetch("./dit.config.json")`。
- R6 PSM 的 `EX-INV-1`／`EX-INV-3` 與 [`USER_GUIDE.md`](../USER_GUIDE.md#L36) 明確宣稱快照不需要網路、快照本身不會發出 request。

**Impact**：即使 CSP 讓 request 失敗，仍與「snapshot 本身 never sends requests」的 observable contract 不一致；若旁邊存在 config，snapshot 可能讀取外部設定並改變 provider/runtime state，這更不是唯讀快照應有的行為。

**Required implementation contract**：

- Snapshot mode 在 config load boundary 直接 no-op；不要以 CSP block 當作修正。
- 若 `activePreset` 可能從 export payload 進入，必須明確禁止 provider probing／annotation side effects。
- 增加 snapshot boot test：mock `fetch`，hydrate export 後 render `App`，assert zero calls；再以 production `file://` 手動驗證 Network panel。

### F-04 — [Should-fix] `pr-link` 在 adapter 收到後於 normalize 階段遺失

**Severity**：should-fix（recognized IO metadata loss）  
**Confidence**：high；adapter test 已證明 producer 有資料，normalizer return shape 沒有轉送。  
**Plain-language intent test**：一份含 Claude `type: "pr-link"` record 的 transcript，載入後再匯出 JSON，`document.session.prLinks` 應與輸入保留相同的 PR number、URL、repository。

**Evidence**：

- Adapter 在 [`claudeCodeJsonl.ts:174`](../../src/core/adapters/claudeCodeJsonl.ts#L174) 寫入 `meta.prLinks`，且 [`claudeCodeJsonl.test.ts:166-172`](../../src/core/adapters/claudeCodeJsonl.test.ts#L166) 已測 producer。
- [`SessionMeta`](../../src/types/spanTree.ts#L107) 已宣告 `prLinks?: SessionPrLink[]`。
- [`normalizer.ts:81-94`](../../src/core/normalize/normalizer.ts#L81) 的 `finalizeMeta` 建立新物件時沒有帶 `prLinks`。

**Impact**：資料流表面上支援該 IO 格式，實際上資料在 canonical `SessionDocument` 邊界消失；目前 export 與未來 UI／cross-session consumer 都無法取回。

**Required implementation contract**：

- `finalizeMeta` 保留 `prLinks`，並針對 empty／undefined 做明確 semantics。
- 增加 adapter → normalize → export-level assertion，而不是只測 adapter。
- 若產品刻意不 export PR links，必須從 `SessionMeta` 移除欄位或記錄 ADR；不能維持「已收集」的假象。

### F-05 — [Should-fix] Fatal／index diagnostic 仍把 raw exception detail 直接顯示給使用者

**Severity**：should-fix（diagnostic contract／UX stability）  
**Confidence**：high；資料來源與 copy interpolation 均可直接追蹤。  
**Plain-language intent test**：磁碟權限、DOMException 或 worker exception 改變時，使用者仍應看到穩定、可翻譯、可行動的說明；原始 path、stack 或瀏覽器例外文字只可進 developer log，不可成為 UI 文案。

**Evidence**：

- [`diagnostics/contracts.ts:6-9`](../../src/core/diagnostics/contracts.ts#L6) 宣稱 unmapped code 不會退回 raw exception message；[`ParseNoticeDialog.tsx:5-7`](../../src/components/ParseNoticeDialog.tsx#L5) 也宣稱永遠不顯示 raw exception。
- [`sessionStore.ts:397-420`](../../src/store/sessionStore.ts#L397) 把 `error.message`／`String(error)` 存進 `detail`。
- [`i18n/diagnosticCopy.ts:75-95`](../../src/i18n/diagnosticCopy.ts#L75) 對 `LOAD_FAILED`、`INDEX_DIRECTORY_UNREADABLE`、`INDEX_FILE_UNREADABLE` 直接插入 `d.detail`。

**Impact**：UI 可能顯示本機檔案路徑、瀏覽器內部錯誤或不適合終端使用者的技術字串；同一 failure 也會因 browser/OS 不同而變成不同語句，讓 UAT 與 support 不可重現。

**Required implementation contract**：

- 將 user-facing detail 改為 stable reason／safe basename／count；raw exception 僅 `console.error` 或 developer diagnostics。
- 定義哪些 diagnostic code 可以攜帶 safe interpolation，禁止 `Error.message` 無條件進 UI。
- 測試以 path-bearing exception assertion「不包含 path／stack／raw message」驗證 zh-TW 與 EN。

### F-06 — [Should-fix] `showModal()` 的 catch 會把真實瀏覽器錯誤靜默降級成非模態 dialog

**Severity**：should-fix（DSM-3 invariant）  
**Confidence**：high；catch 沒有 environment guard；jsdom test 只覆蓋成功 spy path。  
**Plain-language intent test**：若 production browser 的 `showModal()` 因 DOM 狀態或平台限制失敗，系統必須可見地回報並停止錯誤流程，不能假裝 modal 成功而讓背景可操作。

**Evidence**：

- [`useBlockingSurface.ts:41-53`](../../src/components/useBlockingSurface.ts#L41) 對任何 exception 都 `setAttribute("open", "")` 並設定 `modalFallback`。
- 註解說 fallback 只給 jsdom，但程式碼並沒有 `import.meta.env.MODE === "test"` 或 equivalent guard。
- DSM-3 要求 `showModal()`、top layer、backdrop 與 background blocking 是 invariant；用普通 `open` attribute 不等價。

**Impact**：fatal、privacy 或 welcome surface 可能看起來開了，但 background controls 仍可 focus/click；這正是 R9 修復過的 class of defect 重新回來。

**Required implementation contract**：

- 測試環境 fallback 必須與 production behavior 分離；production failure 要有 typed visible failure 或安全停止。
- 加一條 component test：強制 `showModal` throw 時，production branch 不得只留下 `open` attribute；另加 manual top-layer check。

### F-07 — [Should-fix] Settings 的 focus restore 會在其他 blocking surface 活躍時搶走 focus

**Severity**：should-fix（FSM／UX accessibility）  
**Confidence**：medium-high；effect 的觸發條件可直接證明，實際 callback ordering 需 browser/manual confirmation。  
**Plain-language intent test**：當 Settings 被 Map、Structure Drawer、Welcome 或 Fatal surface 取代時，focus 必須留在 active surface；背景的 settings toggle 不得成為目前 focus。

**Evidence**：

- [`SettingsDialog.tsx:57-61`](../../src/components/SettingsDialog.tsx#L57) 只要 `surface.isActive` 為 false，就無條件排程 `settings-toggle-btn.focus()`。
- `surface.isActive === false` 同時代表「Settings 剛關閉」與「Settings 被更高優先 surface 壓住／另一個 surface 正在開」，兩者沒有區分。
- [`blockingSurface.ts:45-52`](../../src/core/surface/blockingSurface.ts#L45) 的 priority arbitration 允許 queued surface，因此這不是理論上的 impossible state。

**Impact**：鍵盤使用者可能被移到背景按鈕；screen reader 的 reading context 與真正 active dialog 脫節，也可能讓 modal 的 focus trap 體驗不穩定。

**Required implementation contract**：

- focus restore 只在 Settings 曾經 active 且真正 close，並且 arbitration 已沒有更高優先 active surface 時執行。
- 將 focus ownership 放在 surface transition 或共用 focus coordinator，不讓每個 dialog 猜測「false」的原因。
- 補測 Settings → Map、Settings → Welcome、Fatal preempts Settings 三條 transition。

### F-08 — [Should-fix] Thinking／IO／Group collapse controls 是 clickable `div`，沒有 keyboard／ARIA semantics

**Severity**：should-fix（UX／accessibility）  
**Confidence**：high；DOM implementation 直接可見。  
**Plain-language intent test**：使用 Tab 聚焦後，Space／Enter 應可展開／收合每個 thinking、IO、edit-loop／subagent group，且 assistive technology 能讀到目前狀態與控制範圍。

**Evidence**：

- [`parts.tsx:21-31`](../../src/components/parts.tsx#L21) 的 `ThinkingBlock` 使用 `<div onClick>`。
- [`parts.tsx:109-142`](../../src/components/parts.tsx#L109) 的 `IOBlock` 使用 `<div onClick>`。
- [`GroupCard.tsx:45-65`](../../src/components/GroupCard.tsx#L45) 的 group header 同樣是 clickable `<div>`，沒有 `role=button`、`tabIndex`、`aria-expanded` 或 `aria-controls`。
- CSS 只有 cursor／visual cue：[`styles/index.css:904-941`](../../src/styles/index.css#L904)。

**Impact**：滑鼠 UAT 會判定「能收合」，但鍵盤、screen reader、automated accessibility audit 會判定控制不存在；這是 UX promise 與 code implementation 的直接落差。

**Required implementation contract**：

- 使用 semantic `<button>` 或共用 Disclosure primitive。
- 以穩定 id 連接 header 與 body，提供 `aria-expanded`、`aria-controls`、`hidden`／等價語意。
- 加 jsdom keyboard interaction test；再用 keyboard-only manual checklist 驗證 visual style 沒有退回成瀏覽器預設按鈕。

### F-09 — [Should-fix] Span Tree version、marker、milestone 三份契約互相矛盾

**Severity**：should-fix（data contract／mapping semantics）  
**Confidence**：high；直接對讀 PSM、work card、types、distiller、locale。  
**Plain-language intent test**：任何人從輸入到 export 再到 map，都應能回答「目前 schema version 是什麼、哪些 skeleton node 會產生、marker／milestone 是否佔 station」，且答案不能依賴讀者猜哪份文件較新。

**Evidence**：

- PSM 宣稱 `Span Tree schema v0.2`，且 breaking change 必須升 `SCHEMA_VERSION`／記 ADR：[`PSM_DIT_v1.0.md:36-50`](../PSM_DIT_v1.0.md#L36)。
- 實碼仍是 [`spanTree.ts:11`](../../src/types/spanTree.ts#L11) 的 `SCHEMA_VERSION = "0.1"`；marker type 已加入 [`spanTree.ts:16-30`](../../src/types/spanTree.ts#L16)。
- R9.1 M3 明確裁定「keep the union member and emit it」，要求 mid-conversation milestone test：[`PSM_R9.1_WORKCARDS_v1.0.md:80-96`](../rounds/r9.1-uat-remediation/PSM_R9.1_WORKCARDS_v1.0.md#L80)。
- 實碼 union 只有 objective／decision／outcome：[`spanTree.ts:134-140`](../../src/types/spanTree.ts#L134)；denoiser 仍對 user message 加 `milestone` tag：[`denoiser.ts:36-45`](../../src/core/denoise/denoiser.ts#L36)；distiller 不產生 milestone station：[`distiller.ts:39-65`](../../src/core/distill/distiller.ts#L39)。
- zh/en locale 仍把 milestone 作為 card tag：[`locales.ts:485-490`](../../src/i18n/locales.ts#L485)，因此使用者會看到一個 tag，但 map／skeleton 沒有對應 station semantics。

**Impact**：現有 JSON export／cache／snapshot 的 version label 不能可靠地告訴 consumer 其實際 shape；Map 的 station count、章節邊界與 legend 會跟 PSM work card 不同。

**Required decision and implementation contract**：

- Owner must choose one explicit direction before coding: (A) implement milestone station per R9.1 M3 and bump/version/ADR as needed, or (B) formally amend PSM／UAT／locale／design notes to remove it.
- Add a contract test that asserts `SCHEMA_VERSION`, skeleton union, marker behavior, and snapshot payload version are aligned.
- No work card may mark this item complete while docs and runtime still state different rules.

### F-10 — [Should-fix] Session Map 顯示分類名稱，卻沒有真正 consume category definition source

**Severity**：should-fix（UX／single-source contract）  
**Confidence**：high；`categoryDefinition` 的使用點與 Map render path 可直接 grep 對照。  
**Plain-language intent test**：使用者在 Overview 或 Session Map 看到「決策／取證／錯誤」時，都能在同一個使用情境取得「是什麼、DIT 怎麼判、例子」；切換頁面不應失去判讀依據。

**Evidence**：

- `categoryDefinitions.ts` 宣稱 legend、Session Map 說明、user guide 都讀同一份：[`categoryDefinitions.ts:8-12`](../../src/core/view/categoryDefinitions.ts#L8)。
- `OverviewView` 實際讀取 `t.categoryDefinition[kind]` 並渲染三段式 definition：[`OverviewView.tsx:115-135`](../../src/components/OverviewView.tsx#L115)。
- `SessionMapDialog` 的 `mapLegendItems` 只讀 symbol 與 short label：[`SessionMapDialog.tsx:181-228`](../../src/components/SessionMapDialog.tsx#L181)；全 repo 只有 `OverviewView` consume `categoryDefinition`。

**Impact**：RC-G 的「使用者無從知道 decision 判準」只在 Overview 被部分修正；使用者真正以 Map 做跳轉時仍只看到名詞，且文件中的「唯一來源」註解不符合 runtime。

**Required implementation contract**：

- Map header／legend 必須提供可開啟的 definitions disclosure，或清楚 link/return path 到同一份 rendered definition。
- Do not duplicate text in `SessionMapDialog`; consume the typed category table／i18n table。
- Add component test asserting every `CATEGORY_ORDER` entry is available from the Map explanation surface。

### F-11 — [Should-fix] Fishbone／map target 仍有未回報的 silent first-target fallback

**Severity**：should-fix（wrong-target risk；可降為 consider 但不能保持 silent）  
**Confidence**：high for code-level invariant；runtime trigger frequency needs fixture coverage。  
**Plain-language intent test**：若 rib、cluster source 或 attach target 不存在，使用者要看到「無法定位」或沒有該 target；絕不能被偷偷指到第一站或第一個 source。

**Evidence**：

- [`fishbone.ts:69-78`](../../src/core/view/fishbone.ts#L69) 在找不到 order 之前最近 station 時使用 `?? stations[0]`，沒有 `reportFallback`。
- [`distiller.ts:68-70`](../../src/core/distill/distiller.ts#L68) 的 `attachFor` 使用 `nodes[0]?.spanId` 與空字串 fallback，沒有把「沒有 anchor」作為 typed condition。
- [`SessionMapDialog.tsx:41-58`](../../src/components/SessionMapDialog.tsx#L41) 在所有 cluster source 都不在 view model 時，雖逐一 report missing id，最後仍回到 `target.sourceViewItemIds[0] ?? currentId`。
- 這些 substitution 可能改變 map jump target，符合 project invariant 中必須回報 silent fallback 的風險類型。

**Impact**：某些 malformed／partial document 會呈現「有結果」但跳到錯的卡片，這比空結果更難察覺；也是本專案過去 wrong-target bug 的相同失效模式。

**Required implementation contract**：

- 用 explicit `null`／unresolved result 表達失配；只有在產品規則明確定義「最近站」時才 fallback。
- 每個不可觀察 substitution 都呼叫 `reportFallback`，named degradation 則走 Diagnostic。
- Add fixtures for rib-before-first-station、missing cluster sources、empty skeleton and assert no wrong jump。

### F-12 — [Consider] Streaming source detection 一次失敗就丟棄後續可辨識行

**Severity**：consider（input resilience；若產品承諾任意 bad line skip，則升 should-fix）  
**Confidence**：high；程式碼與 PSM line-tolerance wording 直接矛盾。  
**Plain-language intent test**：第一個非空 JSONL line 損壞，但後面 line 帶有明確 Claude/Codex signature 時，系統至少應能辨識來源、保留後續 valid events，並對第一行留下 diagnostic。

**Evidence**：

- [`jsonlStream.ts:51-69`](../../src/core/ingest/jsonlStream.ts#L51) 設 `detectionFailed = true` 後不再 retry；後續 line 直接 return。
- PSM §2.3 要求單行損壞不使整體失敗：[`PSM_DIT_v1.0.md:71-75`](../PSM_DIT_v1.0.md#L71)。
- 現有 tests 只釘住「first detection fails → unrecognized」的當前行為，沒有「later valid signature」的 compatibility decision。

**Required decision**：若 source detection 的產品規則確實只允許第一筆 signature，請把它寫成明確 input contract；否則改為在有限窗口搜尋可辨識 record，並將前導壞行納入 diagnostics。兩者都要有 regression test，不能靠目前的 silent discard。

### F-13 — [Consider] Index scan dedup key 不是 uuid，而是前 200 個字元

**Severity**：consider（index accuracy／large-file edge case）  
**Confidence**：high；comment 與 implementation 不一致。  
**Plain-language intent test**：兩筆 JSON record 即使前 200 個字元相同，只要 uuid／完整內容不同，也不能被 index scan 當作同一筆；counts、title、compaction flag 至少不可因此下降。

**Evidence**：

- [`sessionIndexer.ts:151-164`](../../src/core/index/sessionIndexer.ts#L151) 的 comment 說「用 uuid 去重」，但實作只取 `trimmed.slice(0, 200)`。
- 相同長 prompt、相同 prefix 的兩筆 record 可能碰撞；影響 `recordCount`、human prompt count、first/last signal 與 classification。

**Required implementation contract**：

- 優先 parse JSON、取 stable uuid；沒有 uuid 時使用完整行 hash／bounded collision-safe key，而不是 arbitrary prefix。
- Add collision fixture with two distinct records sharing the first 200 characters。

### F-14 — [Consider] `SessionIndexEntry.source` 對 unknown／insufficient-signal entry 仍硬填 `claude-code`

**Severity**：consider（IO contract honesty）  
**Confidence**：high；entry construction 直接固定字串。  
**Plain-language intent test**：清單中顯示 `unknown` 的項目，不應在 data contract 另一欄又假裝是已確認的 Claude Code source。

**Evidence**：

- [`sessionIndexer.ts:295-317`](../../src/core/index/sessionIndexer.ts#L295) 允許 `headScanUsable === false` 的 unknown entry 留下。
- [`sessionIndexer.ts:319-339`](../../src/core/index/sessionIndexer.ts#L319) 卻無條件設定 `source: "claude-code"`。
- `SessionIndexEntry.source` 型別是 `SourceId`：[`index/contracts.ts:33-45`](../../src/core/index/contracts.ts#L33)，而 comment 同時要求「不猜」。

**Required implementation contract**：

- Use an explicit `unknown` source type at the index boundary, or exclude the field until source is confirmed；do not overclaim.
- Align `SourceId`, `SessionIndexEntry`, browser copy and load behavior with one ADR/tested rule.

### F-15 — [Consider] 審查／視覺 gate 不足，且 acceptance documents 已出現狀態漂移

**Severity**：consider（process／maintainability；會放大上述 defects 的回歸機率）  
**Confidence**：high；由 manifest、git history、文件互相對讀。  
**Plain-language intent test**：下一輪 reviewer 能快速知道哪些項目由 automated gate 證明、哪些只能靠 browser/manual UAT；文件中的 `[X]` 不應同時寫著「有問題」或「無法測試」。

**Evidence**：

- `package.json` 只有 `dev/build/typecheck/test/preview/fixture/benchmark`，沒有 lint、a11y、browser e2e 或可再現 visual benchmark runner。
- `npm test` 有 Vite deprecation warnings；目前沒有 gate 使 warning 變成可追蹤 work item。
- R9.1 UAT 明確寫 373 tests／build green，但 A1～A3、B1～B5 仍需真人驗收，B5 Firefox/Safari 是無法驗：[`UAT_R9.1_v1.0.md:1-7`](../rounds/r9.1-uat-remediation/UAT_R9.1_v1.0.md#L1)、[`UAT_R9.1_v1.0.md:149-183`](../rounds/r9.1-uat-remediation/UAT_R9.1_v1.0.md#L149)。
- 舊 `ACCEPTANCE.md` R6 export 區塊同時有 `[X]`、`[有問題]`、`[無法測試]` 與後續修正註解：[`ACCEPTANCE.md:138-159`](../ACCEPTANCE.md#L138)。

**Required implementation contract**：建立 machine-readable gate matrix：每張 work card 有 automated evidence、manual evidence、unverified boundary 與 re-review owner；先修文件狀態，不要把缺乏 browser evidence 包裝成 pass。

## 6. Hotspot 與變更趨勢

以下以 `git log --all --since="2026-06-01"` 的檔案出現次數、目前 LOC、測試／visual evidence 與本次 finding 交叉判定。數字是 risk signal，不是單獨 verdict。

| Hotspot | LOC | 近期期望變更訊號 | 品質訊號 | 判定 |
|---|---:|---:|---|---|
| `src/store/sessionStore.ts` | 1,352 | 24 commits；同時承擔 load、index、cache、replay、privacy、surface actions | 有 418 行 adjacent unit tests 加 transition tests，但 browser boundary／focus ownership 分散 | **Very high**：高耦合 async state machine；F-01、F-03、F-07 直接落在此 seam。 |
| `src/styles/index.css` | 1,127 | 38 commits；R6.5、R7、R9.1 反覆修 layout／container | 沒有等價的 real-browser visual gate | **Very high**：CSS contract 變動成本與 manual-only risk 高。 |
| `src/i18n/locales.ts` | 1,123 | 30 commits；同時承擔 copy、legend、category definitions | locale type tests 有；runtime surface 是否真的 consume definition 不由 type 保證 | **High**：F-09、F-10。 |
| `src/core/view/sessionMap.ts` | 546 | 8 commits；多次 semantic zoom／minimap／focus 修正 | 384 行 map tests；仍缺 malformed-target／visual／keyboard evidence | **High**：projection 正在迭代，F-09～F-11。 |
| `src/components/SessionMapDialog.tsx` | 337 | 10 commits；map UX 與 virtualization 連續調整 | jsdom open/close 測試，沒有真實 SVG／scroll／responsive UAT | **High**：F-10、F-11。 |
| `src/core/normalize/normalizer.ts` | 182 | 7 commits；是 adapter 到 canonical schema 的窄但關鍵邊界 | 有 normalizer tests，但 `prLinks` data preservation 沒有 assertion | **High**：小檔案、高資料損失半徑；F-04、F-09。 |
| `src/core/index/sessionIndexer.ts` | 355 | 最近持續加入 real-data heuristics：head window、分類、title degradation | 有多個 regression tests；仍漏 stale detection／uuid collision | **High**：F-02、F-13、F-14。 |
| `src/components/parts.tsx`／`GroupCard.tsx` | 198／89 | R7～R9 反覆加摘要、group、subagent UX | 摘要純函式有測試；interactive semantics 沒測 | **High**：F-08。 |

### Trend interpretation

變更歷史顯示 project 已經能快速修正「使用者報告的單點症狀」，但現在的風險從單點 bug 轉成 cross-layer contract drift：同一個 concept（milestone、category definition、snapshot mode、failure state）在 types、store、React、docs、UAT 之間各有一份部分真相。下一輪應優先做 contract tests／state transition tests／manual evidence matrix，而不是再擴大功能面。

### Code-smell taxonomy signals

這些是結構性訊號，不等於每一項都要立即重構；它們用來決定施工順序與再次審查要看的地方。

| Smell／signal | Evidence | Risk |
|---|---|---|
| Long method／God object | `sessionStore.ts` 1,352 LOC，同時管理 IO、cache、privacy、LLM、replay、surface state | 一個 async change 可能改變多台 state machine；增加 F-01/F-03/F-07 的 regression radius。 |
| Temporal coupling／module mutable state | `replayTimer`、`activeDirectorySource`、`cachedDirectoryHandle`、privacy reviewer 在 module scope | state snapshot 不足以重建 runtime；測試與真實 lifecycle 可能看到不同答案。 |
| Duplication／parallel truth | `isSubagentPath` 在 index 與 pipeline 各有實作；Map legend／Overview definition 也各有 render path | 一邊修好，另一邊仍會產生不同 classification／copy；F-09/F-10 是已發生的例子。 |
| Primitive obsession／stringly typed diagnostics | raw `Error.message` 透過 `detail` 流到 UI；source unknown 沒有第一級型別 | 跨 OS、跨 browser 的 UX 不穩，且容易把 internal path 當 user copy。 |
| Hidden fallback／wrong-target smell | `?? stations[0]`、`?? sourceViewItemIds[0]`、first-target attach | 產生「看似有結果」但定位錯的 output；F-11。 |
| Dead branch／contract drift | R9.1 要求 milestone station，現行 `SkeletonNodeKind`／distiller 不產生 | 註解、型別與 UI 都可能看似合理，卻不是同一套產品語意；F-09。 |
| Test false confidence | 373 Node/jsdom tests 對 data path 有信心，但沒有 real top-layer、Network、responsive、Firefox/Safari evidence | 綠測試可能掩蓋 visual／interaction failure；F-06～F-08、F-15。 |
| Shotgun surgery／high churn | CSS 38 commits、locale 30 commits、store 24 commits | 每輪修症狀都擴大 cross-file review 成本；需要 contract-level gate 而不是只看 diff。 |

### Ownership／debuggability／exit strategy

每張 work card 都必須有 owner area、可重現 input、stable diagnostic、automated evidence 與 manual exit evidence。特別是 `F-01`、`F-02`、`F-03`：不能用「瀏覽器沒重現」作為 close reason，必須明確標成 unverified 並留下下一個可執行的驗證步驟。若某一修正需要在 `sessionStore.ts` 再加一個例外旗標、在第三個 component 再抄一份 focus rule，應停止並回到 boundary extraction／single-owner contract，而不是繼續疊加 special case。

## 7. 施工 work cards（可直接拆工）

以下卡片的 **Body、Acceptance、Re-review evidence 使用 English**，以符合本專案 work-card body convention。

### WC-01 — Make the WebKit directory fallback reachable and close its failure boundary

- Priority: P0; addresses F-01.
- Owner area: `src/store/sessionStore.ts`, `src/components/SessionBrowserDialog.tsx`, browser transition tests.
- Body (English): Make the folder-first action reach the fallback file input or browser surface when File System Access API is unavailable. Then catch every rejection from `indexFileList` at the store boundary. Transition the browser to `index_failed`, clear progress, preserve the previous valid index, and expose a typed diagnostic with a retry action. Treat an empty filtered fallback selection as an explicit empty-directory outcome instead of a no-op.
- Acceptance (English):
  - A rejected `DirectorySource.list()` leaves `browseState === "index_failed"` and never leaves `indexing` pending.
  - A zero-JSONL fallback selection produces visible `INDEX_EMPTY` or an equivalent named diagnostic and a retryable surface.
  - The primary folder action opens the fallback selection surface in a browser without File System Access API support.
  - An existing indexed list remains available after a new indexing failure.
  - Tests cover unsupported-FSA entry reachability, rejected promises, and the `void` UI call site.
- Re-review evidence (English): test output, state snapshot for each failure path, and one real fallback-browser/manual result.

### WC-02 — Recompute adapter identity after head-window expansion

- Priority: P0; addresses F-02.
- Owner area: `src/core/index/sessionIndexer.ts` and index fixtures.
- Body (English): Make adapter detection depend on the final usable head window. When an oversized first record forces a second read, rerun detection against the complete record before classifying or filtering the entry.
- Acceptance (English):
  - A valid Claude first record between 128 KiB and 1 MiB is listed.
  - Its title and dialogue classification are correct.
  - A first record larger than the maximum window remains `unknown/insufficient-signal` rather than being guessed.
  - The regression fixture is content-shaped like a real JSONL record, not only filler text.
- Re-review evidence (English): focused index test, full `npm.cmd test`, and a captured browser list entry for the oversized fixture.

### WC-03 — Make snapshot boot side-effect free

- Priority: P0; addresses F-03.
- Owner area: `src/App.tsx`, `src/store/sessionStore.ts`, `src/core/config/configFile.ts`, snapshot tests.
- Body (English): Gate persisted-config loading and provider status probing when `snapshotMode` is true. Snapshot boot must hydrate the exported document only and must not fetch configuration, restore annotation storage, probe providers, create workers, or expose loading controls.
- Acceptance (English):
  - A snapshot-mode App render makes zero `fetch` calls.
  - Production `dist/snapshot.html` remains self-contained and works from `file://`.
  - Overview, Reader, Map, language switching, and snapshot-safe Settings controls still work.
  - No load/provider/export controls appear in snapshot mode.
- Re-review evidence (English): mock-fetch test, `dist` artifact inspection, and browser Network-panel capture with all requests listed as zero.

### WC-04 — Preserve recognized session metadata through normalization

- Priority: P0/P1; addresses F-04 and part of F-09.
- Owner area: `src/core/normalize/normalizer.ts`, adapter-to-pipeline tests, export contract tests.
- Body (English): Preserve `ParseResult.meta.prLinks` and any other canonical metadata fields through `finalizeMeta`. Add a pipeline-level preservation assertion so an adapter test cannot pass while the canonical document silently loses the field.
- Acceptance (English):
  - Claude `pr-link` records survive adapter, normalize, distill, and export.
  - Undefined and empty `prLinks` have documented semantics.
  - The canonical `SessionMeta` and `SCHEMA_VERSION` contract are covered by one end-to-end test.
- Re-review evidence (English): serialized document diff before/after normalization and passing focused/full test output.

### WC-05 — Sanitize diagnostic detail at the UI boundary

- Priority: P1; addresses F-05.
- Owner area: `src/store/sessionStore.ts`, `src/i18n/diagnosticCopy.ts`, diagnostic tests.
- Body (English): Separate stable user-facing diagnostic interpolation from raw exception telemetry. Keep raw exception data in developer logging only; expose safe reason codes, counts, and sanitized basenames in UI copy.
- Acceptance (English):
  - `LOAD_FAILED`, `INDEX_DIRECTORY_UNREADABLE`, and `INDEX_FILE_UNREADABLE` never render raw exception messages.
  - Both locales use stable actionable copy.
  - Tests reject path, stack, and arbitrary exception text in visible output.
- Re-review evidence (English): zh-TW/EN rendered strings from path-bearing exceptions plus test output.

### WC-06 — Restore real modal and focus invariants

- Priority: P1; addresses F-06 and F-07.
- Owner area: `src/components/useBlockingSurface.ts`, `SettingsDialog.tsx`, surface transition tests.
- Body (English): Restrict the jsdom-only dialog fallback to the test environment or replace it with an explicit production failure path. Make focus restoration transition-aware: restore focus to the Settings trigger only when Settings actually closed and no higher-priority surface is active.
- Acceptance (English):
  - A production `showModal()` failure cannot silently become a non-modal open dialog.
  - Fatal, privacy, welcome, map, and drawer surfaces retain focus within the active surface.
  - Settings-to-Map, Settings-to-Welcome, and fatal-preempts-Settings transitions have regression tests.
  - Escape/backdrop policy remains unchanged.
- Re-review evidence (English): component test snapshots, focus assertions, and manual top-layer/backdrop keyboard run.

### WC-07 — Convert collapsible content to semantic disclosures

- Priority: P1; addresses F-08.
- Owner area: `src/components/parts.tsx`, `GroupCard.tsx`, styles, accessibility tests.
- Body (English): Replace clickable `div` headers with semantic disclosure controls. Preserve the existing visual language while adding keyboard activation, stable controlled-region IDs, `aria-expanded`, and hidden-content semantics.
- Acceptance (English):
  - Thinking, IO, edit-loop, and subagent group sections are operable by Tab + Enter/Space.
  - Screen readers receive the expanded/collapsed state and relationship to content.
  - Existing collapsed summaries and dynamic height measurement remain correct.
- Re-review evidence (English): jsdom keyboard test, accessibility tree inspection, and manual keyboard-only checklist.

### WC-08 — Resolve the skeleton contract before changing map behavior

- Priority: P1; addresses F-09.
- Owner area: `src/types/spanTree.ts`, `denoise.ts`, `distill.ts`, `sessionMap.ts`, locales, PSM/UAT/ADR.
- Body (English): Choose and document one milestone contract. Either implement the R9.1 ruling that promotes mid-conversation milestone-tagged user messages into milestone stations, or formally amend the PSM/UAT/design documents to remove that ruling. In the same change, reconcile the schema version and record an ADR for any breaking semantic change.
- Acceptance (English):
  - `SCHEMA_VERSION`, type unions, distiller output, map boundaries, labels, snapshots, and PSM text agree.
  - A contract test covers marker-as-non-outcome and the chosen milestone behavior.
  - No stale milestone promise remains in a user-facing legend or work card.
- Re-review evidence (English): ADR link, updated contract matrix, focused tests, and re-approved pipeline snapshot if output changes.

### WC-09 — Make Session Map explanations consume the definition source

- Priority: P1; addresses F-10 and part of F-09.
- Owner area: `src/components/SessionMapDialog.tsx`, `categoryDefinitions.ts`, locales, map tests.
- Body (English): Add an accessible Map explanation surface that consumes `CATEGORY_ORDER` and the localized three-part category definition table. Do not copy the definition strings into the Map component.
- Acceptance (English):
  - Every category in `CATEGORY_ORDER` has a visible or keyboard-reachable definition from Session Map.
  - The Map legend and Overview legend use the same symbols, labels, and definitions.
  - Adding a category causes a type/test failure until both surfaces handle it.
- Re-review evidence (English): component render assertion for all category keys and a manual Map legend walkthrough in both locales.

### WC-10 — Eliminate wrong-target silent fallbacks and index collisions

- Priority: P1/P2; addresses F-11, F-13, and F-14.
- Owner area: `fishbone.ts`, `distiller.ts`, `SessionMapDialog.tsx`, `sessionIndexer.ts`, index/map fixtures.
- Body (English): Replace silent first-target substitutions with explicit unresolved results or typed diagnostics. Use UUID-based or collision-safe deduplication for index scans, and make unknown source identity honest at the index contract boundary.
- Acceptance (English):
  - Missing station/cluster/source never jumps to the first view item without a diagnostic.
  - Two records with the same 200-character prefix remain distinct when their UUID/content differs.
  - Unknown/insufficient-signal entries do not claim a confirmed Claude source.
  - Existing valid map jump and title degradation behavior remains unchanged.
- Re-review evidence (English): malformed-target fixtures, collision fixture, contract/type decision, and full tests.

### WC-11 — Decide the source-detection tolerance contract

- Priority: P2; addresses F-12.
- Owner area: `src/core/ingest/jsonlStream.ts`, adapter contract docs/tests.
- Body (English): Decide whether adapter detection may search a bounded number of later valid lines. If yes, implement bounded retry and preserve diagnostics for skipped leading lines. If no, explicitly document first-record signature as a required input contract and add a negative test that makes the limitation visible.
- Acceptance (English): The chosen behavior is documented in the PSM, reflected in tests, and visible in the diagnostic path; neither implementation nor docs silently imply the stronger guarantee.
- Re-review evidence (English): one positive and one negative fixture, plus updated contract traceability.

### WC-12 — Reconcile UAT status and add a repeatable evidence matrix

- Priority: P2; addresses F-15 and all manual/visual boundaries.
- Owner area: `docs/ACCEPTANCE.md`, `docs/PROGRESS.md`, `docs/rounds/r9.1-uat-remediation/`, package scripts/CI documentation.
- Body (English): Replace contradictory acceptance markers with a single status vocabulary: passed, failed, unverified, or not executable in the current environment. Link every work card to automated evidence and manual evidence, and record toolchain warnings as tracked maintenance items.
- Acceptance (English):
  - No item is both checked and described as unresolved.
  - R9.1 A1-A3/B1-B5 status is explicit and current.
  - Visual, browser, Firefox/Safari, and benchmark limits are clearly separated from green unit/build gates.
  - The next reviewer can re-run the listed commands without reconstructing context.
- Re-review evidence (English): updated status table, command transcripts, and manual acceptance results.

## 8. 建議施工順序與 re-review gate

### Wave 0 — Contract freeze

先完成 `WC-08` 的 milestone／schema decision，並把 `F-01`、`F-02`、`F-03` 的 failure semantics 寫成測試前置條件。這一步不是要擴大 scope，而是避免修一層又被另一層的舊契約覆寫。

### Wave 1 — Release blockers

依序施工 `WC-01`、`WC-02`、`WC-03`、`WC-04`。完成條件是：focused regression tests、full test、typecheck、build、snapshot fetch test 全部有輸出；不能只貼「green」文字。

### Wave 2 — User-visible correctness

施工 `WC-05`、`WC-06`、`WC-07`、`WC-09`。這一波必須配 real-browser manual acceptance，因為 raw exception copy、top layer、focus、keyboard disclosure、Map legend 都不是目前 test environment 能完整證明的。

### Wave 3 — Resilience and records

施工 `WC-10`、`WC-11`、`WC-12`，再重新跑 hotspot／git history snapshot。若 `sessionStore.ts`、`sessionMap.ts` 或 `indexer.ts` 的 churn 仍繼續集中，下一輪應優先做 boundary extraction，而非繼續在大檔案內疊加 branch。

### Re-review entry criteria

再次審查開始前，施工方必須提供：

1. 每張 completed work card 的 commit／file list／test evidence。
2. `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run build`、`git diff --check` 的新鮮輸出。
3. F-01/F-02/F-03/F-04 的 focused regression output。
4. 針對 blocking surface、keyboard disclosure、Map legend、snapshot Network 的 manual evidence。
5. 更新後的 contract traceability 與 `ACCEPTANCE.md` 狀態，不能只更新程式碼註解。

## 9. 手動驗收清單（visual／interaction correctness 未由本輪自動測試證明）

每一步都要記錄實際瀏覽器、build/commit、操作與 expected result；不要只勾選「有點到」。

1. **首次資料夾載入**：清除 site data、重新整理、選一個真實 Claude projects 目錄。Expected：第一次就出現清單；若失敗，明確出現 `index_failed`、安全錯誤文案與 retry。
2. **後備資料夾入口**：在可用的 Firefox/Safari 或等價 fallback 環境選沒有 `.jsonl`、含 unreadable file、以及正常資料夾。Expected：空資料夾有 named empty state；單檔 failure 不吞掉其他 entry；directory failure 不會永久停在 indexing。
3. **Oversized first record**：使用第一筆 JSON record 介於 128 KiB～1 MiB 的 fixture。Expected：browser list 有該 session，title／kind 不被誤判；超過 max window 的 fixture 顯示 unknown/insufficient-signal。
4. **Per-file isolation**：混入 `.meta.json`、壞 JSONL、正常 main、sibling subagents。Expected：壞檔有聚合診斷，正常 main 仍可載入，subagent 正確配對。
5. **Subagent-only selection**：只選 `subagents/` 下檔案，並用裸 basename 多選。Expected：具名 `NO_MAIN_TRANSCRIPT`，上一份 document 保留，不能長出只有兩個端點的假 session。
6. **Marker／outcome／milestone**：載入含 compaction marker 與中間 user turn 的 session。Expected：marker 在原時序出現但不成 outcome；milestone 的結果與 PSM 最終裁決一致，Map endpoint／section boundary 不靠位置猜。
7. **Session Map definitions**：在 Overview 與 Session Map 閱讀 objective、decision、outcome、investigation、error、retry、edit-loop。Expected：兩個 surface 的 symbol、名稱、rule、example 一致且可鍵盤到達。
8. **Map projection and jump**：在 global／section／detail 切換，選主線、rib、subagent、cluster，並讓 current item 不在 projection。Expected：current marker 與 density 同一 projection；不能跳到第一項；unresolved 有明確提示。
9. **Keyboard disclosure**：只用 Tab、Enter、Space 操作 thinking、IO、edit-loop、subagent group。Expected：每一個都有 focus ring、狀態讀取正確、內容展開／收合不造成 blank gap。
10. **Blocking surface arbitration**：依序製造 fatal、welcome、privacy、settings、map、drawer 的競合。Expected：同時只有一個 top-layer surface；背景不能 click/focus；active dialog title 取得 focus；關閉後 focus 回到正確 owner。
11. **Responsive controls**：在 390、740、1280 寬度與窄 settings container 檢查 progress strip、folder/file buttons、legend、Map list。Expected：不水平溢位、不折壞按鈕 label、progress button 可讀且仍可操作。
12. **Snapshot no-network**：production build 後由 app export HTML，關閉所有 server，以 `file://` 開啟；開 Network/Console。Expected：無 request、無 worker missing error、Overview/Reader/Map 可用，snapshot-only Settings 不出現 load/provider/export controls。
13. **Large session／cancel**：使用既有 50 MiB fixture 或同等大檔，觀察 progress、cancel、previous document、Reader virtualized DOM。Expected：progress 先於 ready、cancel 保留 previous document、沒有永久 loading、沒有明顯 blank gap；數值要附實際 metrics。

## 10. Not covered／不應被本報告誤讀的範圍

- 本輪沒有直接修改任何 source；這是 findings-only review，不是 remediation completion。
- 沒有執行完整 Mode C dependency fitness、license、supply-chain 或 security-deep audit；只記錄了與本次 IO/render／toolchain 直接相關的觀察。
- 沒有真實 browser screenshot、top-layer、focus、Network、responsive 或 Firefox/Safari 證據；上述項目均需依第 9 節補驗。
- 沒有執行 LLM annotation quality、provider endpoint reliability 或 privacy detector 的完整 runtime audit。
- Markdown／LaTeX rendering 本輪依 R9 F3 是 design-only；`docs/design/DIT_TEXT_RENDERING.md` 已記錄安全立場與 reader／snapshot 兩路同步要求，本報告不把「尚未實作」誤列成 R9.1 regression，但下一輪若施工必須重跑兩條 render path 的 review。
- 沒有宣稱 Firefox/Safari 可用；目前文件自己的裁決是「有 fallback implementation，但沒有該環境驗證管道」。
- `AGENTS.md` 是工作樹中既有的 user-provided untracked artifact，本輪保留，未把它混入產品 source finding。
