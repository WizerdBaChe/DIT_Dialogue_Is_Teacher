# DIT main 主分支完整專案深度審查

日期：2026-08-03  
審查模式：code-review-deep-checklist Mode B（whole-project architecture health）＋ Mode C（dependency fitness）  
審查基準：本機 main@83723abfad9680da91a99f990a4f987885f166ac  
比較基準：本機 origin/main@2cc4a0657b9a51d14f3a6881dc8f9cdc80b50c66（本輪沒有把 remote 版本當成審查對象）  
審查性質：findings-only；本輪沒有修改 src/ 或套件設定。

## 1. 結論先行

main 的 Node／TypeScript／production build gate 都是綠的，但這只能證明目前資料路徑在自動化測試環境可編譯、可執行，不能證明完整產品契約已成立。main 目前不宜標成「完整健康」或直接宣稱所有 offline、跨瀏覽器、隱私與資料容錯承諾都已完成。

本輪重新以 main 原始碼獨立確認：

| 優先級 | 數量 | 判讀 |
|---|---:|---|
| Blocker | 3 | 核心載入／索引／snapshot 契約會直接失效或無法使用 |
| Should-fix | 13 | 會造成資料遺失、錯誤定位、隱私／可及性／狀態機問題，應在下一個可交付節點前處理 |
| Consider | 7 | 邊界正確性、可維護性與依賴治理風險；需要明確決策或後續工作卡 |
| Nit | 0 | 本輪沒有只屬於排版的問題 |

### Release recommendation

先處理 B-01～B-03，再處理 S-01～S-06；完成後才適合做真實瀏覽器 UAT。若不處理，main 雖然能 build，仍不能把「非 Chromium 可載入資料夾」、「大型／前導壞行輸入不誤丟」、「單檔 snapshot 零網路」及「外送前同意可穩定重用」視為已驗證。

這份報告和同日的 R9.1 branch 報告不是二選一：下列標示為「main baseline」的項目，是對 main 基線重新取證；它們不等於宣稱目前的 R9/R9.1 branch 仍然有同一個問題。

## 2. 審查範圍、方法與證據

### 2.1 讀取的規格與設計來源

- [RPD_DIT_v0.1.md](../RPD_DIT_v0.1.md)：功能需求、offline／large-session 目標、adapter 容錯與 Span Tree。
- [PSM_DIT_v1.0.md](../PSM_DIT_v1.0.md)：canonical schema、batch contract、skeleton、Provider 與驗收狀態。
- [architecture.md](../architecture.md)：adapter → normalize → denoise → distill → validate → viewModel → Zustand → React。
- [DIT_STATE_MACHINES.md](../design/DIT_STATE_MACHINES.md)：session load、blocking surface、browser、snapshot 與已知 debt。
- [README.md](../../README.md)、[DEV_README.md](../../DEV_README.md)、[PROGRESS.md](../PROGRESS.md)、[ACCEPTANCE.md](../ACCEPTANCE.md)：對外承諾與目前狀態。
- repository-level [AGENTS.md](../../AGENTS.md)：壞行／壞檔隔離、fallback reporting、blocking-surface 與報告檔案規則。

### 2.2 審查方法

本輪依 deep checklist 做兩次 pass：

1. Pass 1：先只讀 repository 規格、程式與測試，建立契約／邊界／hotspot 假設，不以網路資料替代本地證據。
2. Pass 2：對高風險 finding 逐一回到實作取行號；依賴部分才查官方 advisory／release policy。
3. 最後將每項判斷標為 locally verified、externally verified 或 decision／unverified。

因目前工作樹的 .git 目錄不能建立獨立 worktree，本輪用 git archive 產生 main 的唯讀 source snapshot，再以 repository 根目錄的既有 node_modules 執行 gate；沒有用目前 R9.1 checkout 的 src 代替 main。

### 2.3 main 與目前 R9.1 branch 的關係

本輪另外核對了 ancestry：

- merge-base(main, HEAD) = main@83723ab；
- main...HEAD = 0 / 8，亦即 main 是目前 feat/r9.1-uat-remediation 的祖先，branch 領先 main 8 個 commit；
- 因此 main 的舊問題被 R9／R9.1 修正是預期中的演進，不是 branch regression。

為避免把兩份審查混讀，這份文件只回答「main 當時的完整健康狀態」。對目前 branch 的有限 diff recheck 顯示：

- R9.1 已改進目錄索引 failure boundary、將 browse state 從 no_directory 改成 closed、把 filename title degradation 改走聚合 Diagnostic，並重新處理 marker／skeleton contract。
- 但 fallback input 的可達性仍不能只靠這個 diff 宣稱完成：branch 的 [SessionLoadActions.tsx](../../src/components/SessionLoadActions.tsx) 仍只呼叫 resumeLastDirectory，真正後備 input 在 SessionBrowserDialog 內。
- snapshot config fetch、stream detection、同步 batch parser isolation、privacy scope、showModal catch、Settings focus、validator、collapse accessibility 等項目沒有在這 8 個 branch commit 中被改動；它們若要判定 branch 現況，應另做 branch-targeted review，不由本報告把 main 結果直接代替。

### 2.4 本地 gate 證據

執行目錄：D:\AIWork\DIT_Dialogue_Is_Teacher\.codex-review-main  
Runtime：Node v24.14.1、npm 11.11.0、local Vite 5.4.21、Vitest 4.1.9。

| Gate | 結果 | 解讀 |
|---|---:|---|
| npm.cmd test | 46 files / 350 tests passed | 純函式、資料管線與部分 jsdom surface 通過；不涵蓋真實 top-layer、network、responsive、Firefox／Safari。 |
| npm.cmd run typecheck | exit 0 | 型別可編譯；不代表 runtime preservation、狀態競速或外部資料契約正確。 |
| npm.cmd run build | exit 0 | main bundle 與 snapshot bundle 都產出；不代表 snapshot 沒有 request，也不代表瀏覽器視覺／focus 正確。 |
| npm test 警告 | Vite React Babel／optimizeDeps 的 esbuild／oxc deprecated options | 目前不阻斷 gate，但應納入工具鏈升級工作；未在本輪修改。 |

### 2.5 規模與變更熱點

main 的 src/ 共 158 個 TypeScript／TSX／CSS 檔、17,598 行；production source 111 檔、12,135 行；tests／snapshots 47 檔、5,463 行。

| Hotspot | main LOC | main history 出現次數 | 風險訊號 |
|---|---:|---:|---|
| src/store/sessionStore.ts | 1,238 | 23 | 同時承擔 load、index、cache、replay、privacy、LLM、blocking surfaces；async state boundary 過度集中 |
| src/styles/index.css | 1,016 | 37 | 高頻 layout 修正，但沒有等價 real-browser visual gate |
| src/i18n/locales.ts | 970 | 29 | card／map／diagnostic／provider 語意集中，容易和文件、runtime 脫節 |
| src/core/view/sessionMap.ts | 502 | 7 | semantic zoom、focus、selection、fallback 都在同一個變動邊界 |
| src/core/adapters/codexJsonl.ts | 485 | 6 | 大型 adapter，輸入格式與降級路徑複雜 |
| src/core/index/sessionIndexer.ts | 315 | 2 | 檔頭／檔尾抽樣、source 判定、分類、title 同時存在 |

整體趨勢不是單一函式太長而已，而是同一概念在 types、store、React、文件與 UAT 各保留一份部分真相。main 的測試數已上升，但測試仍主要保護 data path，沒有同等強度地保護 browser boundary 與跨層 contract。

## 3. 需求／契約 traceability

| 契約 | 目前 main 證據 | 判定 |
|---|---|---|
| 壞行不應讓整份 transcript 失敗 | worker 有逐檔 try/catch；stream detection 與同步 batch path 仍有缺口 | 部分成立 |
| R9 起壞檔不應讓 batch 失敗 | worker path 有 parse_failed；buildSessionDocumentFromFiles 直接呼叫 adapter.parse，沒有同等隔離 | 部分成立 |
| snapshot 零網路 | snapshot CSP 禁止 network，但 App 仍啟動 dit.config.json fetch | 不成立 |
| 外送前顯示並記住同意 scope | reviewer scope 有 provider prefix；approvePrivacyReview 寫入的 scope 沒有 prefix | 不成立 |
| Span Tree canonical schema | PSM 寫 schema v0.2，runtime SCHEMA_VERSION 仍為 0.1；milestone union 有定義但 distiller 不產生 | 不成立 |
| 所有不可觀察 fallback 要回報 | distiller、fishbone、map selection 仍有 silent first-target fallback | 不成立 |
| index 只在有把握時宣稱 Claude source | insufficient-signal entry 可保留，但 source 欄位固定為 claude-code | 不成立 |
| documentation 是目前狀態的可信入口 | README 較新，DEV_README／PROGRESS／PSM 仍含 cloud stub、無測試、舊測試數等歷史敘述 | 不成立 |

## 4. 優先 findings

### B-01 — [Blocker] 非 Chromium 的資料夾入口不可達，且 file-list indexing rejection 沒有收斂

**分類**：main baseline；confidence high；locally verified。R9.1 已增加 directory failure boundary，但 fallback input 可達性仍需另驗。

**Intent test**：在不支援 File System Access API 的瀏覽器，使用者按「載入資料夾」後應能打開 webkitdirectory input；若 list／read 失敗，畫面應進入 index_failed 並可重試。

**Evidence**：

- [SessionLoadActions.tsx:38](../../src/components/SessionLoadActions.tsx#L38) 的資料夾按鈕只呼叫 resumeLastDirectory。
- [sessionStore.ts:741](../../src/store/sessionStore.ts#L741) 在不支援 picker 時只把 browseState 設為 no_directory，沒有開啟 input 或 browser surface。
- [SessionBrowserDialog.tsx:145](../../src/components/SessionBrowserDialog.tsx#L145) 的後備 input 只有在該 dialog 已活躍時才存在於可操作流程。
- [sessionStore.ts:737](../../src/store/sessionStore.ts#L737) 的 indexFileList 直接 await runIndex；[runIndex:382](../../src/store/sessionStore.ts#L382) 沒有內層 failure boundary。reject 後 browseState 可能停在 indexing。

**Impact**：Firefox／Safari 等環境可能沒有任何可達的資料夾選取路徑；後備 FileList 讀取錯誤也可能留下永久 indexing 狀態。這不是單純 visual UAT 缺失，而是核心入口與狀態機未閉合。

**Required direction**：讓 folder-first action 明確打開 browser surface 或後備 input；在 indexFileList 或共用 runIndex boundary 將所有非取消錯誤轉為 typed index_failed diagnostic，保留上一份有效 index 並提供 retry。

### B-02 — [Blocker] 檔頭 window 放大後沒有重新判定 adapter，合法 session 可能被索引層排除

**分類**：main baseline；confidence high；locally verified。這個 stale detection path 不在目前 8 個 branch commit 的修正範圍內。

**Intent test**：第一段 JSONL record 超過初始檔頭 window，但在放大後讀到完整 Claude signature 時，indexer 應把檔案列入清單並與實際載入結果一致。

**Evidence**：

- [sessionIndexer.ts:189](../../src/core/index/sessionIndexer.ts#L189) 在初始 headText 上做一次 detectAdapter，並把結果保存成 isClaudeCode。
- [sessionIndexer.ts:203](../../src/core/index/sessionIndexer.ts#L203) 放大 head window 後只再次 feed 統計，沒有重算 adapter／isClaudeCode。
- [sessionIndexer.ts:297](../../src/core/index/sessionIndexer.ts#L297) 依舊使用舊的 isClaudeCode 決定是否 continue。

**Impact**：大型第一行、夾帶影像或其他長 payload 的合法 transcript 可能先被判成 unknown，後續即使已取得有效 signature 仍被清單排除；使用者會誤以為檔案不存在。

**Required direction**：把「最終採用的 head window」視為 source detection 的唯一輸入，重新判定 adapter；新增 initial miss → expanded hit、expanded miss → unknown 的 regression tests。

### B-03 — [Blocker] snapshot mode 仍觸發 dit.config.json fetch，違反零網路 snapshot contract

**分類**：main baseline；confidence high；locally verified。App/configFile 未在目前 branch diff 中改動。

**Intent test**：打開匯出的單檔 snapshot 時，除載入內嵌 payload 外不應發出任何 request，也不應因 CSP 把 optional config fetch 打進 console。

**Evidence**：

- [App.tsx:31](../../src/App.tsx#L31) 每次 App mount 都呼叫 loadPersistedConfig，沒有先判斷 snapshotMode。
- [configFile.ts:37](../../src/core/config/configFile.ts#L37) 無條件 fetch ./dit.config.json；catch 只把結果吞掉，沒有取消 request。
- [snapshot.html:6](../../snapshot.html#L6) 的 CSP 是 default-src none，但 snapshot bundle 仍包含這段 fetch call；本次 main build 產出的 dist/snapshot.html 可直接 grep 到 dit.config.json。

**Impact**：snapshot 的「零網路」是可檢查的產品契約，不應以「request 失敗後沒有 visible error」代替。CSP 也不能證明沒有嘗試 request；這會污染 console／network evidence，並讓 file://、static host 與 snapshot 的行為不一致。

**Required direction**：在 snapshot boot 後以 state guard 阻止 optional config effect，或讓 config loader 接受 snapshot context 並直接回傳 null；加 network-observation acceptance test。

### S-01 — [Should-fix] streaming source detection 一次失敗就丟棄後續可辨識行

**分類**：main baseline；confidence high；locally verified。這不是對 R9/R9.1 已修正項目的否定。

**Intent test**：第一個非空 JSONL line 損壞，但後面出現可辨識 Claude／Codex signature 時，系統應保留後續有效事件，並對前導壞行留下 diagnostic。

**Evidence**： [jsonlStream.ts:52](../../src/core/ingest/jsonlStream.ts#L52) 設定 detectionFailed；[jsonlStream.ts:55](../../src/core/ingest/jsonlStream.ts#L55) 之後直接 return；[jsonlStream.ts:67](../../src/core/ingest/jsonlStream.ts#L67) 第一次 detectAdapter 失敗即永久停止。

**Impact**：一行格式錯誤會升級成整份輸入 unrecognized，和 repository invariant「壞行跳過」衝突。

**Required direction**：先決定 source detection 的明確 contract；若允許前導壞行，應在有限窗口內重試 signature 並累積 diagnostic；若只認第一筆 signature，必須把限制寫入 PSM、測試與 UX，而不是保持 silent discard。

### S-02 — [Should-fix] 同步多檔 pipeline 沒有檔案級 parse isolation

**分類**：main baseline；confidence high；locally verified。

**Intent test**：多檔載入時，一個 adapter.parse 意外 throw，不應讓其他合法檔案消失或讓整個 batch throw。

**Evidence**：

- [pipeline.ts:34](../../src/core/pipeline.ts#L34) 已定義 parse_failed outcome。
- worker path 在 [session.worker.ts:43](../../src/core/ingest/session.worker.ts#L43) 對每個檔案做 try/catch，能產生 parse_failed。
- 但 [pipeline.ts:82](../../src/core/pipeline.ts#L82) 的 buildSessionDocumentFromFiles 直接 map；[pipeline.ts:88](../../src/core/pipeline.ts#L88) 直接呼叫 adapter.parse，沒有 catch。

**Impact**：worker 與同步呼叫端擁有不同的容錯語意；測試或非 worker consumer 會違反 R9 的 file-level isolation。

**Required direction**：把 parser invocation 收斂到一個不拋出的 per-file helper，所有 caller 都產生 ParsedFileOutcome；為 malformed adapter throw 加 batch fixture。

### S-03 — [Should-fix] privacy consent scope 寫入格式和 reviewer scope 不相容

**分類**：main baseline；confidence high；locally verified。

**Intent test**：使用者批准某個 provider／session／endpoint／policy 後，同 scope 的下一個 item 不應再次顯示同一份 privacy review；切換 provider、endpoint 或 policy 後應重新要求。

**Evidence**：

- cloud reviewer scope 在 [sessionStore.ts:1170](../../src/store/sessionStore.ts#L1170) 的呼叫鏈中包含 cloud provider prefix。
- anthropic 與 generic reviewer 也分別以 anthropic-byok 或 providerId 作 scope prefix。
- [sessionStore.ts:973](../../src/store/sessionStore.ts#L973) 的 approvePrivacyReview 卻只用 session id、cloudConfig 與 policy，沒有 provider prefix，且對 anthropic／generic 也固定讀 cloudConfig。

**Impact**：批准後的 dataOutConsent 通常永遠對不上下一次 reviewer scope；使用者會反覆被打斷，非 cloud provider 的 consent cache 也可能錯誤命中或失效。這會使 privacy gate 的可理解性與可驗證性下降。

**Required direction**：由同一個 typed scope builder 產生 reviewer 與 persisted consent scope，將 provider kind、session、endpoint、model、policy version 明確納入；新增 cloud、anthropic、generic 三組「approve once／change config reprompt」測試。

### S-04 — [Should-fix] raw exception、檔案路徑與 provider response body 直接進入使用者畫面

**分類**：main baseline；confidence high；locally verified；security/privacy boundary。這個 boundary 未在目前 branch diff 中改動。

**Intent test**：UI 應顯示可行動的穩定錯誤 copy；filesystem path、CSP／browser exception、遠端 response body、可能含 credential 的內容不應原樣展示。

**Evidence**：

- [diagnosticCopy.ts:75](../../src/i18n/diagnosticCopy.ts#L75) 將 LOAD_FAILED 的 detail 直接插入 body；[diagnosticCopy.ts:82](../../src/i18n/diagnosticCopy.ts#L82) 將 INDEX_FILE_UNREADABLE detail 直接插入清單。
- [sessionStore.ts:377](../../src/store/sessionStore.ts#L377) 與 [sessionStore.ts:399](../../src/store/sessionStore.ts#L399) 把 Error.message 放入 Diagnostic detail。
- [genericProvider.ts:142](../../src/core/llm/genericProvider.ts#L142) 與 [cloud.ts:56](../../src/core/llm/cloud.ts#L56) 會把 response body 截斷後放入 Error。

**Impact**：錯誤卡可能洩漏本機路徑、server response、proxy 訊息或 provider 回傳的敏感片段；而且跨 OS／provider 的 copy 不穩定。

**Required direction**：引入 typed error code 與 safe public detail；raw detail 僅留在受控 console／debug channel，UI 只顯示 stable copy 和可選的 diagnostic id。

### S-05 — [Should-fix] showModal catch 對真實瀏覽器錯誤也會靜默降級成非模態 dialog

**分類**：main baseline；confidence high；locally verified。這個 UI boundary 未在目前 branch diff 中改動。

**Intent test**：真實瀏覽器中的 blocking surface 必須保持 top layer、backdrop、背景 inert 與正確 Escape policy；只有測試環境缺少 showModal 時才可使用 fallback。

**Evidence**： [useBlockingSurface.ts:46](../../src/components/useBlockingSurface.ts#L46) catch 所有 showModal exception；[useBlockingSurface.ts:51](../../src/components/useBlockingSurface.ts#L51) 對所有 exception 設定 open 與 data-modal-fallback，沒有環境判定。

**Impact**：真正的 DOM／瀏覽器錯誤會被當成 jsdom 缺功能，blocking surface 失去 top layer 與 inert semantics，且沒有 visible diagnostic。

**Required direction**：測試 fallback 必須受 test-only capability guard 保護；production exception 應進入明確 error path，而不是靜默改變 blocking semantics。

### S-06 — [Should-fix] Settings focus restore 會在其他 blocking surface 活躍時搶走 focus

**分類**：main baseline；confidence high；locally verified。這個 focus ownership 問題未在目前 branch diff 中改動。

**Intent test**：當 privacy、fatal、session browser 或 map surface 取代 settings 時，focus 應歸屬 active surface；settings 關閉後才可 restore 到 settings toggle。

**Evidence**： [SettingsDialog.tsx:60](../../src/components/SettingsDialog.tsx#L60) 只依賴 settings 自身 isActive；只要變成 false 就把 focus 拉到 settings-toggle-btn，沒有檢查 active surface owner。

**Impact**：高優先 dialog 開啟時背景按鈕可能重新取得 focus，破壞鍵盤操作、screen reader 順序與 modal ownership。

**Required direction**：由 blocking-surface machine 提供 focus restoration owner／token；只有 settings 確實由使用者關閉且沒有更高優先 surface 時才 restore。

### S-07 — [Should-fix] schema version、milestone node 與文件契約不一致

**分類**：main baseline；confidence high；locally verified。R9.1 另採取 marker／移除 skeleton milestone 的方向；本段描述的是 main 的舊契約，不是說 branch 沒有做方向性修正。

**Intent test**：從輸入、export、cache 到 map，任何 consumer 都應得到同一個 schema version，且能明確回答 user message 是否產生 milestone station。

**Evidence**：

- PSM §2.1 以 schema v0.2 作為定稿；[spanTree.ts:11](../../src/types/spanTree.ts#L11) 的 runtime SCHEMA_VERSION 仍是 0.1。
- [spanTree.ts:127](../../src/types/spanTree.ts#L127) 的 SkeletonNodeKind 包含 milestone，denoiser 在 [denoiser.ts:36](../../src/core/denoise/denoiser.ts#L36) 仍對 user message 加 milestone tag。
- [distiller.ts:43](../../src/core/distill/distiller.ts#L43) 只產生 objective、decision 與最後的 outcome；沒有把中途 user_msg 轉成 skeleton milestone node。
- [sessionMap.ts:66](../../src/core/view/sessionMap.ts#L66) 與 map legend 仍宣稱／顯示 milestone kind。

**Impact**：tag、type、skeleton、map legend 與文件會給出不同答案；export／cache 的 version label 也無法可靠地描述實際 shape。

**Required direction**：先做 contract decision：實作 milestone station 並按規則更新 schema／ADR，或正式刪除該承諾。補一個跨 denoise → distill → validate → map 的 contract test，不要只修其中一層。

### S-08 — [Should-fix] adapter 收到的 pr-link 在 normalize 階段遺失

**分類**：main baseline；confidence high；locally verified。prLinks preservation 未出現在目前 branch diff 中。

**Intent test**：Claude transcript 內的 pr-link 經過 pipeline 後，SessionDocument.session.prLinks 應保留，或若明確不支援，adapter 不應宣稱已收集。

**Evidence**：

- [claudeCodeJsonl.ts:15](../../src/core/adapters/claudeCodeJsonl.ts#L15) 宣稱 pr-link 收進 meta.prLinks；[claudeCodeJsonl.ts:174](../../src/core/adapters/claudeCodeJsonl.ts#L174) 實際 push。
- [normalizer.ts:81](../../src/core/normalize/normalizer.ts#L81) 的 finalizeMeta 回傳只包含 id、source、tool、title、projectPath、startedAt、model，沒有 prLinks。

**Impact**：recognized metadata 在 pipeline 中靜默丟失；未來 export、session browser 或 project linkage 無法依賴這個欄位。

**Required direction**：讓 finalizeMeta 明確 preserve prLinks，並加 adapter → normalize → export preservation test；若暫不消費，仍應保留 canonical data。

### S-09 — [Should-fix] fishbone、distiller 與 map selection 還有 silent first-target fallback

**分類**：main baseline；confidence high；locally verified；直接命中 fallback invariant。本報告只對 main 取證，不把它直接套成 branch verdict。

**Intent test**：找不到 attach target、cluster source 或 station 時，結果應是 unresolved／diagnostic，不可悄悄跳到第一站或第一個 source。

**Evidence**：

- [distiller.ts:62](../../src/core/distill/distiller.ts#L62) 的 attachFor 使用 nodes[0] 與空字串 fallback，沒有 reportFallback。
- [fishbone.ts:71](../../src/core/view/fishbone.ts#L71) 找不到 order 之前最近站點時使用 stations[0]，沒有回報。
- [sessionMap.ts:490](../../src/core/view/sessionMap.ts#L490) selection 找不到時回退到 focus station，沒有 resolved／fallback report。
- [SessionMapDialog.tsx:42](../../src/components/SessionMapDialog.tsx#L42) 與 [SessionMapDialog.tsx:58](../../src/components/SessionMapDialog.tsx#L58) 在 cluster source 不存在時仍可能選第一個 source。

**Impact**：partial／malformed document 會顯示看似合理、實際指錯的 card；wrong-target 比空結果更難被使用者察覺。

**Required direction**：用 null／unresolved typed result 表達失配；只有產品規則明確定義的「最近站」才可 fallback，且所有不可觀察 substitution 都要 reportFallback。補 rib-before-first-station、empty skeleton、missing cluster source fixtures。

### S-10 — [Should-fix] validator 只做基本 span/group 檢查，無法攔住 malformed skeleton 與 parent cycle

**分類**：main baseline；confidence high；locally verified。

**Intent test**：任何進入 view／map 的 SessionDocument，都應在 self-check 階段攔住 skeleton 參照不存在、rib attachTo 不存在、重複 group、parent cycle 與不合法 order。

**Evidence**： [spanTreeSchema.ts:22](../../src/core/validate/spanTreeSchema.ts#L22) 只檢查 span id、order、parentId 存在與 group spanIds 存在；整個 validator 沒有檢查 doc.skeleton、group id uniqueness、group member uniqueness、parent cycle 或 span／tool／result type consistency。

**Impact**：pipeline 的 self-check 可能回報 ok，但下游 view／map 仍收到結構上不完整的資料，silent fallback 就會替 validator 掩蓋的問題作錯誤補位。

**Required direction**：按 canonical schema 分層驗證：reference integrity、acyclic parent graph、group integrity、skeleton integrity、order／kind consistency；每層以 stable issue code 供 UI 與測試使用。

### S-11 — [Should-fix] FSA walk 先完整遞迴與 materialize 所有檔案，之後才套用 500 檔上限

**分類**：main baseline；confidence high；locally verified。

**Intent test**：使用者選取超大目錄時，應有可取消／有界的 enumeration；不應先讀取每個檔案成 File object，再只掃描前 500 個 main transcript。

**Evidence**：

- [directorySource.ts:58](../../src/core/index/directorySource.ts#L58) 的 walk 無 depth、entry count、byte budget 或 abort signal。
- [directorySource.ts:65](../../src/core/index/directorySource.ts#L65) 對每個 file 都先呼叫 getFile。
- [sessionIndexer.ts:261](../../src/core/index/sessionIndexer.ts#L261) 的 maxFiles 只在 source.list() 完成後對 mains.slice(0, maxFiles) 生效。

**Impact**：整包 ~/.claude/projects 或大型 workspace 會在 UI 進入 indexing 前就產生不必要的 enumeration、File handle 與記憶體壓力；RPD 的 large-session 目標不能由目前的上限保證。

**Required direction**：把 enumeration budget／abort contract 放進 DirectorySource，或讓 source.list 產生 lazy bounded entries；progress、cancel 與超量 diagnostic 必須在來源層可觀察。

### S-12 — [Should-fix] collapse controls 使用 clickable div，沒有 keyboard／ARIA semantics

**分類**：main baseline；confidence high；locally verified。這些 component 未在目前 branch diff 中改動。

**Intent test**：使用者可用 Tab 聚焦並用 Enter／Space 展開與折疊 thinking、I/O、group；screen reader 能讀到 expanded state 與控制關係。

**Evidence**：

- [parts.tsx:27](../../src/components/parts.tsx#L27) 的 thinking-head 是 div onClick。
- [parts.tsx:137](../../src/components/parts.tsx#L137) 的 io-head 是 div onClick。
- [GroupCard.tsx:53](../../src/components/GroupCard.tsx#L53) 的 group-head 是 div onClick；這些元素沒有 button role、tabIndex、aria-expanded 或 aria-controls。

**Impact**：滑鼠使用者看似正常，但鍵盤與 assistive technology 使用者無法可靠操作；這也沒有被目前 jsdom click tests 覆蓋。

**Required direction**：改為 semantic button／details，或補齊 keyboard handler、stable id、aria-expanded、aria-controls；新增 keyboard interaction tests。

### S-13 — [Should-fix] 文件、UAT、runtime 與 lockfile 已經形成多組互相矛盾的真相

**分類**：main baseline；confidence high；locally verified。

**Evidence**：

- [DEV_README.md:130](../../DEV_README.md#L130) 仍寫 cloud 是 stub；目前 [cloud.ts](../../src/core/llm/cloud.ts) 已有實際 OpenCode transport。
- [DEV_README.md:166](../../DEV_README.md#L166) 仍寫無自動化測試；main 實際已通過 350 tests。
- [PROGRESS.md:42](../PROGRESS.md#L42) 仍引用 228 tests，且 [PROGRESS.md:503](../PROGRESS.md#L503) 把 GHSA-67mh-4wv8-2f99 描述成「esbuild moderate / vite high」。
- [PSM_DIT_v1.0.md:30](../PSM_DIT_v1.0.md#L30) 仍寫無自動化測試、cloud UI stub；[architecture.md:112](../architecture.md#L112) 則保留另一組舊測試數。
- package.json 是 0.3.1，但 [package-lock.json:3](../../package-lock.json#L3) root version 仍是 0.2.1。

**Impact**：reviewer、maintainer 與使用者無法判斷哪一份文件代表現況；版本／依賴治理也不能可靠地從 lockfile 讀出 release identity。

**Required direction**：建立一個 current-state source of truth，清理已完成 round 的歷史敘述或明確標為 historical；同步 package manifest／lockfile version；每次 release gate 同步更新測試數、Provider 狀態與 vulnerability status。

## 5. Consider findings

### C-01 — [Consider] index dedup key 與 comment 不一致，長行以前 200 字元碰撞

**分類**：main baseline；confidence high；locally verified。R9.1 的 index diff 主要處理 named degradation；本項 collision path 仍應另行驗證。

[sessionIndexer.ts:151](../../src/core/index/sessionIndexer.ts#L151) 的 comment 說使用 uuid 去重，但 [sessionIndexer.ts:156](../../src/core/index/sessionIndexer.ts#L156) 對長行只取前 200 字元。兩筆不同 JSON record 若共享長 prompt prefix，recordCount、human prompt count、title signal 或 classification 可能被低估。應 parse JSON 後優先使用 stable uuid，無 uuid 時使用 bounded collision-safe digest。

### C-02 — [Consider] unknown／insufficient-signal entry 仍硬填 source=claude-code，且 named title degradation 走 fallback channel

**分類**：main baseline；confidence high；locally verified。R9.1 已修正 title degradation 的 channel；本段保留 main 的原始狀態，source 欄位則仍是另一個 contract issue。

[sessionIndexer.ts:297](../../src/core/index/sessionIndexer.ts#L297) 允許 headScanUsable=false 的 entry 保留，但 entry construction 仍固定 source: "claude-code"。同時 [sessionIndexer.ts:237](../../src/core/index/sessionIndexer.ts#L237) 對可見的 filename title degradation 呼叫 reportFallback；project invariant 已把這類 named degradation 定義為應走 Diagnostic。應在 index contract 中加入 unknown source 或移除未確認 source，並將 filename title 以 typed diagnostic 表示。

### C-03 — denoiser 以單一 erroredTool state 表示 retry，交錯工具錯誤可能漏標

**分類**：main baseline；confidence medium；locally verified。

[denoiser.ts:50](../../src/core/denoise/denoiser.ts#L50) 只保存一個 erroredTool；若 tool A error、tool B error、tool A retry，B 會覆蓋 A 的 pending state，A 的 retry 不會被標記。若需求是「錯誤後再次呼叫同一工具」，應以 tool／parent／事件序列建立 pending retry state，並加入交錯錯誤 fixture。

### C-04 — cache match 與 endpoint status 缺少完整 generation／provenance guard

**分類**：main baseline；confidence medium；locally verified。

[sessionStore.ts:250](../../src/store/sessionStore.ts#L250) 的 refreshCurrentCacheMatches 只在結尾檢查 sessionFingerprint，沒有重新確認 provider、locale、policy、endpoint 或 model；[sessionStore.ts:876](../../src/store/sessionStore.ts#L876) 等 status refresh 也沒有 request generation guard。快速切換設定時，較慢的舊 request 可能覆寫目前狀態或 cache。

### C-05 — persisted activePreset 接受任意 string，會把不合法 provider cast 成 ProviderId

**分類**：main baseline；confidence high；locally verified。

[configFile.ts:25](../../src/core/config/configFile.ts#L25) 只確認 activePreset 是 string；[sessionStore.ts:951](../../src/store/sessionStore.ts#L951) 除了排除 local-proxy 外直接 cast 後呼叫 setProvider。損壞的 dit.config.json 可以使 providerId 不在 registry，造成 UI select、provider lookup 或 annotation path 的 undefined 行為。應以 runtime allow-list coerce，不應使用 assertion 代替驗證。

### C-06 — resetToSample 沒有明確清除 snapshotMode

**分類**：main baseline；confidence medium；locally verified。

[sessionStore.ts:989](../../src/store/sessionStore.ts#L989) 的 resetToSample 路徑沒有把 snapshotMode 設回 false；目前 snapshot UI 隱藏 reset action，因而不是每次都可觸發，但 state transition contract 不完整。若未來允許 snapshot 回到 sample，會留下「資料換了但 snapshot gate 仍在」的錯誤狀態。

### C-07 — dependency fitness：Vite／esbuild 需要治理工作，但不應把 advisory 直接等同 production vulnerability

**分類**：main baseline；locally verified inventory + externally verified official sources；applicability partly unverified。

本地 package-lock 解析結果：

- direct runtime：React 18.3.1、React DOM 18.3.1、Zustand 4.5.7、idb 8.0.3、@tanstack/react-virtual 3.14.6。
- build/test：Vite 5.4.21、Vitest 4.1.9、TypeScript 5.9.3、@vitejs/plugin-react 4.7.0。
- transitive esbuild：0.21.5。
- package.json 使用多數 caret ranges，package-lock root version 卻和 package.json 不同。
- lock metadata 共 253 package entries；license metadata 分布為 MIT 215、MPL-2.0 12、ISC 8、Apache-2.0 7、其他多種 permissive／copyleft／attribution licenses。這是 inventory，不是法律核准。

官方核對結果：

- [esbuild GHSA-67mh-4wv8-2f99 advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99) 將 esbuild <=0.24.2 列為受影響、>=0.25.0 為 patched，描述的是 esbuild serve feature 的 CORS 讀取風險，嚴重度為 Moderate；它不是「Vite high」本身。DIT 是否暴露 esbuild serve path 仍未在本輪證明。
- [Vite release policy](https://github.com/vitejs/vite/blob/main/docs/releases.md) 說明只有 current／近期維護線持續得到 fixes，舊 major 需要依 migration guide 更新；官方 repository page 在本次查詢顯示 v8.0.16 release。這使 Vite 5.4.21 成為 upgrade candidate，但不能單憑「版本舊」宣稱 production bundle 已受某個 dev-server advisory 影響。
- 本輪沒有執行 npm audit，也沒有下載 advisory database；因此不能把本地 lock inventory 當成完整 CVE／license clearance。

**Required direction**：新增可重現 dependency audit gate，先修正 manifest／lock identity，再以小批次升級 Vite、esbuild、Vitest 並重跑 test、typecheck、雙 build 與真實瀏覽器 snapshot UAT。是否現在升級、接受哪一組 license、是否允許 dev-only risk，是 owner decision，不在本輪擅自改動。

## 6. Plain-language intent tests 與驗證狀態

下表是下一輪可直接轉成 regression／UAT 的最小 evidence matrix；本輪不把尚未執行的情境標成 pass。

| Intent test | 預期 | main 本輪結果 |
|---|---|---|
| 一個壞檔＋一個合法檔的同步 batch | 合法檔仍完成，壞檔成 parse_failed | source 已證實 sync path 沒有 catch；未新增測試 |
| 前導壞行＋後續 valid signature | 後續事件保留、前導行有 diagnostic | source 已證實 detectionFailed 會丟棄後續；未新增測試 |
| 長第一行在 expanded head window 才出現 signature | index 與 load source 一致 | source 已證實不會重新判定 |
| snapshot 開啟 | network request 數為 0 | source／built HTML 已證實仍含 config fetch；未做 real browser network run |
| 同 provider 同 scope 批次 annotation | approve 一次後不重複 review | scope code 已證實格式不相容；未做 live provider run |
| malformed skeleton／missing attach target | unresolved 或 typed diagnostic，不指第一站 | source 已證實多處 silent fallback |
| keyboard 展開 thinking／I/O／group | Tab + Enter／Space 可用且 aria 正確 | source 已證實 clickable div；未做 keyboard browser UAT |
| Firefox／Safari folder-first | 可達 fallback input 並能處理 rejection | source 已證實入口不閉合；未做實機 browser UAT |

## 7. 架構健康與建議施工順序

### Wave 0 — contract freeze

先決定 schema 0.1／0.2、milestone station、unknown source、snapshot no-network 與 consent scope 的 canonical definition；將決定寫進一份 current-state source，避免只修 runtime 而留下另一份文件真相。

### Wave 1 — release boundary

處理 B-01～B-03、S-01、S-02。這一波應同時補：

- browser surface transition test；
- per-file parse failure test；
- leading-bad-line detection test；
- expanded-head source re-detection test；
- snapshot network observation test。

### Wave 2 — user-visible correctness

處理 S-03～S-06、S-09、S-12；補 privacy scope、safe diagnostic、modal／focus ownership、wrong-target fallback 與 keyboard semantics。這些不是單純 refactor，必須有可觀察 acceptance evidence。

### Wave 3 — contract、resilience、records

處理 S-07、S-08、S-10、S-11、S-13 與 C-01～C-07；再做 dependency upgrade／audit，避免把工具鏈升級和資料語意修正混成一個不可回溯的大 patch。

### Hotspot refactor boundary

不要先把 sessionStore 拆成多個檔案就宣稱風險消失。下一個可逆且高價值的切分是先抽出 typed boundaries：

1. directory/index lifecycle；
2. annotation/privacy consent；
3. cache provenance；
4. blocking-surface focus ownership。

每個 boundary 先有 state transition／contract tests，再搬移實作；否則只是把同一個 temporal coupling 分散到更多檔案。

## 8. 手動驗收清單（本輪未執行）

1. 用 production preview 開啟 main build，載入 sample、Overview、Reader、Map、Structure Drawer、Settings；預期無 fatal console error，active surface 與 focus 不互相搶奪。
2. 在 Chromium 選取含 unreadable／非 JSONL／subagents 的目錄；預期 index progress、typed diagnostic、retry 與 previous valid index 都正確。
3. 在 Firefox／Safari 測試 folder-first；預期按載入資料夾後可打開 fallback input，空選取與 read failure 都有可見結果。
4. 產生 single-file snapshot 並在 file:// 或靜態 host 開啟；預期 Network 面板沒有 dit.config.json 或其他非 payload request。
5. 使用 cloud、anthropic-byok、generic provider 各做一次 privacy review；預期 approve 後同 scope 不重問，改 provider／endpoint／policy 後重問。
6. 只用鍵盤操作 thinking、I/O、group、dialog Escape；預期 focus order、aria-expanded、top-layer 與 close policy 一致。
7. 以 malformed skeleton、rib-before-first-station、missing cluster source 與長行 collision fixture 測 Map／index；預期 unresolved／diagnostic，不跳到第一個錯誤 target。

## 9. Not covered／不可誤讀

- 本輪審查的是本機 main@83723ab，不是 origin/main，也沒有 fetch remote。
- 沒有執行真實瀏覽器 visual／interaction UAT；Firefox／Safari、File System Access API、top-layer、CSP network observation 都仍是 unverified。
- 沒有連線測試 Ollama、OpenCode、Anthropic 或 generic cloud endpoint。
- 沒有執行 npm audit、下載 advisory database、做完整 license legal review；依賴結論只到 inventory＋官方 advisory／maintenance policy。
- 沒有執行 50 MiB benchmark、real heap measurement、惡意輸入 security penetration 或 supply-chain verification。
- 本輪沒有修改 src/、package.json、package-lock.json 或既有審查報告；只有新增本文件作為 main 基線交付物。
