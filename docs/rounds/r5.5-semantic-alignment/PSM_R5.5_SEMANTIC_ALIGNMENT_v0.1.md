# DIT R5.5 符號語意對齊與文案修正 — 施工合約 v0.1

日期：2026-07-20

狀態：**使用者已拍板方向（樹列維持 span 層符號、skeleton 圖例只放 Map、重播改名逐步瀏覽）；可依施工卡實作**

定位：本文件是 [PSM_R5_GUIDED_NAVIGATION_v1.0.md](../r5-guided-navigation/PSM_R5_GUIDED_NAVIGATION_v1.0.md) 的補充合約，只修正 GN-01～GN-10 已交付內容中「偏離已批准語意」與「文案陳舊」的部分。R5 合約的全部 BR、INV、狀態機與 §11 既有契約在本輪繼續有效；本文件新增的規範以 SA-INV 編號，與其不衝突。

範圍裁定（使用者 2026-07-20）：

- 樹列（Structure Sidebar 虛擬樹）維持 **span 層**符號（`SPAN_DOT`）；skeleton 層圖例只出現在 Session Map。
- 「重播」改名為「逐步瀏覽」。
- 後端管線類修正（adapter 未知型別寬容收納、session 標題 fallback）**本輪不做**，列入 §5 延後清單。

## 1. 問題定義（來自 2026-07-20 設計重新分析）

DIT 實際存在兩套符號詞彙：

| 詞彙層 | 語意 | 符號 | 使用表面 |
|---|---|---|---|
| Span 層 | transcript 發生了什麼 | ● 使用者 ○ 回覆 ◇ 思考 ▸ 操作 ↳ 結果 ◆ 子代理 ■ 群組（`labels.ts` `SPAN_DOT`） | Sidebar 樹列、GroupCard、SubagentBranch |
| Skeleton 層 | 學習魚骨的節點／支線種類 | 方＝目標 菱＝決策 六角＝里程碑 圓角＝結果＋四種 rib 提示 | SessionMapGraphic、Minimap |

偏離事實（均已在程式碼定位）：

- **P1（blocker）**：`StructureLegend.tsx` 掛在 Sidebar 樹列上方，畫的卻是 skeleton 層符號（□◇⬡▰├△○◆），與正下方樹列的 `SPAN_DOT` 互相衝突：◇ 圖例＝決策／樹列＝思考、○ 圖例＝重試／樹列＝回覆、◆ 圖例同時＝edit-loop 與子代理（圖例自身重複）。`SessionMapDialog.tsx:175-177` 的 map-legend 同樣有 ◆ 重複。
- **P2**：R5 合約 INV-6 陳述「說明型圖例留在 Overview」，但 `OverviewView.tsx` 從未實作任何圖例。
- **P3**：「重播」（`play()`）實為 1.6 秒一步的 step-through 逐卡瀏覽，與講解 Provider 無關；名稱使人誤期待有旁白式重播。
- **P4**：文案陳舊——`main.infoBody` 仍指引「右上『講解來源』」（Provider 已搬入設定匣）；`locales.ts` 的 `fb.*`（noSpineTitle 等）與 `header.modes`（認知／高密度）為死鍵，且文案引用已移除的「高密度模式」。
- **P5**：收合的結果區塊（`IOBlock`）head 只有「結果」二字，不展開無法判斷該操作有沒有拿到東西。
- **P6（字面違約，低風險）**：`ReaderMinimap.tsx` 以字串拼 SVG 塞進 `background-image` data-URL，違反 INV-17「只渲染 React 文字節點／SVG 屬性」的字面（無 session 文字進入字串，無注入風險）。

## 2. 新增不變條件

- **SA-INV-1**：任何圖例只得描述「它所在表面實際渲染的符號」；同一表面內，同一符號只能有一個語意。
- **SA-INV-2**：Sidebar（desktop 與 drawer）只出現 span 層圖例；skeleton 層圖例只出現在 Session Map dialog 內；Overview 的說明型圖例得同時呈現兩層，但必須明示分層。
- **SA-INV-3**：UI 文案不得引用不存在的介面位置或已移除的模式名稱；`locales.ts` 不得保留無引用的死鍵。
- **SA-INV-4**：本輪不修改 `PrimaryView`、Map 狀態機、Jump／cluster 語意、快捷鍵守門、載入管線、annotation、Privacy Gateway；R5 §11 全部契約與 GN-07/GN-10 效能上限（Reader closed DOM≤250、Map DOM≤500、projection caps）不得失守。
- **SA-INV-5**：圖例內容必須由「與渲染同源」的常數導出（span 層自 `labels.ts`、skeleton 層自 `sessionMap.ts` 或同級單一來源），元件內不得手寫符號清單字串；新增符號一律先進常數再被引用。此條同時服務 R6 靜態 HTML 快照——快照渲染器屆時重用同一組常數，不得複製字串。

## 3. 施工卡

施工順序固定 SA-01 → SA-06；規則同 R5 合約 §0（每卡獨立提交、Acceptance 過了才進下一卡、未涵蓋的語意分岔停工新增決策）。

### SA-01 — 符號系統統一：圖例描述所在表面
- Severity/Confidence: blocker / high；衝突符號已逐一比對 `labels.ts`、`StructureLegend.tsx`、`SessionMapDialog.tsx`、`SessionMapGraphic.tsx`。
- Objects: `src/components/StructureLegend.tsx`, `src/components/SessionMapDialog.tsx`, `src/components/SessionMapGraphic.tsx`, `src/components/labels.ts`, `src/i18n/locales.ts`, `src/styles/index.css`，相關測試。
- Why: 見 §1 P1；圖例教錯符號直接破壞 BR-2「方位」與 GN-09「文字＋形狀表達類型」的目的。
- Change:
  1. `StructureLegend` 改為描述 span 層：● 使用者 ○ 回覆 ◇ 思考 ▸ 操作 ↳ 結果 ◆ 子代理 ■ 群組，並保留一行說明「重要節點另以文字標籤標示（目標／決策／里程碑／結果）」；沿用 GN-10 的四欄網格與 20 px 透明底樣式。
  2. Session Map dialog 的 map-legend 只描述 skeleton 層與地圖形狀（方＝目標、菱＝決策、六角＝里程碑、圓角＝結果、rib 四種提示、cluster 聚合塊），子代理改用與 `SessionMapGraphic` 切角形狀對應的獨特符號，消除 ◆ 重複；最終字元屬技術細節由實作者定（§0.5），唯一性由 Acceptance 把關。
  3. 依 SA-INV-5 把兩份圖例的「符號＋語意 key」清單抽成常數：span 層圖例描述子放 `labels.ts`（緊鄰 `SPAN_DOT`）、skeleton 層圖例描述子放 `core/view/sessionMap.ts`（緊鄰形狀定義）；`StructureLegend` 與 map-legend 只做 render，不再手寫符號字串。
  4. `landmarkKindLabel` 目前在 `SessionMapDialog.tsx` 與 `SessionMapGraphic.tsx` 重複定義，抽成單一共用 helper（放 `sessionMap.ts` 同層或 `labels.ts`），兩處引用。
  5. 不改 `SPAN_DOT` 對應與樹列 rendering；不改地圖 SVG 形狀本身。
- Blast radius: 僅圖例 DOM、locales 圖例字串、圖例常數與共用 helper、對應 CSS；樹列、Map 投影、Jump、caps 不動。
- Rollback: 單獨 revert 本卡 commit 即回 GN-10 狀態。
- Acceptance: 單元測試斷言（a）Sidebar 圖例符號集合 ⊆ `SPAN_DOT` 值集合∪`GROUP_DOT`；（b）Sidebar 圖例與 Map 圖例各自內部無重複符號；（c）Map 圖例不含 `SPAN_DOT` 專屬符號（● ▸ ↳ ■）；（d）圖例測試直接 import 常數驗證，證明元件與常數同源。`rg -n "landmarkKindLabel" src/components` 只允許 import 引用、不允許第二份定義。`npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run build`、`git diff --check` 全部 exit 0。人工：390／740／1280 圖例與所在表面逐符號對得上。
- Commit: `fix(workspace): align legends with their surfaces`

### SA-02 — Overview 說明型圖例（補完 INV-6 原意）
- Severity/Confidence: should-fix / high；INV-6 白紙黑字承諾、實作缺席。
- Objects: `src/components/OverviewView.tsx`, `src/i18n/locales.ts`, `src/styles/index.css`。
- Why: 圖例的「教學版」沒有家；速查版（Sidebar／Map）不適合承載解釋文字。
- Change: Overview 三步之後、CTA 之前**不得**插入（違反 §4.3 順序）；改在 CTA 區塊之後新增可收合的「符號說明」段：兩個小節分別列 span 層（符號＋一句話語意）與 skeleton 層（形狀＋一句話語意），預設收合，不影響首屏順序 badge→標題→用途→三步→CTA。
- Blast radius: 僅 Overview 尾部 DOM 與 locales 新 key；CTA 前資訊順序不變。
- Rollback: 單獨 revert；Overview 回 SA-01 後狀態。
- Acceptance: DOM 順序測試證明 badge→標題→用途→三步→CTA 順序不變且圖例段在 CTA 之後；zh-TW／EN key 同卡補齊。`npm.cmd test`、typecheck、build、`git diff --check` exit 0。人工：390 寬圖例可讀、預設收合。
- Commit: `feat(workspace): add overview symbol guide`

### SA-03 — 「重播」改名「逐步瀏覽」＋陳舊文案與死鍵清理
- Severity/Confidence: should-fix / high；使用者已拍板改名；死鍵與陳舊指引已 grep 定位。
- Objects: `src/i18n/locales.ts`, `src/components/Header.tsx`（僅文案引用）, 相關測試。
- Why: 見 §1 P3、P4。
- Change:
  1. `header.replay`→「逐步瀏覽」／EN "Step through"；`header.pause` 維持「暫停」；`header.replayControlsLabel` 等 aria 文案同步改為逐步瀏覽語彙；`overview.steps.readBody`、`main.infoBody` 中的「重播」一併改。
  2. `main.infoBody`「右上『講解來源』」改為「設定匣中的『講解來源』」（zh／EN 同步）。
  3. 刪除無引用死鍵：`fb.*` 全節、`header.modes`；刪除後 `rg` 驗證無殘留引用。
  4. 不改 `play()`／`pause()` 行為、間隔、狀態機；只動文字。
- Blast radius: 僅 locales 與引用點；EN 由 `typeof zhTW` 型別約束，缺鍵即編譯錯。
- Rollback: 單獨 revert。
- Acceptance: `rg -n "重播" src` 無輸出（測試 fixture 除外，如有需逐條標記理由）；`rg -n '"fb"|modes' src/i18n/locales.ts` 無輸出；`rg -n "fb\.|header.modes" src` 無輸出；`npm.cmd test`、typecheck、build、`git diff --check` exit 0。人工：zh／EN 切換後按鈕、Overview 第 2 步、info-box 文案一致，無 raw key。
- Commit: `refactor(i18n): rename replay to step-through and prune stale copy`

### SA-04 — 收合結果區塊帶證據摘要
- Severity/Confidence: should-fix / medium-high；純 view 層，不動管線。
- Objects: `src/components/parts.tsx`, `src/components/SpanCard.tsx`（傳入摘要）, `src/i18n/locales.ts`, `src/styles/index.css`，相關測試。
- Why: 見 §1 P5；使用者不展開就無法判斷「這次操作有沒有拿到東西」。
- Change: `IOBlock` head 在收合狀態顯示「標題 · N 行 · 首行前 60 字」單行摘要（超出以 … 截斷、`white-space` 單行省略）；展開後摘要隱藏。錯誤結果維持現有預設展開與紅色語意不變。摘要由現有 `text` 於 render 時計算，不新增管線欄位。
- Blast radius: 卡片收合列高度微增；虛擬清單靠既有 remeasurement 吸收；Reader closed DOM≤250 不得失守。
- Rollback: 單獨 revert。
- Acceptance: 單元測試涵蓋空字串、單行、多行、超長首行截斷；`npm.cmd run benchmark:r5 -- <new-metrics.json>` result pass（Reader DOM cap 未破）；`npm.cmd test`、typecheck、build、`git diff --check` exit 0。人工：收合的 WebSearch／Read 結果不展開即可見行數與首行。
- Commit: `feat(reader): show collapsed result evidence summary`

### SA-05 — Minimap 改為 React SVG（INV-17 字面對齊）
- Severity/Confidence: nice-to-fix / high；無安全風險，純合約字面。
- Objects: `src/components/ReaderMinimap.tsx`, `src/styles/index.css`。
- Why: 見 §1 P6。
- Change: 把 data-URL background 改為 inline `<svg aria-hidden>` 子元素，幾何計算與視覺輸出不變（軌道、landmark／cluster path、viewport 框、目前位置圓點、尺寸斷點）；按鈕語意（整體開圖、aria）不變。
- Blast radius: 僅 Minimap 內部 render 方式；Map DOM cap 與互動不動。
- Rollback: 單獨 revert。
- Acceptance: `rg -n "encodeURIComponent|backgroundImage" src/components/ReaderMinimap.tsx` 無輸出；`npm.cmd test`、typecheck、build、`git diff --check` exit 0。人工：740／1280 Minimap 視覺與 GN-10 相同、點擊仍只開圖。
- Commit: `refactor(map): render minimap as react svg`

### SA-06 — 文件與帳本對齊（收尾卡）
- Severity/Confidence: blocker / high；GN-08 教訓——文件保留舊語彙會讓下一個實作者依錯誤文件修改。
- Objects: `docs/USER_GUIDE.md`, `docs/PROGRESS.md`, `docs/ACCEPTANCE.md`, `references/DIT-tickets.md`（T-006）, `docs/BACKLOG.md`（如有增量）。
- Why: USER_GUIDE 第 3、4 節仍寫「重播」與舊圖例描述；PROGRESS／ACCEPTANCE／tickets 需記錄 R5.5 真實狀態。
- Change: USER_GUIDE 改用「逐步瀏覽」語彙並依 SA-01/02 更新圖例描述（span 層在 Sidebar、skeleton 層在 Map、教學版在 Overview）；PROGRESS 新增 R5.5 段（新段落，不覆寫既有內容）；ACCEPTANCE 附加 §4 增量清單；T-006 記錄各卡 commit 與證據。不得把自動化綠燈寫成視覺驗收；T-005／T-006 只有使用者完成真實環境 UAT 後才可 done。
- Blast radius: 僅文件；不動程式。
- Rollback: revert 本卡只回退文件。
- Acceptance: `rg -n "重播" docs/USER_GUIDE.md` 無輸出；`npm.cmd test`、typecheck、build、`git diff --check` exit 0（證明文件卡未夾帶程式變更）。
- Commit: `docs(r5.5): align guide, progress and tickets`

## 4. 最終人工驗收（R5.5 增量）

完成 SA-01～SA-06 後，與 R5 §10 清單合併執行；本輪新增：

1. **圖例對齊**：740／1280 Sidebar 圖例逐符號對照正下方樹列；Map 圖例逐符號對照地圖形狀；任一表面內無一符多義。
2. **Overview 圖例**：首屏順序不變；符號說明預設收合、展開後兩層分節可讀；390 不水平溢出。
3. **改名**：Header 按鈕、Overview 第 2 步、info-box 均為「逐步瀏覽」語彙；EN 對應；行為與 GN-10 相同（逐卡前進、再按暫停）。
4. **證據摘要**：收合結果列可見「N 行＋首行」；展開後不重複；錯誤結果仍預設展開。
5. **回歸**：M 快捷鍵、Map Jump、cluster 不可跳、50 MiB 載入／取消、雙語切換全數不變。

視覺類仍以使用者真實環境確認為準；自動化與 production preview 不能代替。R5（T-005）與 R5.5 一併於此輪 UAT 後收尾，才進 R6。

## 5. 延後清單（本輪明確不做）

注意：**R6 的已批准範圍是匯出（JSON＋靜態 HTML 快照，ADR-013）＋多 session 型別保鮮，僅此而已**。下列項目一律進 `docs/BACKLOG.md`（未排程），不得被視為 R6 範圍的一部分；任何人要把它們排入某輪，需先取得使用者裁定。

| 項目 | 層 | 去向 |
|---|---|---|
| Adapter 未知型別寬容收納（`system` 摺疊為未分類事件、warning 聚合「system ×N」） | 後端管線 | BACKLOG（未排程）；使用者 2026-07-20 裁定先不動管線 |
| Session 標題 fallback（第一個使用者意圖生成標題，取代「未命名 session」） | 後端管線（normalizer） | BACKLOG（未排程）；同上 |
| Sidebar 連續同類操作聚合（取證 ×5 可展開） | UI＋view model | BACKLOG（未排程）；需新增摺疊層級決策 |
| 底部 timeline scrubber／Minimap 語意重定位 | 新 UX 語意 | BACKLOG（未排程）；需另立 UX 決策 |
| 操作卡單行壓縮模式（圖示＋工具名＋摘要＋狀態燈） | 卡片重設計 | BACKLOG（未排程）；與編輯排印風驗收相關 |
| 跨 session 統計／agent 行為分析層 | 產品方向 | RPD D-5 既定擱置；另立契約 |
