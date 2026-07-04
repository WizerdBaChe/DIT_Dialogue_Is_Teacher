# DIT 待辦備忘 (Backlog / Memo)

> 已決定但尚未實作的項目。最高優先在上。對應討論：2026-06-25。

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
- 已修：Ollama 逾時、檔案讀取錯誤、輸入過大軟警告（見 docs/REVIEW_2026-06-25.md）；
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
