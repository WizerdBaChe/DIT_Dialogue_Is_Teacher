# R10.1 — Codex Session Event Provenance RCA（2026-08-15）

## 結論

目前看到的三種訊息不是同一個 bug。

1. `exec` 工具名無法判斷，主因是 Codex 將它記成外層 `custom_tool_call.name = "exec"`，而 `input` 是不保證為單一工具呼叫的自由文字／程式片段；現行正則既會漏判，也可能誤判。
2. `patch_apply_end`、`web_search_end` 與 `mcp_tool_call_end` 找不到原始呼叫，主因是結束事件的 `call_id` 與原始呼叫不在同一 ID 命名空間，且匯出流可因 `context_compacted` 遺失較早的呼叫。現行只能以「同工具、同 turn（若有）、最近仍開啟」推測，無法建立可證明的關係。
3. 目前 UI 文案把這些可預期的資料忠實度限制呈現成 `warn`，因而製造高頻噪音；其中「多半是歷史壓縮」是合理假設，但不是每一筆都已被證明的原因。

因此下一輪不應以「讓 warning 歸零」為目標；應改為保留資料、標示關聯信心（provenance/confidence），並只把真正可能誤導閱讀的情況升為警告。

## 本次證據

### 掃描範圍

- 執行日期：2026-08-15。
- 資料：本機 `~/.codex/sessions` 的 357 份 rollout；只讀掃描，未將 transcript 內容寫入本報告。
- 模式：357/357 為 Legacy；合計 218,517 行。
- 現行 adapter 未知型別佔約 54 行（0.0247%），分散於 14 份檔案；主要是 `tool_search_*`、`image_generation_end`、`thread_goal_updated`，是另一個小型白名單缺口，與本 RCA 的配對警告不同。

### 外層 `exec` 的工具名

| 指標 | 數值 | 判讀 |
|---|---:|---|
| `custom_tool_call` | 9,350 | 外層 exec 呼叫總數 |
| 現行正則無法解析 | 555（5.94%） | `input` 均為字串，但 553 筆沒有 `tools.<name>(` 形狀；不是 JSON 解析失敗 |
| 正則解析到的 `shell_command` | 6,037 | 是最多的工具，但讀檔與改檔都可能落在這個名稱，不能由名稱推導教學語意 |
| 明顯非目前工具目錄的命中 | `combinations`、`append`、`items` | 證明 `/tools\.name\(/` 可命中輸入片段內的文字，而非真正最外層呼叫 |

現況實作位於 `src/core/adapters/codexJsonl.ts` 的 `EXEC_TOOL_NAME_RE` 與 `custom_tool_call` 分支。它只找第一個符合字串，並把失敗統計成 `CODEX_EXEC_TOOL_NAME_UNRESOLVED`；沒有可用的結構欄位可以取代它。

### 結束事件配對

| 事件 | 可辨識的起始呼叫 | 結束事件 | 現行成功配對 | 未配對 | 起始不足的理論下限 |
|---|---:|---:|---:|---:|---:|
| `patch_apply_end` / `apply_patch` | 1,680 | 2,186 | 1,617 | 569 | 506 |
| `web_search_end` / `web__run` | 342 | 586 | 340 | 246 | 244 |
| `mcp_tool_call_end` / `mcp__*` | 464 | 712 | 464 | 248 | 248 |
| 合計 | 2,486 | 3,484 | 2,421 | 1,063 | 998 |

「起始不足的理論下限」是 `max(結束 - 可辨識起始, 0)`。所以至少 998/1,063（93.9%）未配對事件在目前匯出事件流中就沒有足夠的可辨識候選；這不是把最近鄰搜尋再調整一次可修復的問題。其餘 65 筆 patch 與 2 筆 web 可能來自同 turn 嚴格限制、事件順序／邊界，或候選先被消耗，必須逐筆以無內容的結構追蹤才可下結論。

本機另有 97 筆 `context_compacted`。既有 R7B 真實樣本已逐筆證明過一類情況：壓縮前的 `apply_patch` 已不在事件流，壓縮後的 `patch_apply_end` 只好獨立呈現。它是已證實的原因之一，但目前 adapter 沒有將每筆未配對與壓縮邊界做因果連結，故不能把所有 1,063 筆都宣稱為壓縮所致。

## 目前機制與失真點

```text
custom_tool_call (call_id = call_*)
  name = exec
  input = free-form string
       │  regex extracts a possible tools.<name>(
       ▼
pending candidate: tool name + optional turn_id
       ▲
event_msg/*_end (call_id = exec-*)
  no shared ID with the call
  turn_id: present for patch; absent in scanned web/MCP endings
```

- `custom_tool_call_output` 與 `custom_tool_call` 可以用相同 `call_id` 正確掛接；問題只在額外的 `*_end` 事件。
- `patch_apply_end` 的 `turn_id` 在本次 2,186 筆都有；現行實作因此刻意拒絕跨 turn 猜配。
- 本次 586 筆 `web_search_end` 與 712 筆 `mcp_tool_call_end` 都沒有 `turn_id`；現行退回全 session 的最近相容候選，對並行子代理而言天生有誤配風險。
- 候選在成功配對後立即自 pending 集合移除。這避免同一候選重複吸收結束事件，但也表示無法回溯或表達多重／晚到事件。
- 未配對目前會產生合成 marker 卡，並以 warn 聚合；文案在 `src/i18n/diagnosticCopy.ts` 明言「多半是該呼叫已被歷史壓縮取代」，其因果強度超過 adapter 實際掌握的證據。

## 建議調整順序

### P0 — 先降低錯誤宣稱與閱讀噪音

1. 將 `CODEX_EXEC_TOOL_NAME_UNRESOLVED` 改為具名能力限制（例如 `CODEX_EXEC_DETAILS_OPAQUE`）的 info 聚合，而不是 warn。卡片仍顯示 `exec` 與原始輸入；這是使用者可見的命名降級，不是解析失敗。
2. 將 `CODEX_EVENT_UNPAIRED` 文案改成「匯出檔未提供可驗證的原始呼叫關聯；可能包括歷史壓縮、記錄邊界或未支援包裝」，移除「多半」的未驗證歸因。
3. 未配對 `*_end` 不要預設使用顯眼的「未知事件」卡。保留資料，但以低視覺權重的系統標記或折疊的「未關聯工具結束事件」表示；只有同一 turn 中存在多個相容候選而不得不任選時才升為 warn。

### P1 — 改成可稽核的關聯模型，而非假裝有 ID

在 `RawEvent` 或 adapter 私有關聯資料加上下面欄位，並把「原始 ID 配對」和「推測配對」分開：

| 欄位 | 值 | 用途 |
|---|---|---|
| `association` | `exact` / `turn_nearest` / `nearest` / `unmatched` | UI 與蒸餾層知道關聯強度 |
| `unmatchedReason` | `no_candidate` / `turn_mismatch` / `history_compacted_before_end` / `ambiguous` | 不把未知原因偷換成 compaction |
| `sourceCallId`、`endCallId` | 原字串或 `null` | 供診斷與測試稽核，不拿兩種 ID 強行相等 |
| `candidateCount` | 整數 | 讓「最近」是否其實有歧義可見 |

只有在真的同 ID 時使用 `exact`；本資料格式的 `call_*` 對 `exec-*` 不可聲稱 exact。壓縮原因只能在 end 前已見到壓縮邊界、且沒有可辨識候選時標為 `history_compacted_before_end`；那也應是「相容證據」而非絕對因果。

### P2 — 保守地改善 `exec` 名稱辨識

不要把正則擴大成更寬鬆的全文搜尋。它會提升表面覆蓋率，但也把程式字串、註解與多工具 orchestrator script 誤標成單一工具。

可採三段結果：

1. `single_nested_tool`：保守 lexical scanner 在可執行位置只找到一個工具呼叫，才顯示其名稱。
2. `composite_exec`：找到多個候選，顯示「exec（含 N 個工具呼叫）」；不任選第一個。
3. `opaque_exec`：沒有可驗證候選，維持 `exec`。不發 warn。

scanner 至少須略過 quoted string、template literal、line/block comment；若做不到，維持 `opaque_exec` 比猜錯好。`shell_command` 的讀／寫分類是另一個產品語意裁決，不能藉本次 parser 修正偷渡猜測。

### P3 — 補齊已量到的小型型別缺口

`tool_search_call`、`tool_search_output`、`image_generation_end`、`thread_goal_updated` 已有實際欄位形狀，可各自規劃 adapter policy。它們只有約 0.025% 行數，優先度低於 P0/P1；不可與未配對問題混成同一個「noise」指標。

## 建議驗收與量測

實作前先把掃描器擴充為只輸出結構計數的 provenance 報表（不得輸出訊息、指令、cwd、路徑）：

1. 每種 `association` / `unmatchedReason` 的數量，按 `*_end` 型別分列。
2. `exec` 的 `single_nested_tool` / `composite_exec` / `opaque_exec` 數量；另列 scanner 無法安全判讀的原因。
3. 未配對事件中，壓縮邊界前／後的數量；名稱必須是「與壓縮相鄰」而非「由壓縮造成」。
4. 以包含並行子代理、壓縮、單一工具、複合 exec 的合成 fixture 鎖住：不得跨 turn 配對、不得把字串中的 `tools.foo(` 當真正呼叫、不得丟失任何 end event。
5. 真人 UAT：載入一份工具密集 Codex 對話，確認主閱讀流不再被黃色 warning／未知事件卡淹沒；仍能在展開資訊中看見未關聯結束事件與其信心標示。

自動化測試只能證明資料保留與標示正確；最後一項是視覺／閱讀負擔驗收，需由作者在實際 app 判定。

## 不應做的事

- 不要以 `exec-*` 與 `call_*` 的字串轉換猜 ID 關係；現有資料證明它們不是相同命名空間。
- 不要把無結束狀態的 plain exec 顯示為成功；R10 已保留 `outcomeUnknown`，應繼續維持。
- 不要為消掉 warning 而靜默丟棄 `*_end`；它們仍可能帶 patch 結果、搜尋 query 或 MCP 結果。
- 不要宣稱所有未配對都來自 compaction；現有數量只支持「compaction 是已證實原因之一」。

## 關聯程式位置

- `src/core/adapters/codexJsonl.ts`：exec 名稱正則、pending 候選、三種 `*_end` 配對與診斷產生。
- `src/i18n/diagnosticCopy.ts`：使用者看到的兩則 warning 文案。
- `src/core/adapters/codexJsonl.test.ts`：單元測試已覆蓋 turn 限定與無候選降級，但尚未覆蓋 provenance 分類、複合 exec、quoted/comment false positive。
- `scripts/scan-codex-sessions.mjs`：零內容外洩的結構掃描基礎，可擴充為上述量測。

