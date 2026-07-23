# DIT 待辦備忘 (Backlog / Memo)

> 已決定但尚未實作的項目。最高優先在上。對應討論：2026-06-25。

## 📌 2026-07-23 R7 Part B 收尾新增

- [ ] **Codex 子代理協作事件的專屬視覺呈現**：R7B-00／R7B-05 用真實樣本發現 Codex 已有
  `inter_agent_communication_metadata`／`event_msg/sub_agent_activity`／`response_item/agent_message`
  等子代理協作事件（§B1／B4.2 撰寫時的樣本沒有），本輪刻意只讓它們落入通用的寬容收納
  （聚合成「型別 ×N」warning，卡片顯示「未知事件：X」），沒有比照 Claude Code `isSidechain` 的
  子代理群組視覺。是否要做、怎麼對映到 DIT 既有的「子代理」概念，留給下一輪評估
  （見 [R7B_BASELINE_2026-07-23.md](rounds/r7-multi-source-and-layout/R7B_BASELINE_2026-07-23.md) 觀察 2）。
- [ ] **Codex adapter 真實樣本驗證擴大到 ≥5 份檔案**：PSM §9.1 開放問題 3 要求擴到 ≥5 份真實檔案、
  偏離 >10% 即停工回報；R7B-05 本輪只驗證了 3 份（§B1 原樣本＋兩份新樣本）。第三份樣本的巢狀事件
  配對率量到 73%，逐筆核對後確認落差成因是 `context_compacted`（歷史壓縮）讓原始呼叫消失，屬於
  資料限制、非邏輯缺陷，判斷不需要為此停工——但門檻確實沒有補滿，若有更多 Codex 樣本應優先拿來驗證。

## 📌 2026-07-23 R7 Part A 收尾新增

- [ ] **全站 `--fs-*` 字級階梯對齊**：R6.5 LS-01 建立了 `--fs-3xs`～`--fs-2xl` 九階，但當時只把
  `--ui-scale` 這個「單一旋鈕」貫徹到全站，字級的「比例階梯」本身仍是虛設——全站 100 餘處字級仍是
  各自的行內字面值（`calc(Npx * var(--ui-scale))`），彼此不對齊九階。R7A-06 只在本輪觸及的
  header／settings／layer-card／io-head 選擇器內收斂（見
  [PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md](rounds/r7-multi-source-and-layout/PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md) A1.6／R7-INV-5），
  刻意不擴大範圍。全站清掃需要新一輪逐選擇器核對（哪些該精確對齊、哪些是刻意的階梯外特例），
  獨立排程，不得順手夾帶。
- [ ] **`@container` 成對 min/max 斷點的縫隙稽核**：R7A-05 施工時發現 `.app-shell` 量到的
  container inline-size 可能是小數（如 899.33px），會讓成對的 `(min-width:720px) and
  (max-width:899px)` 型斷點漏接，靜默落回基準值。已用 spawn_task 提醒稽核 `index.css` 內其他既有
  的成對 min/max 斷點（如品牌短名切換、Session 地圖 dialog 尺寸）是否有同樣的縫隙；本輪只修了
  R7A-05 新增的三級 `--chrome-scale`，其餘既有斷點未動。

## 📌 2026-07-20 盤點（R5.5 合約定稿時）

**狀態校正**——下列舊段落已被後續輪次完成或取代，僅留作歷史，不得再作為施工依據：

- 「🐟 認知學習模式（魚骨橫向視圖）」整段：已被 R5 Session Map（`PSM_R5_GUIDED_NAVIGATION_v1.0.md`，G1 決策）**取代**；魚骨語彙改以 Map overlay 存在，「高密度 ⇄ 認知」模式切換已移除，React Flow 升級路線由 R5 合約 §6.1 明確拒絕。
- 「接本地 Ollama 實測」：R2 已完成（2026-07-18）。
- 「響應式／行動裝置版面」「大檔虛擬化與漸進載入」：R5 已完成。
- 「pipeline 單元測試」「自動化測試」：R1 已完成。
- 「subagent 跨檔串接」：R4 已完成。

**新增（來自 R5.5 設計重新分析，未排程；排入任一輪前需使用者裁定）**：

- [ ] Adapter 未知型別寬容收納：`system` 等合法型別摺疊為「未分類事件」、warning 聚合為「型別 ×N」，因應 Claude Code JSONL schema 無穩定保證。→ **2026-07-21 使用者裁定：改列 R7 候選**（見下方 R7 段）。
- [ ] Session 標題 fallback：無 `ai-title` 時以第一個使用者意圖生成標題（規則式，免 LLM），取代「未命名 session」。→ **2026-07-21 使用者裁定：改列 R7 候選**（見下方 R7 段）。
- [ ] Sidebar 連續同類操作聚合（如「取證 ×5：Read ×2, WebSearch ×3」可展開），需先拍板摺疊層級語意。
- [ ] 底部 timeline scrubber／Minimap 語意重定位（需另立 UX 決策）。
- [ ] 操作卡單行壓縮模式（圖示＋工具名＋一句結果摘要＋狀態燈），與編輯排印風驗收相關。
- [ ] 跨 session 統計／agent 行為分析層（RPD D-5 解凍後另立契約）。

## 📌 2026-07-21 R5.5 施工期間新增觀察（未排程；均為低風險，非本輪範圍）

- [ ] `header.modeGroupLabel`（`src/i18n/locales.ts`）為無引用死鍵——SA-03 只依合約明確列出的 `fb.*`／
  `header.modes` 兩項清除，此鍵未被列入卡片 Change list，故本輪未動；若下一輪做 i18n 死鍵清掃可一併處理。
- [ ] R5.5 SA-04 的「Reader 封閉 DOM ≤250」自動化查核在此開發沙盒（無法操作 OS 檔案選取對話框，改以合成
  `DataTransfer` 觸發 50 MiB fixture 載入）下量測不穩定，重複重載出現 200～276 的雜訊，可歸因於 Structure
  側欄虛擬清單掛載列數對 resize／navigate 時序敏感。SA-04 已改用零 DOM 增量設計規避風險，但這代表未來任何
  觸碰 Reader／Sidebar DOM 數量的卡片都應在真實瀏覽器（而非本沙盒的合成檔案載入）重新量測，不能沿用此輪
  沙盒內數字作為唯一證據。

## 📌 2026-07-21 R7 候選：多來源接入（Codex adapter）— ✅ 2026-07-23 施工完成，待 ACCEPTANCE.md §23 UAT

> 完整設計分析與 Codex 格式實測證據見 [DESIGN_R7_MULTI_SOURCE_v0.1.md](rounds/r7-multi-source-and-layout/DESIGN_R7_MULTI_SOURCE_v0.1.md)（pre-PSM 草稿）；本段只記排程與範圍。
> 施工結果見 `PROGRESS.md` 的「R7 Part B」段落與 `docs/rounds/r7-multi-source-and-layout/R7B_BASELINE_2026-07-23.md`；
> 施工中發現的新候選項移至本文件開頭「2026-07-23 R7 Part B 收尾新增」。

**排程順序（使用者 2026-07-21 拍板）**：R5.5 UAT 收尾 → R6（範圍不變：匯出＋多 session 型別保鮮）→ **R7 多來源輪**。R6 期間不擴範圍；唯一順手事項是型別保鮮不得把 Claude 專屬假設寫進快照渲染器（SA-INV-5 常數同源已在擋）。

**R7 範圍（同一輪打包，爆炸半徑同在 ingest／normalize 層，一次設計、一個回歸面）**：

- [x] `SourceAdapter` 介面補增量 accumulator（如 `createAccumulator()`），修正 `jsonlStream.ts` 寫死 `ClaudeCodeJsonlAccumulator` 的耦合——否則 50 MiB streaming 路徑永遠 Claude 專屬。（R7B-01）
- [x] Adapter 未知型別寬容收納（自上方 2026-07-20 清單移入）。（R7B-02）
- [x] Session 標題 fallback（自上方 2026-07-20 清單移入；Codex 無 `ai-title`，此為接入前置條件）。（R7B-03）
- [x] Codex jsonl adapter 本體（來源樣本：`~/.codex/sessions/**/rollout-*.jsonl`，2026-07-21 已對照實際資料評估，`RawEvent` 抽象覆蓋率約八成）。（R7B-04）

**R7 開工前需使用者拍板的三個決策點**（寫進該輪 PSM 問題定義）——**皆已拍板並實作**：

1. 雙層去重策略：Codex 對同一內容記 `response_item/*`（模型層）與 `event_msg/*`（UI 層）兩份；預設建議以 `response_item` 為主幹、`event_msg` 只補缺（如明文 `agent_reasoning`）。
   → 拍板成立，見 B4.2 白名單表格與 `codexJsonl.ts` 實作。
2. `turn_id` 對映到 DIT 的哪個結構層（群組？或新概念）；Codex 為扁平流，無 `parentUuid`／`isSidechain`。
   → 拍板為**不新增結構層**（呼應 R7-INV-6），Codex session 呈現為扁平序列；`turn_id` 只用於
   R7B-04 的巢狀事件配對範圍限定，不是持久的 DIT 結構概念。
3. `patch_apply_end` 等高價值事件（含完整檔案變更＋成功旗標）是進寬容收納的「未分類」，還是升格為一級 kind。
   → 拍板為**併入既有 exec 呼叫**（不升格新 kind，零契約變更）：`changes` 併入 `tool_use.toolInput`，
   `success`／`stdout`／`stderr` 併入既有 `tool_result` 文字；配對失敗才降級為 `unknown`。

**已知資料源限制（非 adapter 可修，UI 需接受降級）**：Codex `response_item/reasoning` 為 `encrypted_content` 且 summary 常為空，◇ 思考 span 在 Codex 來源將稀疏、碎片化；工具參數為字串（JS 碼／JSON 字串），adapter 需 parse 或包裝。

## 🐟 認知學習模式（魚骨橫向視圖）— 前端，延後實作
**定位**：低強度「認知學習模式」，與現有「高密度學習模式」並存、可切換。
吃後端已產出的 `doc.skeleton`（DistilledSkeleton preset v1，已完成）。

- [ ] 新增魚骨橫向視圖元件：主線 (spine) 橫向延伸 + 上方觀念 rib / 下方彎路 rib。
- [ ] **時間節點可點擊展開** → 在原地或側邊看到「卡片式單卡內容」（即該節點對應的高密度卡片），
      讓使用者從簡易模式 drill-down 看到「原本發生的內容」（雖也是經過整理的）。
- [ ] 互動：**先做清亮輕量版**（自製 SVG / 簡單橫向捲動），保持可擴充。
- [ ] 升級路線：之後可換 React Flow，做可拖曳、可縮放、可展開分支的真·節點畫布。
- [ ] 模式切換 UI（高密度 ⇄ 認知）與「預設進入哪個模式」設定。
- 參考概念圖：對話中已渲染的 `cognitive_mode_fishbone_concept`。

## 🎨 UI/UX
- [ ] 目前先用「清亮」配色（light tokens 已就緒，集中在 `src/styles/index.css` 的 `:root`）。
- [ ] 使用者將提供 UI/UX skill 做整體調整 → 屆時以 tokens 換膚，不動結構。

## 🧠 講解層（教學 why）
- [ ] 接本地 Ollama 實測逐節點講解品質（provider 已就緒，需本機 Ollama + `OLLAMA_ORIGINS`）。
- [ ] **cloud provider 實作（接 Mistral 免費 API 等）**：UI 骨架已完成（`CloudPanel` + `store.cloudConfig`，
      端點/模型/key 欄位就緒、資料流已通），目前 `cloudProvider.annotate` 仍為樁。屆時只需實作 annotate
      （OpenAI 相容 `/chat/completions`），並考慮 key 安全（目前僅存記憶體）。— 2026-06-26 經使用者拍板「先只做 UI 骨架」。
- [ ] **單節點 token 速率 / 進度條**：目前進度為「節點層級」(done/total)。要顯示單節點內部 it/s 與
      逐字進度，需改用 Ollama streaming（`stream:true` 讀 chunk）並在 provider/store 加串流回呼。
      緩解焦慮的節點層級進度 + 停止已先上線（2026-06-26）。

## 🧪 系統檢查 (2026-06-25 review) 衍生
- [ ] 響應式 / 行動裝置版面（前端 6.1 / 5.6）— 目前桌面優先。
- [ ] 大檔虛擬化與漸進載入（後端 3.7 / 前端 9.5）。
- [ ] 自動化測試：pipeline 快照（adapter→denoise→distill）、關鍵元件（後端 3.11）。
- [ ] 螢幕閱讀器實機測試（前端 7.4）。
- [ ] 雲端階段再加斷路器 / 重試策略（後端 6.6 / 6.7）。
- [ ] **npm audit（dev-only）**：esbuild ≤0.24.2 / vite ≤6.4.2（GHSA-67mh-4wv8-2f99）。僅影響本地 dev server，
      不影響 production 產物。唯一根治是升 vite@8（破壞性）。風險低，暫不升；待之後需要時再做 vite 大版升級 + 回歸測試。
- 已修：Ollama 逾時、檔案讀取錯誤、輸入過大軟警告（見 docs/misc/REVIEW_2026-06-25.md）；
      錯誤卡邊框、Ollama 引導面板、卡片大小字去重（2026-06-26 驗收回饋，見 docs/PROGRESS.md M3）。

## 🛠 後端 / 資料
- [ ] **蒸餾 preset v1 格式待定稿**：`DistilledSkeleton` 的規則與欄位目前為預設版，後續再依魚骨需求調整
      （例如 spine 是否要納入「根因確認」節點、rib 分類粒度、label 來源改用 LLM）。
- [ ] 全局摘要（跨節點濃縮）。
- [ ] subagent 跨檔 (`subagents/*.jsonl`) 串接。
- [ ] pipeline 單元測試（adapter→denoise→distill 快照）。

## ✅ 已完成（移出 backlog 供對照）
- 高密度學習模式（卡片時間軸）+ 降噪/標籤/群組 + 重播。
- 後端蒸餾骨架 DistilledSkeleton preset v1（spine/rib 分類，view-agnostic）。
- 清亮主題換膚（dark → light tokens）。
