# Phase Checkpoint
- Project: DIT (Dialogue Is Teacher)
- Phase: Phase 1 – 構想評估與需求定稿
- Status: completed
- Date: 2026-06-25
- Detail: docs/RPD_DIT_v0.1.md

## Goals
- 評估「把 AI agent 執行軌跡轉成可學習節點」的可行性並定稿需求。

## Decisions
- 可行性高：Claude Code 已有結構化 .jsonl transcript，輸入端幾乎免費。
- 採 Span Tree 為核心資料契約；視圖與資料解耦（上層可多視圖）。
- D-1 MVP 直上 Vite+React+TS（不做原生單頁過渡）。
- D-2 Lobby 嵌入由使用者後處理。
- D-3 隱私「方便優先 + 使用者知情選擇」，需責任說明。
- D-4 講解 Provider 本地 Ollama 優先、雲端可插拔。
- D-5 多 session/技能庫擱置但架構預留。

## Changes
- docs/RPD_DIT_v0.1.md: RPD v0.2（決策鎖定 + 工程準則）。
- docs/demo/concept_demo.html: 雙欄概念展示頁（純溝通）。

## Open Questions / TODO
- 後續以 Vite+React 實作；魚骨視圖待規劃。

# Phase Checkpoint
- Project: DIT (Dialogue Is Teacher)
- Phase: Phase 2 – MVP 骨架（高密度模式 + 後端蒸餾 + 清亮換膚）
- Status: completed
- Date: 2026-06-25
- Detail: docs/architecture.md

## Goals
- 把 .jsonl 解析、降噪、結構化呈現為可互動的高密度卡片時間軸，並建立後端整理與清亮 UI。

## Decisions
- 分層管線：Adapter → Normalizer → Denoiser → Distiller → Validate → ViewModel；UI 只碰 Zustand store（低耦合）。
- 降噪走確定性規則（milestone/error/retry/decision、edit-loop 群組），不靠 LLM。
- 後端新增 DistilledSkeleton（spine/rib，preset v1，view-agnostic）供未來魚骨共用。
- 配色從 dark 改清亮 light（使用者明確要求，嫌 dark 像 SaaS）；tokens 集中於 :root 便於日後換膚。
- LLMProvider 介面：none(預設零外傳)/ollama(本地真實 fetch)/cloud(樁)。

## Changes
- src/types/spanTree.ts: Span Tree + DistilledSkeleton 型別。
- src/core/{adapters,normalize,denoise,distill,validate,view,llm}/, pipeline.ts: 核心管線。
- src/store/sessionStore.ts: 狀態（載入/Provider/重播/講解）。
- src/components/*, src/styles/index.css: 高密度 UI 與清亮主題。
- src/fixtures/sampleSession.jsonl: 內建範例（修 Todo bug）。

## Open Questions / TODO
- 認知/魚骨前端（吃 skeleton）尚未做 → Phase 3。

# Phase Checkpoint
- Project: DIT (Dialogue Is Teacher)
- Phase: Phase 3 – 認知模式（魚骨）+ 系統檢查
- Status: completed（已交付，待使用者實機驗收）
- Date: 2026-06-25
- Detail: docs/misc/REVIEW_2026-06-25.md

## Goals
- 實作橫向魚骨「認知學習模式」，吃後端 skeleton；對照 backend/frontend 檢查清單做系統檢查。

## Decisions
- 魚骨吃 doc.skeleton；主線(spine) 橫向 + 支線(rib) 掛載；節點/支線點擊 drill-down 重用既有 SpanCard/GroupCard。
- 雙模式可切換（cognitive/dense），預設 cognitive。
- phase-log 採兩層：精簡索引 + Detail 連既有 docs，不重複內容（本次 checkpoint 即採此法）。
- 檢查中修掉 3 個韌性缺口：Ollama 逾時(AbortController)、檔案讀取 onerror、輸入過大軟警告。

## Changes
- src/core/view/fishbone.ts, src/components/FishboneView.tsx: 魚骨視圖。
- src/store/sessionStore.ts, src/components/Header.tsx, src/App.tsx: viewMode 切換。
- src/core/llm/ollama.ts, src/components/Header.tsx, src/core/pipeline.ts: 韌性修正。
- docs/misc/REVIEW_2026-06-25.md, docs/ACCEPTANCE.md, docs/BACKLOG.md, docs/PROGRESS.md: 檢查報告/驗收單/待辦/進度。

## Open Questions / TODO
- 目前所屬 phase：Phase 3 已完成交付，**正處於等待使用者實機驗收的邊界**；驗收結果決定下一步。
- Phase 4 候選（見 docs/BACKLOG.md）：接本地 Ollama 實測講解品質、響應式/行動版、大檔虛擬化、自動化測試、雲端 Provider 實作、魚骨上方「觀念 rib」需講解層產生。

# Phase Checkpoint
- Project: DIT (Dialogue Is Teacher)
- Phase: Phase 4 – R1 Test Foundation (PSM R-numbering)
- Status: completed (merged to main)
- Date: 2026-07-04
- Detail: docs/PROGRESS.md (R1 section) + docs/PSM_DIT_v1.0.md (§3.2 R1, §5)

## Context shift
- M1–M3 accepted; repo was not under version control. PSM_DIT_v1.0 (v1.2) is now the single build entry point; execution order fixed R1→R7→R2→R3→R4→R5→R6 (ADR-012).
- ADR-014: `git init` in place (no new repo, nothing archived); baseline commit, then feature branch per milestone.

## Goals
- Establish the test foundation so every later milestone can touch the pipeline without manual regression.

## Decisions
- Vitest with node environment (pure-function tests only this round; no component/E2E tests — low value now).
- Pipeline snapshot tests are the SIT gate; committed snapshots freeze adapter→normalize→denoise→distill output.
- Added a second fixture (subagentSession.jsonl) with isSidechain / long output / multi-task boundaries to seed R4.

## Changes
- git: `.gitignore` (node_modules/dist/archive), baseline commit on main, branch feat/r1-test-foundation.
- package.json + vite.config.ts: Vitest wired (`npm test` = vitest run).
- src/fixtures/subagentSession.jsonl + index.ts: second fixture.
- src/core/pipeline.test.ts, denoise/denoiser.test.ts, distill/distiller.test.ts, adapters/claudeCodeJsonl.test.ts + __snapshots__: 42 test cases.

## Open Questions / TODO
- None blocking. `npm test` 42/42 + `npm run build` green.

# Phase Checkpoint
- Project: DIT (Dialogue Is Teacher)
- Phase: Phase 5 – R7 i18n + anti-slop Editorial Redesign
- Status: completed (merged to main)
- Date: 2026-07-04
- Detail: docs/PROGRESS.md (R7 section) + docs/PSM_DIT_v1.0.md (§3.2 R7, ADR-015~018)

## Goals
- Ship a zh-TW/EN bilingual module and remove the "AI-SaaS" look in favor of a plain, deliberate editorial design.

## Decisions (UX pre-locked before build, ADR-015~018)
- Visual direction: editorial serif — Georgia/宋體, ink #1c1a17 on warm paper, single oxblood accent #7c2128, hairline rules, no shadows, borderless cards with left-rule emphasis.
- Remove all emoji → text labels / geometric marks (sidebar dots, text-label fishbone nodes, guillemet replay controls).
- Default language zh-TW; language switch via Header dropdown; teaching-prompt output language follows UI locale.
- Custom lightweight i18n (src/i18n), no i18next. EN typed against zh-TW shape (missing key = compile error).
- Scope boundary: core diagnostic messages (PipelineError / adapter warnings / checkOllama) stay zh-TW — not i18n'd into core to avoid reverse coupling.
- Comment-language convention confirmed: machine/AI-read → English, human-read → Chinese; existing Chinese comments kept.
- Digit alignment fix (user feedback): @font-face + unicode-range U+0030-0039 maps digits to a sans face (lining figures), leaving serif text intact.

## Changes
- src/i18n/locales.ts + index.ts: dictionary + useT()/useLocale().
- src/store/sessionStore.ts: locale/setLocale; locale threaded into annotate ctx.
- src/core/llm/{types,prompt,ollama}.ts: AnnotateContext.locale; buildSystemPrompt(locale).
- src/components/*: all strings via i18n; labels.ts reduced to visual constants; emoji removed.
- src/styles/index.css: editorial-serif token + component redesign; LiningNums @font-face.
- docs/PROGRESS.md, docs/PSM_DIT_v1.0.md: R7 logged, §3.2 ticked, ADR-015~018.

## Open Questions / TODO
- Verified live: language switch is immediate and state-preserving; grep src/components shows CJK only in comments.
- Next milestone: **R2 – Ollama annotation quality UAT** (needs the user's local machine; run annotateAll on a real session, tune prompt.ts only, produce docs/UAT_ollama_<date>.md).

# Phase Checkpoint
- Project: DIT (Dialogue Is Teacher)
- Phase: Phase 6 – R2 Local Analysis, R3 Privacy-Safe OpenCode, and R4 Subagent Branches
- Status: completed
- Date: 2026-07-19
- Detail: docs/PROGRESS.md

## Goals
- Complete local Ollama teaching-quality UAT, add privacy-safe OpenCode analysis at provider parity, persist reusable annotations, and render cross-file subagent branches.

## Decisions
- OpenCode is an analysis provider peer to Ollama, never a development worker; DIT uses its loopback server without `--pure` so the project `dit-annotator` agent loads.
- Every OpenCode payload passes through the reusable Privacy Gateway with local de-identification, preview, session-scoped consent, and secret fail-closed behavior.
- Web builds only probe runtimes and expose fixed commands because browser pages cannot safely launch local processes; desktop runtime control remains an isolated future product decision.
- Subagent visualization uses the existing Span Tree contract and a lightweight local SVG branch rather than adding React Flow.

## Changes
- src/core/privacy/ and src/adapters/dit/: added the reusable de-identification pipeline and the DIT privacy adapter.
- src/core/annotation/, src/store/sessionStore.ts, and IndexedDB adapters: added missing/retry/all jobs, per-item persistence, restore, and recoverable provider errors.
- src/core/llm/ and src/core/runtime/: added OpenCode transport/status probing, readable loopback failures, and fixed 5173/4173 CORS commands.
- src/core/pipeline.ts, normalizer, view model, and UI components: added main-plus-subagents multi-file merge, UUID parent linkage, expandable groups, symbol legend, and local SVG branches.
- index.html: embedded a data-URL favicon so production preview no longer requests a missing `/favicon.ico`.
- docs/PROGRESS.md, docs/PSM_DIT_v1.0.md, docs/architecture.md, and references/DIT-tickets.md: recorded completed R2–R4 acceptance and evidence.

## Open Questions / TODO
- R5 remains optional and should begin only when large-session performance or narrow-screen usability becomes a demonstrated need.
- A packaged desktop runtime controller remains deferred; current web users start Ollama or OpenCode with the fixed inspectable commands.

# Phase Checkpoint
- Project: DIT (Dialogue Is Teacher)
- Phase: Phase 7 – R5 Large-Session Foundation and Guided Navigation Contract
- Status: completed
- Date: 2026-07-19
- Detail: docs/rounds/r5-guided-navigation/PSM_R5_GUIDED_NAVIGATION_v1.0.md

## Goals
- Make 50 MiB sessions load responsively with bounded rendering, preserve exact R4 ordering and linkage, and correct the workspace navigation model before further UI implementation.
- Consolidate the approved orientation, persistent Structure, Minimap, and Session Map semantics into one build-ready source of truth.

## Decisions
- Preserve the accepted streaming import, worker cancellation, virtualized Sidebar/MainView, deep selection, replay precedence, bilingual behavior, Privacy Gateway, and annotation contracts.
- Supersede the rejected four-tab Reader/Fishbone/Subagents/Structure design; Primary View is limited to Overview, Reader, and Subagents.
- Keep Structure persistent and collapsible at widths at or above 720 px, and expose the same virtualized tree through an accessible left drawer below 720 px.
- Enter every built-in, loaded, or reset session through Overview; use an optional Reader Minimap and a modal Session Map for global orientation and explicit jumps.
- Keep the visible Map launcher as the non-keyboard path; `M` is enabled by default but disabled in editable targets and blocking modals, and users can turn the shortcut off.
- Reuse the current React/SVG stack with deterministic semantic zoom and strict mount caps; add no map or tab library.
- Treat `docs/rounds/r5-guided-navigation/PSM_R5_GUIDED_NAVIGATION_v1.0.md` as the sole normative contract and execute GN-01 through GN-08 sequentially as separate vertical commits.

## Changes
- docs/rounds/r5-guided-navigation/PSM_R5_GUIDED_NAVIGATION_v1.0.md: added the user-approved sole-source contract with 8 business rules, 18 invariants, exact responsive layouts, state transitions, component boundaries, performance caps, 8 complete work cards, and final UAT.
- references/DIT-context.md: added canonical definitions for Primary View, Overview, Session Origin, Structure Sidebar, Current Position, Minimap, Session Map, Map Landmark, Map Cluster, and Semantic Zoom.
- references/DIT-tickets.md: kept T-005 in progress and recorded contract approval without claiming product implementation.
- docs/rounds/r5-guided-navigation/PSM_R5_GUIDED_WORKSPACE_REMEDIATION_v0.2.md and docs/rounds/r5-guided-navigation/CONCEPT_R5_GAMEFUL_NAVIGATION_v0.1.md: retained as non-normative design provenance superseded by the v1.0 contract.

## Open Questions / TODO
- Start the next session by reading this phase log and `references/DIT-context.md`, then load the v1.0 contract and T-005 only; do not reconstruct requirements from superseded UX documents.
- Implement GN-01 only, run its stated automated and manual acceptance, and stop at its commit boundary before GN-02.
- Preserve the current dirty worktree and unrelated user changes; do not modify `.claude/settings.local.json`.
- Independent author-versus-verifier document sign-off remains unavailable; the user approved the contract on 2026-07-19 and final visual acceptance still requires user UAT after GN-08.

# Phase Checkpoint
- Project: DIT (Dialogue Is Teacher)
- Phase: Phase 8 – Provider Openness Design (make the tool usable by everyone)
- Status: design locked; implementation deferred to a new session
- Date: 2026-07-24
- Detail: docs/rounds/r8-provider-openness/DESIGN_R8_PROVIDER_OPENNESS_v0.1.md

## Goals
- Turn the personal, opencode-only cloud path into an open, provider-agnostic teaching layer so any user can pick their own AI (local or paid) with a painless full-feature experience.

## Decisions (user-ratified 2026-07-24; ADR-026..030 in the design doc)
- Verified hard fact: DIT is a browser-only static app; most cloud APIs block direct browser calls via CORS. OpenAI/Gemini are CORS-blocked; Anthropic works with the `anthropic-dangerous-direct-browser-access` header; Ollama/LM Studio/Jan are local; OpenRouter/Groq browser-direct is unverified (M0 to test). "Zero-install + free cloud" does not exist.
- ADR-026: merge `none/ollama/cloud` into ONE Endpoint Provider + Preset registry, all metadata-driven.
- ADR-027: keep a Local Proxy preset (opencode demoted to one option, add LiteLLM) to cover CORS-blocked clouds like OpenAI/Groq.
- ADR-028: relicense to MIT (charitable open source). A no-redistribution license cannot protect the idea, is unenforceable for a solo dev, and contradicts "everyone can use"; donations and the author's own commercialization are both allowed under MIT, so non-commercial was rejected.
- ADR-029: persist BYOK keys via a runtime-fetched `dit.config.json` (release is served over localhost, so a sibling fetch works) + in-memory paste fallback; localStorage is not the default. Keys never enter the UI export, snapshots, or logs.
- ADR-030: every `sendsDataOut` preset must route through the existing Privacy Envelope, not only the old opencode path.

## Changes
- docs/rounds/r8-provider-openness/DESIGN_R8_PROVIDER_OPENNESS_v0.1.md: added the PIM-level semantic contract (glossary, INV-R8-1..8, preset schema, EndpointStatus state machine, key/config design, ADR-026..030, milestone proposal M0..M6, M1 manual acceptance). Labeled PIM-grade, NOT sole-source PSM.
- references/DIT-context.md: added canonical definitions for Endpoint Provider, Preset, Local Proxy, BYOK, Config File.

## Open Questions / TODO (resolve at the start of the implementing session)
- M0 empirical checks BEFORE coding: (a) Anthropic browser-direct with the dangerous header actually succeeds; (b) whether OpenRouter/Groq are browser-directable (if yes, promote to `direct` presets and skip the proxy for them).
- `ProviderId` rename/migration scope (`cloud` is now misleading) — decide ADR once M0 is known.
- Onboarding depth is a UX-semantic decision — ASK the user before building it (M6).
- This design doc is PIM-grade; the implementing session must expand it to a work-card PSM before building, and must not treat it as sole-source.

# Phase Checkpoint
- Project: DIT (Dialogue Is Teacher)
- Phase: Phase 9 – R9 Session Browser + State-Machine Consolidation, and R9.1 UAT Remediation
- Status: R9 merged into `main`; R9.1 built and green in CI-equivalent gates but **manual acceptance not run** — the round is open, not closed
- Date: 2026-07-27 .. 2026-07-29
- Detail: docs/rounds/r9.1-uat-remediation/HANDOFF_R9.1.md
- Note: written retroactively on 2026-08-14. Phases 9 and 10 were never checkpointed at the time; the gap is what let a cloud session open a second round numbered R9.

## Goals
- R9: let the user browse sessions by title instead of guessing at hash filenames, make one bad file a per-file outcome instead of a dead batch, and arbitrate the six blocking surfaces instead of letting them race.
- R9.1: repair the eight root causes (RC-A..RC-H) that the R9 UAT surfaced, structurally rather than symptomatically.

## Decisions
- A line-level parse failure was already tolerated; R9 extended the same discipline to file level — one unreadable file in a batch must not fail the batch.
- `reportFallback` is for a substitution the user **cannot observe**. A degradation already encoded in the return type and shown in the UI (e.g. `titleSource: "filename"`) reports through `Diagnostic` aggregates instead. Recorded in `CLAUDE.md` as a sharpened project invariant.
- `BrowseState`'s `"no_directory"` became `"closed"` — the state is now reachable only by user intent.
- `SpanType` gained `"marker"`; `SkeletonNodeKind` lost `"milestone"` (`SpanTag.milestone` is unaffected).
- `.btn` sizing is a row-level concern (`--btn-min-h`), not a per-element one. Per-element sizing is what produced the 40/30/30 defect.
- B5 (Firefox / Safari) is recorded as **unverifiable in this environment**, not as untested work. It is not a backlog item; the unlock condition lives in `docs/BACKLOG.md` 「無法驗證項」 and `UAT_R9.1_v1.0.md` §F. No document may claim Firefox/Safari support.

## Changes
- docs/rounds/r9-session-browser-and-fsm/: PSM work cards, the UAT with the author's inline reports, and RCA_R9_UAT_v1.0.md (root causes RC-A..RC-H, each pinned to a source line).
- docs/rounds/r9.1-uat-remediation/: work cards M1–M11, the R9.1 UAT checklist, and HANDOFF_R9.1.md.
- docs/design/DIT_STATE_MACHINES.md: maintained inventory DSM-1..DSM-10 plus the debt register.
- docs/design/DIT_TEXT_RENDERING.md: Markdown/LaTeX design note — design only, no implementation (RC-H).
- src/: see the RCA table for the fix location of each cause.

## Open Questions / TODO
- **R9.1 manual acceptance is unrun.** `UAT_R9.1_v1.0.md` A1–A3 and B1–B5. A1 is the one item that can still disprove the RC-A diagnosis.
- Copy judgement on 「挑選 Session」/「載入單一檔案」, the 決策 category definition, and whether `milestone` should be reinstated with a criterion of its own — all await the author.
- Push / merge / release of R9 and R9.1 remain unauthorised as of this writing.

# Phase Checkpoint
- Project: DIT (Dialogue Is Teacher)
- Phase: Phase 10 – R9.2 Conversation Transcript Export (v0.4.0)
- Status: shipped and merged; built in a cloud session against a tree that did not contain R9
- Date: 2026-08-11
- Detail: commits `f1801b4`, `addfc62`, `a9b12bd`, merged as `33bc8f6`
- Note: written retroactively on 2026-08-14. This round shipped with no round id and no round directory; R9.2 is a retroactive label. See docs/rounds/r9.2-transcript-export/RECORD_R9.2.md.

## Goals
- Get the conversation itself out of a session — what the user asked, what the AI thought, what it said back — as something a human reads, distinct from the existing session archive.

## Decisions
- The transcript is deliberately **not** the snapshot. The archive (JSON / HTML snapshot) carries raw events and tool parameters so the node view can be restored; the transcript throws those away and is not restorable.
- Exports get their own privacy policy that **downgrades secrets to placeholder replacement** rather than blocking. Blocking is right pre-egress (nothing is lost by stopping); for a file written to the user's own disk it just makes the user turn redaction off entirely.
- Redaction is document-wide, so one value maps to one placeholder across every turn. Session title and project path are redacted; `session.id` is not (it is a random identifier and the anchor back to the node view).
- Turn boundaries come only from main-line `user_msg`; a side-chain `user_msg` is a subagent prompt and stays inside the current turn, so toggling subagents cannot renumber turns.
- The HTML reading page contains no JavaScript at all — the outline works on anchors — so it needs no template and no production build.

## Changes
- src/core/export/transcript*.ts (+ tests): pure-function pipeline mirroring `buildExport.ts` discipline — no `Date.now()`, no store, no DOM.
- src/core/privacy/apply.ts, redact.ts, policies.ts: overlap resolution and the replacement transform moved out of `gateway.ts` so both paths share the offset-slicing logic.
- src/types/spanTree.ts: optional `synthetic` marker so verbatim outputs can drop the Codex adapter's own narration of system events; `SCHEMA_VERSION` unmoved.
- Four defects fixed in shared code: secrets now outrank other finding kinds regardless of the action a policy assigns; placeholder numbering is a separate forward pass; the post-redaction rescan no longer flags its own placeholders; capture-group findings are located with `match.indices` instead of `indexOf`.

## Open Questions / TODO
- The round was built on a tree without R9, so the merge on 2026-08-14 needed one fixup: the export tests constructed `ParseResult` with the pre-R9 `warnings: string[]` field (commit `e7830bd`). Product code was unaffected.
- The transcript path has had no manual acceptance either — it was verified by tests and build only.

# Phase Checkpoint
- Project: DIT (Dialogue Is Teacher)
- Phase: Phase 11 – R10 Source Awareness, Codex Fidelity, and Product Scan (research)
- Status: research complete; investigation tool shipped; implementation blocked on a local sample scan
- Date: 2026-08-11
- Detail: docs/rounds/r10-source-awareness/RESEARCH_R10_SOURCE_AWARENESS_AND_CODEX_FIDELITY_v0.1.md

## Goals
- Answer three user questions with evidence rather than opinion: what convenience designs existing products offer, whether the Codex adapter can be improved further from official upstream data, and whether the pipeline can identify the source harness before processing instead of checking globally.

## Decisions
- Source detection is already feature-based and correct (`detectAdapter()` reads only the first non-empty line; `normalize()` records the verdict on `doc.session.source`). The defect is downstream: `denoise()` and `distill()` never read that field and match hardcoded Claude Code tool names against every source. Proposed remedy is a `SourceProfile` table keyed by `SourceId`, resolved once at parse time.
- Measured on a semantically identical session expressed in both formats: Claude Code yields 2 skeleton ribs, 1 edit-loop group and error x2; Codex yields zero ribs, zero groups and zero error tags. The Codex degradation is caused by the rule layer, not by missing data in the rollout.
- Upstream `codex-rs/rollout/src/policy.rs` proves rollout files come in two history modes. Every event the R7/R7.5 Codex enrichment depends on is Legacy-mode only; Paginated mode emits `event_msg/item_completed` carrying a `TurnItem` instead, which the current adapter treats as an unknown type. This makes the Paginated case the single largest risk to the existing Codex investment.
- Official `entered_review_mode` / `exited_review_mode` markers exist and are persisted in Legacy mode; R7.5's English-signature heuristic (`"The following is the Codex agent history"`) should become the fallback, not the primary detector.
- `response_item/agent_message` is currently dropped silently as zero-content subagent chatter, but upstream lists `ResponseItem::AgentMessage` as a persisted first-class message item. Flagged for re-verification against real samples; deliberately left unchanged until verified.
- Product scan: multi-harness viewing is commodity (28-agent, 25-agent and 20-agent viewers already exist). Per-session full-text search is the only convenience competitors all have, DIT entirely lacks, and that is compatible with the teaching positioning. Chasing harness breadth is rejected as it also conflicts with R7-INV-6.
- User ruling 2026-08-11 on execution order: assess R10-A's impact first; if the impact turns out to be small, build R10-B (source profiles), then R10-C (search), and take on R10-A last.
- The impact assessment cannot be performed from a cloud session because the rollout files exist only on the user's local machine, so the assessment was converted into a tool the user runs locally.

## Changes
- docs/rounds/r10-source-awareness/RESEARCH_R10_SOURCE_AWARENESS_AND_CODEX_FIDELITY_v0.1.md: added the PIM-grade research note with the measured parity table, the verbatim upstream persistence policy, the competitor matrix, and a to-verify checklist. Explicitly labeled non-normative.
- docs/BACKLOG.md: added the 2026-08-11 R10 section listing R10-A/R10-B/R10-C with priority and blocking conditions.
- scripts/scan-codex-sessions.mjs: added a zero-dependency streaming scanner and classifier for `~/.codex/sessions`. Emits a per-file LEGACY/PAGINATED/MIXED/INDETERMINATE verdict, the type histogram, the tolerant-capture ratio under the current adapter, and key-path shapes for `item_completed.payload.item` and `session_meta`. Records structure and a narrow allowlist of enum-like values only; message text, reasoning, commands, file paths and cwd never enter the shareable report. Verified against synthetic fixtures with eleven planted content strings, none of which appear in the report.
- package.json: added the `scan:codex` script.
- docs/rounds/r10-source-awareness/R10_KICKOFF_PROMPT.md: added the handoff prompt for the local implementation session.

## Open Questions / TODO
- Run `npm run scan:codex -- "<sessions folder>"` locally and report the mode distribution, the tolerant-capture ratio, and the observed `item_completed.payload.item` key paths. Everything downstream depends on these numbers.
- If PAGINATED is a large share of the user's real sessions, the "impact is small" premise behind the agreed ordering fails and the order must be re-ruled by the user rather than silently changed.
- `item_completed.payload.item` JSON field names are still unknown; they were inferred from Rust enum variant names only and must not be invented.
- Confirm whether `response_item/agent_message` is genuinely always empty in real samples.
- Confirm whether `function_call_output.output` carries a `success` field usable to restore `isError`, which is one direct cause of the missing error tags on Codex sources.
- R10-C needs three UX rulings before any code: search scope layers, behavior when a hit lands inside collapsed content, and whether LLM annotations are searchable given they are generated asynchronously.

# Phase Checkpoint
- Project: DIT (Dialogue Is Teacher)
- Phase: Phase 12 - R10 Source Awareness implementation (M1 agent_message, R10-B source profiles)
- Status: built and green on every automated gate; ZERO manual acceptance run - the round is delivered, not accepted
- Date: 2026-08-14
- Detail: docs/rounds/r10-source-awareness/SCAN_R10_LOCAL_ROLLOUT_RESULTS.md, docs/OUTSTANDING_2026-08-14.md

## Goals
- Clear the Step 1 decision gate with measured local data instead of inference, then build what the data justified.

## Decisions
- The scan cleared the agreed ordering: 356/356 rollouts are LEGACY, zero Paginated signals across nine CLI versions, weighted tolerant-capture ratio 0.025%. But three research premises came back false and two of them invalidated planned work.
- User ruling 2026-08-14: F-2 (agent_message data loss) jumps the queue; investigate before speccing R10-B; Paginated becomes detect-and-degrade rather than map-the-fields; the reduced cross-source acceptance is accepted.
- R10-A's first priority is not merely low value, it is unbuildable: with no Paginated sample there are no real key paths, and the round forbids inventing field names.
- `response_item/agent_message` is never empty (544/544, median 84 chars, max 16,215). Dropping it was data loss. Now emitted on the sub-agent side chain with direction read from author/recipient thread paths.
- `function_call_output.output` has no `success` field anywhere (0 of 4,142), so R10-B's stated route to error parity does not exist. What survives: patch_apply_end.success (2,186/2,186) and mcp_tool_call_end.result's Ok/Err tag (712, all Ok, so the failure shape is unproven).
- Plain exec records no outcome at all (0 of 9,342). `isError` is therefore left undefined and `ResultInfo.outcomeUnknown` carries the distinction through normalization, rather than coercing "not recorded" into "succeeded".
- The injection-tag split was dropped on measurement: Codex messages contain all eight tags including 145 recommended_plugins and 57 system-reminder, so splitting would stop stripping preambles that are demonstrably present.
- `shell_command` (6,037 occurrences, the corpus's most common call) is named as unclassifiable rather than guessed into a bucket. Whether to decide it from the command string is an open ruling.
- Round ids and phase numbers were renumbered this week after a cloud session opened a second round called R9; the contract preventing a repeat is in CLAUDE.md.

## Changes
- src/core/adapters/codexJsonl.ts: agent_message kept and directed; patch_apply_end.success and mcp Ok/Err now set isError; exec leaves it undefined.
- src/core/source/profiles.ts: the source profile table, with Codex tool names measured over 356 rollouts.
- src/core/denoise/denoiser.ts, src/core/distill/distiller.ts: read the profile instead of hardcoded Claude Code names. filePathMapKeys models Codex reporting edits as a map keyed by path.
- src/types/spanTree.ts, src/core/normalize/normalizer.ts: optional outcomeUnknown; SCHEMA_VERSION unmoved.
- src/core/source/crossSourceParity.test.ts: the acceptance test, which fails on the previous commit.
- docs/OUTSTANDING_2026-08-14.md: 24 acceptance items across four rounds merged into one runnable sheet, plus what is unbuilt, unruled, and unverifiable.

## Open Questions / TODO
- Nothing in this round has been seen by a human in a browser. docs/OUTSTANDING_2026-08-14.md Part 1 is the sheet; test/uat-2026-08-14 is the branch that carries R9.1 and R10 together.
- Four rulings pending: shell_command classification, R10-C's three UX questions, whether milestone returns, and when R9.1/R10 merge to main.
- The three 2026-08-03 release blockers were re-verified as still present and remain unfixed.

# Phase Checkpoint
- Project: DIT (Dialogue Is Teacher)
- Phase: Phase 13 – Manual UAT pass on test/uat-2026-08-14 (24 items) + rulings + Codex provenance RCA
- Status: UAT run, all 4 pending rulings closed; merge to main authorized but gated on a fix-up pass first — round not yet closed
- Date: 2026-08-15
- Detail: docs/OUTSTANDING_2026-08-14.md (filled-in results, remarks column), references/DIT-decisions.md (D-001..D-004, P-001), docs/rounds/r10.1-codex-session-provenance/RCA_R10.1_CODEX_SESSION_PROVENANCE_2026-08-15.md

## Goals
- Run the 24-item consolidated UAT sheet (Part 1 of OUTSTANDING_2026-08-14.md) covering R9.1, R9.2, R10-M1, and R10-B in one pass on the combined branch.
- Close the four pending Part-3 rulings (shell_command classification, R10-C's three UX questions, milestone reinstatement, main-merge timing).

## Decisions
- All four Part-3 rulings closed — see references/DIT-decisions.md D-001 (shell_command stays unclassified, reinforced by the R10.1 RCA rather than overturned), D-002 (R10-C: text+params default, parent-card "N hits" collapse handling, annotations not searchable yet), D-003 (milestone stays removed), D-004 (main merge authorized once the fix-up pass lands, not immediately).
- The R10-B reduced acceptance items (D2/D5/D4/D6 in the sheet) mostly landed as "無法判定" rather than clean pass/fail — the acceptance criteria for D2 (blocked by a separate C1 finding), D4 (test location too vague), and D5 (most sample files lack injection tags) need sharper UAT wording before they can be re-run, not necessarily code changes.
- P-001 opened: the Codex exec-name/`*_end` pairing problem is root-caused as structurally unrecoverable for ~94% of currently-unpaired events (not a heuristic-tuning problem) via an author-run external Codex CLI investigation, with a four-stage P0-P3 remediation plan proposed and NOT yet implemented.

## New defects surfaced (not pre-existing known blockers; not yet triaged into work cards)
- **Folder-browser excludes Codex sessions entirely** (C1): `sessionIndexer.ts:298` — `if (headScanUsable && !result.isClaudeCode) continue;` — is a pre-R7 ruling ("本輪只索引 Claude Code") that predates R10 and is therefore not a regression, but it now contradicts R10's multi-source premise: Codex sessions can only be reached via single-file load, never via "挑選 Session" folder browsing. Needs a fresh ruling, not a bug fix — flagged in `## Now` above.
- **Reader itself does not render Markdown** (B1): literal backtick/syntax text (e.g. `` `span.synthetic === true` ``) is shown unrendered both in the Reader and in exported outputs — broader than the export scope the UAT item was testing.
- **Transcript export still includes tool activity** (B1) when the author expected pure conversation; export entry-point naming is unclear ("匯出"/"對話紀錄" don't read as distinct); "複製 Markdown" should read "以 MD 形式複製到剪貼簿".
- **Redaction gaps** (B3): long random tokens (session ids, likely API-key-shaped strings) are not being caught by the secret detector; whether git commit hashes in commands should be redacted is an open question, not yet a ruling.
- **Subagent messages classified into the generic "群組" bucket instead of the "子代理" category** the legend documents (C3/D3), on both Codex and Claude Code sessions — the legend's 9-symbol vocabulary (from A7's redesign) and the actual rendered classification have drifted apart.
- **Entry-point copy** (A4): author proposes "挑選 Session"→"從對話集選擇", "載入單一檔案"→"選擇一則對話" for a non-technical audience that shouldn't need to know the word "session".
- **Legend/tooltip redesign** (A7): the Overview page's collapsed-by-default 符號說明 has no discovery affordance; author wants it replaced by hover tooltips at `.tree-legend` and `.map-legend` without changing the existing layout otherwise.

## Changes
- docs/OUTSTANDING_2026-08-14.md: all 24 Part-1 rows filled in with results/observations by the author; all 4 Part-3 rulings recorded inline.
- references/DIT-decisions.md: created (first use in this project) — D-001..D-004, P-001.
- docs/rounds/r10.1-codex-session-provenance/RCA_R10.1_CODEX_SESSION_PROVENANCE_2026-08-15.md: author-run external Codex CLI investigation, not yet committed to git at checkpoint time.
- package-lock.json: refreshed by `npm install` on the UAT branch (routine, not a dependency change).

## Open Questions / TODO
- Whether the folder-browser's Claude-Code-only filter should be lifted for Codex now that R10 exists — this is a ruling, not a code question (see `## Now`).
- The seven "New defects surfaced" items above are not yet work cards — they need triage (which round, what priority) before D-004's merge gate can be considered met.
- P-001's P0 remediation (downgrade warning severity/copy, de-emphasize unpaired cards) is the cheapest next slice if this round continues rather than pausing for merge.
- The three 2026-08-03 release blockers (P2-1/2/3 in OUTSTANDING) remain unfixed and unaddressed by this phase.
- `docs/rounds/r10.1-codex-session-provenance/RCA_R10.1_CODEX_SESSION_PROVENANCE_2026-08-15.md` is untracked in git as of this checkpoint — needs `git add` in the next commit that touches this round.

# Phase Checkpoint
- Project: DIT (Dialogue Is Teacher)
- Phase: Phase 14 – R11 Release Readiness opened (M0 landed, work cards specced, three rulings closed)
- Status: in-progress — M0 shipped and green; M1..M9 specced but not dispatched at write time
- Date: 2026-08-15
- Detail: docs/rounds/r11-release-readiness/PSM_R11_RELEASE_READINESS_v1.0.md

## Goals
- Triage Phase 13's seven untriaged defects plus the three 2026-08-03 release blockers into one executable round, so D-004's merge gate has a definite closing condition.
- Land the findings small enough to fix without a work card, and spec the rest.

## Decisions
- Round id `r11-release-readiness` allocated before any file was written; branch `feat/r11-release-readiness` cut from `test/uat-2026-08-14`. Scope is a fix-up pass, not a feature round.
- Author ruling: the Markdown/LaTeX render layer is split out as `r11.1-text-rendering`. It is a new capability, not a repair, spans both render paths, and carries an injection surface that needs its own security acceptance — keeping it in R11 would let it hold the main merge hostage.
- Author ruling: high-entropy redaction ships **default off** with honest "N detected, not redacted" reporting. Catching unprefixed tokens necessarily over-catches git SHAs and UUIDs, and transcript readability is the user's trade to make, not a default's.
- Author ruling: the Codex skeleton-coverage gap (UAT C3's serious half) gets an investigation card only. D-001 and the R10.1 RCA §P2 both forbid guessing; measuring before editing avoids repeating R10-B's "believed fixed, measured empty" loop.
- P2-1 and C1 are merged into one card: they are the same 15 lines of `sessionIndexer.ts`, and the stale-adapter recompute has to land before the Codex filter is lifted or the lifted filter inherits the stale verdict.
- Only P0 of the R10.1 RCA is in scope. P1/P2/P3 each need their own measurement and are named as out-of-scope so a dispatched agent cannot drift into them.
- `paste` is a declared-but-unproducible `SourceId` — the exact pattern R9.1 removed `milestone` for. Decided under the decision charter (reversible, no UX change): remove it rather than build an entry point nobody requested. This is what made UAT D4 untestable.

## Changes
- src/i18n/locales.ts: entry-point copy drops "session"; export group names distinguish snapshot from transcript; new `card.groupKindTag` table keyed on `GroupKind`.
- src/components/GroupCard.tsx: label reads `group.kind` instead of a hardcoded 群組 — subagent groups now show the category the legend documents.
- src/core/export/contracts.ts: `DEFAULT_TRANSCRIPT_OPTIONS.includeToolSummary` true → false; the stats header still reports the omission.
- src/core/export/{transcript,transcriptMarkdown,transcriptHtml}.test.ts, src/components/SettingsDialog.test.tsx: four tests now request tool summaries explicitly instead of inheriting the old default; one legend assertion updated.
- docs/rounds/r11-release-readiness/PSM_R11_RELEASE_READINESS_v1.0.md: the round spec — UAT-finding-to-card traceability table, seven cards with agent assignment, degradation order, twelve manual acceptance items, and an explicit not-in-this-round list.

## Open Questions / TODO
- M1..M9 are specced but undispatched. Guaranteed core is M1+M2+M3 (the three release blockers); everything after is cut back-to-front if budget runs short, and anything cut must reappear by number in the next OUTSTANDING sheet.
- Three deferred rulings need real output before they can be answered: R11-Q1 (is a git commit SHA sensitive — decide after seeing M7's output), R11-Q2 (should Codex and Claude Code sessions interleave in the picker), R11-Q3 (does M5's root cause land in R11 or R12).
- Phase 13's note that the R10.1 RCA was untracked is stale — it was committed as f9dda37.

# Phase Checkpoint
- Project: DIT
- Phase: Phase 15 – R11 construction complete, manual acceptance run, round NOT accepted
- Status: in-progress (construction done; acceptance failed, repairs untriaged)
- Date: 2026-08-16
- Transcript: d7f966a5-0c07-4e23-aad0-0c89fa63a8c8.jsonl — archived: yes (daily mirror OK 2026-08-16 13:00)

## Goals
- Execute the seven R11 work cards specced in Phase 14, dispatching subagents and committing each card as its own semantic commit.
- Close the three deferred rulings once real output existed.
- Produce a manual acceptance card and get the author through it.

## Decisions
- Author ruling R11-Q1 (D-009): commit hashes stay inside the high-entropy rule — a hash is not readily reversible without its context and path, and the rule is default-off anyway.
- Author ruling R11-Q3 (D-011): the Codex skeleton fix goes to R12; R11 stays a presentation-fix round.
- Author ruling (D-010): WC-4.3 moves to R12 — its "escalate only when ambiguous" clause needs P1 candidate data this round excludes, so the dispatch that omitted it could not have done it correctly anyway.
- Author ruling (D-012): S-03 promoted into R11 — a consent mechanism that has never functioned should not cross the merge gate.
- Author ruling R11-Q2: the picker interleaves Codex and Claude Code by time; the current behaviour is what the author wants. Recorded as D-013.
- Author ruling: the two SECREVIEW suggestions (inert high-entropy checkbox, snapshot export carrying no redaction or disclosure) are recorded as documented exclusions rather than fixed. Recorded as D-014.
- Author ruling: external free models are withdrawn as the executor after the session limit was exhausted by dispatching six agents at once; cap is two concurrent, and reports are analysed before the next batch. The opencode route was measured first (endpoint flaky, `--variant max` works) and abandoned mid-round at the author's instruction.
- Dispatcher ruling: prevention of git access for dispatched agents was ATTEMPTED TWICE and FAILED — agent-level `bash: {"git *": "deny"}` loaded but never fired (a default `*/*: allow` rule precedes it), and a PATH shim never reached the agent's shell. Stopped at two attempts per the no-third-guess rule and switched to post-hoc detection: every card committed before the next dispatch, HEAD compared after each batch. No agent ever touched git.
- M4's root cause was handed to it as evidence but it re-measured independently over 358 rollouts before acting — 5,885/5,889 non-empty `reasoning` summaries are byte-identical to the concatenation of preceding `agent_reasoning` fragments, zero orphans. The fix removes the second span at source rather than deduplicating at render.

## Changes
- src/core/index/{sessionIndexer,contracts,classifySession}.ts (+tests), src/components/SessionBrowserDialog.tsx: adapter verdict recomputed after the head window widens, THEN the Codex exclusion lifted; three-way rule (readable+unclaimed excluded / unreadable listed as undetermined / claimed kept with its source). New `codex-unclassified` reason. Commit d5ef020.
- src/store/sessionStore.ts (+tests): snapshotMode guard inside loadPersistedConfig (one enforcement point for every caller); try/catch on indexFileList symmetric with the FSA path; resumeLastDirectory now opens the browser instead of closing it — the WebKit `<input>` fallback had no entry point at all and the old comment claiming otherwise was false. Commit 397d2ac.
- src/core/adapters/codexJsonl.ts, src/i18n/diagnosticCopy.ts, src/types/spanTree.ts, src/core/source/profiles.ts (+tests): reasoning envelope no longer emits a span; 50,221 bracketed wrapper markers stripped in the one path they occur; unpaired-event diagnostics dropped to the existing info tier; compaction removed as an asserted cause; `paste` SourceId removed (D-008). Commit a5f8899.
- src/core/privacy/**, src/core/export/**, src/components/ExportControls.tsx, src/i18n/locales.ts (+tests): high-entropy detector, default off, with the disclosure running in both states. Threshold 4.3 bits/char chosen from a sweep over 191,534 real message-text values; the decisive change was requiring the undivided run to reach 20 chars, which cut kebab-case false positives from 274,685 to 582. Commit acce089.
- src/components/{StructureLegend,SessionMapDialog}.tsx, src/styles/index.css, src/i18n/locales.ts: legends became always-visible with hover/focus/screen-reader tooltips; new spanKindDefinition copy. Two defects fixed on review that no test could see — `<p>` nested inside `<button>` and inside `<p>`, and a descendant selector that could never match the map legend's sibling bubble. Commit 0941ee3.
- src/core/privacy/redact.ts, src/store/sessionStore.ts (+tests): disclosure counted by containment instead of overlap (a half-redacted high-entropy string was silently dropped from the "not redacted" count); consent scope now reuses the string the review opened with instead of rebuilding it in a second format. Commit 3cbde1f.
- docs/rounds/r11-release-readiness/: RCA_R11_CODEX_SKELETON_COVERAGE.md (M5), REVIEW_R11_BLIND_SPOTS.md (M9), SECREVIEW_R11_M7_REDACTION.md, UAT_R11_v1.0.md. Commits ecb8146, e49564f, a93462b.
- references/DIT-decisions.md: D-009..D-014; `## Now` rewritten.

## Open Questions / TODO
- **R11 IS NOT ACCEPTED.** The author ran UAT_R11_v1.0.md on 2026-08-16: 8 passed, 4 partial, 5 failed, 7 untestable. D-004's merge gate stays shut until the failures are triaged and repaired.
- Failures needing a home: (a) tooltip is clipped/underlapped near the reading column — same root cause as the narrow-window case, and it is a stacking/overflow problem the DOM assertions could not see; (b) every Codex session classifies as "undetermined" and titles fall back to the rollout filename — a direct consequence of M1 making them visible without giving them a classifier or a title source; (c) Codex card titles show raw `exec_command` and an unexplained "操作 foo"; (d) there is no diagnostics surface in the UI at all, so M4's tier downgrade is unobservable and its acceptance item cannot be judged; (e) the high-entropy disclosure line was not found in a real export; (f) the group legend and the group label do not share an abstraction, so they can disagree — the author's point, and it is a design defect not a copy bug; (g) the browser dialog reopens itself after being closed, and one session was intermittently unreadable until a full reload.
- Untestable items and why: no API key for any data-out provider (B11/B12), machine cannot be disconnected (C1), no session containing a real secret (C4). C1/C2 were additionally blocked by an error in the acceptance card itself — it said `npm run dev`, but snapshot export is deliberately disabled in dev mode; the card now carries an erratum pointing at `npm run build` + `npm run preview`.
- A round id must be allocated BEFORE any repair work starts (CLAUDE.md). These are repairs, so they do not belong in the reserved `r11.1-text-rendering`. Recommend `r11.2-uat-repairs`; needs the author's confirmation.
- Also surfaced, not yet ruled: the provider config fields give the user no guidance on what to enter (B11 remark), and image-bearing sessions are readable but carry no marker that an image was there (C7).
- Deferred to R12 and still open: the ten remaining M9 findings, the three remaining SECREVIEW suggestions, RCA P1/P2/P3, and the src/ comment-language unification (ticket delivered outside the repo, measured at 1,308 lines across 65% of files).
