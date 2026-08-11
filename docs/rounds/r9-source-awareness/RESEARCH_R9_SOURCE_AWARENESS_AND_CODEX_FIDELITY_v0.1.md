# DIT — R9 研究筆記｜來源感知管線、Codex 官方格式核對、既有產品掃描 v0.1

> 日期：2026-08-11
> 定位：**PIM 級研究筆記，非 sole-source PSM，未經使用者裁定不得據此施工。**
> 觸發：使用者三問——(1) 既有產品有哪些可借鏡的便利設計？(2) Codex 部分能否依官方資料續行優化、
> 是否有被忽略的細節？(3) 比起全域檢查，能否先辨識來源 harness 再處理？
> 上游合約：[PSM_DIT_v1.0.md](../../PSM_DIT_v1.0.md)、[PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md](../r7-multi-source-and-layout/PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md)、
> [PSM_R7.5_CODEX_NOISE_AND_SETTINGS_CARD_v0.1.md](../r7.5-codex-noise-and-settings-card/PSM_R7.5_CODEX_NOISE_AND_SETTINGS_CARD_v0.1.md)。本文件不推翻既有決策，只提出下一輪候選。

---

## 1. Q3 —「先辨識來源再處理」：偵測早已存在，但**結果在解析後就被丟棄**

### 1.1 as-built 事實

- 來源偵測**已經**是特徵式而非全域掃描：`detectAdapter()`（`src/core/adapters/index.ts`）只讀
  **第一個非空白行**，交給各 adapter 的 `canParse()` 判斷；Codex 認 `type ∈ {session_meta,
  response_item, event_msg, turn_context}` + `payload` 物件，Claude Code 認自己的信封。兩者互斥
  已有測試護欄（R7-INV-9）。就「辨識來源」這件事本身，設計是對的，不需要改。
- 偵測結果也確實保存下來了：`normalize()` 把它寫進 `doc.session.source`（`SourceId`）。

### 1.2 缺口：`source` 從來沒有被下游讀取

`denoise()` 與 `distill()` **完全不看 `doc.session.source`**，而是拿一組寫死的 Claude Code 工具名
對所有來源做全域比對：

| 位置 | 常數 | 內容 | Codex 實際工具名 |
|---|---|---|---|
| `src/core/denoise/denoiser.ts` | `EDIT_TOOLS` | `Edit / Write / MultiEdit / NotebookEdit` | `apply_patch` |
| `src/core/distill/distiller.ts` | `INVESTIGATION_TOOLS` | `Read / Grep / Glob / WebFetch / WebSearch / NotebookRead` | `shell`(cat/rg/ls) / `web__run` / `read_file` |

再加上 `codexJsonl.ts` 的 `custom_tool_call_output` / `function_call_output` **一律寫死
`isError: false`**（Codex 沒有 Claude 的 `is_error` 旗標），denoise 規則 2 的 error/retry 標籤
對 Codex 來源**永遠不會觸發**。

### 1.3 實測證據（2026-08-11，本機 `buildSessionDocument()`）

用**語意完全相同**的一段作業（讀一個檔 → 對同一檔連續兩次編輯，第二次失敗 → 收尾），
分別寫成 Codex rollout 與 Claude Code transcript 餵進 pipeline：

| 指標 | Claude Code | Codex |
|---|---|---|
| `session.source` | `claude-code` | `codex`（**有正確辨識**） |
| spans | 9 | 9 |
| groups | `edit-loop:反覆修改 auth.ts` | **（無）** |
| tags | `milestone×1, decision×1, error×2` | `milestone×3, decision×1`（**無 error**） |
| skeleton nodes | objective, decision, outcome | objective, decision, outcome |
| skeleton ribs | `investigation, edit-loop` | **（無）** |

**結論**：Codex session 進到 DIT 的「蒸餾骨架」後只剩 objective/decision/outcome 三個節點、
零支線。Session Map／魚骨是本產品的核心教學產物，對 Codex 來源等同**近乎空白**。
這不是 Codex 資料不足造成的降級（`apply_patch` 的檔名、失敗旗標都在資料裡），
而是規則層寫死 Claude 詞彙造成的。

### 1.4 建議形狀：Source Profile（來源側寫）

把「哪些工具算編輯 / 取證」「錯誤怎麼判定」「哪些注入標籤要剝除」從全域常數改成
**以 `SourceId` 為鍵、解析期解析一次、隨文件攜帶**的側寫表，denoise/distill/preamble 都改讀側寫：

```ts
interface SourceProfile {
  id: SourceId;
  editTools: ReadonlySet<string>;       // claude: Edit/Write/…   codex: apply_patch
  investigationTools: ReadonlySet<string>;
  injectionTags: readonly string[];      // 目前是跨來源共用的單一白名單
  filePathKeys: readonly string[];       // 從 toolInput 取檔名的鍵順序
}
```

同時要處理的相關過度全域化問題：

- `src/core/text/preamble.ts` 的 `INJECTION_TAGS` 把 Claude Code 專屬標籤
  （`system-reminder`、`command-name`、`local-command-stdout`）與 Codex 專屬
  （`environment_context`、`INSTRUCTIONS`）混成一張全域白名單，對每個來源都套。
- 同檔的 `#` 標頭剝除是**來源無關**且相當積極的：任何來源、任何訊息只要以 Markdown 標題開頭，
  開頭段落就會被吃掉。這是既有行為，未經量測不宜擅動，但應列入側寫化時一併重新裁定。

**爆炸半徑**：denoise/distill/preamble 三個純函式 + 一張新表，UI 零改動；與 R7 的
「adapter 註冊表」擴充點同源，屬同一個設計意圖的補完。

---

## 2. Q2 — Codex 官方資料核對：**最大的風險是 Paginated 歷史模式**

證據來源：`openai/codex` 的 `codex-rs/rollout/src/policy.rs`（`should_persist_event_msg` /
`should_persist_response_item`，2026-08-11 取得逐字原始碼）與 `codex-rs/protocol/src/protocol.rs`
的 `EventMsg` enum。

### 2.1 硬事實：rollout 有兩種歷史模式，寫出的事件集**不一樣**

`ThreadHistoryMode` 有 `Legacy` 與 `Paginated` 兩種。逐字條文：

- **一律持久化**：`token_count`、`thread_goal_updated`、`thread_rolled_back`、`turn_aborted`、
  `task_started`(TurnStarted)、`task_complete`(TurnComplete)、`thread_settings_applied`。
- **只有 Legacy 模式才持久化**：`user_message`、`agent_message`、`agent_reasoning`、
  `agent_reasoning_raw_content`、**`entered_review_mode`**、**`exited_review_mode`**、
  **`patch_apply_end`**、**`context_compacted`**、**`mcp_tool_call_end`**、**`web_search_end`**、
  `image_generation_end`、**`sub_agent_activity`**。
- **`item_completed`**：Paginated 模式**一律**持久化（承載 `TurnItem`）；Legacy 模式**只有**
  `TurnItem::Plan(_)` 與 `TurnItem::Extension(Sleep)` 會寫入。
- **永不持久化**（不必為它們寫程式）：`error`、`exec_command_begin/end`、`plan_update`、
  `turn_diff`、`patch_apply_begin/updated`、`guardian_assessment`、`web_search_begin`、
  `mcp_tool_call_begin`、`item_started`、所有 `collab_*_begin/end`、所有 `*_delta`。

**對 DIT 的意義**：R7／R7.5 為 Codex 做的**全部**加值——`patch_apply_end` 的 changes/success 併入、
`mcp_tool_call_end` 的真實工具名與結果、`web_search_end` 的 query、`agent_reasoning` 明文思考、
`context_compacted` 標記卡——**全部掛在 Legacy-only 事件上**。一旦使用者的 Codex 是 Paginated 模式，
DIT 只會吐出 `未知型別 "event_msg/item_completed" ×N`，整份 session 退化成「訊息＋exec 呼叫」的
裸流。這不是假設性風險，是 upstream 已經寫進 policy 的分支。

**下一輪首要工作**：拿到一份 Paginated 模式的真實 rollout，補 `event_msg/item_completed` →
`TurnItem` 的映射（`TurnItem::Plan` 尤其重要，它是 Codex 的待辦計畫，Legacy 模式下也是唯一會
落地的 item），並讓 adapter 能自我判斷面對的是哪一種模式。

### 2.2 `entered_review_mode` / `exited_review_mode`：官方標記存在，DIT 卻在猜英文句子

R7.5 用來辨識 Codex auto-review 子代理的依據是轉述文字的英文開頭簽名：

```ts
const AUTO_REVIEW_DUMP_PREFIX = "The following is the Codex agent history";
```

官方其實有 `EventMsg::EnteredReviewMode` / `ExitedReviewMode`，且**在 Legacy 模式下會持久化**。
現行做法對 upstream 改字、非英文 locale、或轉述格式微調都是脆的。應改為
**以官方事件為主、英文簽名降為後備**，並在兩者都不存在時才放棄（沿用 R7-INV-8 的降級＋warning 慣例）。

### 2.3 `response_item/agent_message` 目前被靜默丟棄 —— 需要重新查證（**風險最高**）

`should_persist_response_item` 明列 `ResponseItem::AgentMessage` 為**持久化的一級訊息項**，
與 `ResponseItem::Message` 並列。但 `codexJsonl.ts` 目前把 `response_item/agent_message`
歸類為「子代理間通訊，零可讀內容」並**靜默丟棄**（只計入聚合診斷）。

若在某些 Codex 版本／模式下 `agent_message` 才是助理正式回覆的載體，DIT 會**無聲吞掉助理的答覆**。
R7B 當時的樣本觀察到的是零內容，這個判斷在當時的樣本上成立；但與官方 enum 的定位不一致，
**應以真實樣本重新查證後再決定是否維持**。在查證前不建議改動——但也不該當作已定案。

### 2.4 已持久化、但 DIT adapter 尚未處理的 `response_item` 型別

官方持久化 14 種，DIT 目前處理 6 種（`message`／`reasoning`／`custom_tool_call`／`function_call`
／`custom_tool_call_output`／`function_call_output`）。其餘會落入寬容收納：

`local_shell_call`、`tool_search_call`、`tool_search_output`、`web_search_call`、
`image_generation_call`、`compaction`、`context_compaction`。

其中 `local_shell_call`（本機 shell 呼叫）與 `web_search_call` 有明確教學價值，
且能同時餵養 §1.4 的 `investigationTools` 側寫。

### 2.5 `session_meta` / `turn_context` 讀得太少

- `session_meta` 官方欄位包含 `originator`、`cli_version`、`model_provider`、`base_instructions`、
  git branch/commit、`agent_nickname`／`agent_role`／`agent_path`、**`forked_from_id`／
  `parent_thread_id`**。DIT 只取 `session_id` 與 `cwd`。
  `parent_thread_id`／`forked_from_id` 正是 backlog 那項「Codex 子代理協作事件的專屬視覺呈現」
  缺的那條**官方父子連結**——比拿 `turn_id` 猜親緣關係可靠得多。
- `turn_context`（一律持久化）帶每回合的 model／cwd／approval policy／sandbox policy，
  DIT 目前 `return` 直接丟棄；`meta.model` 只從 `thread_settings_applied` 取。

---

## 3. Q1 — 既有產品掃描（2026-08-11）

### 3.1 市場現況

多來源統一檢視**已經不是差異化功能**：`claude-code-history-viewer`（28 種 agent，含 Codex）、
`AgentsView`（20+ agent）、`claude-view`（25+ agent）、`ccusage`（Claude Code + Codex 統一報表）、
VS Code 的 `Claude Code and Codex Assist` 都已支援。專注單一來源的則有 `claude-devtools`、
`claude-session-visualizer`、`simonw/claude-code-transcripts`、`Claudoscope`。

它們的共通功能組（DIT 現況對照）：

| 功能 | 競品普遍有 | DIT 現況 |
|---|---|---|
| 全文搜尋（session 內／跨 session） | ✅ 幾乎全部，且是最常被引用的價值 | ❌ **完全沒有**（`src/` 無任何搜尋 UI／i18n 鍵） |
| token／成本分析 | ✅ | ❌（Codex `token_count` 官方一律持久化，資料就在手邊） |
| 最近開啟的 session、免重選檔 | ✅（讀 `~/.claude/projects`） | ❌ 每次都要重新用 `<input webkitdirectory>` 挑資料夾 |
| 續跑指令（copy resume command） | ✅ | ❌ |
| 執行樹／圖形化 | ✅（多用 React Flow） | ✅ Session Map／魚骨（且 R5 已明確拒絕 React Flow） |
| 匯出 HTML／JSON | ✅ | ✅（R6，含單檔快照＋v0.4.0 逐字稿與遮蔽） |
| 本機優先／不外送 | ✅ | ✅（且有 Privacy Gateway，比多數競品嚴格） |
| **逐節點教學講解（LLM）** | ❌ 幾乎沒有 | ✅ **DIT 的真正差異化** |
| **蒸餾骨架／因果主線支線** | ❌ 沒有 | ✅ **DIT 的真正差異化** |

### 3.2 判讀

- DIT 不該去追「支援 28 種 agent」——那是紅海，且與 R7-INV-6「不為單一來源新增結構層」的克制相衝突。
- 但**session 內全文搜尋**是唯一一項「競品全有、DIT 全無、且與教學定位完全相容」的基礎便利。
  大 session（R5 已驗到 50 MiB／29,452 view items）沒有搜尋，等於逼使用者用捲動找東西。
  已有的虛擬清單與 `viewItems` 索引可直接複用，Reader Minimap 也已有密度指示可掛搜尋命中點。
- **免重選檔**：DIT 是純瀏覽器工具，不能掃描 `~/.codex/sessions`；但 File System Access API 的
  `showDirectoryPicker()` handle 可存進 IndexedDB（DIT 已用 `idb`），下次一鍵重載。
  Chromium-only，需保留現行 `<input webkitdirectory>` 作為 fallback——與 R8「誠實呈現能力邊界」
  的既有立場一致。
- **token／成本**：Codex 的 `token_count` 一律持久化、Claude Code transcript 也有 usage 欄位，
  資料成本低；但與「教學」的關聯最弱，優先度應低於搜尋。

---

## 4. 建議排程（待使用者裁定，未裁定前不施工）

1. **R9-A｜Codex 保真度**（風險最高，且會使 R7／R7.5 的既有投資失效）：
   Paginated `item_completed` 映射、`entered/exited_review_mode` 官方標記優先、
   `agent_message` 重新查證、`session_meta`／`turn_context` 補讀。
   **前置條件**：需要真實的 Paginated 模式 rollout 樣本；同時可補上 backlog 那項
   「真實樣本 ≥5 份」的未達門檻。
2. **R9-B｜Source Profile 側寫化**（爆炸半徑小、收益立即可量化）：
   讓 Codex session 的骨架從「零支線」回到與 Claude Code 對等。可獨立於 R9-A 施工。
3. **R9-C｜Session 內全文搜尋**（唯一的基礎便利缺口）。
4. 其餘（成本分析、resume 指令、目錄 handle 記憶）列候選，不進本輪。

**明確不做**：追競品的多 harness 廣度、跨 session 統計（RPD D-5 仍凍結）、React Flow（R5 已拒絕）。

---

## 5. 待查證清單（施工前必須先解決，不得發明）

- [ ] 取得 Paginated 模式的真實 rollout 檔；確認 `item_completed.payload.item` 的實際 JSON 形狀與
      `TurnItem` 變體命名（本文件只從 Rust enum 推得，**未見過實際 JSON**）。
- [ ] 確認目前使用者手上的 Codex 版本走哪一種 `ThreadHistoryMode`，以及是否可由檔案內容自我判斷。
- [ ] 用真實樣本核對 `response_item/agent_message` 是否真的恆為零內容（§2.3）。
- [ ] `function_call_output` 的 `output` 是否有 `success` 欄位可用來還原 `isError`
      （目前寫死 `false`，是 §1.2 error 標籤失效的直接成因之一）。
