---
xi: 1
what: DIT 開發者入口——現行文件路由、驗證命令、分支與 round 規則 (the developer entry point for current documentation, verification commands, branch rules, and round rules)
tags: [dit, entry, dev-guide]
aliases: [開發者文件, 開發入口, 文件地圖, DEV_README, dev guide]
---
# DIT — 開發者文件 (DEV_README)

這份文件只保留「現在接手工作要去哪裡」的路由。歷史決策與逐輪證據不在這裡重述，避免把舊快照誤讀成現況。

## 文件地圖

| 文件 | 分類與用途 |
|---|---|
| [`README.md`](README.md) | 對外產品入口與使用情境 |
| [`docs/README.md`](docs/README.md) | `docs/` 的分類索引與放置規則 |
| [`docs/architecture.md`](docs/architecture.md) | 現行 as-built 架構、資料流、模組與已知限制 |
| [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) | 使用者操作與匯出說明 |
| [`docs/BACKLOG.md`](docs/BACKLOG.md) | 尚未決定是否施工的長期備忘 |
| [`docs/DEFERRED.md`](docs/DEFERRED.md) | 已決定但尚未歸屬 round 的工作登記表；`DW-NN` 是現行入口 |
| [`docs/rounds/ROUNDS.md`](docs/rounds/ROUNDS.md) | round id 與狀態的唯一登記表 |
| [`docs/rounds/r12-source-first-navigation/UAT_R12_v1.0.md`](docs/rounds/r12-source-first-navigation/UAT_R12_v1.0.md) | 現行唯一 live acceptance card；仍未逐項判定 |
| [`references/DIT-context.md`](references/DIT-context.md) | domain glossary 與文件語境 |
| [`references/DIT-decisions.md`](references/DIT-decisions.md) | live decision journal；`## Now` 是目前 frontier |
| [`references/DIT-phase-log.md`](references/DIT-phase-log.md) | phase checkpoint 歷史與目前階段脈絡 |
| [`references/DIT-tickets.md`](references/DIT-tickets.md) | T-NNN 任務帳本與證據 |
| [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) | 專案規則；`CLAUDE.md` 是權威來源 |

`docs/ACCEPTANCE.md`、`docs/PROGRESS.md`、`docs/OUTSTANDING_2026-08-14.md` 的完整內容與舊版 `DEV_README.md` 已於 2026-09-18 移入本機 `archive/2026-09-18-cleanup/legacy-docs/`；前三個原路徑只保留 compatibility pointer。它們保留作歷史查證，不再作為施工、驗收或現況來源。

## 現行狀態邊界

- R12 已併入 `main`，但作者免除的是等待，不是驗收；R12 的 acceptance 仍未逐項判定。
- `2026-09-compact-chain` 已完成施工與自動檢查，2026-09-27 併入 `main`（v0.4.0）；作者驗收仍未做。
- `2026-09-editorial-workspace` 已完成施工與自動檢查，2026-09-27 併入 `main`（v0.4.0）；作者視覺驗收仍未做。
- 目前狀態以 `ROUNDS.md`、`references/DIT-*.md`、`docs/DEFERRED.md` 與本輪 UAT/PSM 為準；不要從資料夾名稱或舊 progress snapshot 推測現況。

## 開發與驗證

在 Windows PowerShell 使用 `npm.cmd`：

```powershell
npm.cmd install
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run check:rounds
git diff --check
```

自動化 gate 只證明它實際覆蓋的 data path；任何 layout、interaction 或 visual claim 仍須在 running app 中由作者確認。

## Branch 與 round 規則

- round work 使用 `feat/<round-id>`；非 round 維護使用 `chore/<slug>` 或 `fix/<slug>`。
- 新 round 先在 [`docs/rounds/ROUNDS.md`](docs/rounds/ROUNDS.md) 配置 `<YYYY-MM>-<slug>`，再建立任何 round 文件；R1–R12 是封閉的 legacy namespace。
- `docs/rounds/**` 是 frozen evidence，不能用現在的判斷回寫舊文件；狀態更正寫入 register、live records 或新的 dated record。
- live records 應修正現況，不應再新增會與 `DIT-phase-log`、`DIT-decisions` 或 `DIT-tickets` 分叉的平行總表。

## 架構入口

先讀 [`docs/architecture.md`](docs/architecture.md) 的 data flow 與 module table；再依需要進入 `src/core/`、`src/components/`、`src/store/`。產品契約與歷史決策分別回看 [`docs/RPD_DIT_v0.1.md`](docs/RPD_DIT_v0.1.md) 與 [`docs/PSM_DIT_v1.0.md`](docs/PSM_DIT_v1.0.md)，但它們不是現況 status register。
