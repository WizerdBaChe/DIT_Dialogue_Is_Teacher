---
xi: 1
what: DIT 架構與資料流權威文件 v0.4——對 HEAD 034fa43 的漂移校正，Adapter→Normalizer→Denoiser→Distiller 管線 (the authoritative architecture/data-flow document v0.4, a drift-correction pass documenting the Adapter→Normalizer→Denoiser→Distiller pipeline)
tags: [dit, architecture, contract]
aliases: [架構文件, 資料流管線, 架構圖, architecture, pipeline]
date: 2026-08-28
---
# DIT 架構文件 (Architecture) v0.4

> 對應 RPD：[RPD_DIT_v0.1.md](RPD_DIT_v0.1.md)。本文件描述**已落地**的程式結構與資料流。
> 設計遵循 RPD §決策鎖定的工程準則：可擴充 / 低耦合 / 可自檢 / 可維護 / 資料流可追蹤。
>
> **v0.4（2026-08-28）＝ 對 HEAD `034fa43` 的漂移校正**，不是新設計：§2 模組表補齊 14 個從未列入的
> 模組、§5 Provider 從 3 個更正為 `ProviderId` 的 9 個、§6 測試數從 128 更新為實跑量到的 679。
> v0.3 之後的每一輪都改了程式卻沒有回頭改本文，這一版把差距一次補上。**下次動到
> `src/core/` 的目錄結構或 `ProviderId`，本文 §2／§5 必須同一個 commit 一起改。**

## 1. 資料流 (單向、可追蹤)

```
原始 .jsonl 文字／瀏覽器 File、Blob
  │
  ▼  同步 adapter 或 Worker 串流解碼     src/core/adapters/* + src/core/ingest/*
RawEvent[] + meta + warnings            (來源無關的中介事件)
  │
  ▼  normalize()                        src/core/normalize/normalizer.ts
SessionDocument (Span Tree)             (節點 + 巢狀關係，每個 span 保留 raw)
  │
  ▼  denoise()                          src/core/denoise/denoiser.ts
SessionDocument + tags + groups         (milestone/error/retry/decision、edit-loop 群組)
  │
  ▼  distill()                          src/core/distill/distiller.ts
SessionDocument + skeleton              (DistilledSkeleton preset v1：spine/rib，view-agnostic)
  │
  ▼  validateSessionDocument()          src/core/validate/spanTreeSchema.ts
warnings (自檢問題併入回報)
  │
  ▼  buildViewModel()                   src/core/view/viewModel.ts
ViewItem[]                              (可渲染卡片清單；tool_result 巢狀、群組折疊)
  │
  ▼  Zustand store                      src/store/sessionStore.ts
React 元件樹                            src/components/*
```

同步 fixture／相容入口是 `buildSessionDocument()`；production 檔案入口由
`session.worker.ts` 以 `Blob.stream()` + 增量 `TextDecoder` 解析，再呼叫
`buildSessionDocumentFromParsedFiles()`（皆位於 `src/core/`）。
任一步驟的非致命問題都收進 `warnings`，UI 以提示橫幅呈現 → 資料流問題可追蹤。

Worker 只在完整 normalize→denoise→distill→validate 成功後回傳結果；store 在收到完整結果前保留
上一份有效文件。取消會直接終止 Worker，因此不會發布部分 `SessionDocument`，也不會把 transcript
內容寫進 log。載入狀態只傳 reading/parsing/organizing/validating/ready、bytes、行數與來源路徑。

## 2. 模組與職責 (低耦合)

> **清點日 2026-08-28**（HEAD `034fa43`）：本表上次改動是 `0ce7b77`（R5 guided workspace），
> 之後 14 個實際存在的模組從未取得列位——**其中一部分（`privacy`、`export`、`config`）在 R9 之前
> 就存在，是一開始就沒被列進來，不是後來才長出來的**。下表是對 `src/` 逐目錄重讀後補齊的結果，
> 共 26 列；依賴欄只寫 **production import**（`*.test.ts` 的 import 不算，這是 `src/core/source`
> 依賴欄寫「契約」而非 pipeline 的原因）。新增一個目錄卻沒有在此補列，就是下一次的同型漂移。

| 層 | 路徑 | 職責 | 依賴 |
|----|------|------|------|
| 契約 | `src/types/spanTree.ts` | Span Tree canonical schema | 無 |
| 來源 | `src/core/adapters/` | 各來源 → `RawEvent[]`（介面 + 註冊表 + Claude Code／Codex 解析器） | 契約 |
| 來源側寫 | `src/core/source/` | 每個 `SourceId` 一張窮舉表：工具名、檔案路徑鍵、探索規則。來源專屬的 `if` 只准住這裡（R10-B／R12 M1、M6） | 契約 |
| 串流匯入 | `src/core/ingest/` | UTF-8／JSONL chunk 邊界、Worker、進度與取消、逐檔解析隔離 | adapter、pipeline |
| 正規化 | `src/core/normalize/` | `RawEvent[]` → Span Tree | 契約、adapter 型別、文字工具 |
| 降噪 | `src/core/denoise/` | 確定性標籤與分組 | 契約、來源側寫 |
| 蒸餾 | `src/core/distill/` | spine/rib 分類 → DistilledSkeleton (preset v1) | 契約、來源側寫 |
| 自檢 | `src/core/validate/` | invariant 檢查 | 契約 |
| 編排 | `src/core/pipeline.ts` | 組合上述為單一入口；逐檔／逐批的結果狀態機 | 上述各核心 |
| Session 索引 | `src/core/index/` | 目錄式瀏覽：頭尾掃描分類（對話 vs 機器）、子代理 sidecar 配對、標題階梯、目錄 handle 持久化 | 契約、adapter、來源側寫、文字工具、診斷契約、首次導覽（共用同一個 IndexedDB） |
| 講解 Provider | `src/core/llm/` | `LLMProvider` 介面 + preset 註冊表；`none`／`ollama`／`cloud`（OpenCode proxy）／`anthropic-byok`／5 個 OpenAI-chat 相容 preset（見 §5） | 契約 |
| 隱私 | `src/core/privacy/` | 本地 detect → policy → sanitize，再經同意閘門 `authorize()`；**自己從不發任何網路請求** | 無（只依自己的檔案） |
| 隱私轉接 | `src/adapters/dit/privacyAdapter.ts` | 把一個 Span + `PrivacyGateway` + 選定 transport 黏成單一 annotate 呼叫 | 隱私、llm、契約 |
| 講解批次 | `src/core/annotation/` | 逐 span 循序工作機（missing/failed/all）+ 指紋；IndexedDB 快取，失敗退回記憶體 | 契約、診斷 |
| 匯出 | `src/core/export/` | 版本化 JSON 匯出、自足 HTML 快照、逐字稿 markdown／HTML 與去識別化 | 契約、隱私、normalize、pipeline、範例資料、文案 |
| 視圖模型 | `src/core/view/` | Span Tree → 可渲染清單；session map／fishbone 投影 | 契約 |
| 診斷 | `src/core/diagnostics/` | 兩條**刻意分開**的通道：開發者專用 fallback log vs 使用者可見的分級 `Diagnostic` | 無 |
| 阻斷面 | `src/core/surface/` | 7 種彈窗的優先序仲裁，同時只有一個 active；「誰想開」是導出值而非儲存值（R9 M4） | 無（純函式） |
| 文字工具 | `src/core/text/` | 剝除注入的 preamble 標籤；判定衍生標題是否堪用 | 無 |
| 設定檔 | `src/core/config/` | 執行期 best-effort `fetch("./dit.config.json")` 取 BYOK 金鑰；任何失敗一律退成 `null`，不丟例外 | llm（`PresetId`） |
| 首次導覽 | `src/core/onboarding/` | 「已看過歡迎對話框」的 IndexedDB 旗標；同時提供索引層共用的 app-meta DB handle | `idb` |
| 執行環境 | `src/core/runtime/` | 依 OS（Windows／posix）給出啟動本機 `ollama`／`opencode` 的指令字串 | 無 |
| 狀態 | `src/store/` | Zustand：載入／Provider／重播／講解／瀏覽。**唯一**同時接上 pipeline、llm、隱私、索引、講解的模組 | 上述各核心 |
| 文案 | `src/i18n/` | zh-TW／en 訊息表與診斷文案。`locales` 是葉節點；`i18n/index` 才綁 store | 契約、診斷、view、store |
| UI | `src/components/` | 純呈現，只與 store 互動 | store、契約 |
| 範例資料 | `src/fixtures/` | 首次載入的示範 session 與示範講解 | 契約、文案 |

**關鍵解耦點**：UI 不認得 pipeline / provider；下游不認得任何特定來源格式；來源專屬知識只在
`src/core/source/profiles.ts`（INV-R12-1）。

## 3. 擴充點 (可擴充)

- **新增來源**：實作 `SourceAdapter`，在 `src/core/adapters/index.ts` 註冊。其餘不動。
- **新增講解 Provider**：實作 `LLMProvider`，在 `src/core/llm/index.ts` 的 `getProvider` 註冊。
- **新增降噪規則**：在 `denoiser.ts` 內新增純函式規則。
- **多 session（D-5）**：`SessionLibrary` 型別已預留；store 目前持單一 `doc`，未來可改持陣列而不動契約。

## 3.1 Guided workspace 與受限渲染（R5）

- Sidebar 與高密度 MainView 各自使用 `@tanstack/react-virtual`，有獨立 scroll element、overscan 與穩定 `ViewItem.id` key。
- MainView 以 `ResizeObserver` 驅動 `measureElement`，群組／講解展開後會重新量測動態卡片高度。
- Store 以 `PrimaryView = overview | reader | subagents` 與 `SessionOrigin = sample | user` 明確表示主視角與來源。
  啟動、成功載入與重置進 Overview；開始／繼續閱讀、結構選取、地圖 Jump 與子代理選取進 Reader。
- Sidebar 與 MainView 都建立 ID→index lookup；結構、地圖或子代理的手動選取先停止播放並清除舊
  `playingId`，再切回閱讀，以 `scrollToIndex()` 掛載同一 `ViewItem.id`。
- 寬度至少 720 px 時，Structure Sidebar 跨 Overview／Reader／Subagents 常駐且可收合；小於 720 px 時，
  Header 顯示位置並以 native `dialog` 開啟左側 drawer。Privacy Review 會阻擋 drawer 與 Map。
- Session Map 是獨立 native `dialog`，不屬於 primary tabs。`sessionMap.ts` 從同一份 `DistilledSkeleton` 建立
  deterministic global／section／detail projection；global ≤80 targets、section ≤200、detail mounted rows ≤120。
  cluster 保留完整 source IDs 但沒有 `viewItemId`，因此只能縮放，不能冒充真實 Jump target。
- Reader Minimap 使用 global projection 與單一編碼 SVG 背景呈現目前位置／viewport，不產生逐點 DOM；整個
  按鈕只開 Map。安全的 `M` guard 排除 editable target、modifier、repeat、停用狀態與任何 blocking modal。
- 子代理使用獨立虛擬摘要清單，完整群組只在 Reader 顯示；spine/rib、跨檔 parent linkage 與 timestamp order 不變。

## 4. 確定性降噪規則 (denoiser.ts)

1. **milestone**：使用者訊息＝任務分界；最後一個成功結果（標到其父操作卡片）＝完成。
2. **error**：錯誤結果標 error，並上拋到父 `tool_use` 卡片以徽章顯示。
3. **retry**：錯誤後再次呼叫「同一工具」標 retry。
4. **decision**：思考層出現決策語彙（決定/改用/instead…）標 decision。
5. **edit-loop 群組**：對同一檔案連續多次編輯折疊成一個群組；thinking/回覆/結果視為透明，僅不同工具或新使用者訊息打斷。

## 5. LLM 講解層 (D-4)

- 介面 `LLMProvider.annotate(span, ctx)`；逐節點切 chunk（`src/core/llm/prompt.ts` 組裝精簡上下文）。
- **Provider 清單（2026-08-28 對照 `src/types/spanTree.ts:102-111` 重讀）**。R8 的 Provider Openness
  把原本的三個擴成 `ProviderId` 九個值；本節在那之後沒有更新過，直到此次校正：

  | `ProviderId` | 種類 | transport | 外傳 | 出處 |
  |---|---|---|---|---|
  | `none` | 預設 | 無 | 零外傳 | `src/core/llm/none.ts`；`index.ts:27` 是所有未命中分支的落點 |
  | `ollama` | 本地 | `ollama-tags` 探測 + 自有 client | 否 | `src/core/llm/ollama.ts:84,140`（`http://localhost:11434`） |
  | `cloud` | loopback proxy | `opencode-native` | 是（Privacy Envelope 強制） | `src/core/llm/cloud.ts:74-76,177,188,222` |
  | `anthropic-byok` | 雲端直連 | `anthropic-messages` | 是 | `src/core/llm/anthropicProvider.ts:62,104` |
  | `lmstudio`／`jan` | 本地 | `openai-chat`（共用 generic client） | 否 | `src/core/llm/genericProvider.ts:60,121` |
  | `openrouter`／`groq` | 雲端直連 | `openai-chat`（同上） | 是 | 同上 |
  | `custom` | 使用者自填 endpoint | `openai-chat`（同上） | 視 endpoint 而定 | 同上 |

- **兩個容易踩的不對稱**：(1) `getProvider()` 的型別是 `Exclude<ProviderId, "cloud">` ——
  `cloud` 拿不到 `LLMProvider`，它只能經 `createOpenCodeTransport()` 走 Privacy Envelope
  （`src/core/llm/index.ts:20`）。(2) 同一個東西在兩張表裡名字不同：`ProviderId` 叫 `cloud`，
  `PresetId` 叫 `local-proxy`（`src/core/llm/presets.ts:8-17`）。
- 新增一個 OpenAI-chat 相容 provider 只要在 `presets.ts` 加一筆並列入 `GenericChatPresetId`；
  自有協定才需要新的 transport 檔案（ADR-032 說明 `ollama`／`local-proxy` 為何不併入 generic）。
- `sendsDataOut` 旗標驅動 UI 的責任說明（D-3）；`cost !== "free"` 另外觸發一次性同意閘門（INV-R8-4）。
- AnnotationJobController 循序處理 missing/retry/all；完成即寫 IndexedDB，重開可續跑。

## 6. 已知限制 / 待辦

- subagent 主檔＋`subagents/*.jsonl` 已可合併，並以可展開群組＋輕量 SVG 局部分支呈現。
  **佈局更正 (R9)**：真實的 Claude Code 把主檔 `<id>.jsonl` 放在子代理資料夾 `<id>/subagents/` 的**同層兄弟**
  位置，主檔不在資料夾內。R9 之前的文件與 fixture 都假設兩者同層，那個假設從未對真實資料驗證過。
  配對由 Session 索引器負責，見 `docs/design/DIT_STATE_MACHINES.md` DSM-1／DSM-4。
- React Flow 仍是未來高互動分支圖的選配升級，不是目前 R4 的依賴。
- OpenCode 真實 Cloud UAT 已於 production preview 完成：OpenCode 1.17.20 經 Balanced 去識別化預覽
  與同意後，以 `deepseek-v4-flash-free` 成功回傳講解；離線、取消與失敗路徑也已驗證。
- 全局摘要（跨節點濃縮）尚未做，目前降噪為逐條規則。
- 50 MiB fixture 的瀏覽器沒有提供 JS heap 指標；效能報告明確標記 unsupported，未推估記憶體。
- 自動化測試 **679 個、分佈在 69 個檔案，全綠**（`npm test` exit 0，2026-08-28 於 HEAD `034fa43`
  實跑量得，非引用他處數字）。涵蓋核心管線、串流匯入與 Worker、Privacy Gateway、Provider、快取、
  guided navigation、Map、Session 索引、目錄來源與 store。舊版本文寫「128 個」，那是 R5 時的數字，
  之後 R7–R12 沒有回頭更新過。
  GN-07 production preview 已通過有界 DOM／延遲門檻，最終視覺仍須使用者人工 UAT。
