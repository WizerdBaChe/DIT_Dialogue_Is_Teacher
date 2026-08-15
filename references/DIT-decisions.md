# DIT — Decision & Process Journal

## Now (updated 2026-08-15, Phase 14)
frontier: R11 (`feat/r11-release-readiness`) is open. M0 landed and green (typecheck clean, 462/462, build clean). M1..M9 are specced in `docs/rounds/r11-release-readiness/PSM_R11_RELEASE_READINESS_v1.0.md` and awaiting dispatch. R11's exit condition IS D-004's merge gate.
premises: (user) the reduced R10-B error-parity acceptance stands; (user) `shell_command` stays unclassified unless new evidence appears — the R10.1 RCA was that analysis and reinforced it; (user) the render layer is out of R11; (user) high-entropy redaction defaults off; (user) the Codex skeleton gap gets measurement before any edit; (model) lifting the folder-browser's Claude-Code-only filter is now settled by the author's own UAT C1 defect report, so it needs no separate ruling.
open: D-001..D-008 decided; P-001 open (root-caused, P0 specced as R11-M4, unimplemented). Three deferred rulings need real output first: R11-Q1 (git SHA sensitivity — after M7), R11-Q2 (picker interleaving — after M1), R11-Q3 (M5's root cause into R11 or R12). Everything else previously "untriaged" is now a numbered card.

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
