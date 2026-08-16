# DIT — Decision & Process Journal

## Now (updated 2026-08-17, R11.2 construction complete)
frontier: R11.2 (`feat/r11.2-uat-repairs`) **construction is complete and green** — typecheck clean, 508/508, build clean — and **awaiting acceptance**, which is the same shape R11 was in and the reason that round failed. All eight cards are landed, one commit each: R1 `346d13c`, R2 `9e1ab8e`, R3 `6cd7e97`, R4 `81cc416` (investigation, no code), R5 `5074ae0`, R6 `04118e8`, R7 `7e30f8a`, R8 static half only. Nothing was cut, so the degradation order never fired. The re-test card is `docs/rounds/r11.2-uat-repairs/UAT_R11.2_v1.0.md`; passing it reopens D-004's merge gate (R9.1 + R10 + R11 + R11.2 → `main`). R11's original card `UAT_R11_v1.0.md` stays as the record of what failed — it is not edited.
premises: (user) the reduced R10-B error-parity acceptance stands; (user) `shell_command` stays unclassified unless new evidence appears — the R10.1 RCA was that analysis and reinforced it; (user) the render layer is out of R11; (user) high-entropy redaction defaults off; (user) commit hashes stay inside that rule; (user) R11 is a presentation-fix round, so the Codex skeleton work goes to R12; (model) lifting the folder-browser's Claude-Code-only filter was settled by the author's own UAT C1 defect report.
open: D-001..D-014 decided; P-001 open (P0 implemented as R11-M4; P1/P2/P3 remain). Every R11 acceptance failure now has a landed card; what is open is the author's re-test plus four rulings and three findings the construction surfaced. **Rulings wanted**: (a) R1 classifies 356/358 real Codex sessions as `dialogue` and 2 as `machine`, because the human-turn counter increments before preamble stripping — 108 of those files contain no human-typed text anywhere (measured), so the value carries little information; tightening it to "real words required, slash commands exempt" is a bias change and therefore the author's call. (b) The high-entropy disclosure line sits directly under 「未偵測到敏感資訊」 with identical emphasis (`RESEARCH_R11.2_DISCLOSURE_CALIBRATION.md` §4 lists three directions). (c) Provider config fields give no guidance on what to enter — still unruled, still blocks B11/B12. (d) Image-bearing sessions carry no marker. **Findings not fixed**: `src/core/normalize/normalizer.ts` emits user-facing Chinese strings (「工具錯誤」, 「未命名操作」, `結果 (N 行)`) that never switch with the locale — pre-existing convention, so R2 followed it rather than diverging, but the English locale shows Chinese there; C6's second observation (one session unreadable until a full app reload) is unreproduced and explicitly not claimed fixed by R7; the appearance half of R5 and R3 was never seen by the model — the Chrome extension was unreachable and the in-app pane reports `visibilityState: "hidden"` with a 0×0 viewport, so those are by-eye items only. Deferred to R12: the ten remaining M9 findings, the three remaining SECREVIEW suggestions, RCA P1/P2/P3, and the src/ comment-language unification (measured at 1,308 lines across 65% of files; ticket lives outside the repo). T-008 opened 2026-08-16 from outside (claude-config session): compact-chain stitching via logicalParentUuid — R12 candidate, see DIT-tickets.md; a transcript archive now exists at D:\AIWork\_session-archive\ and this ticket is what makes compacted history in it read as one conversation.

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
options: fix in R11 / defer to R12 with the other ten review findings
choice+why: author agreed with the model's recommendation to fix in R11. It is both an observable nuisance and a consent record that names the wrong counterparty, and R11's exit condition is the merge gate — shipping a consent mechanism that has never functioned is not a good thing to carry into `main`. The other ten findings stay in R12.
revisit-if: nothing pending. Fixed in commit `3cbde1f`, pinned by `src/store/privacyConsentScope.test.ts`.
links: docs/rounds/r11-release-readiness/REVIEW_R11_BLIND_SPOTS.md S-03

## D-011 2026-08-15 the Codex skeleton-coverage fix lands in R12; R11 stays presentational
status: decided
context: R11-Q3 asked whether M5's measured root cause — `decision` is structurally unreachable for Codex because DECISION_RE was tuned against Claude Code's raw chain-of-thought — should be folded back into R11.
options: fold the fix into R11 / take only the test-assertion slice / defer wholly to R12
choice+why: author: R12, and R11 is a presentation-fix round (「R11 專修版面」). The fix is a design change rather than a repair, and M5's own recommendation was the same. The test-assertion slice is not taken separately either — it belongs with the change it describes.
revisit-if: nothing pending; the measurement stands as R12's entry evidence.
links: docs/rounds/r11-release-readiness/RCA_R11_CODEX_SKELETON_COVERAGE.md; D-007

## D-010 2026-08-15 WC-4.3 is removed from R11 and recorded against R12
status: decided
context: PSM card M4 carries WC-4.3 — de-emphasise unpaired `*_end` cards visually, escalating to warn only when several candidates make the pick ambiguous. The dispatch that implemented M4 omitted it, and the agent flagged the gap rather than dropping it silently.
options: implement in R11 / move to R12 / drop
choice+why: author moved it to R12. Implementing the "only when ambiguous" clause requires the candidate count, which is P1 provenance data that this round explicitly excludes — so it could not have been done correctly in R11 regardless of the dispatch omission.
revisit-if: R12 implements RCA P1, which is WC-4.3's precondition.
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

## P-001 2026-08-15 Codex exec-name and *_end event pairing cannot be fixed by tuning the heuristic
status: open
trail: R10-B (2026-08-14) added `patch_apply_end`/`mcp_tool_call_end` outcome reading on top of R7/R7.5's existing nearest-candidate pairing. Manual UAT (C4, D1 on 2026-08-15) found duplicate-looking "thinking chain" cards with no real content and leaked internal wrapper tags (`[external_agent_tool_result]...[/external_agent_tool_result]`) eating real content in the rendered card. The author ran an external Codex CLI session to root-cause it, producing `RCA_R10.1_CODEX_SESSION_PROVENANCE_2026-08-15.md`, which measured (357 local rollouts, 218,517 lines): 555/9,350 (5.94%) `custom_tool_call` inputs have no `tools.<name>(` shape the regex can extract; and of 1,063 currently-unpaired `*_end` events, at least 998 (93.9%) have NO recoverable candidate anywhere in the exported event stream — the theoretical floor of "end events minus recognizable starts" already exceeds the unpaired count, meaning no amount of nearest-neighbor tuning can close the gap. `context_compacted` (97 local occurrences) is a *proven* cause for some of these but the adapter has no causal link per-event, so it cannot honestly claim compaction as the reason for all 1,063.
resolution: not yet worked around. The RCA proposes a four-stage remediation (not yet implemented): P0 — downgrade `CODEX_EXEC_TOOL_NAME_UNRESOLVED`/`CODEX_EVENT_UNPAIRED` from warn to a named-capability-limit info tier, remove the unproven "多半是壓縮" claim from copy, de-emphasize unpaired `*_end` cards visually. P1 — add `association` (`exact`/`turn_nearest`/`nearest`/`unmatched`) and `unmatchedReason` fields so UI/distill can tell provenance strength apart instead of pretending IDs match. P2 — tri-state exec name resolution (`single_nested_tool`/`composite_exec`/`opaque_exec`) via a conservative lexical scanner that skips quoted strings/comments, rather than a looser regex. P3 — fill the ~0.025%-of-lines small type gaps (`tool_search_call`, `image_generation_end`, `thread_goal_updated`) separately; do not fold them into the "noise" metric.
links: docs/rounds/r10.1-codex-session-provenance/RCA_R10.1_CODEX_SESSION_PROVENANCE_2026-08-15.md; docs/OUTSTANDING_2026-08-14.md C4/D1 remarks; src/core/adapters/codexJsonl.ts (`EXEC_TOOL_NAME_RE`, `consumeNearestPendingExec`); src/i18n/diagnosticCopy.ts
