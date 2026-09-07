# Work card — bring DIT's agent-instruction reading layer under explicit contracts

**Type**: non-round chore. No round id (see `CLAUDE.md` §Round layout: non-round work is `chore/`).
**Branch**: `chore/cc-reading-layer`
**Scope**: instruction documents plus one report-only checker and its package script. No `src/`
change and no runtime product impact.
**Origin**: `~/.claude/reports/2026-08-26-cc-version-reconcile-2.1.200-2.1.246.md`

**Re-audited 2026-09-07**: Codex CLI 0.153.4 and the current official OpenAI documentation for
[`AGENTS.md`](https://developers.openai.com/codex/guides/agents-md) and
[Codex worktrees](https://developers.openai.com/codex/app/worktrees). This re-audit found a live
round-id drift in `AGENTS.md`, so the earlier ruling that the file must remain untouched is
superseded by direct evidence: leaving it untouched would preserve an incorrect Codex instruction.

---

## 1. Why now

On 2026-08-26 the global ops layer was reconciled against Claude Code 2.1.246 after
sitting at `as-of 2026-08-12`. Eight of twenty recorded facts had gone stale across
46 builds, and one had become actively misleading — a dispatch rule pointing at a
tool the environment cannot call.

DIT's own instruction files make claims of the **same class**: statements about
Claude Code product behaviour, written as if they were project conventions, with no
version premise and no event that invalidates them. The global fix (a version stamp
plus `ops-health` check 16) fires in DIT sessions too, but it only guards the global
`ops/` layer. Nothing guards this repo's.

This card does not import the global mechanism into DIT. It makes DIT's
harness-dependent claims *legible as harness-dependent*, which is the cheap 80%.

---

## 2. Findings

### D1 — `CLAUDE.md` states Claude Code behaviour without a version or a trigger

`CLAUDE.md` §Round layout and naming, "Cloud sessions" and the bullet after it:

- "**Cloud sessions** produce auto-named `claude/<random-slug>` branches."
- "**A Claude Code cloud session can now allocate a round id safely**" under the new id scheme,
  with the supporting premise that it branches from `origin/main` and may be behind local work.

Both describe how Claude Code behaves, not how DIT works. Neither carries an `as-of`
nor a `review-when`. Per the global rule, any rule resting on a fact outside the repo
gets a trigger naming the event that invalidates it — a control that rots silently is
worse than none, because it is still being trusted.

### D2 — the branch contract covers branches, but forked sessions now produce worktrees

Claude Code **2.1.221** changed `/fork`: a forked session now creates **its own git
worktree** instead of working in the original session's checkout
(`~/.claude/cache/changelog.md` L441).

DIT's contract says branches mirror the round directory and that auto-named
`claude/<slug>` branches are "transport, not identity". It says nothing about
worktrees. A forked session can therefore materialise round work in a checkout the
naming contract does not name, and a reader following the contract will not think to
look there.

Related and now fixed, but worth knowing when reading old state: before **2.1.246**
the background retention sweep could delete git worktrees under `.claude/worktrees/`
that a user had created themselves.

At card opening, DIT was clean on this axis — `git worktree list` showed only the main
checkout and there were zero `claude/*` branches — so this was a contract gap rather than an
active cleanup.

### D3 — Codex's native entrypoint had already drifted, and a pointer is not an include

`AGENTS.md` is deliberately a thin pointer, and records why: "A full duplicate was
tried and had already drifted out of date within two weeks." Keeping it thin is correct, but two
facts were missing from the original card:

- Codex natively discovers one instruction file per directory in this order:
  `AGENTS.override.md`, `AGENTS.md`, then configured fallback names. Because this repository has
  `AGENTS.md`, `CLAUDE.md` is not a loader-level include or fallback. The pointer works only as an
  instruction for the running agent to perform a second file read.
- The subset had already drifted. `AGENTS.md` told Codex to allocate new `r<N>[.<m>]-<slug>` ids
  and check the directory for collisions, while `CLAUDE.md` had closed that namespace and made
  `docs/rounds/ROUNDS.md` the registry. This was an active wrong instruction, not future risk.

The repair therefore keeps the pointer short, states the two-step loading boundary explicitly,
corrects the stale round rule, and gives each costly invariant an exact `dit-contract` marker.

---

## 3. Milestones

### M1 — stamp the harness-dependent claims (baseline; ship even if M2/M3 are cut)

- In `CLAUDE.md` §Round layout and naming, mark the two bullets in D1 as describing
  Claude Code behaviour, give them an `as-of` of the build they were verified against
  (2.1.246, 2026-08-26), and attach a `review-when` naming the invalidating event:
  a Claude Code upgrade that changes cloud-session branching, `/fork`, or worktree
  behaviour.
- Point at `~/.claude/reports/2026-08-26-cc-version-reconcile-2.1.200-2.1.246.md`
  for the reconciliation these came from.

**Files**: `CLAUDE.md`
**Acceptance**: every statement in that section that describes Claude Code rather
than DIT carries a version and an invalidating event. Check by reading the section
and classifying each bullet as `DIT convention` or `harness behaviour`; every item
in the second class must be stamped. No unstamped harness claim may remain.

### M2 — extend the branch contract to worktrees

- Add worktrees to the "transport, not identity" rule: a forked session's worktree is
  transport in exactly the way an auto-named `claude/<slug>` branch is. State where
  such a worktree may appear and what to do with it (merge into a properly named
  round branch, then remove the worktree; never let it be the record of a round).
- Note the pre-2.1.246 retention-sweep behaviour as a reason old worktrees may be
  missing, so a future reader does not mistake deletion for their own error.

**Files**: `CLAUDE.md`
**Acceptance**: given a `git worktree list` that shows an unnamed worktree, the
contract states its disposition without the reader having to ask. Verify by running
`git worktree list` and walking the contract against each row.

### M3 — a mechanical drift check between `AGENTS.md` and `CLAUDE.md`

**Ruled 2026-08-26: build the checker. The prose-only variant is rejected.**

Build a repo-local check that every rule in `AGENTS.md` §"The rules most expensive to
violate" still has a corresponding statement in `CLAUDE.md`. Report-only, never
blocking, runnable from `package.json` alongside the existing scripts.

The 2026-08-26 "do not edit `AGENTS.md`" ruling assumed the current subset was faithful. The
2026-09-07 Codex audit falsified that premise, so the stale round-id rule is corrected before the
checker baseline is accepted. This does not expand the file into a duplicate: it remains the
native Codex entrypoint plus the rules most expensive to violate.

Ships with a positive control or it does not ship: a seeded, deliberately desynced
`AGENTS.md` rule that the checker is PROVEN to flag. A checker that has only ever been
run against a passing tree has not been tested, and one that can never fail is not a
control. Run the passing side too — both, or neither counts.

The checker compares exact one-line `dit-contract` marker payloads. This makes semantics strict
without requiring the surrounding prose to match. It also checks that the pointer states the
native-loader boundary and gives Codex an executable instruction to read `CLAUDE.md` in full.

**Files**: `AGENTS.md`, `CLAUDE.md`, `scripts/check-instruction-drift.mjs`, and `package.json`.
Not `src/`.
**Acceptance**: two-sided — exits clean on the current tree, and exits non-clean on a
seeded in-memory desync with the offending `round-id` contract named in the output. Paste both
runs. The probe must not modify either instruction file.
**Windows**: invoke via `npm.cmd`, per `AGENTS.md`.

---

## 4. Non-goals

- **No Claude Code feature list in DIT.** Same reasoning as the global round: a static
  feature list is the fastest-rotting artifact, and three always-current sources
  already exist (the changelog cache, the `claude-code-guide` agent, official docs).
- **No duplication of `CLAUDE.md` into `AGENTS.md`.** The thin-pointer design is load
  bearing and is not to be undone by this card.
- **No change** to round ids, the phase log, or any `docs/rounds/**` content.
- **No touching** the in-flight R11.2 work on `feat/r11.2-uat-repairs`.

---

## 5. Verification

The product runtime is unchanged, but the repository instruction contract requires the standard
gates before claiming the work is complete. Run:

- `npm.cmd run check:instructions`
- `npm.cmd run check:instructions -- --probe-desync` (expected non-zero)
- `npm.cmd test`
- `npm.cmd run typecheck`
- `npm.cmd run build`
- `git diff --check` (whitespace)
- confirm no file under `src/` is in the diff

---

## 6. Rulings resolved by the 2026-09-07 Codex audit

1. Edit `AGENTS.md`: **yes**, narrowly, because it contained a proven false round-id rule and is
   the only project instruction file Codex loads natively in this directory.
2. M3: **mechanical checker**, with an in-memory failing control and no seeded bad file left in
   the repository.
3. Round id: **none**. This remains a non-round `chore/` contract correction.

## 7. 降級順序（預算不足時）

**M1 → M2 → M3**，保底 **M1**。

理由：M1 讓已經在被信任的斷言變得可稽核，是唯一在「不做就繼續被誤讀」的項目；
M2 是預防性的（DIT 目前 worktree 乾淨、零 `claude/*` 分支），成本低但不緊急；
M3 是防止未來漂移，價值最高但也最容易變成沒人跑的東西 —— 如果只能做一半，寧可
不做 M3b 也不要留一個從來不執行的檢查器。
