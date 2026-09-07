---
xi: 1
what: DIT 專案指令——round id 與 phase number 兩種計數器規則、docs/rounds 凍結條款、關鍵不變量 (DIT's project instructions: the two counters — round id vs phase number — the docs/rounds freeze clause, and key invariants)
tags: [dit, conventions, rules]
aliases: [專案慣例, 輪次命名規則, 不變量, CLAUDE.md, project instructions]
---
# DIT — project instructions

ops-relaxation: L1

Author ruling 2026-07-27. L1 = boundary contract + decision charter are active; the full
multi-phase ops workflow is not. Do not re-ask the relaxation gate for this project.

## Language

Follow the global rule in `~/.claude/CLAUDE.md`. In this repo that resolves to:
code, comments and commit messages in English; `docs/**` round documents in Traditional
Chinese with inline English for technical terms; work-card bodies in English; conversation
with the author in Traditional Chinese.

<!-- dit-contract: language | code-comments-commits=English; docs-rounds=Traditional-Chinese-with-inline-English; work-cards=English; author-conversation=Traditional-Chinese -->

## Round layout and naming

Each round lives in `docs/rounds/<round-id>/` and carries a PSM (work cards) plus a UAT
card set. `docs/design/` holds cross-round design documents that outlive a single round.

Two counters exist and they are **not** the same thing. Getting this wrong is what let two
different rounds both call themselves R9 in July/August 2026.

| Counter | Where it lives | Rule |
|---|---|---|
| **Round id** `<YYYY-MM>-<slug>` | directory name, doc filenames, branch name, backlog item prefix | one round = one id, allocated **once**, never reused. The `r<N>[.<m>]-<slug>` form is a **closed legacy namespace**: R1–R12 keep their ids forever, nothing new joins them. See `docs/rounds/ROUNDS.md`. |
| **Phase number** | `references/DIT-phase-log.md` only | monotonic, one checkpoint per round, never renumbered downward. It counts checkpoints, not rounds — historically one phase has covered several rounds. |

<!-- dit-contract: round-id | new=<YYYY-MM>-<slug>; legacy=r<N>[.<m>]-<slug>:closed; registry=docs/rounds/ROUNDS.md; branch=feat/<round-id>; non-round=chore/<slug>|fix/<slug> -->

Rules:

- **Allocate the round id before writing any file, in `docs/rounds/ROUNDS.md`.** That table is
  the registry — **not** the `docs/rounds/` directory listing, which cannot show you a round
  with no directory (R4) or one that is reserved but unstarted (R11.1). A round that ships
  without an id has to be retro-labeled later, which is worse (see `r9.2-transcript-export`).
- **The R-number namespace is closed at R12 (author ruling 2026-08-26).** New rounds use
  `<YYYY-MM>-<slug>`, e.g. `2026-09-codex-provenance`. This is not cosmetic: a sequential number
  is *predictable*, so it can be written down before it exists — which is precisely how "deferred
  to R12" got written, and how R9 collided before it. A date-plus-slug id cannot be forward-
  referenced, because naming the theme IS allocating the round. Follow-up rounds take their own
  slug (`…-repairs`) instead of `.m`, which read like "remediates R<N>" even when it did not
  (R9.2 was a feature).
- **Never defer work to a round id that is not allocated yet.** Unhomed work goes to
  `docs/DEFERRED.md` with a `DW-NN` id and `home: unassigned`. Enforced: `npm run check:rounds`,
  whose live-record rule is now a guard over the closed R-number namespace — the new id shape
  cannot be forward-referenced by construction.
- **`docs/rounds/**` is frozen, and as of 2026-08-26 it is also CLOSED to further annotation.**
  Those documents are the evidence a post-mortem reads. Three dated correction notes were added
  on 2026-08-26 (R11 UAT §D, R11.2 UAT §D, REVIEW_R11_BLIND_SPOTS §5) and they are the last:
  when a frozen document turns out to be misleading, **fix the register, not the document** —
  `docs/rounds/ROUNDS.md` and `docs/DEFERRED.md` are the translation layer between what was
  written then and what is true now. Live records (`references/DIT-*.md`, `docs/DEFERRED.md`,
  this file) are the opposite: they describe the present and are corrected in place.
  One exception, and it is about status not vintage: **the live acceptance card is
  `docs/rounds/r12-source-first-navigation/UAT_R12_v1.0.md`** (2026-08-27), which merges R11.2's
  unfinished items into R12's because R12's branch was cut from R11.2 and carries all of it.
  `UAT_R11.2_v1.0.md` is now a record — it holds the author's filled-in verdicts and is **not**
  edited; the merged card carries those answers forward instead of asking for them again.
- **Every closed round gets a phase checkpoint.** A missing checkpoint is what made the collision
  invisible: Phases 9 and 10 were only written on 2026-08-14, weeks after the work.
- **Doc filenames carry the round id**: `PSM_<id>_*.md`, `UAT_<id>_v*.md`, `RCA_<id>_*.md`,
  `RESEARCH_<id>_*.md`, `DESIGN_<id>_*.md`, `HANDOFF_<id>.md`, `<id>_KICKOFF_PROMPT.md`.
  Legacy rounds use the `R<N>` form of the same names; do not retro-rename them.
- **Branches**: round work is `feat/<round-id>`, matching the round directory exactly.
  Non-round work is `chore/<slug>` or `fix/<slug>` and gets no round id. The historical `codex/`
  prefix is retired — it named the agent that did the work, which is not a property of the branch.
- **Claude Code cloud sessions** produced auto-named `claude/<random-slug>` branches when last
  verified against Claude Code 2.1.246 on 2026-08-26. Those branches are transport, not identity:
  merge one into `main` (or into its properly named round branch), then delete it. Never let an
  auto-named branch be the record of a round. Review this premise after a Claude Code upgrade
  that changes cloud-session branching, `/fork`, or worktree behaviour; the reconciliation
  record is `~/.claude/reports/2026-08-26-cc-version-reconcile-2.1.200-2.1.246.md`.
- **A Claude Code cloud session can now allocate a round id safely**, which it could not under
  the old scheme. When last verified against Claude Code 2.1.246 on 2026-08-26, it branched from
  `origin/main` and could be behind local work it could not see, so it could never know whether
  `R<next>` was taken; `<YYYY-MM>-<slug>` needs no such knowledge. Give it the theme and it can
  name its own round. Review the branching premise on the Claude Code trigger above; the safe
  date-plus-slug conclusion is a DIT naming property and does not depend on that premise staying
  true.

<!-- dit-contract: worktree-identity | detached-worktree=transport; durable-branch=project-contract; codex-prefix=retired; handoff=allowed -->
- **Worktrees are transport, not round identity.** Codex-managed worktrees start detached and
  the app's branch-creation UI suggests a `codex/` prefix; neither changes this repository's
  branch contract. Keep working detached only while the work is disposable. For durable work,
  create the correctly named `feat/<round-id>`, `chore/<slug>`, or `fix/<slug>` branch in that
  worktree, or hand the task back to the local checkout. A branch cannot be checked out in two
  worktrees at once. As of the official Codex worktree documentation checked on 2026-09-07,
  managed worktrees live under `$CODEX_HOME/worktrees` by default and ignored setup files do not
  follow unless covered by `.worktreeinclude`; review when Codex changes its worktree or Handoff
  behaviour. Claude Code `/fork` also created its own worktree when last verified at 2.1.246;
  review that half on the same Claude Code trigger above.

## Invariants worth knowing before editing

<!-- dit-contract: adapter-tolerance | bad-line=diagnostic-and-skip; unreadable-file=diagnostic-and-continue-batch -->
- Adapters never throw on a bad line — a line-level failure records a diagnostic and is
  skipped. As of R9 the same discipline applies at file level: one unreadable file in a
  batch must not fail the batch.
<!-- dit-contract: fallback-visibility | silent-substitution=reportFallback; named-degradation=Diagnostic-aggregate -->
- Every fallback (`?? somethingElse`) must call `reportFallback`. A silent fallback has
  already caused one class of wrong-target bug in this codebase. As of R9.1 the invariant is
  sharpened: `reportFallback` is for a substitution the **user cannot observe**. A degradation
  that is already encoded in the return type and surfaced in the UI (e.g. `titleSource:
  "filename"`, rendered with its own badge) is a *named* degradation — it reports through
  `Diagnostic` aggregates, not through the fallback channel. Putting named degradations on the
  fallback channel floods the console and buries the silent ones it exists to catch.
<!-- dit-contract: blocking-surface | forbidden=window.confirm|window.alert|window.prompt; required=blocking-surface-machine -->
- No `window.confirm` / `alert` / `prompt` in `src/`. Blocking surfaces go through the
  blocking-surface machine (R9 M4).

## Verification

<!-- dit-contract: windows-gates | npm=npm.cmd; required=test|typecheck|build|git-diff-check -->
On Windows, use `npm.cmd`. Before claiming an implementation works, run `npm.cmd test`,
`npm.cmd run typecheck`, `npm.cmd run build`, and `git diff --check`, and paste the output.

<!-- dit-contract: visual-acceptance | automated-build=data-path-only; visual-done=author-confirmation-in-running-app -->
A green build proves the data path, not the picture. Anything visual needs the author's
confirmation in the running app before it can be called done.
