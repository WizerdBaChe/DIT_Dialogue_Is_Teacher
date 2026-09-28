# HANDOFF 2026-09-perf-survey — performance investigation card

- Round id: `2026-09-perf-survey` (allocated 2026-09-28 in `docs/rounds/ROUNDS.md`)
- Ticket: T-009 in `references/DIT-tickets.md`
- Type: **investigation only. No code in `src/` changes in this round.** The output is a research
  document and, if the author approves, a follow-up build round.
- Written by: the session that shipped v0.4.2 (PR #7, folder-listing isolation), 2026-09-28.
- Base: `main` @ `37a2f26` (v0.4.2).

## 0. 作者裁決區 (sections the author rules on)

這一段是中文，因為要由作者拍板；其餘部分是給執行 agent 的英文規格。

**調查範圍（作者 2026-09-28 指示）**

1. **已知的效能問題**：在 session 瀏覽器裡點一筆 session 時，程式會把整棵目錄重新列一次，而且會開啟每一個檔案，包括不是對話紀錄的檔案。見 §2 的 F1。
2. **全面效能評估**：作者另外要做一輪整體效能優化評估，所以這一輪要把 DIT 所有對效能敏感的部分都調查一遍，並依「值不值得做」排序。見 §3。

**本輪不做的事**：不實作、不改 `src/`、不調常數、不發版。

**調查完成後要請作者裁決的事**（執行 agent 在 RESEARCH 文件的最後一節列出，並附上建議）：

- (a) 哪些項目要開成施工輪，順序如何。
- (b) 效能目標值。例如「點一筆 session 到開始載入 < X ms」「索引 N 個檔案 < Y 秒」。沒有目標的最佳化沒有停止條件。
- (c) `INDEX_MAX_FILES = 500` 要不要改，以及被截斷時該保留哪 500 筆。見 F4：這其實比較像正確性問題，不只是效能。

## 1. Mission (English from here on)

Produce `docs/rounds/2026-09-perf-survey/RESEARCH_2026-09-perf-survey_v1.0.md` (Traditional
Chinese, inline `中文 (English)` for terms, per AGENTS.md; human-read). It must contain:

1. A **baseline table** of every surface in §3, each measured, not estimated, with the command
   or script that reproduces it. Record machine, browser and corpus size beside each number.
2. For each finding: the evidence (file:line and the measured cost), the proposed change in one
   paragraph, the expected gain **stated as a measured or bounded number**, the risk to accepted
   behaviour, and a cost estimate (S/M/L).
3. A ranked recommendation (value ÷ cost), marked with which ones need an author ruling.
4. The open rulings (a)–(c) from §0, each with a recommended answer.

Stop at the document. Do not open a build branch.

## 2. Known findings to verify first (seeded by the v0.4.2 session)

These were observed while fixing the v0.4.2 defect. They are claims to confirm or refute with
measurement. They are not settled facts.

| id | claim | where | seed evidence |
|---|---|---|---|
| F1 | Clicking a row in the session browser re-runs `source.list()`, which walks the whole picked tree and calls `getFile()` on every file, only to look up 1..N paths. | `src/store/sessionStore.ts` `loadIndexEntry` (`const { files } = await source.list()`) | Real `~/.claude/projects`: 3,693 files walked per click. The browser cost was not measured. |
| F2 | The FSA walk calls `getFile()` eagerly on every entry, including non-`.jsonl` files that are never candidates. It also runs strictly sequentially (`await` per entry, no concurrency). | `src/core/index/directorySource.ts` `walk` | 3,693 files vs 1,718 `.jsonl` on the real folder. The listing contract (`DirectoryFile.size` is a sync field) is what forces the eager `getFile()`. |
| F3 | `resolveChains` does bounded full reads of chain-head files after the scan. | `src/core/index/chains.ts`, called from `buildSessionIndex` | Not measured in the browser. |
| F4 | **Truncation picks the wrong 500.** `mains.slice(0, maxFiles)` takes the first 500 in *listing order*; sorting by `endedAt` happens only afterwards, over the survivors. With more than 500 sessions, recent ones can be dropped while old ones are kept. | `src/core/index/sessionIndexer.ts` (`const scanned = mains.slice(0, maxFiles)`) | Real folder: `INDEX_TRUNCATED` count 414 (914 mains). This is a correctness risk that looks like a performance limit. Confirm with a fixture, then report it to the author separately. |

Measured once, in Node, **not a browser**: `buildSessionIndex` over the real
`~/.claude/projects` (`expectSource: "claude-code"`) took about 1.5 s and yielded 357 entries.
Treat that only as an order of magnitude. The FSA path was never timed.

## 3. Full survey scope (the author's broader evaluation)

Cover every surface below. Where earlier rounds already measured something, re-measure it at
v0.4.2 and cite the old number next to the new one.

| surface | what to measure | prior art to reuse |
|---|---|---|
| S1 Folder listing + index | pick → list, list → index, index → first paint; per-source (Claude Code `~/.claude/projects`, Codex `~/.codex`) | `scripts/measure-codex-index.mjs`, `scripts/measure-corpus.mjs` |
| S2 Row click → session open | click → first span visible (F1 lives here), including chain members and subagents | — |
| S3 Parse / load in the worker | ingest time, first progress, cancel latency, memory for large sessions | R5 GN-07 thresholds + `scripts/generate-r5-fixture.mjs`, `scripts/render-r5-benchmark.mjs` (T-005 notes: 964 ms load / 50 MiB) |
| S4 Rendering | Reader and Session Map DOM counts, scroll jank, long tasks (Performance panel), virtualisation behaviour | R5 benchmark (DOM caps 247 / 434) |
| S5 Explanation / annotation | IndexedDB read/write on reopen, batch processing overhead (excluding model latency) | T-002 repository tests |
| S6 Startup + bundle | cold start of the release zip (`start-dit.bat`), JS parse/eval, bundle and `snapshot.html` size (498 KB at v0.4.2) | `vite build` output |
| S7 Export | JSON and HTML snapshot export time and size for a large session | R6 |

Method requirements:

- Measure in a **real Chromium browser** (Chrome or Edge) on this Windows machine for S1, S2 and
  S4. The in-app browser pane cannot open `showDirectoryPicker()` (DW-24), so FSA timings from
  it are invalid. If only the `webkitdirectory` fallback or Node is available, label the number
  with the path it took.
- Every probe script that produces a number the document cites goes under `scripts/` (the
  `measure-corpus.mjs` precedent: a claim nobody else can reproduce is a memo, not evidence).
  Adding scripts is allowed; changing `src/` is not.
- For each proposed optimisation, name the accepted behaviour it could break (RC-A cancellation
  semantics, per-entry isolation from v0.4.2, `INDEX_*` diagnostics, chain stitching, subagent
  pairing) and how a build round would re-check it.
- Numbers drift as the corpora grow. Record corpus size (files, `.jsonl` count, total bytes) with
  every measurement.

## 4. Acceptance for this round

- The RESEARCH document exists with sections 1–4 of §1, every S1–S7 row has a measured baseline
  or a stated reason it could not be measured, and F1–F4 are each confirmed or refuted with
  evidence.
- Any new probe scripts run from a clean checkout and are listed in the document.
- `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd run check:rounds` and
  `git diff --check` are green. `git diff 37a2f26 -- src` is empty.
- `docs/rounds/ROUNDS.md` status is updated to "調查完成，待作者裁決", and T-009 carries the
  document path.

## 5. Non-goals and degradation order

- Non-goals: implementing anything; changing `INDEX_MAX_FILES`; Tauri packaging; model/provider
  latency (network and inference time are not DIT's to optimise).
- If the budget runs short, drop in this order. S7 goes first, then S5, then S6. S1, S2, F1–F4
  and the ranked recommendation are the core and must not be dropped.
