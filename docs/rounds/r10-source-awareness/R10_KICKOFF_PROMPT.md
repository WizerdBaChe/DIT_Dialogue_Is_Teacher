# DIT — R10 Implementation Kickoff Prompt（本機 session 用）

> **2026-08-14 改號說明。** 這一輪原本被雲端 session 開成 R9，與本機早三週的
> `r9-session-browser-and-fsm` 撞號。全案已改為 **R10**，工作項改為 R10-A / R10-B / R10-C，
> phase log 的 checkpoint 改為 Phase 11。下文提到的分支 `claude/product-features-codex-optimization-e2idcs`
> 已合併進 `main`，實作分支請用 `feat/r10-source-awareness`。

> 用法：把下面 `---` 之後的整段，當作本機 DIT session 的第一則訊息貼上。
> 本檔與 `RESEARCH_R10_SOURCE_AWARENESS_AND_CODEX_FIDELITY_v0.1.md` 同步；衝突時研究筆記的證據為準，
> 但研究筆記是 **PIM 級、非 sole-source PSM**，不得直接當施工合約用。

---

You are the implementation AI for **DIT (Dialogue Is Teacher)** at `D:\AIWork\DIT_Dialogue_Is_Teacher`.
Work on branch `feat/r10-source-awareness`, cut from `main`. The cloud research and tooling
(`a631e11`) is already merged into `main` as of 2026-08-14; no pull is needed.

**This session starts with an investigation, not with code.** Do not write product code until the
gate in Step 1 is cleared by the user.

## Read first, in this order
1. `docs/rounds/r10-source-awareness/RESEARCH_R10_SOURCE_AWARENESS_AND_CODEX_FIDELITY_v0.1.md` — the
   evidence base for this round. PIM grade, non-normative; §5 lists what is still unverified.
2. `references/DIT-phase-log.md` — the last entry (Phase 11) is this round's checkpoint.
   Phase 9 (R9 + R9.1) and Phase 10 (R9.2) are the two rounds this one is built on.
3. `docs/BACKLOG.md` — the 2026-08-11 R10 section (R10-A / R10-B / R10-C).
4. `docs/PSM_DIT_v1.0.md` §0 behavior rules, §2 frozen contracts, §4 ADR log.
5. `docs/rounds/r7-multi-source-and-layout/PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md` Part B and
   `docs/rounds/r7.5-codex-noise-and-settings-card/PSM_R7.5_CODEX_NOISE_AND_SETTINGS_CARD_v0.1.md`
   — the Codex adapter's existing contract, including R7-INV-6/7/8/9/10.

## Hard rules
- `src/types/spanTree.ts` is the authoritative data contract (ADR-008).
- Anything the PSM does not cover: STOP, record the question, ask the user. Never invent a decision.
- **Never invent a JSON field name.** Everything about Paginated-mode `item_completed` in the research
  note was inferred from Rust enum variant names in upstream `codex-rs`. Until the scan (Step 1) shows
  the real key paths, treat every field name as unknown.
- UX semantics (interaction behavior, defaults, visuals) are user decisions — ask before designing them in.
- A green build proves the data path, not the picture. Anything visual needs the user's confirmation
  in the running app before it can be called done.
- Code, comments, commit messages: English only. UI strings go through `src/i18n/locales.ts`.
  Conversation with the user: Traditional Chinese.
- Windows: use `npm.cmd`. Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build`,
  `git diff --check` before every commit claim, and paste the output.
- One vertical slice per commit. Never delete files; obsolete ones move to `archive/`.

## Step 1 — Investigation (do this first, then STOP)

```
npm.cmd run scan:codex -- "C:\Users\<you>\.codex\sessions\2026"
```

`scripts/scan-codex-sessions.mjs` streams every rollout line by line (GB-scale files are normal) and
writes two files into the current directory:
- `codex-scan-report.json` — shareable. Structure and a narrow allowlist of enum-like values only;
  message text, reasoning, commands, file paths and cwd never enter it. Files are named `file-001`.
- `codex-scan-files.json` — local-only path map. Do not share.

Report back to the user, in Traditional Chinese, exactly these numbers:
1. **Mode distribution** — how many LEGACY / PAGINATED / MIXED / INDETERMINATE.
2. **Tolerant-capture ratio** — `unknownRatio` per file, and the weighted average, split by mode.
   This is the direct measure of "how much does the current adapter lose".
3. **`item_completed.payload.item` key paths and the `item.type` value set** — from
   `aggregate.itemCompletedKinds` and each file's `itemCompletedShape`.
4. **Any file where `ditRecognizes` is false** — those are files DIT would refuse outright.
5. **`session_meta` key paths actually present** — specifically whether `parent_thread_id`,
   `forked_from_id`, `cli_version` and `originator` appear, and whether `cli_version` correlates
   with the mode verdict.
6. Types in `aggregate.unknownShapes` that are NOT `item_completed` — the other adapter gaps.

Then **STOP and present the decision gate**:
- If PAGINATED + MIXED is a **small** share, the user's agreed order holds:
  **R10-B → R10-C → R10-A**.
- If PAGINATED + MIXED is a **large** share, the premise behind that order has failed — most of the
  user's real Codex sessions are already degraded in DIT. Say so plainly with the numbers and ask the
  user to re-rule the order. **Do not silently reorder.**

## Step 2 — R10-B｜Source Profile（只有在使用者確認後才開工）

**Problem.** `detectAdapter()` identifies the harness correctly and `normalize()` records it on
`doc.session.source`, but `denoise()` and `distill()` never read it. They match hardcoded Claude Code
tool names against every source:
- `src/core/denoise/denoiser.ts` — `EDIT_TOOLS = {Edit, Write, MultiEdit, NotebookEdit}`
- `src/core/distill/distiller.ts` — `INVESTIGATION_TOOLS = {Read, Grep, Glob, WebFetch, WebSearch, NotebookRead}`
- `src/core/adapters/codexJsonl.ts` — tool results hardcode `isError: false`

**Measured baseline (cloud session, 2026-08-11).** The same work expressed in both formats:

| | Claude Code | Codex |
|---|---|---|
| groups | `edit-loop:反覆修改 auth.ts` | (none) |
| tags | milestone×1, decision×1, error×2 | milestone×3, decision×1 |
| skeleton ribs | investigation, edit-loop | (none) |

**Proposed shape** (needs user ratification before coding — it adds a concept to the pipeline):

```ts
interface SourceProfile {
  id: SourceId;
  editTools: ReadonlySet<string>;
  investigationTools: ReadonlySet<string>;
  injectionTags: readonly string[];
  filePathKeys: readonly string[];
}
```

Resolved once at parse time, carried on the document, read by denoise/distill/preamble.

**Scope notes.**
- Codex tool names must come from the Step 1 scan, not from guesswork. `apply_patch` and `web__run`
  are known from the existing adapter; the rest are not.
- `src/core/text/preamble.ts`'s `INJECTION_TAGS` currently mixes Claude-only tags
  (`system-reminder`, `command-name`, `local-command-stdout`) with Codex-only ones
  (`environment_context`, `INSTRUCTIONS`) into one global whitelist. Splitting it is in scope.
- The `#`-header stripping in the same file is source-agnostic and aggressive: any message starting
  with a Markdown heading loses its opening block, in any source. This is **existing behavior** —
  surface it to the user and get a ruling; do not change it unilaterally.
- Restoring `isError` for Codex depends on whether `function_call_output.output` carries a `success`
  field (research note §5). Check the scan before assuming.
- UI: zero changes expected. If a change becomes necessary, that is a scope question — ask.

**Acceptance.** Add a permanent **cross-source parity test**: the same session expressed as Codex and
as Claude Code must produce an equivalent skeleton (same rib kinds, same group kinds, same error tags).
That test is the deliverable's proof, and it is what the current code fails. Plus `npm.cmd test`,
`npm.cmd run typecheck`, `npm.cmd run build`, `git diff --check`.

## Step 3 — R10-C｜Session 內全文搜尋（需要先取得三個 UX 裁定）

Competitors all have it, DIT has none — `src/` contains no search UI and no search i18n key. R5 has
already validated 50 MiB / 29,452 view items, so scrolling is the only way to find anything today.

Cheap because three pieces already exist: `ViewItem[]` is a flat linear index
(`src/core/view/viewModel.ts`), the virtualized list can already jump to any index (R5 "Jump to
target"), and `ReaderMinimap.tsx` already draws a density path that hit markers can overlay with zero
added DOM elements (respect the R5.5 SA-04 lesson: anything that adds Reader DOM must be re-measured
in a real browser, not in a sandbox).

**Ask the user before writing code:**
1. Search scope layers — human-readable text only, plus tool params, plus tool results? (Recommend:
   text + params by default, results behind a checkbox, with an honest "another N hits in tool
   results" count.)
2. Hits inside collapsed content (`tool_result` nested under its `tool_use`, `edit-loop` groups) —
   auto-expand, or show "contains 2 hits ▾" on the parent card? (Recommend the latter.)
3. Are LLM annotations searchable? They are generated asynchronously per card, so results would shift
   as annotation progresses. That needs an explicit behavioral contract.

**Out of scope:** cross-session search (RPD D-5 `SessionLibrary` is still frozen) and semantic/vector
search (needs an embedding model, violates the offline/no-egress line).

## Step 4 — R10-A｜Codex 保真度（最後才做，需要 Step 1 的形狀資料）

Blocked until the scan produces real key paths. Then, in priority order:
1. `event_msg/item_completed` → `TurnItem` mapping for Paginated mode. Without it, Paginated rollouts
   lose every R7/R7.5 enrichment and degrade to messages plus bare exec calls.
2. Use official `entered_review_mode` / `exited_review_mode` as the primary auto-review detector and
   demote R7.5's `AUTO_REVIEW_DUMP_PREFIX` English signature to fallback. Keep the R7-INV-8
   degrade-plus-warning convention when neither is present.
3. Re-verify `response_item/agent_message` against real samples before changing its silent-drop
   treatment. If it ever carries the assistant's real reply, DIT is currently swallowing answers.
4. Read more of `session_meta` — `parent_thread_id` / `forked_from_id` are the official parent-child
   link the backlog item "Codex 子代理協作事件的專屬視覺呈現" was missing, and are far more reliable
   than inferring kinship from `turn_id`. Also `turn_context` (always persisted, carries per-turn
   model / sandbox policy) is currently discarded outright.
5. Persisted `response_item` types the adapter still ignores: `local_shell_call`, `tool_search_call`,
   `tool_search_output`, `web_search_call`, `image_generation_call`, `compaction`, `context_compaction`.

**Adapter mode handling.** Whatever the design, the adapter must be able to tell which mode it is
looking at and say so — including MIXED files, which are resumed across Codex versions and will carry
both vocabularies in one file. Silent misparsing is the one outcome R7-INV-7/8 forbid.

## Definition of done (per slice)
1. Stated acceptance passes; `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build`,
   `git diff --check` all green — paste the output, do not summarize it.
2. `docs/PROGRESS.md` gets a new section (newest on top); `docs/BACKLOG.md` R10 items get ticked;
   `references/DIT-phase-log.md` gets a new checkpoint; new ADR entries appended for every decision
   the user ruled on.
3. End with a numbered manual acceptance checklist for the user, then stop before the next slice.
