# R9.2 — 對話逐字稿匯出（回溯建檔）

> 本檔 2026-08-14 回溯補寫。這一輪在雲端 session 完成並直接併進 `origin/main`，
> 當時**沒有 round id、沒有 round 目錄、沒有 PSM、沒有 UAT**，因此不存在可以搬過來的施工文件。
> 本檔的作用是把它接回 round 命名體系，並誠實記下它缺什麼；它**不是** PSM，也不是驗收單。

## 事實

| 項目 | 值 |
|---|---|
| Round id | `r9.2-transcript-export`（回溯指派） |
| Phase checkpoint | Phase 10（回溯補寫於 `references/DIT-phase-log.md`） |
| 版本 | `v0.4.0` |
| Commits | `f1801b4` → `addfc62` → `a9b12bd`，以 `33bc8f6` 併入 `origin/main` |
| 分支 | 雲端自動命名，已不存在於 remote 命名紀錄中 |
| 基準樹 | `2cc4a06`（`origin/main`）——**不含 R9 與 R9.1** |
| 併回本機 | 2026-08-14，merge commit 之後接 `e7830bd` 修正 |

## 交付內容

- `src/core/export/transcript.ts` / `transcriptMarkdown.ts` / `transcriptHtml.ts` / `transcriptFormat.ts` /
  `transcriptRedact.ts` 與各自的測試。四種輸出：Markdown、JSON、獨立 HTML 閱讀頁、複製到剪貼簿。
- `src/core/privacy/apply.ts` / `redact.ts` / `policies.ts`：把重疊解析與替換轉換從 `gateway.ts` 抽出共用。
- `src/types/spanTree.ts`：新增選用的 `synthetic` 標記，讓逐字稿能丟掉 Codex adapter 對系統事件的代述。

設計理由、四個順帶修掉的既有缺陷、以及各項 scope 決策，完整寫在上述 commit 的 message 內文，
本檔不重述；`references/DIT-phase-log.md` 的 Phase 10 有摘要。

## 這一輪缺什麼（不要當成已完成）

1. **沒有人工驗收。** 只有 `npm test` / `typecheck` / `build` 綠燈。逐字稿與 HTML 閱讀頁是給人看的東西，
   綠燈只證明資料路徑，不證明畫面。四種輸出都還沒有人在真實瀏覽器裡開過。
2. **沒有 UAT 卡。** 若要補驗收，需新寫一份 `UAT_R9.2_v1.0.md`。
3. **與 R9 的互動未經檢驗。** 這一輪寫在沒有 R9 的樹上。合併時只有測試 fixture 撞到
   `ParseResult.warnings` → `diagnostics` 的契約變更（`e7830bd` 已修）。R9 為 `SpanType` 新增的
   `"marker"`、R9.1 的 marker 語意變更，是否影響逐字稿的輸出內容，**沒有被驗證過**。
