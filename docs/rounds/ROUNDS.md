---
xi: 1
what: 輪次 id 配置登記表——round id 的唯一真相來源，R1–R12 為封閉的舊命名空間 (the round-id allocation registry, the single source of truth for round ids; R1–R12 is a closed legacy namespace)
tags: [dit, rounds, registry]
aliases: [輪次登記表, 配置登記表, round id registry, ROUNDS]
---
# DIT — 輪次 id 配置登記表 (Round ID Allocation Registry)

> **這張表是輪次 id 的唯一真相來源 (single source of truth)，不是 `docs/rounds/` 的目錄清單。**
>
> 為什麼需要它：目錄清單看不到兩種 id——**沒有目錄的歷史輪次**（R1–R4 產在單一
> `PSM_DIT_v1.0.md` 時期，目錄是後來補的，R4 至今沒有目錄）與**已保留但尚未開工的輪次**
> （R11.1）。CLAUDE.md 舊寫法「先看 `docs/rounds/`」因此看不全，寫紀錄的人會誤以為某個
> id 還空著。2026-08-26 就是這樣讓 Phase 16 把一批項目延到當時看似空著的「R12」，而 R12
> 後來被配給 source-first-navigation。**配置 id 之前先讀這張表，配好之後立刻回填這張表。**
>
> 機器檢查：`npm run check:rounds`（`scripts/check-round-ids.mjs`）。它驗三條性質——
> 表內 id 不重複、表與目錄雙向對得上、**活紀錄裡提到的每一個 `R<N>` 都必須在這張表裡**。

## 規則 (rules)

- 一個輪次 = 一個 id，**配置一次，永不重用**。`.m` 是掛在它後面的後續輪（R9.1 修 R9）。
- **活紀錄 (live records) 不得指向未配置的 id。** 活紀錄指
  `references/DIT-*.md`、`docs/DEFERRED.md`、`CLAUDE.md`——也就是下一場工作會讀的檔案。
  還沒有歸屬的工作寫進 [`docs/DEFERRED.md`](../DEFERRED.md) 拿一個 `DW-NN` id，**不要**寫
  「延到 R<下一個數字>」。這是 2026-08-26 修掉的那個缺陷的正面寫法。
- **`docs/rounds/**` 底下的輪次文件是凍結紀錄，不受上一條約束，檢查器也刻意不掃它們。**
  當時寫的「R12 候選」在當時為真；改寫它等於竄改事後檢討要用的證據。誤讀風險用**加註**
  解決（見 R11／R11.2 UAT 卡 §D 的 2026-08-26 更正框），不用改寫解決。
- 輪次目錄名 = id + slug，與分支名 `feat/<id>-<slug>` 完全一致。

## 已配置 (allocated)

| id | 目錄 (directory) | 狀態 | 主題 |
|---|---|---|---|
| R1 | `r1-test-foundation` | shipped | 測試基礎與最初的施工進入點 |
| R2 | `r2-ollama-uat` | shipped | 本地 Ollama 分析與其驗收 |
| R3 | `r3-analysis-runtime` | shipped | 分析執行時 (analysis runtime) 與隱私閘道 |
| R4 | — | shipped | 子代理逐字稿跨檔渲染與分支檢視。**沒有目錄**：產於單一 PSM 時期，目錄從未補建 |
| R5 | `r5-guided-navigation` | shipped | 導引式導航與大 session 的有界渲染 |
| R5.5 | `r5.5-semantic-alignment` | shipped | 符號語意對齊：一個符號不得有兩個意思 |
| R6 | `r6-export` | shipped | 版本化 JSON 與單檔 HTML 快照匯出 |
| R6.5 | `r6.5-layout-scale` | shipped | 版面縮放階梯 (`--ui-scale` / `--fs-*`) |
| R7 | `r7-multi-source-and-layout` | shipped | 多來源 (Codex) 支援與版面 |
| R7.5 | `r7.5-codex-noise-and-settings-card` | shipped | Codex 雜訊收斂與設定卡 |
| R8 | `r8-provider-openness` | shipped | Endpoint Provider 開放化與 Preset |
| R9 | `r9-session-browser-and-fsm` | shipped | Session 瀏覽器與阻斷式介面狀態機 |
| R9.1 | `r9.1-uat-remediation` | shipped | R9 驗收缺陷修復 |
| R9.2 | `r9.2-transcript-export` | shipped | 逐字稿匯出。**事後補標的 id**——當時沒先配置 |
| R10 | `r10-source-awareness` | shipped | 來源感知：`SourceProfile` 的**渲染半邊** |
| R10.1 | `r10.1-codex-session-provenance` | RCA 已寫，**修復未做** | Codex exec 名稱解析與 `*_end` 配對的根因分析；P1/P2/P3 未實作（→ DW-13） |
| R11 | `r11-release-readiness` | 施工完成，**驗收失敗** | 合併閘門前的修整輪；UAT 8 過／4 部分／5 失敗／7 無法驗 |
| R11.1 | — | **已保留，未開工** | Markdown／LaTeX 渲染層。設計指引已存在於 `docs/design/DIT_TEXT_RENDERING.md`，一行程式碼都還沒寫 |
| R11.2 | `r11.2-uat-repairs` | 施工完成，**驗收未過** | R11 驗收缺陷的修復輪；B1 與前提 1、前提 2 仍開著 |
| R12 | `r12-source-first-navigation` | 施工完成，**已併入 `main`**（2026-08-30，`aa74fd9`）。作者裁決免除本輪 UAT 等待——**不等於驗收通過**，`UAT_R12_v1.0.md` 的項目未被逐項判定 | 探索 (discovery) 依 agent 系統分流、檢視 (viewing) 收斂回同一套 |
| 2026-09-compact-chain | `2026-09-compact-chain` | 施工完成，**待驗收、未併入**（2026-09-06 配置並施工；分支 `feat/2026-09-compact-chain`；PSM §4 是驗收清單） | T-008／DW-16：壓縮後的續接檔以 `compact_boundary` 的 uuid 串成一場對話——索引層分組、載入時拼接並跨檔去重 |
| 2026-09-editorial-workspace | `2026-09-editorial-workspace` | 施工與自動檢查完成，待作者視覺驗收、未併入 | 延續編輯排版風格，重整首頁資訊層級、載入入口與閱讀定位 |

## R 編號到 R12 為止封號 (numeric namespace closed at R12)

**作者裁決 2026-08-26：不會再有下一個 R 編號。** 上表那 20 個 id 從此是一個**封閉的命名
空間**——永久有效、繼續被引用、但不再新增。

理由是這個缺陷的根：連續編號讓「下一個 id」**可以被預測**，所以它可以在存在之前就被寫進
紀錄。「延到 R12」寫得出來，正是因為誰都猜得到下一個是 12。這不是靠紀律修得掉的——只要
編號可預測，遲早有人再寫一次；R9 撞過一次、R12 撞第二次，就是證據。

### 新命名 (from the next round on)

輪次 id = **`<YYYY-MM>-<slug>`**，例如 `2026-09-codex-provenance`。

- **結構上無法前向引用**：要寫出這個 id，你得同時知道月份**和主題**。而只要你講得出主題，
  這一輪就已經配置了——「先佔下一輪」在這個命名底下講不出口。這才是真正把洞補起來。
- **自我配置**：不查表也知道有沒有被用掉，沒有稀缺性可搶。
- **目錄天然按時間排序**，這是舊編號只是碰巧做到的事。
- **後續輪不用 `.m`**，自己拿一個 slug：`2026-09-codex-provenance-repairs`。順便修掉第二個
  歧義——`.m` 讀起來像「修 R\<N>」，但 R9.2 是新功能不是修復，只有 R9.1 是。

分支同步：`feat/<id>`，例如 `feat/2026-09-codex-provenance`。

### 不改名的東西

**R1–R12 全部維持原樣，包含 R12 本身。** R12 的 id 從來不是問題——問題是「在 R12 存在之前
就引用它」。改名要動目錄、分支、PSM 檔名，還會讓已經產生的 commit 訊息指向不存在的名字，
換不到任何東西。**封號不等於改名。**

### 檢查器的職責因此縮小

`check:rounds` 的 P1（活紀錄不得指向未配置的 id）從此是**舊編號的遺留守衛**——新命名結構上
不可能被前向引用，那條規則對新 id 無事可做。這是設計變好的徵兆，不是保護變弱：機制縮小是
因為它守的洞被填掉，不是因為放棄守。

## 未歸屬的待辦不在這裡

沒有歸屬的待辦**不會**出現在上表——它們在 [`docs/DEFERRED.md`](../DEFERRED.md)，帶
`DW-NN` id 與 `home: unassigned`。等到某一輪要吃下它們時，才把 `home` 改成真正的輪次 id。

<!--
review-when: a new round id is allocated, a reserved id is started or dropped, or a round's
status changes. This table is the input to scripts/check-round-ids.mjs — an edit here that
the checker rejects is an error in the edit, not in the checker.
-->
