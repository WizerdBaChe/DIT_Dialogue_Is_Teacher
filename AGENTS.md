---
xi: 1
what: DIT 共用專案契約——所有 coding agent 都遵守的語言、round 命名、分支、不變量與驗證規則；Codex 原生讀取，Claude Code 經 CLAUDE.md 匯入 (the shared project contract every coding agent follows — Codex reads it natively, Claude Code imports it from CLAUDE.md)
tags: [dit, conventions, rules, agents]
aliases: [專案契約, 專案慣例, 輪次命名規則, 不變量, AGENTS.md, project instructions, shared agent contract]
---
# DIT — project contract for coding agents

This is the one file of project rules for every coding agent in this repository. Codex loads it
natively. Claude Code loads it through the `@AGENTS.md` import in `CLAUDE.md`; that file adds only
Claude Code-specific notes, and other agents can ignore it.

Keep this file tool-neutral: a rule that depends on one agent's harness, paths or settings belongs
in that agent's own instruction file, not here. The reasons behind the rules are recorded for
humans in `docs/design/DIT_AGENT_INSTRUCTIONS.md`; you do not need it to follow them.

## Language

- Code, comments, commit messages, configuration and agent instruction files: English.
- `docs/**` documents written for people (round documents, design documents, user guide):
  Traditional Chinese, with inline `中文 (English)` for technical terms.
- Work-card (PSM) bodies an agent will execute: English.
- Conversation with the author: Traditional Chinese.

## Where things are

| What | Where |
|---|---|
| Round registry: every round id and its status | `docs/rounds/ROUNDS.md` |
| The live acceptance card | `docs/rounds/r12-source-first-navigation/UAT_R12_v1.0.md` |
| Decisions (`D-NNN`) and the current frontier (`## Now`) | `references/DIT-decisions.md` |
| Phase checkpoints | `references/DIT-phase-log.md` |
| Tickets (`T-NNN`) | `references/DIT-tickets.md` |
| Glossary | `references/DIT-context.md` |
| Unhomed deferred work (`DW-NN`) | `docs/DEFERRED.md` |
| Developer entry and document map | `DEV_README.md` |
| Architecture as built | `docs/architecture.md` |

Read the current state from these registers, never from folder names or old progress snapshots.

## Rounds and phases

Two counters exist and they are not the same thing:

| Counter | Where it lives | Rule |
|---|---|---|
| Round id `<YYYY-MM>-<slug>` | directory name, doc filenames, branch name, backlog prefix | one round, one id, allocated once, never reused |
| Phase number | `references/DIT-phase-log.md` only | monotonic; one checkpoint per closed round; counts checkpoints, not rounds |

- Allocate the round id in `docs/rounds/ROUNDS.md` before writing any file. That table is the
  registry; the `docs/rounds/` directory listing is not.
- `r<N>[.<m>]-<slug>` (R1 to R12) is a closed legacy namespace. Those rounds keep their ids and no
  new round joins them. A follow-up round takes its own slug (for example `…-repairs`), never `.m`.
- Never defer work to a round id that is not allocated. Unhomed work goes to `docs/DEFERRED.md` as
  `DW-NN` with `home: unassigned`. `npm run check:rounds` enforces this.
- Every closed round gets a phase checkpoint.
- Doc filenames carry the round id: `PSM_<id>_*.md`, `UAT_<id>_v*.md`, `RCA_<id>_*.md`,
  `RESEARCH_<id>_*.md`, `DESIGN_<id>_*.md`, `HANDOFF_<id>.md`, `<id>_KICKOFF_PROMPT.md`. Legacy
  rounds keep their `R<N>` names; do not rename them.

## Frozen documents and live records

- `docs/rounds/**` is frozen evidence and closed to further annotation. When a frozen document
  turns out to be misleading, fix the register (`docs/rounds/ROUNDS.md`, `docs/DEFERRED.md`), not
  the document.
- Exception, by status rather than age: the live acceptance card named above is edited as it is
  judged. `UAT_R11.2_v1.0.md` is a record of the author's verdicts and is not edited.
- Live records describe the present and are corrected in place: `references/DIT-*.md`,
  `docs/DEFERRED.md`, `docs/rounds/ROUNDS.md`, `AGENTS.md`, `CLAUDE.md`. Do not start a parallel
  status table that can fork from them.

## Branches and worktrees

- Round work: `feat/<round-id>`, matching the round directory exactly. Non-round work:
  `chore/<slug>` or `fix/<slug>`, with no round id.
- A branch name describes the work, not the agent that did it: no `codex/` or `claude/` prefix on a
  durable branch.
- Whatever an agent tool creates on its own is transport, not identity: an auto-named branch, a
  suggested tool-prefixed branch name, a detached-HEAD worktree, a forked session's worktree. Use
  it while the work is disposable. For durable work, create the properly named branch (a branch
  can be checked out in only one worktree at a time) or hand the work back to the main checkout.
  Merge into `main` or the round branch, then delete the transport branch or worktree. Never let
  one be the record of a round.
- Any session may allocate a round id, even one working from an out-of-date `origin/main`: a
  date-plus-slug id does not depend on knowing which number was taken last.

## Invariants (read before editing `src/`)

- Adapters never throw on a bad line. A line-level failure records a diagnostic and is skipped;
  one unreadable file must not fail a batch.
- Every fallback (`?? somethingElse`) calls `reportFallback`, but only for a substitution the user
  cannot observe. A degradation already encoded in the return type and shown in the UI (for
  example `titleSource: "filename"` with its own badge) is a named degradation and reports through
  `Diagnostic` aggregates instead. Named degradations on the fallback channel bury the silent ones
  it exists to catch.
- No `window.confirm`, `alert` or `prompt` in `src/`. Blocking surfaces go through the
  blocking-surface machine.

## Verification

- On Windows, invoke npm as `npm.cmd`.
- Before claiming work is done, run `npm.cmd test`, `npm.cmd run typecheck`,
  `npm.cmd run build` and `git diff --check`, and paste the output. Add `npm.cmd run check:rounds`
  when a change touches rounds or live records.
- A green build proves the data path, not the picture. A visual or interaction change is done only
  after the author confirms it in the running app.
- Release packaging: `scripts/package-release.bat` (builds, tests, and zips `dist/` as `app/`).
- `src/instructionFiles.test.ts` keeps this arrangement honest: it fails if `CLAUDE.md` stops
  importing this file, or if this file picks up a single-agent harness reference.
