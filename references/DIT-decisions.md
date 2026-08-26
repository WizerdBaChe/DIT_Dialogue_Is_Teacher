# DIT — Decision & Process Journal

## Now (updated 2026-08-27, R12 built M1–M8 and green · R11.2 and R12 both awaiting acceptance)
frontier: **R12 (`feat/r12-source-first-navigation`) is built end to end — M1 through M8, plus DW-02, DW-18, DW-19, DW-20 and DW-21 closed — and green**: typecheck clean, **649/649 across 68 files**, two-stage build clean, `check:rounds` OK (all four run unpiped, exit 0 read directly). Nothing in it has been seen by the author in a browser; appearance is unverified throughout (the in-app pane reports `visibilityState: "hidden"`, and the built-in sample is synthetic so it carries neither attribution nor a sidecar). Each card's `BUILT` note in the PSM records what shipped, how it deviated from the card, and the measurement behind it. **R12's branch was cut from `feat/r11.2-uat-repairs`, so R11.2 must be accepted first** — re-cutting from `main` is still cheap if that coupling is unwanted. All three external verifications (correctness, evidence quality, security) have returned and been folded in (`6fbab4a`, `9a21ebe`, `30be739`); M8 closes the last three coverage gaps they raised and repaired two silent-failure defects the new tests exposed (D-020, D-021).

Behind that: R11.2 (`feat/r11.2-uat-repairs`) **construction is complete and green** — typecheck clean, 508/508, build clean — and **awaiting acceptance**, which is the same shape R11 was in and the reason that round failed. All eight cards are landed, one commit each: R1 `346d13c`, R2 `9e1ab8e`, R3 `6cd7e97`, R4 `81cc416` (investigation, no code), R5 `5074ae0`, R6 `04118e8`, R7 `7e30f8a`, R8 static half only. Nothing was cut, so the degradation order never fired. The re-test card is `docs/rounds/r11.2-uat-repairs/UAT_R11.2_v1.0.md`; passing it reopens D-004's merge gate (R9.1 + R10 + R11 + R11.2 → `main`). R11's original card `UAT_R11_v1.0.md` stays as the record of what failed — it is not edited.
premises: (user) the reduced R10-B error-parity acceptance stands; (user) `shell_command` stays unclassified unless new evidence appears — the R10.1 RCA was that analysis and reinforced it; (user) the render layer is out of R11; (user) high-entropy redaction defaults off; (user) commit hashes stay inside that rule; (user) R11 is a presentation-fix round, so the Codex skeleton work leaves R11 (now DW-13, unhomed); (model) lifting the folder-browser's Claude-Code-only filter was settled by the author's own UAT C1 defect report; (user, 2026-08-26) discovery splits per agent system and viewing converges — Claude Code is adapted to the maximum, Codex is incidental, 17% sidecar coverage is accepted.
open: D-001..D-014 decided; P-001 open (P0 implemented as R11-M4; P1/P2/P3 remain). Every R11 acceptance failure now has a landed card; what is open is the author's re-test plus four rulings and three findings the construction surfaced. **Rulings wanted**: (a) R1 classifies 356/358 real Codex sessions as `dialogue` and 2 as `machine`, because the human-turn counter increments before preamble stripping — 108 of those files contain no human-typed text anywhere (measured), so the value carries little information; tightening it to "real words required, slash commands exempt" is a bias change and therefore the author's call. (b) The high-entropy disclosure line sits directly under 「未偵測到敏感資訊」 with identical emphasis (`RESEARCH_R11.2_DISCLOSURE_CALIBRATION.md` §4 lists three directions). (c) Provider config fields give no guidance on what to enter — still unruled, still blocks B11/B12. (d) Image-bearing sessions carry no marker. **Findings not fixed**: `src/core/normalize/normalizer.ts` emits user-facing Chinese strings (「工具錯誤」, 「未命名操作」, `結果 (N 行)`) that never switch with the locale — pre-existing convention, so R2 followed it rather than diverging, but the English locale shows Chinese there; C6's second observation (one session unreadable until a full app reload) is unreproduced and explicitly not claimed fixed by R7; the appearance half of R5 and R3 was never seen by the model — the Chrome extension was unreachable and the in-app pane reports `visibilityState: "hidden"` with a 0×0 viewport, so those are by-eye items only. **Deferred work no longer names a round.** As of 2026-08-26 the ten remaining M9 findings, the one remaining SECREVIEW suggestion (§2 and §3 became D-014 exclusions, not debt), RCA P1/P2/P3, D-010, D-011, the src/ comment-language unification (1,308 lines across 65% of files), T-008 and the M9 Consider-level residue live in `docs/DEFERRED.md` as DW-01..DW-17, every one of them `home: unassigned`. **None of it is in R12.** Those records previously read "deferred to R12", written while R12 was an unallocated stand-in for "the next round"; `docs/rounds/ROUNDS.md` is now the allocation registry and `npm run check:rounds` rejects a live record that names an unallocated id. Read DW-02's warning box before touching the load path: R11.2's F-01/F-02 raised its exposure from dormant to reachable, and it needs a ruling rather than a queue slot.

## D-022 2026-08-27 the worker's cancellation branch is kept unwired, deliberately
status: decided
context: DW-22. `sessionLoader` handles `{type:"cancelled"}` and `session.worker.ts` posts it on `StreamCancelledError`, but nothing can produce one: `parseJsonlBlob` only raises it when given an `isCancelled` callback and the worker never passes one. The UI cancels by `terminate()`ing the worker. P-005's shape seen from the producer end.
options: wire a message-based cancel protocol / delete the branch / keep it, pinned by a test
choice+why: **kept, unwired.** Wiring means a new cancel-message protocol plus a race between the message and the `terminate()` that already works — the core need is met, so building it would be change for its own sake. Deleting removes the only place in the codebase that defines what cancellation looks like, and would have to be re-derived the day graceful cancellation is actually wanted. `session.worker.test.ts` pins the current behaviour, so the branch cannot rot silently.
revisit-if: main-thread fallback parsing needs to be cancellable — `sessionLoader.cancel()` currently rejects the promise while a fallback parse keeps running, which is the case that would justify the protocol.

## D-023 2026-08-27 an impossible-to-be-human cancellation is announced, not re-classified
status: decided
context: DW-24. Measured in the Claude Code in-app browser pane: `showDirectoryPicker()` rejects immediately with `AbortError :: "The user aborted a request."` — the embedder refuses to open the native dialog and reports it as the user's own cancellation. DIT follows R9.1 RC-A (the picker's own AbortError IS a cancellation) and closes quietly, which is correct for a real cancel and produces a silent dead end here. The author hit this and reported it.
options: leave it / re-classify a fast rejection as an environment failure and show an error / keep the classification and make it audible
choice+why: **audible, not re-classified.** The API genuinely cannot distinguish the two, and the gate rule says a check may only rule on what it can determine — so behaviour is untouched and no accepted test changes. A rejection under 200 ms now logs a named console warning saying a person cannot cancel that fast. The threshold gates a LOG only and never a verdict, which is why a wrong value costs nothing. The real negative control — how long a human takes to cancel a real dialog — can only come from the author's own Chrome, so the acceptance card asks for it.
revisit-if: the author's acceptance run measures a human cancel; if it is comfortably above 200 ms the threshold is confirmed and a user-facing hint becomes defensible.

## D-020 2026-08-27 the three untested modules are closed inside R12, and the tests are accepted on whether they FAIL
status: decided
context: the evidence audit named three coverage gaps (DW-19/20/21). Two questions had to be answered before writing anything: which round they belong to, and what "done" means for a test-only card.
options: allocate a new `<YYYY-MM>-<slug>` round / fold into R12 as a late card / do it as `chore/` work and close the DW items by route 3
choice+why: **folded into R12 as M8, dated 2026-08-27 in the PSM.** A round in this repo carries a PSM *and* a UAT card set; test-only work has nothing for a human to accept, so allocating a round would produce an empty UAT card — ceremony describing nothing. But it is not unhomed either: this is R12's own verification debt, raised by R12's audit, on R12's branch, before R12 is accepted, which is exactly the route DW-02 and DW-18 took into this round. A fourth stacked branch for three test files was rejected on the same grounds. Acceptance is stated as **"every group must be shown to fail when the behaviour is removed"**, not "the tests pass" — 18/18 green on the first run against previously untested code is an instrument fault until a positive control says otherwise (`directorySource` was mutated three ways and failed in exactly the six places it should).
revisit-if: the author wants R12's scope frozen at M1–M7 — then M8 moves to its own round and the two repairs below travel with it.

## D-021 2026-08-27 two silent-failure defects found by writing the tests, both repaired in place
status: decided
context: neither is reachable from `src/` today, and both have the same shape as M7's silent `?? "claude-code"` — correct-looking code whose failure mode is invisible. (1) `session.worker.ts` computed its byte total OUTSIDE the `try`, so a request with a missing blob threw where nothing could report it: no message posted, caller's promise pending forever, progress bar on "reading". (2) `sessionStore`'s module-load handle read did `cachedDirectoryHandles = handles` — a whole-object replace — so a folder picked before that promise settled was overwritten by last session's stored value.
options: record them as findings / pin current behaviour and defer / repair in place with the reproducing test
choice+why: repaired in place, each with the test that reproduced it first. Both are one line. Recording-only was rejected because the reproducing test already existed at that point — a test that documents a defect it could instead prevent is the weaker artifact. (2) is repaired by MERGING rather than replacing (`{ ...handles, ...cachedDirectoryHandles }`): order is priority, an in-session pick is newer than a start-up read. Tested in both directions — a source picked in neither order must still adopt its stored folder, or "do not clobber the pick" silently becomes "ignore storage".
revisit-if: message-based cancellation is added to the worker (DW-22) — the byte total moves again.

## D-019 2026-08-27 M6's zero-regression claim is re-verified on the FULL corpora
status: decided
context: M6's acceptance was "classification is unchanged, cell for cell", measured at 287 Claude / 346 Codex entries. The evidence audit pointed out both figures came from a measurement harness carrying its own 8 MB file cap — 13 Claude and 12 Codex real files were never scanned — so the claim held only on a sample, and the fix commit had re-verified the sidecar numbers but not these.
options: leave it as a sample-based claim / re-measure uncapped / write a standing test
choice+why: re-measured uncapped, before and after, by reverting `classifySession.ts` alone to its pre-M6 commit (it imports nothing from the profile, so it reverts cleanly in isolation) and running the full corpora both ways. Identical: **Claude Code 301 entries, all `dialogue`/`has-human-prompt`; Codex 358 entries, 356 `dialogue` + 2 `machine`.** A standing test was rejected — it would pin numbers that grow with the corpora and fail for the wrong reason; the behavioural guards in `classifySession.test.ts` are what protect the property.
revisit-if: the classification rules change again; re-run the same before/after by reverting that one file.

## P-005 2026-08-27 a declaration with no consumer is a distinct failure mode, and no gate watches for it
context: R12's own external review found `SidecarSpec.joinKey` declared in the profile, documented, and asserted by a test — while the actual extraction sat hardcoded in `absorb()` and never read it. Editing the profile, the sanctioned place, changed nothing.
what it cost: nothing shipped wrong, but M5's stated acceptance ("a test pins the correct key so a future 'raise coverage' change fails instead of looking like an improvement") was simply untrue: the pinning test read a constant, not the code path. The round's own gate could not see it either — `sourceKnowledge.test.ts` catches a file that WRITES a source id, and `sessionIndexer.ts` writes none.
lesson: P-004 was "a declaration the type system cannot reach will drift". This is its mirror and it needs naming separately: **a declaration nothing CONSUMES cannot drift, because it was never attached.** Both produce a confident-looking record that describes nothing. The tell is the same in each case — a test that asserts a VALUE (`expect(spec.joinKey).toEqual([...])`) rather than a BEHAVIOUR. When a config field claims to drive something, at least one test must fail if the field is changed and the code is not. Neither `tsc` nor a literal-scanning gate can see this class; only asking "what breaks if I edit this line?" can.

## P-007 2026-08-27 a coverage measurement needs a positive control, and "looks covered" is worse than "untested"
context: closing DW-19/20/21 started with a grep for modules no test file imports. It returned 39 files — including `core/privacy/gateway.ts`, which has `gateway.test.ts` sitting next to it testing it directly. The test imports `from "./index"`, so the module's own filename never appears and the ruler reported a zero for it.
what it cost: nothing, because the false positive was one of the first things checked. Had it not been, the list would have been cited as a coverage report and would have sent work at modules that are already tested while missing ones that are not.
lesson: two halves. (1) **A coverage instrument must be calibrated against a module known to BE tested before any of its zeros are believed** — the same rule already written for gates, arriving here in a new costume. Anything reached through a barrel file is invisible to a filename-based ruler. (2) The more dangerous state is not "untested" but **"looks covered"**: `browseFailure.test.ts` imports `directorySource` through the barrel and mocks precisely the functions holding its logic, so a line-coverage tool would report the module as loaded while nothing about its behaviour is asserted. A coverage percentage cannot distinguish those two, which is why the DW items were written as named modules with named invariants rather than as a number to raise.

## P-006 2026-08-27 a green test summary is not a green run, and a piped command hides the exit code
context: while the external reviews ran, `node_modules` was damaged — an npm operation raced the `vite preview` server holding `esbuild.exe` open, leaving `.bin` and `.package-lock.json` gone and a jsdom transitive dependency missing. `npm test` then reported `Test Files 54 passed (54)` with `Tests 550 passed (550)`, which reads as success. Eleven jsdom test files had failed to start and never ran.
what it cost: caught, because the file count had been 65 the run before. Nothing false was reported to the author. But it was caught by noticing a number, not by any gate.
lesson: two things. (1) The summary line answers "did the tests that ran pass", never "did every test run" — a suite that silently shrinks is the same false negative as a checker that vacuously passes, and the defence is the same: know the expected count. (2) Piping a gate through `grep`/`tail` discards its exit status; every gate run must capture `${PIPESTATUS[0]}` or run unpiped. Repair was `npm ci` AFTER stopping the preview server — the EPERM on `esbuild.exe` names the lock-holder, and `npm rebuild` restores `.bin` without fixing missing packages, which is how a half-repaired tree can look plausible.

## D-016 2026-08-26 the R-number namespace closes at R12; new rounds are `<YYYY-MM>-<slug>`
status: decided
context: Phase 16 deferred a batch of work "to R12" while R12 was unallocated; R12 was later given to source-first-navigation. Same shape as the R9 collision two rounds earlier.
options: keep numbering and rely on the new registry + checker / close the numeric namespace and switch to a date-plus-slug id / rename everything
choice+why: author closed the namespace. A sequential number is *predictable*, so it can be written down before it exists — which is the entire mechanism of both collisions, and not something a rule can fix, because the rule has to be recalled at the moment the writer is thinking about something else. `<YYYY-MM>-<slug>` cannot be forward-referenced: writing the id requires naming the theme, and naming the theme IS allocating the round. Renaming was rejected — R1–R12 keep their ids, and closing is not renaming; renaming would move directories, branches and filenames and leave existing commit messages pointing at names that no longer exist, for nothing. Follow-ups take their own slug instead of `.m`, which read as "remediates R<N>" even when it did not (R9.2 was a feature).
revisit-if: nothing pending. `docs/rounds/ROUNDS.md` is the registry; `npm run check:rounds` guards the closed namespace.
links: docs/rounds/ROUNDS.md; docs/DEFERRED.md; scripts/check-round-ids.mjs

## D-017 2026-08-26 DW-02 is fixed in place, not accepted as an exclusion
status: decided
context: `buildSessionDocumentFromFiles` had no per-file try/catch. M9 judged it unreachable — correctly, since every UI load went through the worker — until R11.2's F-01/F-02 opened a route from a real user load to it, to let a worker that fails to boot degrade to a main-thread parse.
options: add the try/catch / record it as a documented exclusion
choice+why: author chose the fix. The path is taken exactly when the worker is already broken, which is the worst moment to have less protection; and leaving it would keep a live violation of a stated CLAUDE.md invariant, which erodes the invariant. Implementation was smaller than estimated: `parse_failed` already existed in `ParsedFileOutcome`, the batch layer already reported it, and the worker had emitted it since R9 — only the sync path never produced it.
revisit-if: nothing pending.
links: docs/DEFERRED.md DW-02; src/core/pipeline.ts

## D-018 2026-08-27 the Codex sidecar joins on `payload.id`, and the higher-coverage key is rejected
status: decided
context: `session_meta.payload` carries both `id` and `session_id`, present on all 358 rollouts and disagreeing on 135 — exactly those with `parent_thread_id`. Those are forked threads.
options: join on `payload.id` / join on `payload.session_id` / offer the parent's description as its own rung
choice+why: `payload.id`, 61 hits and 0 wrong. `session_id` scores 190 — coverage 17% to 53% — and is wrong 129 times, giving a fork its parent's purpose: a fluent, plausible title with no visible tell. Zero forked threads have a description of their own. Optimising for coverage would have shipped the wrong-target defect this codebase keeps paying for, wearing a better number. The third option is recorded but not built: it needs its own `titleSource` and on-screen "inherited from the parent conversation", or it simply IS the second option, and that is a product ruling rather than an implementation choice.
reproducible: `node scripts/measure-corpus.mjs sidecar` re-derives this without importing DIT's own code. Re-run 2026-08-27 after the joinKey rewiring: 358 rollouts, 61 descriptions, 135 forks; `payload.id` 61 hits, `payload.session_id` 190 hits of which 129 are forks inheriting a parent's description, and 0 forks carry one of their own.
revisit-if: the author rules on whether a fork should show its parent's description as a named rung.
links: docs/rounds/r12-source-first-navigation/RESEARCH_R12_CODEX_SIDECAR_2026-08-26.md §4; scripts/measure-corpus.mjs

## P-004 2026-08-27 a declaration the type system cannot reach will drift, and only behaviour catches it
context: M1 declared Codex's `classify.signals` as `[]` with the note "empty, and measured", while `classifySession` had read two Codex signals since R11.2 R1 and classified 346 of 346. M4's review separately found `sourceLabels` written as `{...} as Record<SourceId, string>` — a type ASSERTION, which unlike an ANNOTATION does not require exhaustiveness; deleting a key and running `tsc --noEmit` passed clean.
what it cost: implementing M6 literally against that row would have taken a module with zero regressions and made it classify nothing. Both were caught by measuring, not by reading — and one of them had survived a full round.
lesson: two different failures, one shape. A claim about a source that lives in a list — rather than in a `Record<SourceId, …>` with a real annotation, or in behaviour a test exercises — has nothing holding it to the truth. Prefer the annotation; where a list is unavoidable, pin it with a behavioural test that fails when the list is wrong, not merely when it is missing. Also: "empty because it has no value" and "empty because it does not exist" are different claims, and writing them as one is how the first of these got in.

## D-014 2026-08-16 the two SECREVIEW suggestions become documented exclusions, not fixes
status: decided
context: the M7 security review left two unfixed suggestions — the high-entropy checkbox does nothing while the master redaction toggle is off (and says so nowhere), and the single-file snapshot export runs no redaction and carries no disclosure at all.
options: fix both in R11 / fix one / record both as documented exclusions
choice+why: author: 「明文排除，有標示就好」. The snapshot gap is pre-existing and the snapshot is designed to reproduce the full node view, so redacting it would fight its purpose; the checkbox interaction is a UX question the author does not want R11 to settle. Both are now written into the acceptance card's out-of-scope section, which converts them from defects found by review into limitations the reader is told about.
revisit-if: a user reports the inert checkbox as confusing in real use, or the snapshot export starts being shared outside the author's own machine.
links: docs/rounds/r11-release-readiness/SECREVIEW_R11_M7_REDACTION.md §2/§3

## D-013 2026-08-16 the session picker interleaves sources by time
status: decided
context: R11-Q2 — once M1 made Codex sessions visible, the picker could list them interleaved with Claude Code by time, or grouped by source.
options: interleave by time / group by source / a toggle
choice+why: author, after seeing the real list: 「混排，現在這樣很好」. What the user is looking for is a conversation at a point in time; which harness produced it is a property of the row, not an axis to navigate by.
revisit-if: source-specific defects make it useful to isolate one harness while debugging.
links: src/core/index/sessionIndexer.ts; docs/rounds/r11-release-readiness/UAT_R11_v1.0.md §F

## D-012 2026-08-15 S-03 (privacy consent scope) is promoted into R11
status: decided
context: M9's review found the approval path builds the consent scope in a different format from the three reviewer call sites, so the strings can never match: "approve once per scope" had never worked, every annotation reopened the privacy review, and a non-cloud approval recorded cloud's endpoint and model.
options: fix in R11 / defer with the other ten review findings
choice+why: author agreed with the model's recommendation to fix in R11. It is both an observable nuisance and a consent record that names the wrong counterparty, and R11's exit condition is the merge gate — shipping a consent mechanism that has never functioned is not a good thing to carry into `main`. The other ten findings stay deferred — as of 2026-08-26 they are `docs/DEFERRED.md` DW-01..DW-10, all `home: unassigned` (this line originally said "stay in R12", written before R12 existed as an id).
revisit-if: nothing pending. Fixed in commit `3cbde1f`, pinned by `src/store/privacyConsentScope.test.ts`.
links: docs/rounds/r11-release-readiness/REVIEW_R11_BLIND_SPOTS.md S-03

## D-011 2026-08-15 the Codex skeleton-coverage fix leaves R11; R11 stays presentational
status: decided
context: R11-Q3 asked whether M5's measured root cause — `decision` is structurally unreachable for Codex because DECISION_RE was tuned against Claude Code's raw chain-of-thought — should be folded back into R11.
options: fold the fix into R11 / take only the test-assertion slice / defer wholly to R12
choice+why: author: not R11 — R11 is a presentation-fix round (「R11 專修版面」). The fix is a design change rather than a repair, and M5's own recommendation was the same. The test-assertion slice is not taken separately either — it belongs with the change it describes.
correction 2026-08-26: this entry originally read "lands in R12" in its heading and choice, because at the time R12 meant "the next round" and no round had that id. R12 was subsequently allocated to `source-first-navigation`, which does not contain this work. The author's actual decision — out of R11 — is unchanged and preserved above; only the forward reference is removed. The item is now `docs/DEFERRED.md` DW-13, `home: unassigned`.
revisit-if: a round takes DW-13; the measurement stands as its entry evidence.
links: docs/rounds/r11-release-readiness/RCA_R11_CODEX_SKELETON_COVERAGE.md; D-007

## D-010 2026-08-15 WC-4.3 is removed from R11 and held until its precondition exists
status: decided
context: PSM card M4 carries WC-4.3 — de-emphasise unpaired `*_end` cards visually, escalating to warn only when several candidates make the pick ambiguous. The dispatch that implemented M4 omitted it, and the agent flagged the gap rather than dropping it silently.
options: implement in R11 / move to R12 / drop
choice+why: author moved it out of R11. Implementing the "only when ambiguous" clause requires the candidate count, which is P1 provenance data that this round explicitly excludes — so it could not have been done correctly in R11 regardless of the dispatch omission.
correction 2026-08-26: originally recorded as "moved to R12" when R12 was an unallocated placeholder for "the next round"; R12 now belongs to `source-first-navigation` and does not contain this. The decision itself is unchanged. The item is `docs/DEFERRED.md` DW-14, blocked by DW-12 (RCA P1).
revisit-if: whichever round implements RCA P1 (DW-12) — that is WC-4.3's precondition, and it must be taken first or together.
links: docs/rounds/r10.1-codex-session-provenance/RCA_R10.1_CODEX_SESSION_PROVENANCE_2026-08-15.md P1; PSM_R11 M4 WC-4.3

## D-009 2026-08-15 R11-Q1 — commit hashes stay in the high-entropy rule
status: decided
context: M7's detector catches full 40/64-char commit SHAs through its hex rule (abbreviated ones fall below the floor). Of 14,716 hex-run findings on the real corpus, roughly 6,238 are commit-SHA-shaped by a proxy that cannot separate a SHA from any other lowercase hex hash.
options: exclude hashes from the rule / keep them / make it a separate toggle
choice+why: author: keep them — without the surrounding context and path a hash cannot readily be reversed, so treating it as sensitive costs little and the rule is default-off anyway. Not excluding also avoids a special case that the proxy could not implement accurately.
revisit-if: real use shows the hash class dominates the findings enough to make the rule unusable when enabled.
links: PSM_R11 M7; src/core/privacy/detectors.ts; D-006

## D-008 2026-08-15 `paste` SourceId is removed, not given an entry point
status: decided
context: `SourceId` declares `"paste"` and `profiles.ts` defines a `PASTE` profile, but no adapter or UI path ever produces it — both adapters hardcode their own id. UAT D4 asked the author to test "the paste entry" and they correctly answered 「完全不知道這則在說甚麼」: there is nothing to test.
options: build a paste entry point / remove the declaration
choice+why: decided by the model under the decision charter (reversible, internal type, no UX change). This is the exact pattern R9.1 removed `milestone` for — declared in the type, never produced, documented anyway — and D-003 confirmed the precedent holds. Nobody has asked for a paste entry; inventing one to justify a type member is backwards.
revisit-if: a paste/drop entry is actually requested as a feature.
links: src/types/spanTree.ts; src/core/source/profiles.ts; PSM_R11 WC-4.4

## D-007 2026-08-15 the Codex skeleton-coverage gap gets measurement before any edit
status: decided
context: UAT C3 surfaced something worse than the label bug it was testing — Codex sessions often produce a skeleton of only {start, end} with everything else a rib, so ordinary user intents and replies never become spine nodes. R10-B's `crossSourceParity.test.ts` passes regardless, which is itself evidence the test asserts the wrong property.
options: investigate and fix in R11 / investigate only in R11 / defer entirely
choice+why: author chose investigate-only. D-001 and the R10.1 RCA §P2 independently forbid guessing tool semantics, and R10-B already spent a round believing a source-profile fix was sufficient before measurement showed otherwise. Editing before measuring would repeat that loop.
revisit-if: M5's measurement produces a root cause cheap enough to fold back into R11 (tracked as R11-Q3).
links: PSM_R11 M5; docs/OUTSTANDING_2026-08-14.md C3/D3

## D-006 2026-08-15 high-entropy redaction ships default-off with honest reporting
status: decided
context: UAT B3 found the secret detector catches only prefixed known shapes (`ghp_`, `sk-`, JWT, connection-string passwords), so unprefixed API tokens, session UUIDs and git SHAs pass through untouched. Any rule that catches them necessarily over-catches harmless identifiers.
options: add the rule default-on (security first) / add it default-off behind its own checkbox / do not add it
choice+why: author chose default-off. Transcript readability is a trade the reader owns, not one a default should make for them. The gap is closed by *disclosure* rather than by redaction: the summary must report 「另偵測到 N 筆疑似高熵字串（未遮）」 whether or not the rule is enabled, so a silent miss becomes an announced one.
revisit-if: R11-Q1 — after seeing M7's real output, the author may decide git commit hashes should be excluded from the rule, or that default-on is acceptable after all.
links: PSM_R11 M7; src/core/privacy/detectors.ts; docs/OUTSTANDING_2026-08-14.md B3

## D-005 2026-08-15 the Markdown/LaTeX render layer is split out of R11 into R11.1
status: decided
context: UAT B1 reported that Markdown is never rendered — literal backticks and syntax show through in the Reader and in every export. It is the largest single item the UAT surfaced, roughly equal in volume to the rest of R11 combined.
options: include in R11 / split into its own round / ship a minimal read-only subset inside R11
choice+why: author chose the split. It is a new capability rather than a repair, it must land on both render paths simultaneously (Reader and snapshot) or the exports silently diverge, and it turns untrusted transcript content into DOM — an injection surface that needs its own security acceptance. Bundling it would let a feature hold D-004's merge gate hostage.
revisit-if: nothing pending; `docs/design/DIT_TEXT_RENDERING.md` is the standing design guidance for R11.1.
links: docs/design/DIT_TEXT_RENDERING.md; PSM_R11 §8; docs/OUTSTANDING_2026-08-14.md B1

## D-005 2026-08-26 discovery splits per agent system, viewing converges; Claude Code is the priority and Codex is incidental
status: ruled, unbuilt (R12)
trail: R11.2 B1 (Codex session titles are noise) was first diagnosed as F-05, a regex whitelist in `stripInjectedPreamble` that cannot match tags carrying attributes. The author rejected that root cause on the second report of the same symptom. Measurement then showed the real shape: `pickTitle`'s top two rungs are Claude Code record types (`custom-title`, `ai-title`), so every Codex session falls to the first-user-message excerpt, and F-05 could at best make that excerpt tidier — it can never produce a purpose. Corpus facts behind the ruling: Codex rollouts carry no title field (542 `session_meta`, counted per key); `thread_goal_updated.goal.objective` exists 10 times corpus-wide; the purpose lives outside the transcript in `.codex-global-state.json` → `electron-persisted-atom-state` → `thread-descriptions-v1`, keyed by `session_meta.payload.id`, 61/61 resolving to a file on disk (17% of 358). On the Claude side, attribution (~13k records), `toolUseResult` (17,686), `gitBranch` and `entrypoint` (66,524 each) and `leafUuid`/`lastPrompt` (4,523) are referenced nowhere in `src/`; `slug` is a per-session random codename and is ruled out as a title.
resolution: R12 splits DISCOVERY per agent system and converges VIEWING. Rulings, all the author's: only Claude Code and Codex are supported and this is stated in the UI; the existing "從對話集選擇" / "單開對話" modes move to a second level under a source choice; position memory is kept PER `SourceId` (not one last-folder) so the level-1 choice actively assists locating; the Codex root is `~/.codex`, not `~/.codex/sessions`, because a browser cannot read the parent of a picked directory and the sidecar lives one level up; 17% sidecar coverage is accepted as sufficient, on the reasoning that a session with no defined purpose is that session's own gap; **Claude Code is adapted to the maximum and Codex is incidental**, which promotes Claude metadata consumption to M4 ahead of the Codex sidecar at M5 and makes M5 the first card cut under budget; `product-design-thinking` is declined because the direction is already ruled and the root cause is measured, with the LLM title-condensation round named as the case where it would pay for itself.
links: docs/rounds/r12-source-first-navigation/PSM_R12_SOURCE_FIRST_NAVIGATION_v0.1.md; src/core/index/sessionIndexer.ts (`pickTitle`); src/core/source/profiles.ts; P-003

## D-004 2026-08-15 R9.1 and R10 merge to `main` once this UAT batch is fixed up
status: decided
context: `main` currently carries only R9 + R9.2; R9.1 and R10 have been sitting on branches since 2026-07-29 and 2026-08-14 respectively, unmerged.
options: merge now as-is / merge after the newly-found defects (naming, markdown rendering, redaction gaps, folder-browser Codex exclusion) are addressed
choice+why: author: "這批驗完了，微調完整就可以進" — verified is not the same bar as polished; the merge waits on the fix-up pass, not on a second full UAT round.
revisit-if: the fix-up pass turns out to need its own round-scale UAT (unlikely given the defects are localized).
links: docs/OUTSTANDING_2026-08-14.md Part 3-4; phase-log Phase 13

## D-003 2026-08-15 "milestone" stays removed, not reinstated
status: decided
context: R9.1 removed the `milestone` skeleton-node kind (declared in the type but never produced; the legend listed it anyway). R10's UAT round asked whether it should come back.
options: reinstate with a real criterion / leave removed
choice+why: author: "維持移除，太不實用" (not useful enough to justify inventing a criterion). No criterion was proposed that wouldn't degrade into "every user message" per R9.1's original objection.
revisit-if: a concrete, non-degenerate criterion is proposed.
links: docs/rounds/r9.1-uat-remediation/UAT_R9.1_v1.0.md A3; docs/OUTSTANDING_2026-08-14.md Part 3-3

## D-002 2026-08-15 R10-C full-text search: three UX questions ruled
status: decided
context: R10-C (session full-text search) cannot start without three UX rulings the R10 kickoff prompt flagged as blocking.
options: (1) search scope — text-only / text+params / text+params+results; (2) a hit inside collapsed content — auto-expand / parent card shows "contains N hits ▾"; (3) are LLM annotations searchable, given they generate asynchronously
choice+why: author: (1) agreed to text+params default with tool results behind a checkbox; (2) the simpler parent-card "contains N hits" version, not auto-expand; (3) not searchable yet — no contract for a result set that shifts as annotation progresses.
revisit-if: annotation becomes synchronous/complete-at-load, removing the reason (3) was deferred.
links: docs/rounds/r10-source-awareness/R10_KICKOFF_PROMPT.md Step 3; docs/OUTSTANDING_2026-08-14.md Part 3-2

## D-001 2026-08-15 `shell_command` stays unclassified — no command-string guessing
status: decided
context: R10-B built `SourceProfile` but left Codex's `shell_command` (6,037 occurrences, the corpus's single most common call) in `ambiguousTools` rather than guessing read-vs-write from the command string. The R10.1 RCA (same day) independently reached the same conclusion from a different angle: P2 of that report explicitly warns against expanding the exec-name regex into a looser full-text search, for the same reason — it would misclassify multi-tool orchestrator scripts and program strings as a single tool.
options: (a) keep unclassified (b) conservative allowlist (`cat`/`rg`/`ls`→investigation, `sed -i`/`tee`→edit) with degrade-on-guess-failure
choice+why: author: "不要猜，除非跟C4的報告分析後有新收穫" — the R10.1 RCA was that analysis, and it reinforced (a) rather than unlocking (b).
revisit-if: a future scan finds `shell_command` inputs that are safely parseable (e.g. a stable subset with unambiguous verbs).
links: src/core/source/profiles.ts; docs/rounds/r10.1-codex-session-provenance/RCA_R10.1_CODEX_SESSION_PROVENANCE_2026-08-15.md P2; docs/OUTSTANDING_2026-08-14.md Part 3-1/D6

## P-003 2026-08-26 a lesson fixed in one layer regrew one layer up, because nothing made it a property of the asset
status: open — R12 M1 is the proposed closure
trail: R10-B (2026-08-11) found that `denoise()` and `distill()` matched Claude Code tool names against every source, so the Codex half of a matched pair produced zero side branches, zero groups and zero error tags. It was fixed properly, with a real abstraction: `SourceProfile` in `src/core/source/profiles.ts`, plus a cross-source parity test. Fifteen days later R11.2 B1 turned out to be the same defect one layer up — `pickTitle` walking a ladder whose top rungs only exist for Claude Code, and `classifySession` reading Claude field names against Codex, which is why the verdict value `codex-unclassified` had to be invented at all. The profile covered RENDERING; DISCOVERY was never brought under it.
resolution: the failure was not that someone forgot. Nothing in the repo made "source differences go through the profile" checkable — it lived only in the memory of the round that introduced it, and rounds do not remember. R12 M1 answers this by holding the discovery half as a typed exhaustive `Record<SourceId, SourceDiscovery>`, so adding a third source fails `tsc` until its row exists; the PR is required to demonstrate that failure once and then revert the probe, because a registry that cannot fail that way has not made the rule structural. INV-R12-1 states the property directly — any `if (source === …)` outside the profile is a defect, not a style choice.
links: docs/rounds/r12-source-first-navigation/PSM_R12_SOURCE_FIRST_NAVIGATION_v0.1.md §1 and M1; src/core/source/profiles.ts; src/core/source/crossSourceParity.test.ts; src/core/index/sessionIndexer.ts; D-005

## P-002 2026-08-17 appearance defects keep reaching acceptance because no dispatched worker can see the screen
status: open
context: R11 shipped green (491/491) and still failed acceptance on four presentation items. R11.2 repaired them and hit the same wall from the other side — every subagent dispatched this round reported, unprompted, that it had no browser or DOM-read tooling, and the dispatcher's own two paths both failed: the Chrome extension was unreachable on two attempts, and the in-app browser pane reports `visibilityState: "hidden"` with a 0x0 viewport, so `getBoundingClientRect()` returns zeros and geometry reasoning is worthless. R5's whole acceptance is by-eye and its diagnosis (a clipping ancestor) is read from the stylesheet, never observed.
lesson: a test suite cannot close a presentation card, and neither can a subagent — so a round that contains presentation cards must budget an author pass, and the cards must say which claims are hypotheses. What worked: agents were told to state plainly what they could not verify instead of reporting it as passed, and every one of them did. What did not work: assuming the dispatcher could cover the gap. The residual is named rather than hidden — R5 leaves `overflow: hidden` on `.workspace-layout`/`.workspace-panel`, so a clip may survive at the window edges, and the acceptance card points the author straight at it.
revisit-if: the Chrome extension becomes reliably available in this environment, or the in-app pane starts reporting a non-zero viewport — either one turns these items back into machine-checkable ones.
links: docs/rounds/r11.2-uat-repairs/UAT_R11.2_v1.0.md §0 and the `[目視]` items; src/styles/index.css:497-498; commit 5074ae0

## P-001 2026-08-15 Codex exec-name and *_end event pairing cannot be fixed by tuning the heuristic
status: open
trail: R10-B (2026-08-14) added `patch_apply_end`/`mcp_tool_call_end` outcome reading on top of R7/R7.5's existing nearest-candidate pairing. Manual UAT (C4, D1 on 2026-08-15) found duplicate-looking "thinking chain" cards with no real content and leaked internal wrapper tags (`[external_agent_tool_result]...[/external_agent_tool_result]`) eating real content in the rendered card. The author ran an external Codex CLI session to root-cause it, producing `RCA_R10.1_CODEX_SESSION_PROVENANCE_2026-08-15.md`, which measured (357 local rollouts, 218,517 lines): 555/9,350 (5.94%) `custom_tool_call` inputs have no `tools.<name>(` shape the regex can extract; and of 1,063 currently-unpaired `*_end` events, at least 998 (93.9%) have NO recoverable candidate anywhere in the exported event stream — the theoretical floor of "end events minus recognizable starts" already exceeds the unpaired count, meaning no amount of nearest-neighbor tuning can close the gap. `context_compacted` (97 local occurrences) is a *proven* cause for some of these but the adapter has no causal link per-event, so it cannot honestly claim compaction as the reason for all 1,063.
resolution: not yet worked around. The RCA proposes a four-stage remediation (not yet implemented): P0 — downgrade `CODEX_EXEC_TOOL_NAME_UNRESOLVED`/`CODEX_EVENT_UNPAIRED` from warn to a named-capability-limit info tier, remove the unproven "多半是壓縮" claim from copy, de-emphasize unpaired `*_end` cards visually. P1 — add `association` (`exact`/`turn_nearest`/`nearest`/`unmatched`) and `unmatchedReason` fields so UI/distill can tell provenance strength apart instead of pretending IDs match. P2 — tri-state exec name resolution (`single_nested_tool`/`composite_exec`/`opaque_exec`) via a conservative lexical scanner that skips quoted strings/comments, rather than a looser regex. P3 — fill the ~0.025%-of-lines small type gaps (`tool_search_call`, `image_generation_end`, `thread_goal_updated`) separately; do not fold them into the "noise" metric.
links: docs/rounds/r10.1-codex-session-provenance/RCA_R10.1_CODEX_SESSION_PROVENANCE_2026-08-15.md; docs/OUTSTANDING_2026-08-14.md C4/D1 remarks; src/core/adapters/codexJsonl.ts (`EXEC_TOOL_NAME_RE`, `consumeNearestPendingExec`); src/i18n/diagnosticCopy.ts
