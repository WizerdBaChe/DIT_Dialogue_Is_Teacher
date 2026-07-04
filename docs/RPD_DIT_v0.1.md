# DIT — Dialogue Is Teacher｜需求與開發文件 (RPD) v0.1

> *Idea → Requirement → Feasibility → MVP → 技術規格*
> 本文件為專案第一份文件資產，後續設計與實作以此為依賴基準。
> 標記 `【假設】` 者為待你確認之預設值；標記 `【待確認】` 者為尚未決定、需補資訊之項目。

---

## 決策鎖定 (v0.2 — 2026-06-25)

以下為已拍板事項，取代先前的【待確認】：

| # | 決策 | 影響 |
|---|------|------|
| D-1 | **MVP 直接走 Vite + React + TypeScript**（不做原生單頁過渡版） | 朝最終方向；獨立的純 HTML「概念展示頁」另行提供，僅供溝通、不進產品碼 |
| D-2 | Lobby 嵌入由你後續處理 | 本專案不為嵌入做特別設計，但保持為標準靜態產物 |
| D-3 | **隱私採「方便優先 + 使用者選擇」**：提供 `none/ollama/cloud` 切換，並附足夠說明以釐清責任 | 需求新增「Provider 選擇 UI + 責任說明文案」 |
| D-4 | **講解層優先做本地 Ollama**（較複雜且為賣點）；介面抽象化，雲端 API 為日後可插拔 | LLMProvider 介面先以 ollama 落地，cloud 為實作樁 |
| D-5 | 個人技能庫/多 session 擱置，但**架構須預留擴充性** | Span Tree 與儲存層設計須可容納多 session，不得寫死單 session 假設 |

### 工程設計準則（貫穿全專案）
本專案以系統工程師核心哲學開發，所有設計與實作須滿足：

- **可擴充 (Extensible)**：來源 adapter、LLM Provider、視圖、降噪規則皆為可插拔模組，新增不動核心。
- **低耦合 (Low Coupling)**：以明確介面隔離各層（Adapter / Normalizer / Annotator / Renderer）；資料以 Span Tree 契約傳遞，模組間不直接相依實作。
- **可自檢 (Self-checking)**：解析/正規化具 schema 驗證與容錯（未知型別不崩、損壞行跳過並記錄）；提供開發期 invariant 檢查與健康檢查點。
- **可維護 (Maintainable)**：TypeScript 強型別、模組單一職責、命名一致、關鍵決策就近註解。
- **資產文件清晰 (Documented)**：維護本 RPD、架構決策紀錄(ADR)、以及**進度文件與段落文件**（每里程碑/段落留下可追溯紀錄）。
- **資料流可追蹤 (Traceable Data Flow)**：每個 Span 保留 `raw` 原始事件可回溯；Provider 標註來源；資料自來源→渲染全程可定位「畫面元素來自哪一條原始事件」。

---

## A. 專案基本資訊

| 項目 | 內容 |
|------|------|
| 專案名稱 | **DIT — Dialogue Is Teacher**（對話即教師） |
| 版本 | v0.2 |
| 作者/負責人 | weibaphoto（單人開發）【假設】 |
| 日期 | 2026-06-25 |
| 一句話摘要 | 把 AI coding agent 的執行軌跡（思考＋操作＋結果）轉成可學習的結構化節點視圖，讓 vibe coding 從「下指令＋批准」升級為「從實作中學會怎麼做」。 |

---

## B. 問題與價值確認

### 核心問題
- **要解決的問題**：使用 Claude Code / CC 插件 / Codex 等 agent 時，完整的思考與操作過程雖然看得到，但呈現為一長串密密麻麻的文字與指令；使用者只是不斷「批准」，無法從中**結構化地學習「為什麼這樣做、這是什麼通用做法」**。
- **問題為什麼存在**：原始 transcript 是為「即時互動」設計，不是為「事後學習」設計——資訊密度高、噪音多（重試、失敗、冗長輸出）、缺少抽象與教學層。
- **現在的人如何解決**：自己回頭翻 log、靠記憶、或乾脆不學（純黑箱使用）。
- **現有方案缺點**：LLM tracing/observability 工具（LangGraph Studio、Agent Prism 等）是給**開發者除錯**用，不是給**使用者學習**用——它們呈現「發生了什麼」，但不解釋「為什麼、以及你下次該怎麼做」。
- **不解決的影響**：vibe coding 普及後，使用者技能不增反退，淪為「只會按同意的人」。

### 價值主張
- **主要價值**：把一次性的 agent 執行軌跡，轉化為**可複用、可學習的知識節點**。
- **對使用者的具體好處**：(1) 降噪——一眼看懂任務的關鍵步驟骨架；(2) 解釋 why——每步附「為什麼這樣做」；(3) 抽象——從「這次怎麼做」上升到「這類問題的通用做法」；(4) 重播——像播放器一樣一步步走過任務。
- **比現有方案更好的地方**：教學導向（非除錯導向）＋ 在地隱私（可純本地 Ollama，code/log 不出機器）＋ 輸入端對 Claude Code 幾乎零成本（直接讀官方結構化 `.jsonl`）。

---

## C. 使用者與情境

- **主要使用者**：使用 AI coding agent、但想真正學會技術而非黑箱操作的開發者／學習者。
- **次要使用者**：想回顧／分享自己 agent 工作流程的人；做教學內容的人。
- **使用場景**：完成一次 agent 任務後，想「複盤」這次到底做了什麼、學到什麼。
- **觸發時機**：任務結束後、或想把某次精彩的 session 整理成教材時。
- **使用頻率**：每次有價值的 session 後（非高頻，但黏著）。【假設】

### 典型使用流程
```
開始
  ↓ 使用者選擇一個 Claude Code session（讀取 .jsonl）
  ↓ 系統解析 → 正規化為 Span Tree（結構化節點）
  ↓ 確定性規則降噪／分組（重試、連續編輯同檔等折疊）
  ↓ [可選] 啟用講解層：逐節點切 chunk 丟 LLM（無／Ollama／雲端 API）
  ↓ 渲染為雙欄儀表板（左側樹＋右側卡片）＋ 局部分支圖
  ↓ 使用者瀏覽／展開思考層／step-through 重播
完成（學會這次的「怎麼做」）
```

---

## D. 利害關係人

- **使用者**：見 C。
- **開發者**：weibaphoto（單人）【假設】。
- **維運者**：同上（本地工具，維運極輕）。
- **決策者**：weibaphoto。
- **外部相依**：Claude Code 的 `.jsonl` 格式（非公開、可能隨版本變動）；Ollama（本地）；Claude API（可選）。

---

## E. 需求定義

### 功能需求 (FR)
- **FR-1**　讀取單一 Claude Code session `.jsonl`（檔案上傳或本機路徑），解析每行事件。
- **FR-2**　將事件正規化為統一的 **Span Tree** JSON schema（見 §H/§附錄 schema）。
- **FR-3**　確定性降噪／分組：折疊重試、連續編輯同檔、冗長輸出，標記 milestone/decision/error。
- **FR-4**　以雙欄儀表板渲染（左側目錄樹＋右側卡片），思考層可展開。
- **FR-5**　step-through 重播：可一步步「播放」session。
- **FR-6**　【可選層】教學講解：逐節點切 chunk 產生 `{what, why, generalLesson}`，支援三種 Provider：`none`／`ollama`(本地)／`cloud`(Claude API)，可切換。
- **FR-7**　局部分支圖：在 subagent／重試分叉處渲染小型節點圖。
- **FR-8**　匯出：可將處理後的 Span Tree JSON 與渲染結果存檔／分享。【次要】

### 非功能需求 (NFR)
- **效能**：單一中型 session（數百事件）解析＋渲染 < 2s；逐節點 LLM 講解可背景並行＋快取。
- **安全/隱私**：預設不外傳；本地 Ollama 路線下 code/log 完全不出機器；雲端路線需明確告知並由使用者自備 key。
- **可用性**：MVP 可純前端離線運作（單檔／靜態）。
- **可維護性**：來源解析做成 adapter 介面，新增來源不動核心。
- **擴充性**：LLM Provider、來源 adapter、視圖皆為可插拔模組。
- **成本限制**：MVP 零成本（純前端＋本地）；雲端 API 為使用者自費可選。

---

## F. 約束與風險

| 風險 | 影響 | 緩解 |
|------|------|------|
| `.jsonl` 格式無官方文件、隨版本變動 | 解析破裂 | adapter 隔離＋寬鬆解析（未知欄位略過不崩）＋版本標記 |
| 小模型講解品質不穩 | 教學價值打折 | 逐節點 chunk（範圍小好做）＋全局摘要走規則或雲端 |
| 全局摘要需大 context | 小模型吃力 | 拆任務：逐節點→小模型；全局→規則/雲端 |
| 「學習價值」抽象難量化 | 產品定位模糊 | MVP 先驗證「降噪＋結構呈現」這個確定有感的價值，再疊講解 |
| 隱私疑慮（log 含原始碼） | 使用者卻步 | 本地優先、預設不外傳、明確 opt-in |

---

## G. CIM 層：情境與業務描述

- **使用流程**：見 §C 典型流程。
- **角色與互動**：單一使用者本機操作；無多人協作、無帳號系統（MVP）。
- **業務規則**：(1) 一次處理一個 session；(2) 講解層完全可選且預設關閉；(3) 任何外傳行為須使用者明確同意。
- **外部系統**：Claude Code 檔案系統（讀）、Ollama 本地 API（可選）、Claude API（可選）。
- **邊界條件**：超大 session 需分頁／虛擬化；損壞或非預期格式的行需容錯跳過並提示。

---

## H. PIM 層：平台獨立設計

### 核心模組
```
[Source Adapter]  →  [Normalizer]  →  [Span Tree (canonical JSON)]
                                            │
                          ┌─────────────────┼──────────────────┐
                          ▼                 ▼                  ▼
                  [Denoise/Grouper]  [LLM Annotator(可選)]   [Persistence/Export]
                   (確定性規則)        (Provider介面)
                          │                 │
                          └────────┬────────┘
                                   ▼
                            [View Renderer]
                  雙欄 SpanCard 視圖 + 局部分支圖 + step-through 重播
```

### 模組職責
- **Source Adapter**：把特定來源轉成中介事件流。v1 只實作 `ClaudeCodeJsonlAdapter`。介面：`parse(raw) → Event[]`。
- **Normalizer**：Event[] → Span Tree（建立 parent/child、排序、時間、型別）。
- **Denoise/Grouper**：套確定性規則產生分組與標籤（見下）。
- **LLM Annotator**：對每個 span（或群組）切 chunk，呼叫 `LLMProvider.annotate(span, context)` 取得 `{what, why, generalLesson, confidence}`；結果以 span 內容雜湊為 key 快取。
- **View Renderer**：消費 Span Tree 渲染 UI。

### 確定性降噪規則（不需 LLM）
- 連續對同一檔案的多次 `Edit` → 折疊為「反覆修改 X」群組。
- `tool_use` 後緊接失敗 `tool_result`（error）再重試 → 標記 `retry`/`error`。
- 冗長 `tool_result`（如大檔讀取） → 預設摺疊、僅顯示摘要行。
- subagent 區段 → 收成可展開的巢狀群組。
- 任務分界（使用者新訊息） → 標記 `milestone`。

### 資料流（教學層的 chunk 策略）
- **逐節點講解**：每個 span 是一個 chunk，附「最小必要上下文」（前一步動作 + 使用者當前意圖摘要）→ 小模型/本地即可勝任，可並行。
- **全局摘要/分組**：走確定性規則，或（可選）雲端大模型；不丟給小模型。

### 狀態轉移（重播）
`idle → loaded(已解析) → playing(逐步前進) → paused → done`；播放游標即 span 順序索引。

---

## I. PSM 層：平台特定設計（技術規格）

> 技術選型考量你的偏好排序假設為：**驗證速度 > 開發速度 > 擴展性 > 可維護性**【待確認】，以及本專案隸屬你的「HTML Tools Lobby」工具集。

### 技術棧建議（分階段，避免一開始就背後端）
- **Phase 1（MVP，純前端零後端）**
  - 語言/框架：原生 HTML + CSS + TypeScript（或 ESM JS），可選 Vite 做開發體驗。沿用你提供的雙欄樣板。
  - 檔案讀取：瀏覽器 `File API`（使用者選 `.jsonl`），完全在前端解析。
  - 狀態：輕量即可（少量模組化 JS / 或 Zustand 若上 React）。
  - 部署：靜態檔，直接放進 HTML Tools Lobby。**零成本、可離線。**
- **Phase 2（教學層，本地優先 — 見 D-4）**
  - **Ollama 路線（優先落地）**：瀏覽器直連 `http://localhost:11434`（設 `OLLAMA_ORIGINS` 允許跨域）即可免後端；或加極薄本地 proxy（Node/Express 或 Python/FastAPI）負責 chunk 編排、並行限流、快取。
  - **雲端路線（介面預留、樁實作）**：抽象在同一 `LLMProvider` 介面下；日後可接 Claude API 或免費雲端 API（如 NVIDIA 等）。涉及外傳，須走 Provider 選擇 UI 並顯示責任說明（見 D-3）。
  - 模型建議：本地逐節點講解用 7–8B coder 級小模型（如 Qwen2.5-Coder 7B）即可；全局摘要走規則或（日後）雲端大模型。
- **Phase 3（擴充）**
  - 新增 `CodexAdapter`、貼上文字 adapter（正則＋LLM 還原）；可選持久化（IndexedDB／SQLite）。

### 框架取捨（已定案 — 見 D-1）
- **MVP 直接採 Vite + React + TypeScript**：狀態用 Zustand、分支圖用 React Flow、樣式沿用提供的雙欄樣板 design tokens。
- 不做原生單頁過渡版；純 HTML 僅用於本文件外的「概念展示頁」溝通用途（`docs/demo/concept_demo.html`）。

### API / 介面設計（內部）
```ts
interface SourceAdapter { id: string; parse(raw: string): RawEvent[]; }
interface LLMProvider {
  id: 'none' | 'ollama' | 'cloud';
  annotate(span: Span, ctx: AnnotateContext): Promise<Annotation>;
}
```

### 部署環境 / 監控
- MVP：靜態託管（本機 / GitHub Pages / Lobby 內）。
- 日誌：MVP 無需後端日誌；Phase 2 薄後端可加本地 console / 簡易檔案 log。

---

## J. 實作規劃

### 里程碑
- **M1（MVP，純前端）**：`.jsonl` → Span Tree → 雙欄渲染 + 思考層展開 + 確定性降噪。**驗證核心價值。**
- **M2**：step-through 重播 + 局部分支圖。
- **M3**：LLM Annotator（`none`/`ollama` 先行）+ chunk 編排 + 快取。
- **M4**：雲端 API 路線 + 匯出/分享。
- **M5**：跨來源 adapter（Codex／貼上）。

### 任務拆解（M1）
1. 取樣本：用本專案現有 `.jsonl` 當 fixture。
2. 寫 `ClaudeCodeJsonlAdapter`：逐行 parse，辨識 `thinking/tool_use/tool_result/user/assistant/subagent`。
3. 寫 `Normalizer`：建 Span Tree（parent/child、order、time）。
4. 寫 `Denoise` 規則（折疊重試/連續編輯/長輸出）。
5. 套樣板渲染：左樹由 Span Tree 生成、右卡片顯示 what + 思考層（`.ts-logic`）。
6. 容錯：未知型別不崩、損壞行跳過並提示。

### 優先順序
M1 必做 → M3（講解層，產品差異化）→ M2 → M4 → M5。

### 依賴項
Claude Code `.jsonl` 樣本（已有）；Ollama 本機安裝（M3）；Claude API key（M4，使用者自備）。

---

## K. AI 分析輸出（Product Strategy / System Architect / Software Planning 三顧問視角）

### 1. 一句話定義
把 AI coding agent 的執行軌跡，轉成可學習的結構化節點視圖，讓使用者從實作中學會「怎麼做」。

### 2. 真正要解決的核心問題
不是「看不到過程」（過程看得到），而是「過程不可學」——缺少降噪、解釋與抽象，使用者淪為按同意的黑箱操作者。

### 3. 目標使用者與情境
想真正學會技術的 agent 使用者；於每次有價值的 session 後做「可學習的複盤」。

### 4. 成立的前提假設
- (a) Claude Code 的 `.jsonl` 結構穩定到足以解析（已驗證當前版本可行）。
- (b) 使用者願意花時間「複盤學習」，而非只求完成任務。
- (c)「降噪＋結構呈現」本身已有學習價值，講解層是加分而非必要。

### 5. 缺失資訊與待確認事項
- 你的技術棧偏好與優先順序排序（驅動框架取捨）。
- 是否要嵌入現有 HTML Tools Lobby（影響打包方式）。
- 隱私底線（是否完全禁止任何雲端外傳，或允許 opt-in）。
- 是否需要多 session 比較／累積成「個人技能庫」（影響是否要持久化）。

### 6. 產品型態選項（至少 3 種）

**方案 A — 純前端單檔 HTML 工具（建議 MVP）**
- 說明：瀏覽器讀 `.jsonl`，前端解析＋渲染，無後端、無 LLM。
- 優點：零成本、離線、隱私最佳、最快驗證、可直接進 Lobby。
- 缺點：無講解層（只有降噪＋結構）。
- 開發成本：低。技術風險：低。

**方案 B — 前端 + 本地 Ollama（建議成長路線）**
- 說明：A 之上加逐節點講解，瀏覽器直連本地 Ollama 或經薄 proxy。
- 優點：隱私仍佳、補上產品最大差異化（why/通用做法）。
- 缺點：需使用者裝 Ollama；小模型品質需調校。
- 開發成本：中。技術風險：中。

**方案 C — 全功能 SaaS（雲端 API + 帳號 + 分享）**
- 說明：雲端處理、可分享教材、跨裝置。
- 優點：可商業化、低使用門檻。
- 缺點：隱私/成本/合規負擔大、與「讀本機 log」定位衝突。
- 開發成本：高。技術風險：高。**不建議現階段。**

### 7. MVP 建議
- **MVP 目標**：驗證「結構化降噪呈現」是否讓使用者覺得「比看 raw log 更能學到東西」。
- **功能清單**：FR-1～FR-5（解析、正規化、降噪、雙欄渲染、思考層展開、重播）。**不含 LLM。**
- **驗證指標**：使用者能在 < 1 分鐘內講出某 session 的關鍵步驟骨架；主觀「比 raw log 更易學」回饋為正。

### 8. 功能拆解
- **核心**：解析、Span Tree、確定性降噪、雙欄渲染、思考層、重播。
- **次要**：LLM 講解層（Ollama/雲端）、局部分支圖、匯出/分享。
- **未來**：跨來源 adapter、個人技能庫/多 session 比較、教材匯出。

### 9. 商業模式與價值來源
現階段定位為**個人工具/作品集（Lobby 一員）**，非營收導向。若日後商業化：本地版免費、雲端便利/分享/協作為付費點。【待確認】

### 10. 技術架構初稿
- **Frontend**：原生 HTML/TS 單頁（MVP）→ 視成長遷 Vite+React+Zustand（分支圖 React Flow）。
- **Backend**：MVP 無；Phase 2 為極薄 proxy（Node/Express 或 Python/FastAPI）負責 chunk 編排/限流/快取/保護 API key。
- **Database**：MVP 無；如需持久化用 IndexedDB（前端）或 SQLite（後端）。
- **Infrastructure**：靜態託管即可；後端為本機進程。
- **第三方服務**：Ollama（本地，可選）、Claude API（雲端，可選、使用者自備）。

### 11. 最大風險與未知數
最大風險＝**`.jsonl` 格式變動**（用 adapter 隔離＋寬鬆解析緩解）；最大未知＝**講解層在小模型上的品質**（用逐節點 chunk 縮小範圍緩解）。

### 12. 下一步最該先確認的 5 個問題 — 已於 v0.2 全數拍板
1. MVP 框架 → **Vite + React + TypeScript**（D-1）。
2. Lobby 嵌入 → 由你後續處理（D-2）。
3. 隱私底線 → **方便優先 + 使用者知情選擇**（D-3）。
4. 第一個 Provider → **本地 Ollama 優先，雲端可插拔**（D-4）。
5. 個人技能庫 → 擱置，但**架構預留擴充**（D-5）。

### 13. 開發前確認事項
- **進入設計前必須確認**：已於 v0.2 完成（D-1～D-5）。
- **進入實作前必須確認**：Span Tree schema 欄位定稿（見附錄）、`.jsonl` 樣本涵蓋的事件型別清單。

### 14. AI 建議下一步
**建議：MVP 規劃（MVP Planning）。**
原因：可行性已驗證、價值假設清楚，最大不確定性在於「結構化呈現是否真的有學習感」——這只能靠一個能跑真實 `.jsonl` 的 MVP 來驗證，且該 MVP 成本極低（純前端）。先做 M1 再決定是否投入講解層，是風險/報酬最佳的順序。

### 15. 這個想法最像／不像什麼
- **最像**：Agent trace 視覺化工具（LangGraph Studio、Agent Prism）的 `TreeView+SpanCard` 模式；程式碼複盤/教學工具；session replay。
- **不像**：即時 agent 操控台（它是事後複盤，非即時）；通用 LLM observability（它是教學導向，非除錯/監控導向）；聊天記錄美化器（它做語意降噪與抽象，非排版）。

---

## 附錄：Span Tree Canonical Schema（草案 v0.1）

```jsonc
{
  "schemaVersion": "0.1",
  "session": {
    "id": "string",
    "source": "claude-code",          // 來源 adapter id
    "tool": "claude-code",
    "title": "string",
    "projectPath": "string",
    "startedAt": "ISO-8601",
    "model": "string|null"
  },
  "spans": [
    {
      "id": "string",
      "parentId": "string|null",       // 巢狀：subagent / 重試群組
      "order": 0,                        // 線性播放順序
      "type": "user_msg|assistant_msg|thinking|tool_use|tool_result|subagent|group",
      "startedAt": "ISO-8601|null",
      "durationMs": 0,
      "summary": "string",              // 一行摘要（降噪後顯示）
      "raw": { },                        // 原始事件（保底可回溯）
      "tool": {                          // 僅 type=tool_use
        "name": "Read|Edit|Bash|...",
        "params": { "filePath": "...", "command": "..." }
      },
      "tags": ["retry","error","decision","milestone"],
      "annotation": {                    // 由 LLM Annotator 產生，可選
        "what": "string",
        "why": "string",
        "generalLesson": "string",
        "confidence": 0.0,
        "provider": "none|ollama|cloud"
      }
    }
  ],
  "groups": [                            // 降噪分組
    { "id": "string", "label": "反覆修改 foo.ts", "spanIds": ["..."], "kind": "edit-loop|retry|subagent|verbose" }
  ]
}
```

---

## 變更紀錄
| 版本 | 日期 | 修改內容 | 原因 |
|------|------|---------|------|
| v0.1 | 2026-06-25 | RPD 初稿，整合需求確認單與規格模板 | 建立第一份文件資產 |
| v0.2 | 2026-06-25 | 鎖定 D-1～D-5 決策、新增工程設計準則、產出概念展示頁 | 5 項關鍵決策拍板，進入設計階段 |
