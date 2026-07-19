# DIT 架構文件 (Architecture) v0.3

> 對應 RPD：[RPD_DIT_v0.1.md](RPD_DIT_v0.1.md)。本文件描述 M1 已落地的程式結構與資料流。
> 設計遵循 RPD §決策鎖定的工程準則：可擴充 / 低耦合 / 可自檢 / 可維護 / 資料流可追蹤。

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

| 層 | 路徑 | 職責 | 依賴 |
|----|------|------|------|
| 契約 | `src/types/spanTree.ts` | Span Tree canonical schema | 無 |
| 來源 | `src/core/adapters/` | 各來源 → `RawEvent[]`（介面 + 註冊表 + CC 解析器） | 契約 |
| 串流匯入 | `src/core/ingest/` | UTF-8／JSONL chunk 邊界、Worker、進度與取消 | adapter、pipeline |
| 正規化 | `src/core/normalize/` | `RawEvent[]` → Span Tree | 契約、adapter 型別 |
| 降噪 | `src/core/denoise/` | 確定性標籤與分組 | 契約 |
| 蒸餾 | `src/core/distill/` | spine/rib 分類 → DistilledSkeleton (preset v1) | 契約 |
| 自檢 | `src/core/validate/` | invariant 檢查 | 契約 |
| 講解 | `src/core/llm/` | LLMProvider 介面 + none/ollama/cloud | 契約 |
| 編排 | `src/core/pipeline.ts` | 組合上述為單一入口 | 上述各核心 |
| 視圖模型 | `src/core/view/` | Span Tree → 可渲染清單 | 契約 |
| 狀態 | `src/store/` | Zustand：載入/Provider/重播/講解 | pipeline、view、llm |
| UI | `src/components/` | 純呈現，只與 store 互動 | store、契約 |

**關鍵解耦點**：UI 不認得 pipeline / provider；下游不認得任何特定來源格式。

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
- `none`（預設、零外傳）/ `ollama`（本地、真實 fetch `http://localhost:11434`）/
  `cloud`（Privacy Gateway 後由 loopback OpenCode server 代理）。
- `sendsDataOut` 旗標驅動 UI 的責任說明（D-3）。
- AnnotationJobController 循序處理 missing/retry/all；完成即寫 IndexedDB，重開可續跑。

## 6. 已知限制 / 待辦

- subagent 主檔＋`subagents/*.jsonl` 已可經資料夾輸入合併，並以可展開群組＋輕量 SVG 局部分支呈現。
- React Flow 仍是未來高互動分支圖的選配升級，不是目前 R4 的依賴。
- OpenCode 真實 Cloud UAT 已於 production preview 完成：OpenCode 1.17.20 經 Balanced 去識別化預覽
  與同意後，以 `deepseek-v4-flash-free` 成功回傳講解；離線、取消與失敗路徑也已驗證。
- 全局摘要（跨節點濃縮）尚未做，目前降噪為逐條規則。
- 50 MiB fixture 的瀏覽器沒有提供 JS heap 指標；效能報告明確標記 unsupported，未推估記憶體。
- 核心管線、串流匯入、Privacy Gateway、Provider、快取、guided navigation、Map 與 store 已有 128 個自動化測試；
  GN-07 production preview 已通過有界 DOM／延遲門檻，最終視覺仍須使用者人工 UAT。
