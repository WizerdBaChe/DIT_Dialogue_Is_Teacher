# R10 Step 1 — 本機 Codex rollout 實測結果（決策閘門用）

> 2026-08-14 於本機執行 `scripts/scan-codex-sessions.mjs`，樣本為 `%USERPROFILE%\.codex\sessions`
> 全部 356 份 rollout、218,478 行。報告與本機對照表寫在 session scratchpad，**未進 repo**。
> 另跑一支只讀結構的補充探針（key 名稱、型別、長度、計數），回答研究筆記 §5 兩個待查項；
> 兩支工具都不記錄訊息內文、指令、檔案路徑或 cwd。
>
> 本檔是**實測紀錄**，不是 PSM。裡面的「建議」需要作者裁定後才算數。

## 1 六項必報數字

| # | 項目 | 結果 |
|---|---|---|
| 1 | 歷史模式分佈 | **LEGACY 356 / 356**。PAGINATED 0、MIXED 0、INDETERMINATE 0。legacy 訊號 82,040 次，paginated 訊號 **0** 次 |
| 2 | 寬容收納比例 | 加權 `unknownRatio` = **0.025%**（55 / 218,478 行）。356 份裡只有 14 份有任何未知行，最高一份 1.47%（2/136）。parse error 共 3 行，無檔案被截斷 |
| 3 | `item_completed.payload.item` | **樣本中完全不存在**，`itemCompletedKinds` 為空，無任何檔案有 `itemKinds` |
| 4 | `ditRecognizes` 為 false 的檔 | **0 份**。356 份的第一行型別全部是 `session_meta` |
| 5 | `session_meta` 實際鍵 | `cli_version` 356/356、`originator` 356/356、`parent_thread_id` 134/356、`forked_from_id` 25/356。`cli_version` 橫跨 0.142.5 → 0.147.0-alpha.6.5 共 9 個版本，**與模式判定無相關性**（全部 LEGACY） |
| 6 | 非 `item_completed` 的未知型別 | `response_item/tool_search_call` 17、`response_item/tool_search_output` 17、`event_msg/image_generation_end` 11、`event_msg/thread_goal_updated` 10。合計 55 行，就是第 2 項的全部來源 |

## 2 三個推翻研究筆記前提的發現

### F-1　Paginated 模式在本機零出現 → R10-A 第一優先項失去施工基礎

研究筆記把 Paginated 列為「對既有 Codex 投資的最大風險」。實測：**跨 9 個 CLI 版本、含最新
alpha，356 份全是 Legacy**。

- 這不只是「佔比小」，是**一份都沒有**。沒有樣本就無法實作 `TurnItem` 對映——研究筆記自己也
  寫了「絕不可自行發明 JSON 欄位名」，而現在沒有任何真實鍵路徑可依據。
- 因此 R10-A 的第 1 項（Paginated 對映）從「最高優先」變成**無法施工**。
- 但「零出現」不等於「不會出現」。Paginated 是 upstream 已存在的持久化模式，可能是尚未對此
  帳號啟用。合理的處置是**偵測而非對映**：adapter 看到 paginated 訊號時，依 R7-INV-7/8 明講
  「此檔為未支援的歷史模式」並降級，而不是靜默誤讀。這個成本遠低於猜欄位名。

### F-2　`response_item/agent_message` 從來不是空的 → DIT 正在吞掉真實訊息

研究筆記標為「待查證」。實測 544 筆，**544 筆都有非空 content**：

| 指標 | 值 |
|---|---|
| 總數 | 544（分佈在有子代理的 session） |
| `content` 為空陣列 | **0** |
| 文字長度 min / 中位數 / max | 75 / 84 / **16,215** |
| 鍵 | `type`、`author`、`recipient`、`content`、`internal_chat_message_metadata_passthrough`、`id`(403/544) |

DIT 目前把它當「零內容的子代理雜訊」靜默丟棄。**這是資料遺失，不是降噪。** 最長一筆 16KB 的
內容整段消失，使用者不會看到任何提示。

另外 `author` / `recipient` 是一組定址欄位——這正是 backlog 舊項「Codex 子代理協作事件的專屬
視覺呈現」一直缺的東西，比從 `turn_id` 推親子關係可靠得多。`inter_agent_communication_metadata`
出現 544 次，與 agent_message 數量完全一致。

**建議：把這一項從 R10-A 抽出來，升為本輪最高優先。** 它是三項候選裡唯一一個「正在造成使用者
看不到既有資料」的缺陷；R10-B 是品質降級（線索變少），R10-C 是功能缺口（本來就沒有）。

### F-3　`function_call_output.output` 沒有 `success` 欄位 → 復原 `isError` 的既定路線不成立

研究筆記把「用 `output.success` 復原 `isError`」列為 Codex 缺 error 標籤的直接解法。實測 4,142 筆：

- `output` 是字串：3,455 筆
- `output` 是陣列：687 筆
- 帶 `success` 欄位的：**0 筆**

所以這條路徑不存在，R10-B 的驗收（跨來源同等的 error 標籤）不能靠它達成，必須另找依據
（例如 `custom_tool_call_output` 的形狀，或 patch/exec 事件自身的結束狀態）——**這是 R10-B 開工前
必須先確定的前置，目前未決。**

附帶：`entered_review_mode` / `exited_review_mode` 在 356 份裡**一次都沒出現**。研究筆記提議把它
升為 auto-review 的主偵測器、把 R7.5 的英文簽名降為 fallback——以本機資料無法驗證，且會把唯一
可用的偵測器降級。建議維持現狀，等真的看到官方標記再說。

## 3 順帶量到、目前沒被使用的資料

| 資料 | 出現 | 現況 |
|---|---|---|
| `source.subagent.thread_spawn`（`parent_thread_id`/`depth`/`agent_path`/`agent_nickname`/`agent_role`） | 59/356 | 完全未讀。`agent_role` 實際值有 `engineering-code-reviewer`、`worker`、`management-tech-lead`、`explorer`、`default` |
| `thread_source` | 200/356（subagent 135、user 82） | 未讀。可直接分辨「這份 rollout 本身就是子代理」 |
| `turn_context` | 1,565 筆 | 整批丟棄。帶每回合的 model / sandbox policy |
| `dynamic_tools` | 83/356 | 未讀。帶該 session 實際可用的工具清單——這正是 R10-B 側寫表想寫死的東西，**可以從資料讀而不是寫死** |

最後一項值得注意：R10-B 原本的設計是一張以 `SourceId` 為鍵的靜態 `SourceProfile` 表。`dynamic_tools`
說明 Codex 的工具集是**逐 session 變動**的，靜態表在 83/356 的情形下會失準。這是設計層面的問題，
不是實作細節。

## 4 決策閘門（等作者裁定，未裁定前不動 `src/`）

原議定順序 **R10-B → R10-C → R10-A** 的前提是「先評估 R10-A 影響，若小則後做」。影響確實小
（Paginated 零出現），所以前提成立——**但 F-2 是議定順序時不知道的事實**。

需要裁定：

1. F-2（agent_message 資料遺失）要不要插隊為第一順位？
2. R10-B 的 error 標籤依據（F-3 之後）尚未確定，要先做一次小型追查，還是先做 R10-C？
3. R10-B 的 `SourceProfile` 要靜態表還是讀 `dynamic_tools`？（會改變這一項的規模）
4. Paginated 依 F-1 改為「偵測並降級告知」，是否同意？
