# DIT — PSM v1.0｜平台特定設計定稿 + 剩餘工程藍圖

> 日期：2026-07-04
> 定位：**接手實作 AI 的單一施工入口**。本文件定稿現有契約、統一里程碑編號、
> 並把剩餘工作寫到「按圖施工」等級。上游文件不重寫：
> - [RPD_DIT_v0.1.md](RPD_DIT_v0.1.md)（v0.2）＝需求與決策合約（D-1～D-5 拍板，不得推翻）。
> - [architecture.md](architecture.md)＝已落地結構的 as-built 紀錄。
> - **契約衝突時，以本文件 §2 為準**（RPD 附錄 schema v0.1 草案自此作廢，見 §2.1）。

## 0. 接手者閱讀順序與行為規則

1. 讀 RPD §決策鎖定（D-1～D-5）與工程準則 → 這是不可重新談判的合約。
2. 讀本文件 §2 契約定稿、§3 剩餘藍圖 → 這是施工圖。
3. `src/types/spanTree.ts` 是資料契約的 single source of truth；文件與程式不符時，
   **先查本文件 §2 的差異說明，仍不符則停下記錄提問，不得自行發明**（ADR 規則，見 §4）。
4. 每完成一個里程碑：更新 [PROGRESS.md](PROGRESS.md)（最新在上）、勾 §3 對應驗收項、
   必要時在 §4 追加 ADR。

## 1. 現況基線（as-built，2026-06-26 已過三輪實機驗收）

- 管線：Adapter → Normalizer → Denoiser → Distiller → Validate → ViewModel → Zustand store → React UI，
  單一入口 `buildSessionDocument()`（`src/core/pipeline.ts`）。各層職責見 architecture.md §2。
- 已交付：高密度卡片時間軸、認知模式魚骨視圖（含 drill-down）、確定性降噪
  （milestone/error/retry/decision + edit-loop 群組）、後端蒸餾 `DistilledSkeleton`、
  step-through 重播、LLM 講解層（none/ollama 實作、cloud 為 UI 骨架＋樁）、
  Ollama 引導面板（狀態探測/逾時/keep_alive/num_predict/think 開關）、講解進度條與停止、
  清亮 light 主題（tokens 集中於 `src/styles/index.css :root`）。
- 驗證狀態：`npm run build` 全綠（74 modules）；**無自動化測試**（本藍圖第一優先，見 §3 R1）。
- 已知 dev-only 漏洞：esbuild/vite（GHSA-67mh-4wv8-2f99），僅影響本地 dev server，
  處置維持 BACKLOG 記錄，不在小版本內強升 vite@8。

## 2. 契約定稿（Contracts — 取代 RPD 附錄草案）

### 2.1 Span Tree schema v0.2（定稿）

**權威定義＝`src/types/spanTree.ts` 現行內容**，本節記錄其與 RPD 附錄 v0.1 草案的差異，
以免接手者誤把舊草案當規格：

| 差異 | 實碼現況（以此為準） | 草案寫法 |
|---|---|---|
| `Span.text` | 有——完整內文（思考/訊息/結果全文），與 `summary`（一行摘要）分離 | 無此欄位 |
| `Span.result?: ResultInfo` | 有——`{ isError, text }`，tool_result 結構化 | 無 |
| `Span.tool.params` | `Record<string, unknown>`（不限定鍵名） | 例示 filePath/command |
| `SessionDocument.skeleton?` | 有——`DistilledSkeleton`（§2.2） | 無 |
| 頂層包裝 | `SessionDocument`；多 session 預留 `SessionLibrary`（D-5） | 無包裝型別 |

**演進規則**：欄位只增不改語意；破壞性變更須升 `SCHEMA_VERSION` 並在 §4 記 ADR。
下游（denoise/distill/view/llm）只認此契約，不得繞過契約直讀 raw（`raw` 僅供追溯與除錯顯示）。

### 2.2 DistilledSkeleton preset v1（規則定稿）

實作於 `src/core/distill/distiller.ts`，確定性規則（無 LLM）：

| 產物 | 規則 |
|---|---|
| spine `objective` | 第一個 `user_msg` |
| spine `decision` | 帶 `decision` 標籤的 thinking 節點 |
| spine `outcome` | 最後一個 span（若未已入 spine） |
| rib `error` / `retry` | 帶對應標籤的節點（tool_result 略過，因錯誤已上拋父卡） |
| rib `investigation` | tool_use 且工具 ∈ {Read, Grep, Glob, WebFetch, WebSearch, NotebookRead} |
| rib `edit-loop` | 降噪群組（每群組一條 rib，取首成員為代表） |
| rib 掛載 | 掛到 order 之前最近的 spine 節點 |
| label | `summary` 截 28 字 |

**狀態：格式凍結、規則開放。** 欄位（`SkeletonNode`/`SkeletonRib`）視為 v1 定稿；
規則層留三個已知調整候選（改動任一須記 ADR，並先向使用者確認，因直接影響魚骨視覺密度——UX 語意）：
(a) spine 是否納入「根因確認」類 milestone；(b) rib 分類粒度；(c) label 改由講解層 LLM 產生。

### 2.3 來源層契約（SourceAdapter / RawEvent）

定義於 `src/core/adapters/types.ts`：`SourceAdapter { id, canParse(raw), parse(raw) → ParseResult }`；
`ParseResult = { meta, events: RawEvent[], warnings[] }`。容錯鐵律：**單行損壞不得整體拋例外**，
未知型別收進 warnings。新增來源＝實作介面＋在 `adapters/index.ts` 註冊，其餘不動。

`RawEvent` 已含 `uuid` / `parentUuid` / `isSidechain` / `toolUseId`——這正是 R4（subagent 跨檔）
所需的全部鉤子，屆時不需改契約。

### 2.4 講解層契約（LLMProvider）

定義於 `src/core/llm/types.ts`：`LLMProvider { id, sendsDataOut, annotate(span, ctx) → Annotation|null }`。
- `sendsDataOut` 驅動 UI 責任說明（D-3），任何新 provider 必須誠實設定。
- `AnnotateContext` 刻意精簡（sessionTitle + prevSummary），利小模型與並行——**不要**為了品質
  偷偷塞大上下文，若要擴充 context 欄位須記 ADR。
- Ollama 調用參數（`OllamaConfig`：model/timeout/think/keepAlive/numPredict/numCtx）與
  Cloud 骨架（`CloudConfig`：endpoint/model/apiKey，僅存記憶體）持有於 `src/store/sessionStore.ts`。
- Cloud 實作規格（R3 時生效）：OpenAI 相容 `POST {endpoint}/chat/completions`，
  沿用 `src/core/llm/prompt.ts` 組裝，回應解析與錯誤訊息比照 ollama.ts 的容錯風格；
  key 不落地（不進 localStorage），除非屆時使用者另行拍板。

## 3. 里程碑統一編號與剩餘藍圖

### 3.1 編號對照（消除兩套編號的混亂）

RPD §J 的 M1–M5 與 PROGRESS.md 的 M1/M1.1/M2/M3 **語意不同**（例：RPD M2＝重播+分支圖，
PROGRESS M2＝魚骨）。自本文件起：**已完成階段沿用 PROGRESS 編號視為歷史紀錄；
剩餘工作一律改用 R 編號**，RPD §J 的 M 編號不再引用。

| 歷史 | 內容 | RPD 對應 |
|---|---|---|
| M1 / M1.1 | MVP 骨架＋蒸餾＋清亮主題 | RPD M1 |
| M2 | 魚骨認知模式＋系統檢查 | （RPD 未編列，源自 2026-06-25 雙模式拍板） |
| M3 | 三輪驗收回饋修正＋Ollama 面板＋雲端 UI 骨架 | RPD M3 部分 |

### 3.2 剩餘里程碑（每項含驗收，完成即勾）

**執行順序（2026-07-04 定稿，ADR-012）：R1 → R7 → R2 → R3 → R4 → R5 → R6。**
R3（雲端接入）固定排在 R2 之後——實作時直接沿用 R2 實測得到的 prompt 調校成果；
啟用與否仍由使用者於 UI 中 opt-in，實作完成≠預設開啟。

**R1 — 測試地基（最優先，理由：後續所有 R 都會動 pipeline，沒有快照測試＝每次改動都靠人工回歸）**
✅ 已完成（2026-07-04，見 [PROGRESS.md](PROGRESS.md) R1 段落）
- 範圍：Vitest；(1) [x] pipeline 快照測試——`src/fixtures/sampleSession.jsonl` 經
  adapter→normalize→denoise→distill 的輸出快照；(2) [x] denoiser 規則單元測試（5 條規則各至少一正一反例）；
  (3) [x] distiller 規則單元測試（spine/rib 各 kind）；(4) [x] 容錯測試——損壞行/未知型別/空檔案不崩、warnings 正確。
- 不做：元件測試、E2E（本階段收益低）。
- 驗收：[x] `npm test` 全綠（42 案例）並納入 build 流程說明；[x] 快照檔進版控。
- [x] 新增第二個 fixture：`src/fixtures/subagentSession.jsonl`，含 subagent(isSidechain)/長輸出/多任務分界，為 R4 鋪路。

**R7 — 語言模組 (i18n) + anti-slop 版面（2026-07-04 新增，ADR-009）**
- 範圍：(1) zh-TW / EN 雙語模組——`src/components/labels.ts` 擴為 locale 字典
  （建議自製輕量 hook，不引 i18next 級重庫；理由：字串量小、零依賴、符合單檔工具定位），
  含講解層 prompt 的輸出語言跟隨 UI 語言；(2) 版面去 AI 味——依使用者「plain, deliberate design」
  偏好整體調整，tokens 已集中於 `:root` 可換膚不動結構。
- **前置（UX 語意，實作前必問）**：預設語言、語言切換的位置與形式、視覺方向
  （使用者將提供參考或 UI/UX skill）。實作 session 應搭配現有 skill：
  `design:design-critique`（改版評圖）、`design:design-system`（token 一致性）、
  `design:ux-copy`（雙語文案）、`design:accessibility-review`（對比與鍵盤）。
- 驗收：全 UI 無 hardcode 中文殘留（grep 驗證）；切換語言即時生效且狀態不丟失；
  視覺改版經使用者實機確認（build 綠不算過）。

**R2 — Ollama 講解品質實測（UAT，需使用者本機參與）**
- 範圍：以真實 session 跑 `annotateAll`，評估 7–8B 級模型的 what/why/generalLesson 品質；
  依結果調 `prompt.ts`（僅調 prompt 與參數，不改契約）。
- 驗收（人工清單）：① 10 個節點中 ≥7 個講解「正確且非復述」；② 無整頁崩潰；③ 逾時/斷線提示可讀。
- 產出：一頁品質紀錄（新檔 `docs/UAT_ollama_<date>.md`），含模型名、參數、樣本結論——供日後選模型參考。

**R3 — Cloud provider 實作**（前置：使用者拍板啟用時機與服務商；2026-06-26 已拍板「先只做 UI 骨架」）
- 範圍：依 §2.4 規格實作 `cloudProvider.annotate`；串 CloudPanel 現有欄位；責任說明維持琥珀色警示。
- 驗收：填入有效 endpoint/key 後可產生講解；key 錯誤/超時有可讀錯誤；`sendsDataOut=true` 的橫幅正確。

**R4 — Subagent 跨檔串接 + 局部分支圖**
- 範圍：(1) adapter 層支援讀入主檔＋`subagents/*.jsonl`（多檔輸入→合併 RawEvent，靠現有
  uuid/parentUuid/isSidechain 掛巢，契約不動）；(2) 分支圖先做輕量 SVG（與魚骨同路線），
  React Flow 列為升級選項而非前提。
- 驗收：含 subagent 的 fixture 正確渲染為可展開巢狀群組；分支處有小型節點圖；R1 快照更新全綠。

**R5 — 大檔虛擬化 + 響應式**
- 範圍：卡片清單虛擬化（建議 `@tanstack/react-virtual`，MIT、維護活躍；採用前依慣例向使用者確認）；
  >8MB 軟警告改為漸進解析；窄螢幕版面（魚骨在行動裝置的呈現屬 UX 語意，設計前先問）。
- 驗收：50MB 級 session 可開啟且捲動流暢；行動版經使用者實機確認。

**R6 — 匯出（FR-8）與多 session（D-5 解凍時）**
- 範圍：先做最小匯出——處理後 `SessionDocument` 存 JSON＋可獨立開啟的靜態 HTML 快照；
  多 session/技能庫維持凍結，僅確保 `SessionLibrary` 型別不腐化。
- 驗收：匯出檔可在無 dev server 環境開啟重現視圖。

### 3.3 明確不做（邊界，承 RPD 與「不要為了做而做」）

- 不做帳號/雲端儲存/SaaS 化（RPD 方案 C 已否決）。
- 不做即時 agent 操控（定位是事後複盤）。
- 講解層核心需求已由 none/ollama 滿足——R3 之後若使用者無新痛點，**建議停在 R4/R5 視需要**，
  不主動擴充。

## 4. ADR 紀錄與規則

**規則**：本文件與 RPD 未涵蓋的決策，實作 AI 一律「記錄＋提問」，不得自行發明；
拍板後以 ADR 條目追加於此（一行式即可：編號/日期/決策/理由）。

| ADR | 日期 | 決策 | 理由 |
|---|---|---|---|
| 001 | 2026-06-25 | D-1～D-5（見 RPD） | 見 RPD 決策鎖定 |
| 002 | 2026-06-25 | 降噪走確定性規則不靠 LLM | 可測、零成本、離線 |
| 003 | 2026-06-25 | 蒸餾骨架 view-agnostic，魚骨/高密度共用同一 Span Tree | 低耦合、雙模式不分叉資料 |
| 004 | 2026-06-25 | 配色清亮 light，tokens 集中 `:root` 待日後 skill 換膚 | 使用者明確否決 dark |
| 005 | 2026-06-26 | 雲端先只做 UI 骨架，不接 Mistral | 使用者拍板 |
| 006 | 2026-06-26 | Ollama 預設 keep_alive=10m、num_predict=512、timeout 60s 可調 | 實測冷載入/逾時痛點 |
| 007 | 2026-07-04 | 不重建 RPD/architecture，以本 PSM 定稿契約＋R 編號統一剩餘工作 | 上游已拍板；漂移集中在 PSM 層 |
| 008 | 2026-07-04 | RPD 附錄 schema v0.1 草案作廢，`spanTree.ts` 為權威 | 消除 doc-code drift |
| 009 | 2026-07-04 | 納入 i18n 雙語 (zh-TW/EN) 與 anti-slop 版面，立為 R7 | 使用者拍板（產品慣例雙語＋去 AI 味排版） |
| 010 | 2026-07-04 | Skeleton preset v1 暫定夠用，規則調整凍結；僅當實際使用發現魚骨密度/可讀性問題時重開 | 使用者不熟此塊，採本 PSM 評估先行假定 |
| 011 | 2026-07-04 | Cloud 維持骨架；實作時機固定為 R3（緊接 R2 之後），啟用仍為 UI opt-in | 使用者拍板「維持骨架、時機固定」 |
| 012 | 2026-07-04 | R 執行順序定稿：R1→R7→R2→R3→R4→R5→R6 | 使用者同意 R1 優先；i18n 越晚成本越高故排第二 |
| 013 | 2026-07-04 | R6 匯出格式確認：JSON + 靜態 HTML 快照 | 使用者拍板 |
| 014 | 2026-07-04 | 不另開 repo：於現址 `git init`（.gitignore 排除 node_modules/dist/archive），先做基線 commit 再以 feature branch 進 R1；現有檔案皆為活資產，一律不進 archive | 資料夾尚未版控；程式碼已過驗收、文件即合約，搬家只會斷鏈 |

## 5. 測試策略分層

| 層 | 內容 | 何時 |
|---|---|---|
| UNIT | denoiser/distiller/adapter 規則與容錯 | R1 建立，之後每 R 維護 |
| SIT | pipeline 端到端快照（fixture → SessionDocument） | R1 建立；R4 擴 subagent fixture |
| UAT | 人工驗收單（[ACCEPTANCE.md](ACCEPTANCE.md) 模式延續，每 R 附清單） | 每個 R 交付時；視覺類必過使用者實機 |

視覺/互動類改動依全域準則：build 綠≠畫面對，一律以使用者實機確認為準。

## 6. 風險更新（2026-07-04 外部查核）

- `.jsonl` 格式漂移仍是首要風險，但生態已成熟可借力：格式已有第三方文件化規格
  （claude-dev.tools 的 JSONL format 說明），且有多個維護中的開源解析器可比對行為——
  [simonw/claude-code-transcripts](https://github.com/simonw/claude-code-transcripts)（Python，1.5k★）、
  [daaain/claude-code-log](https://github.com/daaain/claude-code-log)（Python）、
  [withLinda/claude-JSONL-browser](https://github.com/withLinda/claude-JSONL-browser)（Web）。
  遇未知事件型別時，先查上述專案的處理方式再決定 adapter 修法；**不改抄其架構**（皆為
  「可讀化」導向，無蒸餾/教學層——DIT 差異化經查仍成立）。
- 小模型講解品質未知 → R2 以實測收斂，不預先過度設計。

## 7. 開放問題

原 5 項開放問題已於 2026-07-04 全數拍板（見 ADR-009～013）。尚餘（皆綁定 R7 實作前）：

1. **R7 視覺方向**：anti-slop 的具體長相需使用者提供參考或 UI/UX skill，實作前確認（UX 語意）。
2. **R7 語言細節**：預設語言、切換 UI 的位置與形式，實作前確認（UX 語意）。
3. **R3 服務商**：實作採 OpenAI 相容介面（§2.4），具體接哪家（Mistral 等）屆時再指定，不影響實作。

## 變更紀錄

| 版本 | 日期 | 內容 |
|---|---|---|
| v1.0 | 2026-07-04 | 初版：契約定稿（schema v0.2/skeleton v1/provider）、R 編號藍圖、ADR 制度、測試分層、風險更新 |
| v1.1 | 2026-07-04 | 開放問題 1–5 拍板落定（ADR-009～013）：新增 R7（i18n＋anti-slop）、執行順序定稿、R3 時機固定 |
| v1.2 | 2026-07-04 | ADR-014（repo 於現址 git init、不 archive）；新增 docs/IMPLEMENTATION_KICKOFF_PROMPT.md 作為實作 session 開場 |
