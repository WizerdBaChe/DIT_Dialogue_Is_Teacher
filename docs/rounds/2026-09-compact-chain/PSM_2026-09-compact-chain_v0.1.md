# PSM 2026-09-compact-chain — compacted continuation files render as ONE conversation (v0.1)

- **Round id**: `2026-09-compact-chain` (allocated 2026-09-06 in `docs/rounds/ROUNDS.md`; no collision)
- **Branch**: `feat/2026-09-compact-chain`
- **Origin**: `references/DIT-tickets.md` T-008 · `docs/DEFERRED.md` DW-16 (home set to this round)
- **Author session**: claude-config `s:8a5b20ed` (2026-09-06, Fable main loop, ops-relaxation L2)
- **Status**: built 2026-09-06, green at the branch tip; author acceptance (§4) and merge pending — see §7

---

## 0　Boundary contract

**Premises**
- P-env (verified 2026-09-06): 424 transcripts under `~/.claude/projects/*`; 10 files start with a `compact_boundary`; 9 of them resolve to a parent file on disk, 1 (CLI `9335c619`) has no parent left. Six parent→child pairs measured line by line (§1).
- P-intent (user, 2026-09-06): start T-008 now; touch nothing else from the compaction audit. Ticket acceptance is the scope.
- P-validity (model, measured): the child file re-emits the parent's boundary record (same uuid), the compact summary, 2–3 preserved records and the parent's whole post-boundary segment, then appends its own turns. One of six parents diverged after the boundary (`2d736817`).

**Interpretation forks (chosen → alternative)**
- Chain key: the head boundary's own `uuid` → `logicalParentUuid` alone. The ticket names `logicalParentUuid`; measurement shows it points at a record that exists in BOTH files, so it cannot identify the parent by itself. It stays as half of the parent test (§2.2).
- Resolution time: at index time (bounded full reads of time-filtered candidates) → on open. Grouping the list needs the answer before anyone opens anything.
- List shape: chained children fold under the root row with a `接續 ×N` badge → nested child rows. The ticket says ONE logical session; nested rows are a one-line flip in `SessionBrowserDialog.tsx` if the author prefers them.
- Duplicate policy: drop a continuation file's events whose uuid an earlier chain member already emitted → keep and mark. In-file duplicates (a file re-emitting its own head block, seen in `68f287cd`) are untouched.

**Boundary inputs**: `DirectorySource` file list with ranged reads; 128 KB head window (`INDEX_SCAN_HEAD_BYTES`); entry `startedAt`/`endedAt` from head/tail scans; compact JSON (`"uuid":"…"`) as written by Claude Code; resolution cap 8 candidate files / 256 MB per browse.

**Acceptance (ticket T-008, verbatim)**: loading a folder containing a real compacted chain shows ONE logical session in the browser — chained files grouped, timeline stitched in order, the boundary rendered as the existing marker event; a fixture with a real chained pair passes; typecheck/tests/build stay green.

**Non-goals & degradation**: Codex chains (no such record shape); in-file duplicate suppression; a parent that continued on its own after the boundary is rendered chronologically before the child's turns (no branch view); a parent no longer on disk → the child stays a standalone entry with an info diagnostic, never a claim that it is standalone by nature; a boundary past the head window → not detected (same fate). Drop order if the round runs out of budget: badge tooltip → duplicate-count diagnostic → fold (children stay listed, root still loads the chain) — core = grouping + stitched load.

---

## 1　量到的事實（盤點）

| 母檔 → 子檔 | 母檔 boundary 位置 | 母檔壓縮後記錄 | 子檔共享其中 | 子檔自有記錄 | 保留段副本 | 形狀 |
|---|---|---|---|---|---|---|
| `7d074bf8` → `7fed77ca` | L3461／3789 | 249 | 243 | 345 | 3 | 雙寫 |
| `5b8bea97` → `68f287cd`／`bc7436fd`／`fffca805` | L385／530 | 125 | 122 ×3 | 2906／5／311 | 3 | 雙寫，三個手足 |
| `2d736817` → `0ee5c8e5` | L956／983 | 18 | 1 | 593 | 2 | **母檔分歧** |
| `8ee03a1f` → `1c256260` | L2277／3527 | 962 | 862 | 9763 | 2 | 雙寫 |
| `e258504a` → `4593d832` | L1175／1382 | 163 | 160 | 276 | 3 | 雙寫 |

- 子檔頭部固定形狀：`custom-title` → `mode` → (`atis-latch`) → `queue-operation`… → **`compact_boundary`**（uuid 與母檔同一顆）→ `isCompactSummary` user → 保留段副本（uuid 與母檔壓縮前尾端相同，`parentUuid` 已重接、跳過 attachment）→ 母檔壓縮後整段副本 → 子檔自己的新回合。
- `logicalParentUuid` 指向的記錄在母檔位於 boundary **之前**，在子檔位於 boundary **之後**。這就是母檔判準。
- 母檔的 boundary 一律在檔案中段（L385/530、L3461/3789…），頭尾 128 KB 視窗掃不到——所以解析必須整檔讀，但只對候選檔做。
- `2ec80b41`／`d0127035`（AppData 目錄）：boundary 在 L27/L35，但 `logicalParentUuid` 在檔內 boundary 之前就出現 → 檔內壓縮，**不是**續接檔（負向對照）。
- `9335c619`：第一筆 assistant 的 `parentUuid` 全目錄找不到（母檔已被清理）；沒有 boundary → 本輪不處理（孤兒 fork 不在票的範圍）。
- 時間戳不單調：子檔 L7 的 assistant（02:05:31）早於 L5 的 boundary（02:10:15）。拼接排序只能靠「檔案順序 + 去重」，不能靠時間。

---

## 2　Design

### 2.1 Index layer — detect the chain head (`src/core/index/sessionIndexer.ts`)
`ScanStats` gains `chainHead: { boundaryUuid, logicalParentUuid, boundaryTimestamp } | null`, set by `absorb()` on the FIRST `compact_boundary` whose `logicalParentUuid` is not among the uuids fed before it. Determinable inside the head window; the seen-set already threaded through `feed()` is reused. Emitted on `SessionIndexEntry.chain.head`.

### 2.2 Index layer — resolve the parent (`src/core/index/chains.ts`, new)
`resolveChains(entries, files, options)` runs after the scan loop:
1. For each entry with a head, candidates = entries in the same `project`, not itself, not a sibling (same `boundaryUuid`), `kind !== "subagent"`, with `startedAt ≤ boundaryTimestamp ≤ endedAt` (null timestamps → kept, tried last), sorted by `startedAt` descending.
2. Each candidate is read in 4 MB ranged chunks with a 128-byte overlap; the reader looks for the byte positions of `"uuid":"<logicalParentUuid>"` and `"uuid":"<boundaryUuid>"`. Parent ⇔ both found and target < boundary. First parent wins; the chunked read stops as soon as the verdict is known.
3. Budget: at most 8 candidate files and 256 MB read per browse; exhausted → the entry stays unresolved and `INDEX_CHAIN_SEARCH_CAPPED` (warn) is added once. No parent among candidates → `INDEX_CHAIN_UNRESOLVED` (info, count). Read errors are per-candidate and count as "not the parent".
4. Result: `entry.chain.parentPath` (string | null). Cycles are impossible by construction (parent must contain the boundary before the child's head) but `chainMembers()` guards against them anyway.

`chainMembers(entries, rootPath)` returns the ordered member paths (root, then children in `startedAt` order, recursively). `foldChains(entries)` returns the root entries with `chain.childPaths` filled and the folded children removed; both are pure and shared by the store and the dialog.

### 2.3 Load — stitch and dedupe (`src/core/pipeline.ts`, `src/core/ingest/*`)
`SessionBlobInput`, `TranscriptFileInput` and `ParsedFileOutcome` gain `role?: "main" | "continuation"`. `buildSessionDocumentFromParsedFiles`:
- `countTopLevelSessions` ignores continuation files (they legitimately carry their own sessionId).
- Ordering: main, then continuations in the order given, then subagents; the existing timestamp sort stays (child-only records are later than everything they follow; the copied records are dropped before sorting).
- Dedupe: while walking a continuation file, an event whose `uuid` was emitted by an earlier main/continuation file is dropped; dropped count → `CHAIN_DUPLICATES_DROPPED` (info). Events without uuid are kept. Subagent files are never deduped.
- `meta` stays the main file's (parent sessionId, parent title).
The boundary marker is the parent's own `compact_boundary` record through the unchanged `markerText` path; the child's copy is a duplicate and is dropped.

### 2.4 Store and dialog
- `loadIndexEntry(path)`: wanted set = `chainMembers(root)` each followed by its own `subagentPaths`; continuation blobs carry `role: "continuation"`. Opening a folded child path is not reachable from the UI; if reached (stale state) it loads that file alone as today.
- `SessionBrowserDialog.tsx`: list = `foldChains(visible)`; the root row shows `接續 ×N` with a tooltip naming the member files; `hasCompaction` badge unchanged.
- i18n: `browser.chainCount(n)` / `browser.chainMembers` in every locale table; diagnostic copy for the three new codes.

### 2.5 Files touched
`src/core/index/contracts.ts`, `src/core/index/sessionIndexer.ts`, `src/core/index/chains.ts` (+ test), `src/core/pipeline.ts` (+ test), `src/core/ingest/contracts.ts`, `src/core/ingest/session.worker.ts`, `src/core/ingest/sessionLoader.ts`, `src/core/diagnostics/contracts.ts`, `src/i18n/diagnosticCopy.ts`, `src/i18n/locales.ts`, `src/store/sessionStore.ts`, `src/components/SessionBrowserDialog.tsx`, `src/fixtures/chain/*` (+ `src/fixtures/index.ts`), `docs/DEFERRED.md`, `docs/rounds/ROUNDS.md`, `references/DIT-tickets.md`, `references/DIT-phase-log.md`, `references/DIT-decisions.md`.

---

## 3　Automated acceptance

- `chains.test.ts`: positive — fixture pair resolves child→parent; sibling with the same boundary is not a parent; a candidate whose boundary uuid appears only AFTER the target (a grandchild copy) is not a parent; negative — in-file boundary (AppData shape) yields no head; missing parent → `INDEX_CHAIN_UNRESOLVED`, no throw; cap → `INDEX_CHAIN_SEARCH_CAPPED`; `chainMembers` order and cycle guard.
- `sessionIndexer.test.ts`: `chain.head` captured from the head window; standalone file → `chain.head === null`.
- `pipeline.test.ts`: parent + continuation → one document, parent meta, exactly one compaction marker, child-only events present after the parent's, `CHAIN_DUPLICATES_DROPPED` count equals the copied records; two unrelated mains without roles still → `MULTIPLE_SESSIONS`.
- Real-data control (not committed, recorded in the phase checkpoint): the resolver run over `~/.claude/projects` must find the 9 parents in §1 and nothing for the AppData pair.
- Gates: `npm run typecheck`, `npm test`, `npm run build`, `npm run check:rounds`.

---

## 4　人工驗收（A 必驗 / B 體驗）

A1　從對話集選擇 `~/.claude/projects/C--Users-gunda--claude`：`論文分析簡報製作流程` 只剩一列，帶 `接續 ×1`；`子代理分派成本優化` 一列帶 `接續 ×3`。
A2　打開前者：時間軸上母檔的內容在前、壓縮標記在中、子檔的新回合在後；壓縮標記只有一個。
A3　打開 `2d736817` 那條鏈：母檔分歧的 18 筆出現在子檔回合之前，沒有被吃掉。
A4　診斷面板：無 warn（除非搜尋預算真的被用完）；info 有 `CHAIN_DUPLICATES_DROPPED` 且數字接近 §1 的「子檔共享」欄。
B1　`接續 ×N` 的 tooltip 列出成員檔名，讀得懂哪幾個檔被併了。
B2　索引時間沒有明顯變慢（候選整檔讀取只發生在有續接頭的檔案上，本目錄 5 個）。

## 5　降級宣告

母檔不在磁碟上（`9335c619` 類）→ 子檔照舊單獨列出，多一則 info；不會假裝它本來就是獨立對話。搜尋預算用完 → warn 一則，未解析的續接檔照舊單獨列出。以上兩種都是「無法判定」，不是「判定為獨立」。

## 6　未決

- 折疊 vs 巢狀子列：本輪折疊（票面「ONE logical session」）。作者若要看見成員列，翻 `foldChains` 的用法即可。
- 母檔分歧的那 18 筆要不要標成分支（R4 的分支檢視）：本輪不做，先讓它可見。

---

## 7　BUILT 2026-09-06 (contract re-check at close-out)

- **Acceptance vs contract**: grouped (`foldChains`, one row per chain) ✓ · stitched in order (`TranscriptRole`, chain-ordered blobs, cross-file dedupe) ✓ · boundary = the parent's own record through the unchanged `markerText` ✓ · fixture pair shaped after a real chain (`src/fixtures/chain/`) ✓ · gates green ✓. Nothing in the degradation order fired.
- **Gates** (branch tip, exit codes read directly): `tsc --noEmit` clean · vitest 696/696 across 70 files (12 new in `chains.test.ts`, 2 in `sessionIndexer.test.ts`, 3 in `pipeline.test.ts`) · two-stage build clean · `check:rounds` OK (21 ids, 19 directories).
- **Real-data control** (temporary vitest file over `~/.claude/projects`, deleted after the run, never committed): all 9 parents of §1 resolved, the two AppData in-file boundaries produced 0 chain heads, 0 chain diagnostics. `C--Users-gunda--claude`: 156 files, 152 entries, 5 heads; index 333 ms of which resolution 122 ms — 21 ranged reads, 76.3 MB (the head/tail scan itself read 116.5 MB). Expectations were fixed from the Python measurement before the TypeScript ran.
- **Deviations from §2**: none in behaviour. `locateChainParent` takes `chunkBytes` as an option so the straddling-needle case is testable on a tiny blob; the store marks the role on the member's main file only (subagent blobs stay role-less, as §2.4 implied).
- **Not done, by design**: no separate `UAT_*.md` (the R12 card is still the only live acceptance card and is unfilled; §4 above is this round's checklist); no nested child rows; no branch rendering of the diverged parent; the CLI orphan `9335c619` (no boundary, parent gone) is out of scope as stated in §1.
