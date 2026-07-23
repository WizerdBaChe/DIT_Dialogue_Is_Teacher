# R7B-00 — 樣本基線與型別普查（2026-07-23）

> 依 [PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md](PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md) §B5 R7B-00
> 執行。§B1 已用 `2026/07/19` 的 16.3 MB 樣本核對過三處推翻設計文件的細節（工具名藏在 exec input、
> `patch_apply_end` 要補既有 exec 呼叫、`mcp_tool_call_end` 要進白名單），本卡在開工 Part B 施工卡
> 之前，額外核對兩份 §B1 撰寫時沒看過的樣本，確認結論仍然成立、並記錄兩項新觀察。

## 樣本

| 樣本 | 大小 | 行數 | 特徵 |
|---|---|---|---|
| `2026/07/08/rollout-2026-07-08T16-46-28-...jsonl` | 17.6 MB | 23,747 | Part A §22 提到的「已知最大真實檔案」；純對話、零工具呼叫 |
| `2026/07/23/rollout-2026-07-23T03-35-05-...jsonl` | 3.8 MB | 2,240 | 當天最新樣本；含 Codex 子代理（sub-agent）協作事件 |

（§B1 原樣本 `2026/07/19/rollout-...-019f76c0-...jsonl`，16.3 MB／1,912 行，維持既有結論不變，
不重複列在此。）

## 型別普查

### `2026/07/08` 樣本（17.6 MB，零工具呼叫）

```
11735 response_item/message
11599 event_msg/agent_message
  137 event_msg/task_started
  137 event_msg/user_message
  137 event_msg/task_complete
    1 session_meta
    1 event_msg/token_count
```

JSON 解析：23,747 行、**0 筆失敗**。

**觀察 1：大檔案不等於「工具呼叫密集」。** §B1 的原始樣本是工具呼叫密集型（`custom_tool_call`／
`patch_apply_end` 等佔相當比例），這份樣本幾乎全是 `response_item/message`（使用者/助手對話）與
`event_msg/agent_message`（B4.2 白名單判定為噪音、不出事件），代表大檔案也可能單純是「對話輪次多」。
兩種真實情境（工具密集 vs 對話密集）的效能特徵不同（前者事件密度高、後者是少數幾種型別大量重複），
R7B-05 的真實樣本回歸應兩種都涵蓋，不能只用工具密集的樣本代表全部大檔案情境。

### `2026/07/23` 樣本（今日最新，含子代理事件）

```
445 event_msg/token_count
339 response_item/reasoning
221 response_item/function_call
221 response_item/function_call_output
209 response_item/custom_tool_call
209 response_item/custom_tool_call_output
137 event_msg/agent_reasoning
127 response_item/message
111 event_msg/agent_message
 49 inter_agent_communication_metadata      ← §B1／B4.2 白名單都沒有
 49 response_item/agent_message             ← response_item 層的 agent_message，B4.2 只列了 event_msg 層
 40 event_msg/sub_agent_activity            ← §B1／B4.2 白名單都沒有
 26 event_msg/patch_apply_end
  8 turn_context
  8 event_msg/web_search_end
  7 event_msg/task_started
  7 event_msg/user_message
  6 session_meta
  6 event_msg/task_complete
  6 event_msg/thread_settings_applied
  4 world_state
  2 compacted
  2 event_msg/context_compacted
  1 event_msg/turn_aborted
```

JSON 解析：2,240 行、**0 筆失敗**。其餘型別（`function_call`／`custom_tool_call`／`patch_apply_end`／
`web_search_end`／`turn_context`／`session_meta`／`compacted`／`world_state`／`thread_settings_applied`／
`context_compacted`／`turn_aborted`）分布與 §B1 一致，B4.2 白名單表格可直接沿用。

**觀察 2：Codex 新增了子代理協作事件，§B1／B4.2 撰寫時（2026-07-22）沒有踩到。**
`inter_agent_communication_metadata`（頂層型別）、`event_msg/sub_agent_activity`、以及
`response_item/agent_message`（B4.2 表格只列了 `event_msg/agent_message`，沒有 `response_item` 層
的這個組合）三者共 89 筆，佔這份樣本 2,240 行的約 4%。

**裁定（見 R7 Part B 實作計畫，已於規劃階段與使用者確認）**：這三個型別**照白名單外的預設路徑處理**
——落入 R7B-02 的寬容收納，聚合為「型別 ×N」warning，不新增專屬分支、不新增 view 層行為
（呼應 PSM §B2 非目標）。是否要讓 Codex 子代理比照 Claude Code 既有的 `isSidechain` 群組視覺呈現，
記錄為 BACKLOG 候選（見 R7B-06），留待之後决定，不在本輪擴大範圍。

## 結論

- §B1 的三處核心推翻（工具名藏在 exec input、`patch_apply_end` 巢狀配對、`mcp_tool_call_end` 進
  白名單）在兩份新樣本上都成立，無需修訂。
- 新增兩項觀察記入本文件（大檔案不代表工具密集；Codex 新增子代理事件已存在但不阻塞施工，走
  既有寬容收納路徑）。
- **R7B-00 到此完成，可以進 R7B-01。**
