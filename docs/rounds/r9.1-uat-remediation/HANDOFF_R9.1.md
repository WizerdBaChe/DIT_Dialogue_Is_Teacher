# R9.1 Handoff — state, index, and what comes next

> Written 2026-07-29 at the close of the R9.1 remediation round.
> **Primary consumer: the next session.** Read this file first; it is the cheapest path
> back to full context. Everything below is verified against the tree, not recalled.
>
> Author-facing sections (rulings, open questions, risk acceptance) are in Traditional Chinese
> because the author rules on them personally. Everything else is English by project contract.

---

## 1 Where the repo actually is

| Fact | Value |
|---|---|
| Current branch | `feat/r9.1-uat-remediation` |
| Branch head | `801cb22` (7 commits ahead of `main`) |
| `main` head | `83723ab` — **9 commits ahead of `origin/main` (`e46585d`)** |
| Remote | `origin` → `github.com/WizerdBaChe/DIT_Dialogue_Is_Teacher` |
| Working tree | clean at handoff time except the two doc edits in §6 |
| Tests | `npm test` → **373 passed / 48 files** |
| Build | `npm run build` → green (tsc + 2 vite builds); `dist/snapshot.html` 439 kB / 138 kB gzip |
| Version | `0.3.1` (not bumped this round) |

**Nothing from R9 or R9.1 has been pushed.** `main` carries the whole R9 round locally and
`origin/main` still sits at `v0.3.1`. Merging R9.1 into `main` and pushing are both **unstarted
and unauthorised** — the author has not said to push.

### Branch inventory (many stale branches exist; do not assume they are live)

Live: `main`, `feat/r9.1-uat-remediation` (this round), `feat/r9-session-browser-and-fsm` (kept
undeleted by author ruling). Everything else (`feat/r1-*` … `feat/r8-*`, `codex/*`,
`claude/cranky-tereshkova-5744cb`) is historical.

---

## 2 Reference index — read in this order

| # | File | What it is | Read it when |
|---|---|---|---|
| 1 | `docs/rounds/r9.1-uat-remediation/HANDOFF_R9.1.md` | this file | always first |
| 2 | `docs/rounds/r9-session-browser-and-fsm/RCA_R9_UAT_v1.0.md` | **root causes RC-A…RC-H**, each pinned to a source line; §4 holds the three author rulings | before touching anything R9.1 changed |
| 3 | `docs/rounds/r9.1-uat-remediation/PSM_R9.1_WORKCARDS_v1.0.md` | work cards M1–M11 with per-card acceptance | to see what was in scope and why |
| 4 | `docs/rounds/r9.1-uat-remediation/UAT_R9.1_v1.0.md` | manual acceptance checklist; **§F is the B5 risk acceptance** | when the author is about to test |
| 5 | `docs/rounds/r9-session-browser-and-fsm/UAT_R9_v1.0.md` | the original UAT with author reports inline | to re-read a report verbatim |
| 6 | `docs/design/DIT_STATE_MACHINES.md` | maintained state-machine inventory (DSM-1…DSM-10) | any state/FSM work |
| 7 | `docs/design/DIT_TEXT_RENDERING.md` | Markdown/LaTeX design note, **no implementation** | if picking up rendering |
| 8 | `docs/BACKLOG.md` | three sections now: normal backlog, **無法驗證項**, **R9.1 留下的決定** | when choosing next work |
| 9 | `CLAUDE.md` | project invariants; the fallback-channel rule was sharpened this round | before writing any fallback |

---

## 3 What R9.1 changed, by cause

Each entry: what was wrong structurally, where the fix lives, how it is pinned.

| Cause | Structural defect | Fix location | Pinned by |
|---|---|---|---|
| **RC-A** | Picking and indexing shared one `try`; the cancel test (`AbortError`) was only valid for the first phase, so an indexing failure read as a user cancel and landed on the one invisible state | `store/sessionStore.ts` (`pickAndIndexDirectory`, `resumeLastDirectory`), `core/index/handleRepository.ts`, `store/surfaceSelectors.ts` | `store/browseFailure.test.ts` (10 tests) |
| **RC-B** | `reportFallback` used for a degradation the user can already see, flooding the channel meant for invisible ones | `core/index/sessionIndexer.ts` | `sessionIndexer.test.ts` |
| **RC-C** | Subagent identity read off a path string that a plain multi-file selection does not carry | `core/pipeline.ts` (`isSubagentContent`), `components/ReaderMinimap.tsx` | `core/pipeline.test.ts` |
| **RC-D** | Marker identity destroyed at the normalize boundary; `outcome` was positional | `types/spanTree.ts`, `core/normalize/normalizer.ts`, `core/distill/distiller.ts` | `core/distill/distiller.test.ts` |
| **RC-E** | `.btn` declared appearance but never size, across `<button>` and `<label>` | `styles/index.css` | measured in-browser, not statically testable |
| **RC-F** | Progress strip's column minimums bound to its first host | `styles/index.css` | measured in-browser |
| **RC-G** | Density encoding and category criteria never stated to the user | `components/ReaderMinimap.tsx`, `core/view/categoryDefinitions.ts`, `components/OverviewView.tsx` | `categoryDefinitions.test.ts` |
| **RC-H** | No Markdown/LaTeX rendering | none — design note only | n/a |

### Renames and type changes that will break stale assumptions

- `BrowseState`: `"no_directory"` → **`"closed"`**. It is now reachable only by user intent.
  Any code or test that expects the old name is stale.
- `SpanType` gained **`"marker"`**. `KIND_TO_SPAN_TYPE.unknown` maps to it. Records typed
  `Record<SpanType, …>` (SPAN_DOT, locale `spanKind`) are compiler-enforced.
- `SkeletonNodeKind` lost **`"milestone"`**. `SpanTag.milestone` is unaffected and still used.
- New diagnostic codes: `INDEX_DIRECTORY_UNREADABLE` (fatal), `INDEX_TITLE_FROM_FILENAME` (info),
  `INDEX_HANDLE_NOT_PERSISTED` (warn). `diagnosticCopy.test.ts` enforces copy in both locales.
- `saveDirectoryHandle` / `clearDirectoryHandle` now return `HandleStoreNotice` instead of `void`.

### Verified in a real browser (not just tests)

- Overview action row: 40 / 30 / 30 px before → **40 / 40 / 40** after; header row all 31 px.
- Settings-dialog progress strip: button box 72×**37** (wrapped) before → 76×**30** (single line)
  after; columns 246 / 123 / 76. The old geometry was re-applied to a probe to confirm causation.
- 7 category definitions render with all three parts; minimap caption and aria-label present.
- Console: no errors.

---

## 4 What is genuinely open

### 4a Blocked on the author (cannot proceed without a ruling)

1. **R9.1 manual acceptance has not happened.** `UAT_R9.1_v1.0.md` A1–A3 and B1–B5 are unrun.
   A1 in particular is the one item that can still disprove the RC-A diagnosis: if the folder
   still fails on the first attempt after a cache clear, the mechanism is something else and the
   error text in the new `INDEX_DIRECTORY_UNREADABLE` message is the next clue.
2. **Copy judgement** — 「挑選 Session」/「載入單一檔案」 were chosen by the assistant.
3. **Category definitions** — whether the 決策 definition is correct and legible.
4. **`milestone`** — whether to reinstate it with a criterion of its own.
5. **Push / merge / release** — all three unstarted and unauthorised.

### 4b Known-unknowable (do NOT schedule these)

- **B5 Firefox / Safari.** 作者 2026-07-29 裁決：本環境無法驗，沒有測試依據。
  記在 `docs/BACKLOG.md` 的「無法驗證項」，**不是待辦**。解除條件與未偵測風險寫在那裡與
  `UAT_R9.1_v1.0.md` §F。任何文件都不得宣稱 Firefox/Safari 可用。

### 4c Carried debt (unchanged by this round, already logged)

`DSM-7` (privacy resolver at module scope), `DSM-8` (`cacheReady` has three writers),
`DSM-9` (`replayTimer` at module scope), `DSM-10` (map is both a view and a blocking surface),
and the missing `tests/e2e/` in-process renderer observer. All in `docs/BACKLOG.md`.

---

## 5 Traps for the next session

- **The R9 UAT file is the author's own record.** It has been appended to (a ruling note under
  B3) but must not be rewritten. New findings go in a new file.
- **`.btn` sizing is now a row-level concern.** If a new button looks wrong, do not add
  `min-height` to the element — set `--btn-min-h` on the row, or add a variant next to
  `.btn.lg` / `.btn.sm`. Adding per-element sizing is exactly what produced 40/30/30.
- **`reportFallback` vs diagnostics.** See the sharpened rule in `CLAUDE.md`. A degradation the
  user can already see reports through `Diagnostic`; only invisible substitutions use the
  fallback channel.
- **Two render paths.** Anything that changes how a span looks must be done in both the reader
  and `core/export/snapshotTemplate.ts`, or the exported snapshot silently diverges.
- **vitest runs in node.** Top layer, backdrop, occlusion and hit-testing are invisible to it.
  Layout and modality claims need the browser tools or the author.
- **`ops-relaxation: L1`** is recorded in `CLAUDE.md`. Do not re-ask the relaxation gate.

---

## 6 Immediate uncommitted state

Two doc edits made while writing this handoff, not yet committed:

- `docs/rounds/r9.1-uat-remediation/UAT_R9.1_v1.0.md` — B5 restated as unverifiable; new §F.
- `docs/BACKLOG.md` — new 「無法驗證項」 section.

Commit them together as `docs(r9.1): record B5 as unverifiable rather than untested`.
