---
xi: 1
what: DIT 的 Claude Code 專屬指令——匯入共用契約 AGENTS.md，另加 ops-relaxation 與 Claude Code 行為前提 (DIT's Claude Code-only instructions: imports the shared AGENTS.md contract, then adds ops-relaxation and Claude Code harness premises)
tags: [dit, conventions, claude-code]
aliases: [Claude 專屬指令, CLAUDE.md, claude code instructions]
---
# DIT — Claude Code instructions

@AGENTS.md

The shared project contract is imported above and binds every agent. This file holds only what is
specific to Claude Code; a tool-neutral rule goes in `AGENTS.md`, never here.

ops-relaxation: L1

Author ruling 2026-07-27. L1 = boundary contract + decision charter are active; the full
multi-phase ops workflow is not. Do not re-ask the relaxation gate for this project.

## Language

The global language rule in `~/.claude/CLAUDE.md` resolves, in this repo, to the Language section
of `AGENTS.md`.

## How this file loads (verified against Claude Code 2.1.281, 2026-09-27)

Because this repo has a `CLAUDE.md`, Claude Code does not read `AGENTS.md` directly under the
default "Project instructions" setting; the `@AGENTS.md` import is what loads it, and it never
double-loads under any setting. Keep the import as a real import on its own line: a sentence asking
Claude to read `AGENTS.md` depends on Claude choosing to, and a symlink turns into a one-line text
file in a Windows checkout. Review if Claude Code changes `@` import semantics or the
"Project instructions" setting.

## Claude Code harness behaviour (verified against 2.1.246, 2026-08-26)

These describe Claude Code, not DIT. They are examples of the transport rule in `AGENTS.md`
"Branches and worktrees". Review after a Claude Code upgrade that changes cloud-session branching,
`/fork` or worktree behaviour; the reconciliation record is
`~/.claude/reports/2026-08-26-cc-version-reconcile-2.1.200-2.1.246.md`.

- Cloud sessions create auto-named `claude/<random-slug>` branches from `origin/main`, so they can
  be behind local work they cannot see.
- `/fork` creates its own git worktree (since 2.1.221). Before 2.1.246 the background retention
  sweep could delete user-created worktrees under `.claude/worktrees/`, so an old worktree going
  missing is not necessarily a mistake of yours.
