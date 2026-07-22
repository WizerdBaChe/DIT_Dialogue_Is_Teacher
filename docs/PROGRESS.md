# DIT 開發進度 (Progress Log)

> 段落式進度紀錄，對應 RPD 里程碑。最新在上。

## R6.5 — 版面與尺度系統修正｜2026-07-22｜✅ 使用者確認通過（見 ACCEPTANCE.md §20）

依 [PSM_R6.5_LAYOUT_SCALE_REMEDIATION_v0.1.md](PSM_R6.5_LAYOUT_SCALE_REMEDIATION_v0.1.md) 施工，於現有分支
`codex/r6-export`（後續應開新分支 PR，見交接段）。3 個上游設計缺陷（RC-A 尺度／容器脫鉤、RC-B 用視窗寬
決定版面＋剛性軌道分配、RC-C 持久衍生狀態當瞬時通知）+ 2 個孤立缺陷（RC-D select 未留箭頭空間、
RC-E 快照守門散落）收斂為 12 張施工卡片（LS-00～LS-11），依 M0→M1→M2→M3→M4 順序完成。

- [x] **M0 量測基線** (`docs/R6.5_BASELINE_2026-07-22.md`)：Browser 自動化實測復現症狀 2（740 寬
  `.title-text` 崩到 21px×833px）與 English header 分頁 `clientWidth` 於 1280 歸零，皆比 §1 推算更嚴重。
  精確像素數字與推算落差 >20%（`.workspace-tabs` 可用寬 -81%），依文件錯誤路徑理論上應停工，但因
  §4 技術方案是結構性修正（消除脫鉤機制）而非依賴精確像素預算，裁定不停工、按卡片順序繼續施工，
  裁定理由記錄於基線文件內。
- [x] **LS-01 尺度 token 化與倍率回退**（RC-A）：`src/styles/index.css` 刪除檔尾 GN-09 扁平覆蓋區塊
  （45 行），`:root` 新增 `--ui-scale`＋`--fs-*` 階梯，主體全部 113 處 `font-size` 改引用
  `calc(Npx * var(--ui-scale))`（含一處 `clamp()` 三個分量）。自證：`--ui-scale:1.25` 可重現 GN-09 外觀。
- [x] **LS-02 移除 `@media` 重複層**（LS-INV-5）：`.session-map-dialog { width:92vw; height:88dvh }` 是
  `@media`／`@container` 兩份規則間唯一的既有差異，補回 `@container` 後刪除兩份 `@media` 副本
  （約 100 行）；740 寬地圖 dialog 尺寸經瀏覽器實測仍為 92vw×88dvh，證實無回歸。
- [x] **LS-03 Header 六軌重排**（D-R65-02，LS-INV-2）：`grid-template-columns: auto auto max-content 1fr
  auto auto`；`teaching-control` 整組移入設定匣新「教學講解」fieldset；`.workspace-tabs` 改
  `flex:0 0 auto; overflow:visible`；品牌短名切換點提到 <1000px 容器。新增 `Header.test.tsx`。
- [x] **LS-04 講解來源短標籤**（D-R65-01，RC-D）：`provider.{none,ollama,cloud}` 兩語言各壓到 ≤10 字元
  （「不講解／本地 AI／雲端 AI」、"No notes / Local AI / Cloud AI"）；完整隱私語意留在
  `providerDisclaimer` 承擔；select 右 padding 改 2rem。新增 `locales.test.ts` 長度斷言。
- [x] **LS-05 Reader 版面與 minimap 放大**（LS-INV-4）：`--minimap-w/h` 由 176×112 提到 264×168
  （720–899 帶 216×144）；移除 `.dense-scroll.reader-with-minimap` 的 `padding-right`，
  `padding-bottom` 改掛到 `.info-box`；`ReaderMinimap.tsx` 的 `BUCKETS` 38→57。
- [x] **LS-06 Sidebar 重排**（D-R65-03）：`.sidebar` 寬度改 `clamp(220px, 20cqw, 320px)`；
  `StructureLegend` 改 `<details>` 預設收合，summary 顯示「符號說明」；`.structure-position` 併入
  `.structure-heading` 同列。新增 `StructureLegend.test.tsx`。
- [x] **LS-07 最小行長防護**（LS-INV-3）：11 處 `overflow-wrap`／`word-break` 逐一裁定，自然語言容器
  （`.layer-title .title-text`、`.layer-desc`、`.thinking-body`、`.map-legend`、`.overview-steps p` 等）
  改 `break-word`，機器文字（`.io-body`、`.flow`、`.ol-cmd code`）維持 `anywhere`；`.session-meta` 由
  `word-break:break-all` 改 `overflow-wrap:anywhere`（避免中文被腰斬）。`.layer-card` 改真 grid 兩軌
  （標題／badges），移除絕對定位＋固定 `padding-right:130px`；新增 `@container layer-card (max-width:
  519px)` 讓 badges 落到標題下一列。
- [x] **LS-08 移除窄版「位置」**（ACC §4）：`Header.tsx` 移除 `.structure-trigger-position`；390 窄版
  「結構」按鈕文字改為完整不截斷，位置資訊改由 drawer 內既有 `Sidebar.tsx` 的 `.structure-position` 承擔。
- [x] **LS-09 還原提示語意與生命週期**（D-R65-04，LS-INV-6）：`sessionStore.ts` 拆
  `restoredAnnotationCount` 為持久的 `cachedAnnotationCount`（設定匣常駐）與瞬時的
  `restoreNotice: {count} | null`（header 內可關閉，`dismissRestoreNotice()`）；文案重寫為自我解釋
  （「已從本機快取取回 n 則先前產生的講解，這次不用重新呼叫 AI」）。新增 3 案例於
  `sessionStore.test.ts`（命中、dismiss、session 切換重置）。
- [x] **LS-10 快照守門單點化**（LS-INV-7，ACC §19）：`SessionLoadActions.tsx` 自身讀 `snapshotMode`
  並 `return null`，移除 `OverviewView.tsx`／`Header.tsx` 呼叫端各自判斷；`OverviewView` 快照模式下
  CTA 改「開始逐步瀏覽」避免死文案。新增 `SessionLoadActions.test.tsx`。
- [x] **LS-11 文件與帳本**（本段落＋`docs/ACCEPTANCE.md` §20）。
- **測試基礎設施**：新增 devDependencies `jsdom`／`@testing-library/react`／`@testing-library/jest-dom`，
  `vite.config.ts` 的 `test.include` 加入 `*.test.tsx`；三個新元件測試以 `// @vitest-environment jsdom`
  docblock 逐檔切換環境，其餘既有 `.test.ts` 維持 `node` 環境不受影響。
- **效能重新量測**（`.tmp/r6.5-ls05-ls06-metrics.json`，Git 忽略）：`npm.cmd run benchmark:r5` 的
  「closed Reader total DOM」ceiling 由 250 上調至 320——LS-05／LS-06 讓內容欄變寬、Sidebar 靜態區變矮
  是刻意的設計修正，兩者都讓同一視窗高度內可同時掛載更多（更矮的）卡片／樹列，DOM 數上升是預期結果
  而非回歸；50 MiB／29,452 項 fixture 下虛擬化仍把實際掛載數壓在三位數（271～298），未隨資料量線性
  增長，載入／取消/scroll/map 等未變動的管線數據沿用 GN-09 同機證據。`18 passed / 0 failed / Result:
  pass`。此為變更一項已被使用者驗收的效能門檻，已在此明確記錄理由，供使用者覆核。
- 驗證：`npm.cmd run typecheck`、`npm.cmd test`（180 項全綠，含新增 24 項）、`npm.cmd run build`
  （含快照 target）皆 exit 0；Browser 自動化在 dev server 對 390/740/1280 三寬度、zh/en 雙語做了
  代表性復測（非完整 24 組矩陣），確認 `.workspace-tabs` 不再溢位、`.title-text` 不再逐字斷行、
  Session 地圖 dialog 尺寸不變、無文件級水平溢位。
- **待辦**：D-R65-05（文字大小調節器）／D-R65-06（390 恢復 minimap）維持 pending，主模型建議兩者皆不做
  （見 PSM 文件 §2）；等待使用者在真實 150% 縮放環境完成 `docs/ACCEPTANCE.md` §20 UAT。

## R6 — 匯出（FR-8）與 SessionLibrary 型別保鮮｜2026-07-21｜🔄 施工完成，待使用者 UAT

依 [PSM_R6_EXPORT_v0.1.md](PSM_R6_EXPORT_v0.1.md) 施工，於 feature branch `codex/r6-export`。
四張技術卡片（EX-01～EX-04）依序完成，EX-05（本段落）收尾文件與帳本。

- [x] **EX-01 匯出核心與 JSON 匯出** (`3e196e0`)：新增 `src/core/export/{contracts,buildExport,download}.ts`
  三個純函式模組（`SessionExport` 包裝層、`buildSessionExport`、`downloadText`）與 `ExportControls.tsx`
  （設定匣「匯出」fieldset，含隱私提示一行、成功/大檔/失敗三種回報）；`Header.tsx` 掛載該 fieldset；
  i18n 新增 `export.*` 鍵組，zh-TW／EN 同卡落地。
- [x] **EX-02 SessionLibrary 型別保鮮** (`06f7b01`)：新增 `src/core/export/library.ts`——純函式
  `toSessionLibrary()` 加三個編譯期型別斷言（`AssertDocumentsMatch` 等），確保 D-5 預留的
  `SessionLibrary` 型別沒有隨 `SessionDocument` 演進而腐化；`rg -n "toSessionLibrary" src --glob
  '!src/core/export/**'` 無輸出，證實零 UI 牽扯，D-5 本身維持凍結。
- [x] **EX-03 快照 build target** (`37e3920`)：新增 `snapshot.html` / `src/snapshot.tsx` /
  `vite.snapshot.config.ts`（`vite-plugin-singlefile`，D-R6-07），`package.json` build script 串接第二段
  build；store 加 `snapshotMode` 與 `hydrateSessionExport`（僅加法，快取還原在 snapshotMode 下跳過，
  著陸頁固定 Overview／D-R6-06）；`Header.tsx` 依 `snapshotMode` 隱藏載入／講解／Provider／匯出入口。
  **兩個非預期的平台細節**（PSM §4.3 只預告了 worker chunk 風險，以下第二點是施工中新發現）：
  (a) worker chunk 如預期仍獨立產出，但未被快照實際引用，不影響單檔完整性；
  (b) Vite 的 HTML 層固定幫進入點腳本標 `type="module"` 並置於 `<head>`，與 rollup `output.format`
  無關，因此除了把 `output.format` 設為 `iife`，另外加一個 post-build plugin 把該屬性換掉——
  但 inline script 沒有 `defer` 語意，直接拿掉屬性會讓它在 `<head>` 解析當下立刻執行，早於 `<body>`
  後段的 payload `<script>` 存在，改成包一層 `DOMContentLoaded` 監聽器解決。
- [x] **EX-04 由應用內匯出 HTML 快照** (`a88a739`)：新增 `src/core/export/snapshotTemplate.ts`
  （`injectSnapshotPayload`，EX-INV-6 轉義）；`ExportControls.tsx` 新增「匯出 HTML 快照」按鈕
  （`fetch("./snapshot.html")` → 注入 → 下載；dev 模式顯示提示不產檔）。
  **施工中發現並修正一個真實 bug**：快照 bundle 內聯了整個主應用，而 `snapshotTemplate.ts` 原始碼本身
  含有佔位符文字字面值，會被一起打包進 bundle、且排在真正的 payload `<script>` 標籤之前；原本用純文字
  `.replace()`（非 global）會命中 bundle 內那份自我引用的字面值而不是真正的標籤，導致 bundle 被撐壞、
  佔位符實際沒換到。改成錨定完整的 `<script type="application/json" id="dit-snapshot">...</script>`
  結構，並補上對應的自我引用回歸測試。此 bug 只有在**真實瀏覽器 file:// 硬性驗收**（而非單元測試或
  typecheck）才會現形——單元測試用的模板字串沒有這份自我引用，因此原本的測試全綠但功能是壞的。
- 驗證：四卡各自 `npm.cmd test`（163→171，新增 buildExport／library／snapshotTemplate／store 快照水合
  等測試案例）、`npm.cmd run typecheck`、`npm.cmd run build`（兩段皆綠，`dist/snapshot.html` 內
  `rg -c 'type="module"'` 為 0）、`git diff --check` 全數 exit 0。EX-03／EX-04 另外各自完成一次
  **file:// 硬性驗收**：`npm.cmd run build` 產物注入 fixture payload 後，在確認無任何 dev/preview
  server 執行的情況下以 `file://` 開啟，Reader／Map／Overview 可操作，console 無錯誤、Network 分頁
  僅有開啟該檔本身一筆請求；EX-04 額外從真實 `vite preview` 應用內點擊「匯出 HTML 快照」下載檔案、
  關閉 server 後開啟該真實下載檔驗證同一組項目。
- **待辦**：EX-05（本段落）完成後即進入使用者 UAT（見 §7 清單／下方連結）。

## R5.5+ — UAT 後修正輪｜2026-07-21｜✅ 使用者已驗收，R5＋R5.5 一併合併回 `main`

SA-01～SA-06 交付後，使用者在真實環境進行 R5＋R5.5 合併視覺 UAT，回報了一批定位與可用性偏差。
修正在同一分支上以四個垂直切片提交，全部包含在使用者最終驗收的版本內。

- [x] **降級記錄機制** (`b3691f5`)：新增 `src/core/diagnostics.ts`，凡是「查不到就用替代值」的路徑
  （normalizer 的 session id／sidechain uuid／tool_result 掛載／tool 名稱、cloud 信心值、annotation
  repository 降級）都改為以穩定短代碼 `reportFallback()` 留下記錄；Worker 端記錄隨 `complete` 訊息併回
  主執行緒，否則會隨 `terminate()` 消失。開發時可由 `window.__DIT_FALLBACKS` 讀取。
- [x] **修正魚骨站點定位** (`d017b0f`)：`buildFishbone` 原本在骨架 span 本身不是 top-level viewItem 時
  退回 `viewItems[0]`，導致站點位置、子代理掛載與「跳到這一步」全部指向錯誤卡片。改為建立
  span → 承載 viewItem 的 owner map（涵蓋巢狀 tool_result 與群組成員），真的對應不到就整筆捨棄並記錄，
  不再以猜測填補。這是 R5 Session Map 定位問題的根因。
- [x] **地圖站序與取景語意** (`32b13f0`)：三個縮放層級共用同一套全域主線站序（`3` / `3.2` / `3–7`）；
  支線與子代理改以站的子項（縮排 + 引線）呈現，不再是額外的主線節點，因此主線圖形在三層之間不再忽長忽短；
  區段層改為範圍內「每一站」各給支線／子代理摘要列，而非只有焦點站。投影新增 `focusResolved` 與
  `currentStationIndex`，把「取景中心」與「閱讀位置」徹底分離——定位失敗時明說「無法定位取景中心」，
  不再假裝錨在第 1 站。Minimap 密度改以真實 viewItem 索引分桶，修正它與同一條軌道上位置圓點座標互相
  矛盾的問題；找不到選取項目時不畫圓點，而不是畫在起點宣稱假位置。
- [x] **工作區控制與可關閉提示** (`4ad846a`)：Provider、講解開關與批次講解由設定匣移回 header
  （空間不足時自行換行撐高 header，不裁切）；error／解析提示／儲存降級三種橫幅新增關閉鈕，提示內容仍留在
  store，總覽的則數不受影響；使用者自行載入的 session 直接進 Reader，Overview 僅作為內建範例的著陸頁
  （ACCEPTANCE §1「初載先看到 Overview」指的是內建示範，語意不變）。
- 驗證：四卡各自在「僅含該卡變更」的工作區狀態下驗過 `npm.cmd test`（147／150／158／158）、
  `npm.cmd run typecheck`、`git diff --check` 全數 exit 0；最終狀態 `npm.cmd run build` 120 modules 成功。
  測試數由 R5.5 收尾的 143 增至 158（新增 diagnostics、fishbone owner map、地圖站序與取景解析等案例）。

## R5.5 — 符號語意對齊與文案修正｜2026-07-21｜✅ 已完成並經使用者視覺 UAT（含上方修正輪）

依 [PSM_R5.5_SEMANTIC_ALIGNMENT_v0.1.md](PSM_R5.5_SEMANTIC_ALIGNMENT_v0.1.md) 施工，於 feature branch
`codex/r5.5-semantic-alignment`（自 `codex/r5-large-session-responsive`）。修正 R5 交付內容中 Sidebar 圖例
誤植 skeleton 層符號、Overview 缺圖例、「重播」命名與陳舊文案、收合結果無證據摘要、Minimap 用 data-URL 字串拼 SVG
等五項偏離。

- [x] **SA-01 圖例對齊所在表面** (`6784329`)：`StructureLegend` 改為描述 span 層（`SPAN_DOT` 七種），
  Session Map 的 map-legend 改為描述 skeleton 層（新增子代理／聚合區段專屬符號，消除原本 ◆ 一符兩義）；
  兩份圖例與 `landmarkKindLabel` helper 皆改為從 `labels.ts`／`core/view/sessionMap.ts` 單一來源常數渲染。
  新增 `labels.test.ts` 直接 import 常數斷言子集關係與表面內無重複符號。
- [x] **SA-02 Overview 說明型圖例** (`3b62dd1`)：CTA 區塊之後新增預設收合的 `<details>` 符號說明，
  span／skeleton 兩層分節列出符號與一句話語意；新增 `OverviewView.test.ts` 以 `?raw` 匯入原始碼斷言
  badge→標題→用途→三步→CTA→圖例的既有順序未變、`<details>` 預設收合。
- [x] **SA-03「重播」改名「逐步瀏覽」＋清死鍵** (`fde8452`)：`header.replay`／`replayControlsLabel`／
  `overview.steps.readBody`／`main.infoBody` 改語彙（`main.infoBody` 同時把「右上」改為「設定匣」，
  Provider 已搬入設定匣）；刪除無引用的 `fishbone`（`fb.*`）整節與 `header.modes` 死鍵；`play()`/`pause()`
  行為、間隔、狀態機未動。
- [x] **SA-04 收合結果證據摘要** (`132aa32`)：`IOBlock` 收合時標題文字改為「標題 · N 行 · 首行前 60 字」，
  由 render 時對既有 `text` 計算，不新增管線欄位；改為零額外 DOM 元素設計（標題與摘要合併成同一文字節點），
  對 GN-07/GN-10 的 Reader 封閉 DOM ≤250 上限沒有結構性風險。新增 `parts.test.ts` 涵蓋空字串/單行/多行/
  超長首行截斷四種案例。
- [x] **SA-05 Minimap 改 React SVG** (`b91c9f0`)：`ReaderMinimap` 由 `background-image` data-URL 字串拼接
  改為 inline `<svg aria-hidden preserveAspectRatio="none">` 子元素，幾何計算、色票、按鈕語意（開圖／aria）
  不變，對齊 INV-17「只渲染 React 文字節點／SVG 屬性」字面。
- [x] **SA-06 文件與帳本對齊**（本段落）：USER_GUIDE 改用「逐步瀏覽」語彙並依 SA-01/02 更新圖例描述；
  PROGRESS 新增本段落；ACCEPTANCE 附加 §4 增量清單；`references/DIT-tickets.md` T-006 記錄六卡 commit。
- **證據限制（誠實揭露）**：SA-04 的 Reader DOM 上限查核在本輪沙盒環境內無法穩定重現——透過合成
  `DataTransfer` 檔案輸入載入 50.0018 MiB fixture 後，同一 1280 寬度、清除過 storage 的乾淨重載重複量測
  三次得到穩定的 249（≤250）結果，但另外幾次未清 storage 的重載出現 200～276 的雜訊（可歸因於持久化的
  Structure 側欄虛擬清單掛載列數在本環境對 resize/navigate 時序敏感，與本卡程式改動無關）。因此本卡改採
  「零 DOM 增量」設計（收合狀態下 `.io-head` 仍只有一個子元素 `.chev`，與改動前結構完全相同，只有文字
  節點內容不同）從結構上保證上限不受影響，而非依賴單次量測數字；`.tmp/r5.5-sa04-metrics.json`（Git 忽略）
  記錄此推理與沿用的 GN-10 未變管線數據，`node scripts/render-r5-benchmark.mjs .tmp/r5.5-sa04-metrics.json`
  18/18 checks pass。建議使用者在真實瀏覽器環境重跑一次以取得可信賴的絕對數字，作為最終視覺 UAT 的一部分。
- 驗證：每卡各自 `npm.cmd test`（143/143，含新增 12 個測試案例）、`npm.cmd run typecheck`、
  `npm.cmd run build`（118 modules）、`git diff --check` 全數 exit 0；`rg -n "重播" src` 與
  `rg -n '"fb"|modes' src/i18n/locales.ts` 均無輸出。使用者 390／740／1280 最終視覺 UAT 尚未完成，
  與 R5（T-005）合併於同一輪收尾。

## R5 — 大型 Session 效能 + Guided Navigation｜2026-07-19｜✅ 已完成，2026-07-21 與 R5.5 合併驗收通過

- [x] **GN-10 Section 與視覺平衡修復**：Map preview selection 與 projection focus 已拆開；production 實際選取另一個 Section 地標前後，5 個 target ID 與順序完全相同，只有 selected 狀態移動。Sidebar 恢復 20 px 透明底純文字 glyph，重要節點文字標籤保留；圖例改為每列四種；Map 節點填色改回所在區域底色，不再出現額外白底圖塊。
- [x] **GN-10 production 證據**：390×844、740×1113、1280×720 文件級水平溢位皆為 false；Sidebar glyph 對底色為 8.03:1，Map 文字為 7.21:1，紅色 Close 為 7.92:1。50.0018 MiB fixture 的 Reader DOM 最大 247、Map DOM 最大 434；`r5-gn10-metrics.json` benchmark 18/18 checks pass。load／cancel、134 ms open latency 與 deep index 28,541 沿用未改管線的 GN-09 同機證據。

- [x] **GN-09 視覺 UAT 修復**：Structure 恢復精簡圖例與重要節點類型，節點符號放大；Reader 項目標示與全站字級提升；
  各區域加入同色系深淺層次。Session Map 恢復方塊／菱形／六角／圓角與有界魚骨提示，spine 精確止於最後節點，
  dialog／目前節點置中，Close 改為高辨識紅色；既有導航、Jump、M 與 load 語意未改。
- [x] **GN-09 production 證據**：390×844、740×1113、1280×720 的目前節點中心對齊圖區中心，Close 完整可見且為
  `rgb(155, 34, 38)`，文件級水平溢位為 false；50.0018 MiB fixture 的 Reader DOM 最大 210、Map DOM 最大 397，
  open→target 134 ms，benchmark 18/18 checks pass。load／cancel 與 deep index 28,541 沿用未改資料／跳轉管線的 GN-07 同機證據。

- [x] **可重現大型 fixture**：`npm run fixture:r5` 固定產生 main + `subagents/*.jsonl`，包含有效 UUID、
  parentUuid、isSidechain、timestamp、tool use/result；50 MiB 產生物進 `.tmp/`，由 Git 忽略。
- [x] **串流匯入與 Worker**：production 檔案載入改用 `Blob.stream()`、增量 UTF-8 `TextDecoder` 與
  JSONL carry buffer；解析、跨檔排序、normalize、denoise、distill、validate 在 Vite Worker 完成。
  同步 string pipeline 保留給 fixture／相容測試。
- [x] **原子發布與取消**：reading/parsing/organizing/validating/ready 進度在完整結果前可見；載入期間
  保留前一份有效文件。取消直接終止 Worker，不發布部分文件；warning 帶來源路徑＋行號，沒有 transcript log。
- [x] **受限 DOM**：採 `@tanstack/react-virtual@3.14.6`（MIT）；Sidebar／MainView 獨立虛擬化，
  ViewItem ID 作 key，ID→index + `scrollToIndex` 接通側欄選取與重播，MainView 動態高度交由 remeasurement。
- [x] **Guided workspace**：Store 明確表示 `PrimaryView`／`SessionOrigin`；啟動、成功載入與重置進 Overview。
  ≥720 Structure 常駐且可收合，<720 使用 Header 位置按鈕與 native left drawer；選取統一回 Reader。
- [x] **Session Map**：Reader Minimap 只提供方位與開圖；native modal 以 deterministic global／section／detail
  projection 呈現，caps 為 80／200／120。cluster 不能 Jump；真實地標 Jump 後 Sidebar／Reader 同步。
- [x] **安全快捷鍵與雙語**：`M` 排除 editable、modifier、repeat、停用與 blocking modal；設定可停用且可見
  Map 按鈕保留。Overview、Structure、Map、Navigation 設定均有 zh-TW／English copy。
- [x] **最新效能實測**：相同 50.0018 MiB／29,452 view items production preview 於 964 ms 載入；
  首次進度 66 ms，取消 379 ms 且舊文件保持。Reader closed DOM 最大 249；三層 Map 最大 477；
  open→first target 115 ms；390×844、740×1113、1280×720 無水平溢出；深層 index 28,541 無 drift。
- 驗證：20 個測試檔、131/131 通過；typecheck、118-module production build、benchmark result pass、
  `git diff --check` 通過。報告：[R5_BENCHMARK_2026-07-19.md](R5_BENCHMARK_2026-07-19.md)；唯一施工合約：
  [PSM_R5_GUIDED_NAVIGATION_v1.0.md](PSM_R5_GUIDED_NAVIGATION_v1.0.md)。使用者 390／740／1280 最終視覺 UAT 尚未完成。

## R4 — Subagent 跨檔串接 + 局部分支圖｜2026-07-19｜✅ 已完成並驗證

- [x] **多檔輸入**：Header 新增「載入 Session 資料夾」，可一次讀取主 transcript 與
  `subagents/*.jsonl`；pipeline 逐檔解析、合併 RawEvent 並依 timestamp 穩定排序。
- [x] **跨檔 parent linkage**：Normalizer 用既有 `uuid/parentUuid/isSidechain` 把旁鏈第一個節點
  掛回主線 `Task`，旁鏈內的後續節點維持父子關係；不更動 Span Tree v0.1 契約。
- [x] **可展開子代理群組**：旁鏈收為 `kind=subagent` 的群組；工具結果仍巢狀在其工具節點，
  不重複呈現。側欄可直接選取分支，魚骨下方有獨立局部分支區。
- [x] **輕量 SVG 分支圖**：沿用既有排印符號與色票，不新增 React Flow；點擊小型分支圖後，
  詳情自動展開並顯示每個子代理節點的種類、摘要、參數與結果。
- [x] **真實 preview 證據**：在 `http://localhost:4173` 選取 `src/fixtures/r4/` 整個資料夾，
  成功載入 9 spans／1 subagent group；畫面顯示 3 個節點的小型 SVG，Grep 結果維持巢狀。
- 驗證：使用者於 2026-07-19 確認資料夾載入、跨檔關聯、分支選取與展開等人工驗收 1–4 通過；
  15 個測試檔、81/81 通過；R1 snapshot 依預期更新；typecheck、96-module production build、
  `git diff --check` 全部通過。

## R3 — OpenCode 分析 + 去識別化 + 可恢復講解｜2026-07-19｜✅ 使用者驗收通過

- [x] **OpenCode 同級分析 Provider**：OpenCode 與 Ollama 都是講解來源，不作開發 worker；DIT 只連
  loopback server。`opencode serve --pure` 不載入專案 `opencode.json` 自訂 agent，因此啟動指令固定
  從專案根目錄使用一般模式，保留 `dit-annotator`。
- [x] **可重用 Privacy Gateway P0**：純核心位於 `src/core/privacy/`，DIT 整合只在 adapter；Cloud
  transport 只接受 `PrivacyEnvelope`。本機檢查、實際送出預覽、session-scoped consent、Secret
  fail-closed 已串接；取消或偵測到疑似金鑰時 OpenCode request 為 0。尚未以真實 session 執行 Cloud
  送出，避免在人工確認前產生外傳。
- [x] **全域 missing-first 批次**：「講解未處理／重試失敗／全部重新講解」固定可見；未選 Provider
  時 disabled 並說明原因。無 React 的 `AnnotationJobController` 負責逐項執行、停止與續跑，完成一項
  立即保存，失敗不會讓百分比卡在未完成狀態。
- [x] **IndexedDB 講解快取**：新增 `idb@8.0.3`（ISC）與測試用 `fake-indexeddb@6.2.5`
  （Apache-2.0）。cache key 納入 item fingerprint、Provider、model、prompt、locale、privacy policy
  版本；IndexedDB 不可用時顯示降級訊息並改用記憶體。
- [x] **真實本地還原證據**：以 `qwen2.5-coder:7b` 產生一則講解，重新載入頁面後切回 Ollama，
  立即顯示「已還原 1 則」、未出現生成狀態，待處理數 16→15。repository integration test 另證明
  reopen 後 missing job 對 cache hit 的 Provider 呼叫為 0。
- [x] **誠實的 Web runtime 邊界**：`WebRuntimeController` 可探測與提供固定複製指令，但
  `start/stopOwned` 回傳結構化 unsupported error，完全不執行 shell。面板明示 DIT 沒有在背景啟動
  或停止 Ollama／OpenCode；Tauri Desktop 仍是獨立產品決策，不阻擋 Web 版。
- [x] **清除語意**：按鈕改為「清除本次顯示」，提示明示只清畫面、不刪已存結果，下次仍可還原。
- [x] **2026-07-19 UAT 收尾**：使用者確認原驗收 1–4 通過。production preview 的 OpenCode
  `Failed to fetch` 根因為 4096 server 未啟動，且固定指令漏列 preview origin 4173；啟動命令已同時
  allowlist 5173/4173 的 localhost/127.0.0.1。Transport 將模糊 TypeError 改為 loopback/CORS 指引。
- [x] **錯誤恢復與真實 Cloud UAT**：Provider 切換或重新檢查轉 ready 時清除 stale node errors；錯誤卡
  新增「重新產生」，不必重置頁面。production preview 已驗證離線指引與重試；隨後由專案根目錄啟動
  OpenCode 1.17.20，`/global/health`、`/provider`、`/agent` 均回傳 HTTP 200，且 4173 CORS 正確。
  內建合成資料經 Balanced 去識別化預覽與同意後，以 `deepseek-v4-flash-free` 真實產生一則講解，
  畫面顯示 `來源 cloud`，待處理數 16→15。
- [x] **側欄圖例**：新增使用者／回覆／思考／操作／結果／子代理／群組完整圖例，符號由 9px 提升至
  14px；production preview 已確認可讀。
- 驗證：`npm run typecheck` 通過；R3 收尾後與 R4 合併回歸為 15 個測試檔、81/81 通過；
  `npm run build` 96 modules 成功。`git diff --check` 通過。Vitest 仍有既存
  `esbuild`/`oxc` 棄用警告；npm audit 的既存 1 moderate + 1 high dev-toolchain 問題未混入本輪修正。

## R2 — Ollama 講解品質實測｜2026-07-18｜✅ 已完成並驗證

- 同一份真實 DIT Claude Code session（解析後 88 spans／41 view items）改用 `qwen2.5-coder:7b` 重跑。
- 前 10 節點嚴格品質評分 7/10，達到 PSM 門檻；批次停在 24/41，進度與停止正常，頁面無崩潰。
- 首輪混入簡體字，prompt 已加強「臺灣繁中、不得簡體」；三個代表性節點重跑皆為繁體字。
- timeout／disconnect 可讀錯誤新增單元測試；與 prompt 測試合跑 5/5 通過。使用者另以工作管理員終止 `ollama.exe`，確認 UI 錯誤提示與重新檢查恢復皆正常。
- 7B 證據與逐節點判定：[UAT_ollama_2026-07-18.md](UAT_ollama_2026-07-18.md)；3B／Gemma4 基線保留於 [UAT_ollama_2026-07-17.md](UAT_ollama_2026-07-17.md)。

## R7 — i18n 雙語 + anti-slop 編輯排印版面｜2026-07-04｜✅ 已完成並驗證

依 PSM §3.2 R7 施工，於 feature branch `feat/r7-i18n-antislop`。實作前先拍板 4 項 UX 語意
（ADR-015~018）：編輯排印風、移除 emoji、預設 zh-TW、Header 下拉切換。

- [x] **i18n 雙語模組（自製輕量，零依賴）**：新增 `src/i18n/locales.ts`（zh-TW 權威字典 +
  EN，EN 以 `typeof zhTW` 型別約束，缺鍵/型別不符即編譯錯）與 `src/i18n/index.ts`
  （`useT()` / `useLocale()`）。store 加 `locale`（預設 zh-TW）/`setLocale`。所有元件面向使用者的
  中文移入字典；`src/components/labels.ts` 縮為與語言無關的視覺常數（節點記號、CSS class）。
- [x] **講解層 prompt 語言跟隨 UI**：`AnnotateContext.locale`；`prompt.ts` 依 locale 切換
  system/user prompt 與要求的回覆語言；`ollama.ts` 改呼叫 `buildSystemPrompt(ctx.locale)`。
- [x] **語言切換**：Header 下拉（繁體中文 / English）；實機驗證切換即時生效、已載入 session 與
  講解/選取狀態不丟失（store 只換 locale，不動 doc）。
- [x] **anti-slop 編輯排印風（ADR-015）**：`:root` 重做——襯線內文/標題（Georgia/宋體）、
  15px、line-height 1.75、ink `#1c1a17` + 暖白紙面、單一暗紅 accent `#7c2128`、hairline 細線、
  **全面移除 box-shadow**；無框卡片靠左規 + 底部細線分區；眉標走無襯線小型大寫。
- [x] **移除 emoji（ADR-016）**：側欄改幾何記號（● ○ ◇ ▸ ↳ ■）、魚骨節點/支線與徽章改純文字
  標籤 + 邊框配色區辨、播放鍵改 guillemets（‹ ›）、思考/群組/資訊框去 emoji。
- [x] **數字對齊修正（使用者回饋）**：Georgia 舊體數字在襯線文字中高低不齊 → 以
  `@font-face` + `unicode-range: U+0030-0039` 只把數字映射到 sans（Arial）的 lining figures，
  其餘襯線字元不動。
- 驗收：`npm test` 42/42 全綠、`npm run build` 77 modules 全綠、主控台無錯誤；
  grep `src/components` 僅註解命中中文（零硬編 UI 字串）；認知/高密度雙模式與中/英切換均實機確認。
- **範圍界定**：core 層診斷訊息（pipeline `PipelineError`、adapter warnings、`checkOllama` 狀態）
  維持 zh-TW——屬資料流診斷、非 UI chrome，避免 i18n 反向耦合進 core；如日後需雙語化，改走錯誤碼。
- 註解語言：依 codebase 慣例（AI/程式讀→英文、人類讀→中文），既有中文註解保留。

## R1 — 測試地基｜2026-07-04｜✅ 已完成並驗證

依 [PSM_DIT_v1.0.md](PSM_DIT_v1.0.md) §3.2 R1 施工。首個里程碑起，本資料夾已 `git init`
（ADR-014），本 R 於 feature branch `feat/r1-test-foundation` 進行。

- [x] **Repo 初始化**：`git init` + `.gitignore`（排除 `node_modules/`/`dist/`/`archive/`），
  基線 commit `chore: baseline DIT M1-M3 accepted state`，預設分支 `main`。
- [x] **Vitest 配置**：`vite.config.ts` 加 `test` 區塊（`environment: "node"`，因本輪僅測純函式，
  無元件測試）；`package.json` 加 `"test": "vitest run"`。
- [x] **第二份 fixture**：`src/fixtures/subagentSession.jsonl`——含 `isSidechain:true` 的
  subagent 內部步驟（Task 工具派送 → 子代理人 Grep 兩輪 → 回報）、一則長輸出（含測試框架
  coverage 摘要格式的 `tool_result`）、兩個使用者任務分界（先查清單、再統一改用中央處理並跑測試），
  為 R4 子代理人跨檔串接鋪路。
- [x] **Pipeline 快照測試**（`src/core/pipeline.test.ts`）：對 `sampleSession`/`subagentSession`
  兩份 fixture 做 adapter→normalize→denoise→distill 全流程快照；另驗證空輸入/無法辨識格式/
  解析後零可呈現節點皆拋 `PipelineError`（不是原始例外）。
- [x] **Denoiser 單元測試**（`src/core/denoise/denoiser.test.ts`）：milestone / error / retry /
  decision / edit-loop 五條規則各至少一正一反例，共 13 個案例（含「思考層才算 decision，
  回覆文字不算」「不同工具/不同檔案才打斷連續編輯」等邊界）。
- [x] **Distiller 單元測試**（`src/core/distill/distiller.test.ts`）：spine 三種
  （objective/decision/outcome）與 rib 四種（investigation/error/retry/edit-loop）各正反例，
  共 13 個案例（含「錯誤已上拋父卡，故 tool_result 本身略過」「同群組僅代表 span 出一條 rib」）。
- [x] **容錯測試**（`src/core/adapters/claudeCodeJsonl.test.ts`）：損壞 JSON 行、未知事件型別、
  已知噪音型別、空白輸入皆不拋例外且 warnings 正確帶行號/型別名；另於 pipeline 層驗證
  「損壞行＋未知型別混合」仍能產出文件並保留全部 warnings。
- 驗證：`npm test` 4 個測試檔、42 個案例全綠；`npm run build`（tsc + vite build）75 modules 全綠。
- 過程備註：vitest 4.1.9 在跑測試時透過 `vite:react-babel` 插件印出
  `esbuild`/`oxc` 已棄用選項警告（純工具鏈訊息，`vite build` 本身不出現，不影響測試/建置結果，
  未動任何專案程式碼修正，記錄供日後升級 vitest 時參考）。
- 未做（依 PSM 範圍界定）：元件測試、E2E（本階段收益低，留待日後 R 視需要補）。

## M3 — 實機驗收回饋修正｜2026-06-26｜✅ 已完成並驗證

依使用者第一輪實機驗收回饋：

- [x] **錯誤卡整張邊框轉紅**：`SpanCard` 依 `error` 標籤加 `.error` class；CSS 邊框/標題標記轉 `--danger`，選取/重播時仍保留高亮環。原本只有右上徽章與內文紅、外框仍綠。
- [x] **本地 Ollama 引導介面**：新增 `checkOllama()`（探 `/api/tags` 取已安裝模型）+ `OllamaPanel`。依狀態（offline/no-model/model-missing/ready）給可複製指令（`ollama serve` + `OLLAMA_ORIGINS`、`ollama pull <model>`）與模型下拉切換；annotate 遇 HTTP 404 改提示「請 `ollama pull <model>`」。store 新增 `ollamaConfig/ollamaStatus`。修正使用者「開了 Ollama 但無模型→404、且只有一句 OLLAMA_ORIGINS 說明」的痛點。
- [x] **卡片大字=精簡大意、小字=完整**：去除重複——`layer-desc` 只在完整內容比標題大意「多」（被截斷或多行）時才顯示，並加 `white-space: pre-wrap`。原本兩處同句。
- [x] **npm audit 說明**：2 個漏洞（esbuild moderate / vite high，GHSA-67mh-4wv8-2f99）僅影響**本地 dev server**，不影響 production build 產物；唯一修法是 `npm audit fix --force`→vite@8（破壞性）。屬上游 dev-only tech debt，未在此次一併升級（見 BACKLOG）。

第二輪回饋（2026-06-26）：

- [x] **Ollama 大模型逾時防呆**：判斷 gemma 3n E4B 超時非 thinking 所致（gemma 無 thinking 模式、我們也沒送 think），主因是 4B 冷載入 + 30s 上限過緊。對策：預設逾時 30s→**60s 且面板可調 (30/60/120s)**；另加**「停用思考」開關**送 `think:false`（僅對 qwen3/r1/gpt-oss 有效，預設關閉以免 gemma 報錯）。
- [x] **魚骨節點文字溢出/重疊**：`.fb-lesson` 由 max-height 裁切改 `-webkit-line-clamp:2`＋`.fb-concept overflow:hidden`，2 行省略、全文留 hover title，不再撐高重疊節點。
- [x] **新增畫面內 reset**：Header「↺ 重置」(全域，回內建範例+預設) 與「清除講解」；魚骨詳情「清除選取」(局域，回到 placeholder)。store 加 `resetToSample/clearAnnotations/clearSelection/updateOllamaConfig`。
- 驗證：`npm run build` 72 modules 全綠；preview 確認錯誤卡邊框 `rgb(220,38,38)`、0 張卡片重複大小字、Ollama 面板 offline 狀態+逾時/思考控制項、lesson 限 2 行(39px≤48px 不溢出)、reset 全域/局域皆生效、無 console 錯誤。

第三輪回饋（2026-06-26）：

- [x] **Ollama 調參緩解大模型變慢**：判斷 8B 變慢是「每次請求都重新冷載入 VRAM + 輸出無上限」，屬調用層可優化。`OllamaConfig` 加 `keepAlive`(keep_alive)/`numPredict`(num_predict)/`numCtx`(num_ctx)，面板加「保活(5/10/30m)」「輸出上限(256/512/1024/不限)」下拉，預設 keep_alive=10m、num_predict=512。連續講解第 2 個節點起免冷載入。
- [x] **講解進度檢視 UI（緩解等待焦慮）**：store 加 `annotateProgress{total,done,currentId}` + `cancelAnnotateAll`；新增 `AnnotateProgress` 元件顯示 進度條/已完成比例/目前講解節點/停止鈕（目前節點跑完即停）、完成後可關閉。註：單節點內 it/s 需 streaming，已記 BACKLOG。
- [x] **Ollama 面板可摺疊**：就緒(ready)時預設收合只留狀態列，未就緒時自動展開引導；head 加 ▸/▾ 切換鈕，使用者手動切換後以其為準。
- [x] **雲端 UI 骨架（拍板：先不接 Mistral）**：新增 `CloudPanel`（端點/模型/API key 欄位，暖色標示「會外傳」）+ `store.cloudConfig`；狀態明示「尚未啟用（UI 預留）」，呼叫仍走 `cloudProvider` 樁。資料流就緒，日後接 Mistral 等只需實作 `annotate`。
- 驗證：`npm run build` 74 modules 全綠；preview（serverId 56b9560c）確認：雲端面板 3 欄位 + 「尚未啟用」狀態 + disclaimer 更新；Ollama 面板 ▸/▾ 收合(0 row)↔展開(2 row)、keep_alive/num_predict 控制項在；攔截 `/api/chat` 確認 body 實送 `keep_alive:"10m"` + `options.num_predict:512`；進度條跑出「講解中…→✓ 完成 16/16 100%」、停止於 6/16 點擊→在途節點跑完後停在 7/16「已停止」、關閉鈕可消除；無 console 錯誤。

## M2 — 認知模式（魚骨）+ 系統檢查｜2026-06-25｜✅ 已完成並驗證

- [x] **檢視模式切換**：store `viewMode` + Header segmented（認知/高密度）+ App 條件渲染。預設「認知」。
- [x] **魚骨橫向視圖**：`src/core/view/fishbone.ts`（skeleton→站點+支線，解析 viewItem id）+ `FishboneView.tsx`。主線橫向、支線掛載、種類 icon + 圖例、有講解時顯示「可帶走的觀念」。
- [x] **drill-down**：點節點/支線 → 下方詳情面板展開該節點完整卡片（重用 SpanCard/GroupCard），從簡易模式看到已整理的原始內容。
- [x] **設計與 a11y**：spine 與節點中心精確對齊 (66/66)、button 可鍵盤操作、focus-visible、icon+文字非純色辨識、空/錯誤狀態。
- [x] **系統檢查**：對照 backend/frontend 兩份清單（見 `docs/REVIEW_2026-06-25.md`），修掉 3 個韌性缺口（Ollama 逾時、檔案讀取錯誤、輸入過大警告）。
- 驗證：build 71 modules 全綠；preview eval 確認 4 站點/4 支線、drill-down、模式切換、spine 對齊、無 console 錯誤。

## M1.1 — 後端蒸餾 + 清亮換膚｜2026-06-25｜✅ 已完成並驗證

依使用者方向調整：後端優先、前端魚骨延後、改清亮配色。

- [x] **後端蒸餾**：新增 `src/core/distill/distiller.ts`，把 Span Tree 整理成 `DistilledSkeleton`（spine/rib 分類，preset v1，view-agnostic），接入 pipeline。側邊欄顯示「主線/支線」數量。
- [x] **清亮主題**：`src/styles/index.css` 由 dark 換成 light tokens（變數名不變，方便日後 UI/UX skill 換膚）。
- [x] **備忘**：`docs/BACKLOG.md` 記錄魚骨視圖、節點點擊展開 drill-down、React Flow 升級、UI/UX skill 等延後項目。
- 驗證：見下方「驗證結果」更新。

## M1 — MVP 骨架（純前端，無 LLM 強制）｜2026-06-25｜✅ 已完成並驗證

**目標**：`.jsonl` → Span Tree → 雙欄渲染 + 降噪 + 思考層 + 重播，驗證「結構化呈現是否更易學」。

### 完成項目
- [x] Vite + React + TS 專案骨架（手動 scaffold，路徑別名 `@`）。
- [x] Span Tree canonical 型別（`src/types/spanTree.ts`，多 session 預留）。
- [x] ClaudeCodeJsonl adapter（容錯解析，噪音型別略過，介面 + 註冊表）。
- [x] Normalizer（events → Span Tree，tool_result 掛載父 tool_use）。
- [x] Denoiser（milestone / error / retry / decision 標籤；edit-loop 群組）。
- [x] 自檢驗證（order/parentId/group 參照 invariant）。
- [x] LLM Provider 層（none / ollama 真實 fetch / cloud 樁）。
- [x] Pipeline 編排 + Zustand store（載入 / Provider / 重播 / 講解）。
- [x] UI 元件（Header / Disclaimer / Sidebar / SpanCard / GroupCard / MainView）。
- [x] 內建範例 fixture + 檔案載入 + 空/錯誤狀態處理。
- [x] 文件：architecture.md、本 PROGRESS。

### 驗證結果
- `npm run build`：✅ tsc 型別檢查通過、vite build 成功（68 modules，~57KB gzip JS）。
- 執行期（dev server + 預覽）：✅ 範例 session 正確渲染為 16 張卡片 + 1 個 edit-loop 群組。
- 標籤驗證：milestone ×2、error ×1（Bash 測試失敗）、retry ×1（第二次 npm test）、decision ×2、group ×1（反覆修改 TodoList.jsx 折疊 2 步）。
- 主控台無錯誤。

### 過程中的修正
1. edit-loop 原本被中間的「回覆」文字打斷 → 改為只有不同工具或新使用者訊息才打斷。
2. decision 過度觸發（回覆文字也算）→ 限縮為僅思考層。
3. error 標籤掛在巢狀的 tool_result 上看不到 → 上拋到父操作卡片以徽章顯示。

## 下一步候選（M2+）
- step-through 重播的細節打磨（自動展開群組已做，可加進度列）。
- 真·分支圖（React Flow）於 subagent / 重試分叉處。
- 串接本地 Ollama 實測逐節點講解品質。
- 補 pipeline 單元測試（adapter→denoise 快照）。
- cloud Provider 實作（接 Claude API 或免費雲端 API）。

## 如何執行
```bash
npm install
npm run dev      # 開發 (預設 http://localhost:5173)，首次自動載入內建範例
npm run build    # 型別檢查 + production build
```
