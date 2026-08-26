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
| R12 | `r12-source-first-navigation` | **已規格化，未施工** | 探索 (discovery) 依 agent 系統分流、檢視 (viewing) 收斂回同一套 |

## 未配置 (not allocated)

**R13 及之後全部空著。** 需要新輪次時：先在這張表加一列，再建目錄與分支。

沒有歸屬的待辦**不會**在這裡出現——它們在 [`docs/DEFERRED.md`](../DEFERRED.md)，帶
`DW-NN` id 與 `home: unassigned`。等到某一輪要吃下它們時，才在那份登記表把 `home` 改成
真正的輪次 id。這樣做的理由：先寫下「延到 R13」就等於用掉了 R13，而下一個真正的主題還
沒出現——那正是 R9 撞號與 R12 撞號的形狀。

<!--
review-when: a new round id is allocated, a reserved id is started or dropped, or a round's
status changes. This table is the input to scripts/check-round-ids.mjs — an edit here that
the checker rejects is an error in the edit, not in the checker.
-->
