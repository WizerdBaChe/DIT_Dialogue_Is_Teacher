# DIT — Decision & Process Journal

## Now (updated 2026-08-15)
frontier: Manual UAT pass on `test/uat-2026-08-14` (R9.1 + R9.2 + R10, 24 items) complete; author ruled on all four pending Part-3 questions. Merge to `main` is authorized once the newly-surfaced defects below are triaged and fixed — not immediately.
premises: (user) the reduced R10-B error-parity acceptance stands; (user) `shell_command` stays unclassified unless the R10.1 RCA yields new evidence; (model) the folder-browser's Claude-Code-only filter (`sessionIndexer.ts:298`) is a pre-R7 ruling, not an R10 regression — but it now conflicts with R10's multi-source premise and needs a fresh ruling.
open: D-001..D-004 all decided; P-001 open (root-caused, unimplemented); folder-browser Codex exclusion needs a ruling (see phase-log Phase 13 Open Questions); several newly-found UI/export defects are triaged in `docs/OUTSTANDING_2026-08-14.md` Part 1 remarks column but not yet turned into work cards.

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
