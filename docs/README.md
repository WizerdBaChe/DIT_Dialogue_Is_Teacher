---
xi: 1
what: docs/ 目錄索引——導向核心活文件與各輪次 rounds 子資料夾，本身不重複內容 (the docs/ directory index, routing to core live documents and per-round subfolders without duplicating their content)
tags: [dit, docs, index]
aliases: [文件目錄索引, docs入口, 目錄索引, docs index]
---
# docs/ 索引

這份索引只負責路由，不複製各文件的決策內容。判斷「現在是什麼狀態」時，優先使用 live records；不要把歷史快照當成現況。

## `docs/` 根目錄：維護中的契約與登記表

| 檔案 | 分類與用途 |
|---|---|
| [architecture.md](architecture.md) | 現行 as-built 架構與資料流 |
| [BACKLOG.md](BACKLOG.md) | 尚未決定是否施工的長期備忘 |
| [DEFERRED.md](DEFERRED.md) | 已決定但尚未歸屬 round 的 `DW-NN` 登記表 |
| [USER_GUIDE.md](USER_GUIDE.md) | 使用者操作與匯出說明 |
| [RPD_DIT_v0.1.md](RPD_DIT_v0.1.md) | 初始需求與 D-1～D-5 基礎決策；屬 foundation record |
| [PSM_DIT_v1.0.md](PSM_DIT_v1.0.md) | 初始施工契約與 ADR 基線；屬 foundation record |

舊版 `ACCEPTANCE.md`、`PROGRESS.md`、`OUTSTANDING_2026-08-14.md` 是已封版或停止更新的歷史文件；完整內容已移入本機 `archive/2026-09-18-cleanup/legacy-docs/`，`docs/` 根目錄只保留 compatibility pointer，不冒充 live source。

## `rounds/`：按 round 保存的 frozen evidence

每個 round 目錄保存當時的 PSM、UAT、RCA、RESEARCH、baseline 或 handoff。完整 round id 與狀態以 [`rounds/ROUNDS.md`](rounds/ROUNDS.md) 為準；R1–R12 是封閉的 legacy namespace，新 round 使用 `<YYYY-MM>-<slug>`。

`docs/rounds/**` 是 post-mortem evidence，不能因現在狀態改變而回寫。現行唯一 live acceptance card 是 [`r12-source-first-navigation/UAT_R12_v1.0.md`](rounds/r12-source-first-navigation/UAT_R12_v1.0.md)；新 round 的 acceptance 應放在自己的 round 目錄。

## 其他分類

| 位置 | 分類 |
|---|---|
| [design/](design/) | 跨 round 的設計契約與尚未施工的設計引導 |
| [concepts/](concepts/) | 尚未立項的未來產品構想 |
| [misc/](misc/) | 不屬於單一 round 的一次性審查與檢查報告 |
| [demo/](demo/) | 靜態展示素材，不是產品文件 |

跨階段的 live workflow records 不放在這裡，而在 [`../references/DIT-context.md`](../references/DIT-context.md)、[`../references/DIT-decisions.md`](../references/DIT-decisions.md)、[`../references/DIT-phase-log.md`](../references/DIT-phase-log.md) 與 [`../references/DIT-tickets.md`](../references/DIT-tickets.md)。

## 新文件放置規則

- 只描述目前狀態的文件：放在 `docs/` 根目錄或 `references/` 的既有 live record。
- 只屬一個 round 的施工、驗收與證據：放進 `docs/rounds/<round-id>/`。
- 跨 round 設計：放進 `docs/design/`；未立項想法放 `docs/concepts/`；一次性審查放 `docs/misc/`。
- 已停止更新的快照或明確過時的工作入口：移到根目錄 `archive/<date>-cleanup/`，並在 manifest 保留原位置與 hash。
