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
| **Round id** `r<N>[.<m>]-<slug>` | directory name, doc filenames, branch name, backlog item prefix | one round = one id, allocated **once**, never reused. `.m` is a follow-up to the round it hangs off (R9.1 remediates R9). |
| **Phase number** | `references/DIT-phase-log.md` only | monotonic, one checkpoint per round, never renumbered downward. It counts checkpoints, not rounds — historically one phase has covered several rounds. |

Rules:

- **Allocate the round id before writing any file.** Check `docs/rounds/` first. A round that
  ships without an id has to be retro-labeled later, which is worse (see `r9.2-transcript-export`).
- **Every closed round gets a phase checkpoint.** A missing checkpoint is what made the collision
  invisible: Phases 9 and 10 were only written on 2026-08-14, weeks after the work.
- **Doc filenames carry the round id**: `PSM_R<N>_*.md`, `UAT_R<N>_v*.md`, `RCA_R<N>_*.md`,
  `RESEARCH_R<N>_*.md`, `DESIGN_R<N>_*.md`, `HANDOFF_R<N>.md`, `R<N>_KICKOFF_PROMPT.md`.
- **Branches**: round work is `feat/r<N>[.<m>]-<slug>`, matching the round directory exactly.
  Non-round work is `chore/<slug>` or `fix/<slug>` and gets no round id. The historical `codex/`
  prefix is retired — it named the agent that did the work, which is not a property of the branch.
- **Cloud sessions** produce auto-named `claude/<random-slug>` branches. Those are transport, not
  identity: merge one into `main` (or into its properly named round branch), then delete it.
  Never let an auto-named branch be the record of a round.
- **A cloud session cannot allocate a round id safely** — it branches from `origin/main`, which
  may be behind local work it cannot see. Either hand it the id, or renumber on merge.

## Invariants worth knowing before editing

- Adapters never throw on a bad line — a line-level failure records a diagnostic and is
  skipped. As of R9 the same discipline applies at file level: one unreadable file in a
  batch must not fail the batch.
- Every fallback (`?? somethingElse`) must call `reportFallback`. A silent fallback has
  already caused one class of wrong-target bug in this codebase.
- No `window.confirm` / `alert` / `prompt` in `src/`. Blocking surfaces go through the
  blocking-surface machine (R9 M4).
