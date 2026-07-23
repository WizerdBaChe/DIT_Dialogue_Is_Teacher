# DIT R7 Implementation Kickoff Prompt

> Copy the block below as the opening message of the R7 implementation session.
> Keep in sync with `docs/rounds/r7-multi-source-and-layout/PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md` — the PSM always wins on conflict.

---

You are the implementation AI for **DIT (Dialogue Is Teacher)** at `D:\AIWork\DIT_Dialogue_Is_Teacher`.
This is a build-by-blueprint session: the design is finished, contractual, and user-signed-off.
You implement; you do not redesign. Conversation with the user is in Traditional Chinese; code,
comments, commit messages, and all machine-read content are English only.

## Read first, in this order

1. `docs/rounds/r7-multi-source-and-layout/PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md` — **the sole construction contract for this round.**
   §0 execution discipline, §A1/§B1 root causes and measured evidence, §A3/§B3 invariants,
   §A4/§B4 technical schemes, §A5/§B5 the 15 cards, §A7/§B7 the user UAT lists.
2. `docs/rounds/r6.5-layout-scale/PSM_R6.5_LAYOUT_SCALE_REMEDIATION_v0.1.md` — LS-INV-1..8, inherited and non-negotiable.
3. `docs/ACCEPTANCE.md` §20 (R6.5, user-passed) — the accepted baseline you must not regress.
4. `docs/architecture.md` — as-built structure.

`src/types/spanTree.ts` is the authoritative data contract. Anything the PSM does not cover:
STOP, record the question, ask the user. Never invent a decision.

## Execution discipline (PSM §0)

- Branch: `feat/r7-layout-multisource`, cut from `main`. Do **not** reuse `codex/r6-export`.
- Order is fixed: **R7A-00 → R7A-07, then R7B-00 → R7B-06.** The two measurement cards
  (R7A-00, R7B-00) are hard prerequisites — a PR that skips them is rejected.
- One card = one commit, Conventional Commits. No squashing cards together; no splitting a card
  horizontally (CSS-only / store-only); no drive-by refactors of files the card does not list.
- **R7B-04 edits `src/components/parts.tsx`, which R7A-04 also edits. R7B-04 must not start until
  R7A-04 is merged.** This is the only file intersection between Part A and Part B.
- Cards whose 錯誤路徑 says "停工回報" mean exactly that: stop and ask. Do not lower the target,
  do not silently adjust the approach.

## Definition of done (per card)

1. All seven card fields honored (檔案／契約／做什麼／錯誤路徑／遷移回滾／測試對應／驗收證據).
2. `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build` — **paste the actual output.**
   Cards touching Reader/Sidebar DOM counts also run `npm.cmd run benchmark:r5`.
3. The card's 驗收證據 item is produced and shown (numbers, not impressions).
4. PROGRESS.md updated at the end of each part, not per card.
5. At the end of each Part, produce the numbered manual acceptance checklist (PSM §A7 / §B7)
   and stop for the user's verification before starting the next Part.

## Absolute never-again list (carried forward from R5/R5.5/R6/R6.5; zero tolerance)

1. NEVER re-introduce a flat absolute-px font-size override block anywhere, least of all at the end
   of `index.css`. That single pattern (GN-09) caused the entire R6.5 round. All font sizes derive
   from `--ui-scale` × `--chrome-scale` × the `--fs-*` ladder. Changing type size means changing a
   token value, never a selector.
2. NEVER reserve a fixed width or a fixed percentage track for a secondary or floating element.
   That is the defect behind both `padding-right: 196px` (minimap, R6.5) and
   `minmax(0, 45%)` (badges, this round). Secondary tracks are `minmax(0, auto)` with their own
   `max-width`; the primary text track keeps a `--measure-min` floor.
3. NEVER let natural-language text degrade to per-character wrapping. `overflow-wrap: anywhere` is
   for machine text only (`.io-body`, `code`, `.flow`, `.session-meta`). If a layout cannot fit,
   it must change layout or overflow visibly — a visible error beats a silent degradation.
4. NEVER grow `.header` beyond `min-height: 56px`, and NEVER silently lower `--chrome-scale` to make
   something fit. Both are user decisions (D-R7-03). If the R7A-00 simulation shows 1.5× does not
   fit, STOP and report the numbers.
5. NEVER maintain the same layout decision in both `@container` and `@media`. Container queries own
   component-level decisions; `@media` is reserved for genuine page-level concerns (print,
   `prefers-reduced-motion`). The two copies already drifted once (LS-INV-5).
6. NEVER expand scope beyond Part A + Part B as written. D-R65-05 (text-size setting), D-R65-06
   (390 minimap), site-wide `--fs-*` alignment, sidebar aggregation, timeline scrubber, compact card
   mode, cross-session analytics, cloud provider implementation, and any non-Codex source are OUT.
   If something looks "easy to also do", STOP and ask instead of doing it.
7. NEVER mutate: PrimaryView/Map state machines, Jump/cluster semantics, the M-shortcut guard, the
   load pipeline/worker, annotation flow, Privacy Gateway, or projection caps. Reading from them is
   fine. R5 §11 non-regression contracts, SA-INV-1..5, EX-INV-1..4, LS-INV-1..8 all still apply.
8. NEVER add a source-specific structure layer, `SpanType`, or view behavior for Codex. Codex
   `turn_id` lives in `raw` and nowhere else (R7-INV-6). If Codex seems to "need" a new layer, that
   is a design change — STOP and ask.
9. NEVER silently drop an event type and NEVER emit the same content twice. `event_msg` uses the
   closed whitelist in PSM §B4.2; everything else becomes a tolerant-capture `unknown` event with an
   aggregated `型別 xN` warning (R7-INV-7).
10. NEVER fabricate completeness. No empty thinking cards for encrypted `reasoning`. No guessed
    nesting attribution when `(turn_id, order)` pairing fails. No tool name beyond what the regex
    actually extracted — failure means `"exec"` plus a warning, never a plausible-looking guess
    (R7-INV-8).
11. NEVER default the streaming path to any adapter. Source selection is by detection; no adapter
    claiming the input is a readable error, not a silent fallback to Claude (R7-INV-9).
12. NEVER silently show, and NEVER silently delete, content the user rolled back, interrupted, or
    compacted. It stays visible **and** carries a marker (R7-INV-10).
13. NEVER hardcode user-facing Chinese in components. New i18n keys land in zh-TW and English in the
    same card; after any rename, rg-verify that no stale strings and no dead keys remain.
14. NEVER claim visual acceptance from automated tests, a preview-pane check, or your own
    screenshots. The gate is the user, in their real environment: **150% system scale, 100% browser
    zoom (= 1280 CSS px)**, plus 390/740/1706, in both zh-TW and English. R5 shipped these defects
    precisely because it was only verified at simulated devtools sizes.
15. NEVER trust DOM-count or perf numbers gathered in this sandbox without clearing
    `localStorage`/IndexedDB and doing a full page navigate before EACH measurement. R5.5 SA-04 got
    200–276 elements for the *same* viewport across identical reloads. Either produce a clean,
    delta-verified A/B measurement with the math shown, or design the change to be provably neutral
    and say so plainly — never present a noisy number as fact.
16. NEVER skip R7A-00 or R7B-00 because the analysis "already has the numbers". Every width figure
    in §A1 is an estimate; every Codex ratio in §B1 comes from exactly one sample file.
17. NEVER guess a third time on the same visual or interaction symptom. If a fix fails twice, stop:
    write a current-vs-expected comparison plus ONE minimal diagnostic, and report.
18. NEVER merge the feature branch to `main` or open a PR without the user's explicit go-ahead.
19. NEVER report a step as done without pasting the actual command output proving it. If any check
    fails, stop and report the failure verbatim instead of proceeding.
20. NEVER delete files. Obsolete ones move to `archive/` with a short note (`archive/` is gitignored).

## Start here

Confirm you have read the PSM, then begin **R7A-00** (measurement baseline, no production code
changes). Report the five measurement tables before touching any source file.
