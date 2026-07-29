# DIT — project instructions

ops-relaxation: L1

Author ruling 2026-07-27. L1 = boundary contract + decision charter are active; the full
multi-phase ops workflow is not. Do not re-ask the relaxation gate for this project.

## Language

Follow the global rule in `~/.claude/CLAUDE.md`. In this repo that resolves to:
code, comments and commit messages in English; `docs/**` round documents in Traditional
Chinese with inline English for technical terms; work-card bodies in English.

## Round layout

Each round lives in `docs/rounds/<round-id>/` and carries a PSM (work cards) plus a UAT
card set. `docs/design/` holds cross-round design documents that outlive a single round.

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
