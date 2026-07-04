# DIT 開發進度 (Progress Log)

> 段落式進度紀錄，對應 RPD 里程碑。最新在上。

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
