# Work card — bring DIT's reading layer under a version premise

**Type**: non-round chore. No round id (see `CLAUDE.md` §Round layout: non-round work is `chore/`).
**Branch**: `chore/cc-reading-layer`
**Scope**: documentation only. No `src/` change, no build impact.
**Origin**: `~/.claude/reports/2026-08-26-cc-version-reconcile-2.1.200-2.1.246.md`

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
- "**A cloud session cannot allocate a round id safely** — it branches from
  `origin/main`, which may be behind local work it cannot see."

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

DIT is currently clean on this axis — `git worktree list` shows only the main
checkout and there are zero `claude/*` branches — so this is a contract gap, not an
active mess. Fix it while it is cheap.

### D3 — no carrier for drift between `CLAUDE.md` and `AGENTS.md`

`AGENTS.md` is deliberately a thin pointer, and records why: "A full duplicate was
tried and had already drifted out of date within two weeks." That design is correct
and should not be undone. But nothing verifies that the pointer's short rule list is
still a faithful subset of `CLAUDE.md`, and the same two-week drift applies to a
subset just as it did to a copy.

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

`AGENTS.md` is **not edited** by this card (ruled). It is the checker's INPUT: the
point is that it stays a thin pointer while something independent verifies the pointer
is still faithful. Resist the urge to "fix" a drift by editing `AGENTS.md` mid-build —
that would make the checker pass against a tree it was never tested on.

Ships with a positive control or it does not ship: a seeded, deliberately desynced
`AGENTS.md` rule that the checker is PROVEN to flag. A checker that has only ever been
run against a passing tree has not been tested, and one that can never fail is not a
control. Run the passing side too — both, or neither counts.

Expect the matching to be the hard part: `AGENTS.md` paraphrases rather than quotes
(compare its fallback bullet with `CLAUDE.md`'s). Exact-substring matching will report
drift on every line and be switched off within a week. Anchor on something stable —
a marker, an id, or a normalised key phrase — and say in the script's header which one
was chosen and why.

**Files**: one script (suggest `scripts/check-instruction-drift.*`, matching the
repo's existing script conventions), one `package.json` entry. Not `AGENTS.md`, not
`src/`.
**Acceptance**: two-sided — exits clean on the current tree, and exits non-clean on a
seeded desync with the offending rule named in the output. Paste both runs.
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

Documentation only, so the usual gates do not apply and saying "tests pass" would be
meaningless here. What must be run:

- `git diff --check` (whitespace)
- confirm no file under `src/` is in the diff

Do **not** claim a build or test result for this card. If M3b is chosen, that script
is the only thing with a real pass/fail, and it needs the seeded-desync control above.

---

## 6. 待裁決事項（作者決定，不要自行選）

1. **`AGENTS.md` 要不要跟著改？** 它的設計原則明寫是「thin pointer, not a second
   copy」，而且記錄了完整複製兩週內就走樣。往裡面加一條 worktree 規則，等於宣告
   「這條錯了很貴」到足以進那份短名單。加或不加都合理，這是你的判斷。
2. **M3 走 a 還是 b？** M3a 是一行 `review-when`，幾分鐘完成、靠人讀；M3b 是真的
   檢查器，會抓到漂移但要多養一個腳本和它的正對照。依 D3 的證據（薄指標尚未被驗證
   過是否仍忠實），b 比較實在，但它是本卡唯一會長出程式碼的部分。
3. **要不要吃一個 round id？** 依 `CLAUDE.md` 這是 chore、不配 round id；但它改的是
   `CLAUDE.md` 本身，而不是某一輪的產物。若你認為改動契約層應該留下 round 記錄，
   現在是分配 id 的時機（分配前先看 `docs/rounds/`）。

## 7. 降級順序（預算不足時）

**M1 → M2 → M3**，保底 **M1**。

理由：M1 讓已經在被信任的斷言變得可稽核，是唯一在「不做就繼續被誤讀」的項目；
M2 是預防性的（DIT 目前 worktree 乾淨、零 `claude/*` 分支），成本低但不緊急；
M3 是防止未來漂移，價值最高但也最容易變成沒人跑的東西 —— 如果只能做一半，寧可
不做 M3b 也不要留一個從來不執行的檢查器。
