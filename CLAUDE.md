# DIT — project instructions

ops-relaxation: L1

Author ruling 2026-07-27. L1 = boundary contract + decision charter are active; the full
multi-phase ops workflow is not. Do not re-ask the relaxation gate for this project.

## Language

Follow the global rule in `~/.claude/CLAUDE.md`. In this repo that resolves to:
code, comments and commit messages in English; `docs/**` round documents in Traditional
Chinese with inline English for technical terms; work-card bodies in English.

## Round layout and naming

Each round lives in `docs/rounds/<round-id>/` and carries a PSM (work cards) plus a UAT
card set. `docs/design/` holds cross-round design documents that outlive a single round.

Two counters exist and they are **not** the same thing. Getting this wrong is what let two
different rounds both call themselves R9 in July/August 2026.

| Counter | Where it lives | Rule |
|---|---|---|
| **Round id** `<YYYY-MM>-<slug>` | directory name, doc filenames, branch name, backlog item prefix | one round = one id, allocated **once**, never reused. The `r<N>[.<m>]-<slug>` form is a **closed legacy namespace**: R1–R12 keep their ids forever, nothing new joins them. See `docs/rounds/ROUNDS.md`. |
| **Phase number** | `references/DIT-phase-log.md` only | monotonic, one checkpoint per round, never renumbered downward. It counts checkpoints, not rounds — historically one phase has covered several rounds. |

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
- **Cloud sessions** produce auto-named `claude/<random-slug>` branches. Those are transport, not
  identity: merge one into `main` (or into its properly named round branch), then delete it.
  Never let an auto-named branch be the record of a round.
- **A cloud session can now allocate a round id safely**, which it could not under the old
  scheme. It branches from `origin/main` and may be behind local work it cannot see, so it could
  never know whether `R<next>` was taken; `<YYYY-MM>-<slug>` needs no such knowledge. Give it the
  theme and it can name its own round.

## Invariants worth knowing before editing

- Adapters never throw on a bad line — a line-level failure records a diagnostic and is
  skipped. As of R9 the same discipline applies at file level: one unreadable file in a
  batch must not fail the batch.
- Every fallback (`?? somethingElse`) must call `reportFallback`. A silent fallback has
  already caused one class of wrong-target bug in this codebase. As of R9.1 the invariant is
  sharpened: `reportFallback` is for a substitution the **user cannot observe**. A degradation
  that is already encoded in the return type and surfaced in the UI (e.g. `titleSource:
  "filename"`, rendered with its own badge) is a *named* degradation — it reports through
  `Diagnostic` aggregates, not through the fallback channel. Putting named degradations on the
  fallback channel floods the console and buries the silent ones it exists to catch.
- No `window.confirm` / `alert` / `prompt` in `src/`. Blocking surfaces go through the
  blocking-surface machine (R9 M4).
