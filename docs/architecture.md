# DIT 架構文件 (Architecture) v0.1

> 對應 RPD：[RPD_DIT_v0.1.md](RPD_DIT_v0.1.md)。本文件描述 M1 已落地的程式結構與資料流。
> 設計遵循 RPD §決策鎖定的工程準則：可擴充 / 低耦合 / 可自檢 / 可維護 / 資料流可追蹤。

## 1. 資料流 (單向、可追蹤)

```
原始 .jsonl 文字
  │
  ▼  SourceAdapter.parse()              src/core/adapters/*
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

整條管線的單一入口是 `buildSessionDocument()`（`src/core/pipeline.ts`）。
任一步驟的非致命問題都收進 `warnings`，UI 以提示橫幅呈現 → 資料流問題可追蹤。

## 2. 模組與職責 (低耦合)

| 層 | 路徑 | 職責 | 依賴 |
|----|------|------|------|
| 契約 | `src/types/spanTree.ts` | Span Tree canonical schema | 無 |
| 來源 | `src/core/adapters/` | 各來源 → `RawEvent[]`（介面 + 註冊表 + CC 解析器） | 契約 |
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

## 4. 確定性降噪規則 (denoiser.ts)

1. **milestone**：使用者訊息＝任務分界；最後一個成功結果（標到其父操作卡片）＝完成。
2. **error**：錯誤結果標 error，並上拋到父 `tool_use` 卡片以徽章顯示。
3. **retry**：錯誤後再次呼叫「同一工具」標 retry。
4. **decision**：思考層出現決策語彙（決定/改用/instead…）標 decision。
5. **edit-loop 群組**：對同一檔案連續多次編輯折疊成一個群組；thinking/回覆/結果視為透明，僅不同工具或新使用者訊息打斷。

## 5. LLM 講解層 (D-4)

- 介面 `LLMProvider.annotate(span, ctx)`；逐節點切 chunk（`src/core/llm/prompt.ts` 組裝精簡上下文）。
- `none`（預設、零外傳）/ `ollama`（本地、真實 fetch `http://localhost:11434`）/ `cloud`（樁）。
- `sendsDataOut` 旗標驅動 UI 的責任說明（D-3）。
- store 的 `annotateAll` 循序處理，對本地小模型友善、避免壓垮 Ollama。

## 6. 已知限制 / 待辦 (M2+)

- subagent 跨檔（`subagents/*.jsonl`）尚未串接；目前以單檔內 `isSidechain` 為主。
- 真·節點分支圖（React Flow）尚未做，目前為時間軸卡片 + 群組折疊。
- cloud Provider 為樁；待接 Claude API / 免費雲端 API。
- 全局摘要（跨節點濃縮）尚未做，目前降噪為逐條規則。
- 尚無自動化測試；下一步建議補 pipeline 的單元測試（adapter→denoise 的快照）。
