# DIT — project instructions (Codex)

**`CLAUDE.md` in this same directory is the single source of truth. Read it now, and treat it
as authoritative wherever this file is thinner or disagrees.** This file exists only because
Codex looks for `AGENTS.md`; it is deliberately a pointer plus the few rules that are costly
to get wrong, not a second copy. A full duplicate was tried and had already drifted out of
date within two weeks — that is why it is not one.

ops-relaxation: L1 (author ruling 2026-07-27; do not re-ask the relaxation gate).

## The rules most expensive to violate

- **Language.** Code, comments, commit messages, `AGENTS.md`: English. `docs/**` round
  documents: Traditional Chinese with inline `中文 (English)` for technical terms. Work-card
  bodies: English. Conversation with the author: Traditional Chinese.
- **Round and phase naming.** Round id `r<N>[.<m>]-<slug>` and the phase number in
  `references/DIT-phase-log.md` are two different counters. Allocate the round id before
  writing the first file, check `docs/rounds/` for collisions first, and never reuse an id.
  Branches mirror the round directory (`feat/r<N>-<slug>`); non-round work is `chore/`/`fix/`.
  Full contract in `CLAUDE.md`.
- **Adapters never throw on a bad line.** A line-level failure records a diagnostic and is
  skipped; a single unreadable file must not fail a batch.
- **Every fallback (`?? somethingElse`) calls `reportFallback`** — but only for a substitution
  the user *cannot observe*. A degradation already encoded in the return type and shown in the
  UI is a *named* degradation and reports through `Diagnostic` aggregates instead. Putting
  named degradations on the fallback channel buries the silent ones it exists to catch.
- **No `window.confirm` / `alert` / `prompt` in `src/`.** Blocking surfaces go through the
  blocking-surface machine.
- **Windows.** Use `npm.cmd`. Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build`
  and `git diff --check` before claiming anything works, and paste the output.
- **A green build proves the data path, not the picture.** Anything visual needs the author's
  confirmation in the running app before it can be called done.
