# DIT R7 多來源接入（Codex Adapter）— 基礎設計文件 v0.1

日期：2026-07-21

狀態：**前置設計草稿（pre-PSM）**。使用者已同意排程方向（R5.5 UAT → R6 → R7）；本文件沉澱 2026-07-21 對照真實 Codex 資料的評估結論，供 R7 開工時直接升級為 PSM 施工合約，不是施工依據。

定位：與 [BACKLOG.md](../../BACKLOG.md)「2026-07-21 R7 候選」段互為表裡——BACKLOG 記排程與範圍，本文件記設計分析與證據。三個待決點（§6）在 R7 PSM 定稿前需使用者拍板。

---

## 1. 現有架構評估：架構上到位，實作上單一來源

### 1.1 已到位的擴充點

| 元件 | 位置 | 狀態 |
|---|---|---|
| `SourceAdapter` 介面 | `src/core/adapters/types.ts` | 來源無關；`canParse` 自動偵測＋`parse` 全量解析 |
| `RawEvent` 中介事件 | 同上 | 6 種 kind：`user_text` / `assistant_text` / `thinking` / `tool_use` / `tool_result` / `unknown`；下游 Normalizer 只認此型別 |
| Adapter registry | `src/core/adapters/index.ts` | `getAdapter` / `detectAdapter` / `listAdapters`；新增來源理論上只需 register |
| `SourceId` | `src/types/spanTree.ts` | 已預留 `"claude-code" \| "codex" \| "paste"` |
| 容錯契約 | `types.ts` 介面註解 | 單行損壞只記 warning，不得整體拋例外 |

### 1.2 實作耦合缺口

- **缺口一（blocker）**：`src/core/ingest/jsonlStream.ts:33` 直接 `new ClaudeCodeJsonlAccumulator()`，streaming 路徑繞過 registry。50 MiB 大檔載入（R5 已驗收能力）目前 Claude 專屬。修法：`SourceAdapter` 介面補增量概念（如 `createAccumulator(): LineAccumulator`），`jsonlStream` 改吃介面。
- **缺口二**：`RawEvent` 對 Codex 缺少承接 turn 結構、`patch_apply` 類事件的位置（詳 §4、§6）。

### 1.3 偵測互斥性（已驗證）

Codex 行為 `{timestamp, type, payload}` 雙層結構；首行 `session_meta` 無頂層 `sessionId` / `message` / `aiTitle`，Claude adapter 的 `canParse` 不會誤收。Codex adapter 的 `canParse` 建議條件：`type` ∈ {`session_meta`, `response_item`, `event_msg`, `turn_context`} 且存在 `payload` 物件。

## 2. Codex JSONL 格式實測（證據）

樣本來源：`~/.codex/sessions/2026/07/11/rollout-*.jsonl`（19 檔，21 KiB～3.8 MiB），2026-07-21 實測。

### 2.1 頂層型別

每行 `{timestamp, type, payload}`，`type` ∈：

| 頂層 type | 內容 | 對 DIT 的價值 |
|---|---|---|
| `session_meta` | `session_id`、`cwd`、`originator`（"Codex Desktop"）、`cli_version`、`source`、`model_provider`、`base_instructions`（完整 system prompt 文字） | meta 來源；`base_instructions` 屬噪音（極長） |
| `response_item` | 模型層事件（見 §2.2） | **主幹** |
| `event_msg` | UI 事件層（見 §2.3） | 補缺用，多數與主幹重複 |
| `turn_context` | `turn_id`、cwd、sandbox / permission 設定 | turn 邊界佐證；設定屬噪音 |
| `world_state` | AGENTS.md 全文快照 | 噪音 |

### 2.2 `response_item`（模型層，建議主幹）

| payload.type | 關鍵欄位 | 對映 |
|---|---|---|
| `message`（role: user/assistant/developer） | `content[]` 為 `{type:"input_text"\|"output_text", text}` | role=user → `user_text`；role=assistant → `assistant_text`；role=developer → 噪音（permissions 說明等注入文） |
| `reasoning` | `summary[]`（常空）＋`encrypted_content`（不可解） | `thinking`，**多數不可還原**（§5） |
| `custom_tool_call` | `name`、`input`（**字串**，常為 JS 程式碼）、`call_id` | `tool_use`；`input` 需包裝為 `{ raw: string }` 或嘗試 parse |
| `custom_tool_call_output` | `call_id`、`output[]` 為 `{type:"input_text", text}` | `tool_result`；`call_id` → `toolUseId` |
| `function_call` | `name`、`arguments`（JSON **字串**）、`call_id` | `tool_use`；`arguments` 需 `JSON.parse`（失敗則包字串） |
| `function_call_output` | 同 `custom_tool_call_output` | `tool_result` |

### 2.3 `event_msg`（UI 層，僅補主幹缺口）

| payload.type | 與主幹關係 | 處置建議 |
|---|---|---|
| `user_message` | 與 `response_item/message`(user) 重複；且含合成訊息（"# Files mentioned by the user" 附件展開） | 略過（去重） |
| `agent_message` | 與 `response_item/message`(assistant) 重複 | 略過（去重） |
| `agent_reasoning` | **主幹加密思考的唯一明文來源**，但為串流碎片（如 `"**Planning"` 半截） | 收為 `thinking`（需相鄰合併，仍為降級品質） |
| `task_started` / `task_complete` | turn 邊界（`turn_id`）；`task_complete.last_agent_message` 與 agent_message 重複 | 供 turn 分段，不出卡 |
| `patch_apply_end` | 檔案變更全文＋`success` 旗標＋stderr——**高價值取證素材**，主幹無對應 | 待決點 3（§6） |
| `web_search_end` | 搜尋 query | 待決點 3 一併裁定 |
| `token_count` / `thread_settings_applied` / `turn_context` | 用量、設定 | 噪音；`thread_settings_applied.thread_settings.model` 可補 meta.model |

### 2.4 Meta 對映

| DIT `SessionMeta` | Codex 來源 |
|---|---|
| `id` | `session_meta.payload.session_id` |
| `projectPath` | `session_meta.payload.cwd` |
| `startedAt` | `session_meta.payload.timestamp` |
| `model` | `thread_settings_applied.thread_settings.model`（或 `turn_context`） |
| `title` | **無 `ai-title` 對應**——必走「session 標題 fallback」（R5.5 §5 延後項，故列 R7 前置） |
| `source` / `tool` | `"codex"` |

## 3. RawEvent 覆蓋率結論

約八成可乾淨對映：`user_text` / `assistant_text` / `tool_use` / `tool_result` 均可；`thinking` 降級（§5）；`isSidechain`（子代理）在 Codex 無對應概念；`parentUuid` 可空所以扁平流能收，但層級語意需 turn 對映決策（§6）。

## 4. R7 範圍（與 BACKLOG 同步）

1. `SourceAdapter` 介面補增量 accumulator，解除 `jsonlStream.ts` 耦合。
2. Adapter 未知型別寬容收納（R5.5 §5 移入）。
3. Session 標題 fallback（R5.5 §5 移入；Codex 接入前置條件）。
4. Codex jsonl adapter 本體。

爆炸半徑全在 ingest / normalize 層；view 層合約（R5 §11、SA-INV 系列）不動。R6 期間唯一順手事項：型別保鮮不得把 Claude 專屬假設寫進快照渲染器（SA-INV-5 已在擋）。

## 5. 已知資料源限制（非 adapter 可修）

- **思考不可完整還原**：`response_item/reasoning` 為 `encrypted_content` 且 `summary` 常空；明文僅存 `event_msg/agent_reasoning` 串流碎片。◇ 思考 span 在 Codex 來源將稀疏、碎片化——UI 需接受降級，不得偽造完整性。
- **工具參數非結構化**：`custom_tool_call.input` 是 JS 程式碼字串、`function_call.arguments` 是 JSON 字串；adapter 負責 parse 或包裝，`RawEvent.toolInput` 型別（`Record<string, unknown>`）不需為此改動。

## 6. R7 PSM 定稿前需使用者拍板的決策點

1. **雙層去重策略**：預設建議「`response_item` 為主幹、`event_msg` 只補主幹沒有的（明文 agent_reasoning、patch_apply_end）」。替代案：以 `event_msg` 為主（較貼近使用者看到的 UI，但丟失 developer 注入與 call 配對細節）。
2. **`turn_id` 對映**：Codex 扁平流以 `task_started`/`task_complete` 包夾 turn。選項：(a) turn → 既有群組（■）語意；(b) 不分層，僅存 raw 供未來使用。影響 Sidebar 樹列與 Map 投影的分段。
3. **`patch_apply_end` / `web_search_end` 定位**：(a) 進寬容收納「未分類事件」（保守，不動 `RawEventKind`）；(b) 升格一級 kind（如 `file_change`，取證價值高但動到 normalizer 與 view 對映）。

## 7. 非目標（R7 明確不做）

- 跨 session 統計／agent 行為分析層（RPD D-5 擱置中）。
- Codex 以外的其他來源（Gemini CLI 等）——但 accumulator 介面設計需不排除之。
- `paste` 來源的正式 adapter（`SourceId` 已預留，另案）。
- 任何 view 層行為變更；Codex 資料以現有卡片／Map 語彙呈現，降級處明示而非新設 UI。
