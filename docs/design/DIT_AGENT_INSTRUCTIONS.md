---
xi: 1
what: Agent 指令檔的分層設計與規則由來——為什麼 AGENTS.md 是唯一共用契約、CLAUDE.md 只放 Claude 專屬補充，以及每條專案規則背後的事故 (why AGENTS.md is the single shared contract and CLAUDE.md a thin Claude-only layer, and the incident behind each project rule)
tags: [dit, design, agents, conventions]
aliases: [指令檔設計, agent 指令分層, 規則由來, agent instructions design]
date: 2026-09-27
---
# DIT Agent 指令檔：分層設計與規則由來

這份文件給人看，說明兩件事：指令檔為什麼這樣分，以及 `AGENTS.md` 裡每條規則是被哪個事故逼出來的。
規則本身只寫在 `AGENTS.md`；這裡不是第二份規則，兩者不一致時以 `AGENTS.md` 為準。
對應決策：`references/DIT-decisions.md` D-025。

## 1. 結構

| 檔案 | 誰讀 | 放什麼 |
|---|---|---|
| `AGENTS.md` | Codex 原生讀取；Claude Code 經匯入讀取 | **唯一的共用契約 (shared contract)**：語言、round／phase、凍結與 live 紀錄、分支與 worktree、程式不變量 (invariant)、驗證 |
| `CLAUDE.md` | 只有 Claude Code | 第一段是 `@AGENTS.md` 匯入；之後只放 Claude 專屬：ops-relaxation、Claude Code 行為前提（附驗證版本與重查事件） |
| `src/instructionFiles.test.ts` | 隨 `npm test` 自動跑 | 守三件事：CLAUDE.md 仍匯入 AGENTS.md；AGENTS.md 不含單一工具的環境字眼；CLAUDE.md 沒有抄回共用規則 |

放置判準只有一條：**這條規則換一個 agent 還成立嗎？** 成立 → `AGENTS.md`；只對某個工具成立 → 那個工具自己的檔案。
Codex 的專屬內容目前是零：原本想寫的 worktree 規則，改寫成「任何工具自動產生的分支或 worktree 都只是工作場地」之後，對兩邊都成立。

## 2. 兩個工具實際怎麼讀（2026-09-27 查證）

**Claude Code 2.1.281**（官方文件 <https://code.claude.com/docs/en/memory>）

- 2.1.277 起能直接讀 `AGENTS.md`，但預設設定 `claude-md-or-agents-md` 是「路徑上有 `CLAUDE.md` 就只讀 `CLAUDE.md`」。DIT 有 `CLAUDE.md`，所以不匯入的話 Claude **完全看不到** `AGENTS.md`——這正是舊結構兩份檔案會各自漂移的原因。
- `CLAUDE.md` 裡的 `@AGENTS.md` 會在啟動時展開；在任何 Project instructions 設定下都不會重複載入。寫在反引號或程式碼區塊裡的 `@AGENTS.md` 不算匯入。
- 官方明講 Windows 要用匯入、不要用 symlink：git 在 Windows 上會把 symlink checkout 成一行純文字。

**Codex CLI 0.155.1**（官方文件 <https://learn.chatgpt.com/docs/agent-configuration/agents-md>，原網址 developers.openai.com 已 308 轉址至此）

- 每層目錄依序找 `AGENTS.override.md` → `AGENTS.md` → `project_doc_fallback_filenames` 裡設定的名字；`CLAUDE.md` 不在預設清單。本機 `~/.codex/config.toml` 沒有設定 fallback，所以 Codex 不會讀 `CLAUDE.md`。
- 專案文件預設上限 `project_doc_max_bytes` = 32 KiB，從 repo 根目錄一路串到工作目錄，越近的越後面、優先。
- 注意 `AGENTS.override.md` 是**取代**同層的 `AGENTS.md`，不是追加；所以不能拿它來放「Codex 專屬補充」。
- Codex app 的 worktree 預設在 `$CODEX_HOME/worktrees`、以 detached HEAD 開始、建分支時建議 `codex/` 前綴；被 git 忽略的檔案只有列在 `.worktreeinclude` 的才會帶過去（<https://learn.chatgpt.com/docs/environments/git-worktrees>）。

## 3. 每條規則的由來

- **兩個計數器分開。** 2026 年 7／8 月有兩個不同的 round 都自稱 R9，因為 round id 與 phase number 被當成同一個東西。
- **在 `ROUNDS.md` 登記，不看目錄清單。** 目錄清單看不到沒有目錄的 round（R4），也看不到已保留但未開工的 round（R11.1）。沒有 id 就出貨的 round 只能事後補標，更糟（`r9.2-transcript-export`）。
- **R 編號在 R12 關閉（作者裁定 2026-08-26）。** 連號可以被預測，所以能在它存在之前就被寫下來——「延後到 R12」就是這樣寫出來的，R9 撞號也是。日期加主題的 id 無法被預先引用，因為取名字本身就是配置。後續輪次用自己的 slug 而不是 `.m`：`.m` 讀起來像「修補 R<N>」，但 R9.2 其實是新功能。
- **凍結文件不再加註（2026-08-26）。** 那天在 R11 UAT §D、R11.2 UAT §D、REVIEW_R11_BLIND_SPOTS §5 加的三則更正是最後一批；之後的更正寫進登記處。R12 的 UAT 卡是例外，因為它合併了 R11.2 未完成的項目、仍在逐項判定。
- **每個結束的 round 都要有 phase checkpoint。** Phase 9、10 直到 2026-08-14 才補寫，距離工作結束好幾週，撞號因此一直沒被發現。
- **`codex/` 前綴退役。** 它記錄的是「哪個 agent 做的」，那不是分支的屬性。
- **不變量。** 壞行不拋錯（R9 起延伸到檔案層級：一個壞檔不能讓整批失敗）；`reportFallback` 只用於使用者看不到的替代（R9.1 收斂）；阻斷式介面只能走 blocking-surface machine（R9 M4）。

## 4. 這個結構取代了什麼

- **2026-08 以前**：`AGENTS.md` 曾是 `CLAUDE.md` 的完整複本，兩週內就走樣；於是改成「精簡指標＋幾條最貴的規則」。
- **2026-08-26 的兩條裁定**：「AGENTS.md 不編輯，只當檢查器輸入」與「M3 做 AGENTS↔CLAUDE 漂移檢查器」。前提是 Codex 與 Claude 必須各讀一份檔案。
- **2026-09-07**：一個 Codex session 在 `chore/cc-reading-layer` 查出精簡版 `AGENTS.md` 的 round 規則已經錯了（仍叫 Codex 用 `r<N>` 編號），並做了比對標記＋檢查器。那條分支從未合併。
- **2026-09-27（D-025，作者同意）**：查證 Claude Code 可透過匯入讀 `AGENTS.md` 後，前提不再成立——只剩一份規則，就沒有漂移可檢查。上述兩條裁定因此被取代；`chore/cc-reading-layer` 的有效內容（修正後的 round 規則、Codex 讀檔事實、worktree 規則、版本標記）併入本結構，分支本身封存為 tag `archive/cc-reading-layer`。

## 5. 什麼時候要重查

- Claude Code 改變 `@` 匯入語意，或改變 Project instructions 設定的預設值。
- Codex 開始原生讀取 `CLAUDE.md`，或 `AGENTS.override.md` 改成可追加。
- 又有第三個 agent 要在這個 repo 工作：先確認它讀哪個檔，再決定要不要加它自己的薄層。
- `CLAUDE.md` 的 Claude Code 行為前提有各自的重查事件，寫在該段標題旁。
