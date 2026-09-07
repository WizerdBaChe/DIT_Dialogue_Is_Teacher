---
xi: 1
what: Codex 讀取的專案指令指標檔——精簡版，CLAUDE.md 才是權威來源 (the pointer file Codex reads for project instructions — deliberately thin; CLAUDE.md remains authoritative)
tags: [dit, conventions, pointer]
aliases: [Codex指令, 指標檔, AGENTS.md, codex pointer]
---
# DIT — project instructions (Codex)

**Codex natively loads this file; it does not natively include `CLAUDE.md` through this pointer.**
Before repository work, read `CLAUDE.md` in this same directory in full with a file-reading
tool. Treat it as the single source of truth wherever this file is thinner or disagrees. This
intentional two-step keeps the Codex entrypoint short without maintaining a second copy of the
full contract. A full duplicate was tried and drifted within two weeks.

ops-relaxation: L1 (author ruling 2026-07-27; do not re-ask the relaxation gate).

## The rules most expensive to violate

<!-- dit-contract: language | code-comments-commits=English; docs-rounds=Traditional-Chinese-with-inline-English; work-cards=English; author-conversation=Traditional-Chinese -->
- **Language.** Code, comments, commit messages, `AGENTS.md`: English. `docs/**` round
  documents: Traditional Chinese with inline `中文 (English)` for technical terms. Work-card
  bodies: English. Conversation with the author: Traditional Chinese.
<!-- dit-contract: round-id | new=<YYYY-MM>-<slug>; legacy=r<N>[.<m>]-<slug>:closed; registry=docs/rounds/ROUNDS.md; branch=feat/<round-id>; non-round=chore/<slug>|fix/<slug> -->
- **Round and phase naming.** New round ids use `<YYYY-MM>-<slug>`; the
  `r<N>[.<m>]-<slug>` namespace is closed legacy. The phase number in
  `references/DIT-phase-log.md` is a separate counter. Allocate the round id in
  `docs/rounds/ROUNDS.md` before writing the first file and never reuse one. Round branches
  mirror the directory as `feat/<round-id>`; non-round work is `chore/<slug>` or `fix/<slug>`.
<!-- dit-contract: worktree-identity | detached-worktree=transport; durable-branch=project-contract; codex-prefix=retired; handoff=allowed -->
- **Worktrees are transport, not identity.** A detached Codex worktree may be used for the
  task, but durable work must land on the project branch required above. Do not keep the app's
  default `codex/` prefix as the record of the work. Handoff to the local checkout is also valid.
<!-- dit-contract: adapter-tolerance | bad-line=diagnostic-and-skip; unreadable-file=diagnostic-and-continue-batch -->
- **Adapters never throw on a bad line.** A line-level failure records a diagnostic and is
  skipped; a single unreadable file must not fail a batch.
<!-- dit-contract: fallback-visibility | silent-substitution=reportFallback; named-degradation=Diagnostic-aggregate -->
- **Every fallback (`?? somethingElse`) calls `reportFallback`** — but only for a substitution
  the user *cannot observe*. A degradation already encoded in the return type and shown in the
  UI is a *named* degradation and reports through `Diagnostic` aggregates instead. Putting
  named degradations on the fallback channel buries the silent ones it exists to catch.
<!-- dit-contract: blocking-surface | forbidden=window.confirm|window.alert|window.prompt; required=blocking-surface-machine -->
- **No `window.confirm` / `alert` / `prompt` in `src/`.** Blocking surfaces go through the
  blocking-surface machine.
<!-- dit-contract: windows-gates | npm=npm.cmd; required=test|typecheck|build|git-diff-check -->
- **Windows.** Use `npm.cmd`. Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build`
  and `git diff --check` before claiming anything works, and paste the output.
<!-- dit-contract: visual-acceptance | automated-build=data-path-only; visual-done=author-confirmation-in-running-app -->
- **A green build proves the data path, not the picture.** Anything visual needs the author's
  confirmation in the running app before it can be called done.
