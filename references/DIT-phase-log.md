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
