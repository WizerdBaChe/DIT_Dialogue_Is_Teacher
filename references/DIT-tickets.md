# DIT — Task Ledger

## Not yet specified

- Tauri desktop packaging is intentionally deferred until the Web RuntimeController is accepted. It is a separate product-value decision and does not block R3 or R4.

## T-001 OpenCode analysis is protected by a reusable local privacy gateway
status: done  owner: dispatcher  blocked-by: -
type: build
acceptance: `npm.cmd test` exits 0; privacy tests prove secret canaries never reach the OpenCode request mock, cancel yields zero requests, and all Cloud transport inputs are `PrivacyEnvelope`.
notes: User accepted R3 on 2026-07-19. Production preview verified privacy consent/cancel and a real de-identified annotation through OpenCode 1.17.20 with deepseek-v4-flash-free; the UI rendered the cloud result and pending count changed 16→15. Request mocks prove raw identifiers/secrets and cancelled reviews yield no OpenCode payload.

## T-002 Reopening a session restores annotations and batch processing fills only missing work
status: done  owner: dispatcher  blocked-by: -
type: build
acceptance: `npm.cmd test` exits 0; repository integration test proves load → annotate → persist → reload produces zero provider calls for cache hits, while changed item/model/prompt/policy invalidates only the expected records.
notes: Implemented controller, IndexedDB repository with memory fallback, missing/retry/all modes, visible disabled batch action, immediate per-item writes, stop and resume. Evidence: 2026-07-18 local qwen2.5-coder:7b annotation survived a real page reload (`已還原 1 則`, pending 16→15); repository/controller/fingerprint tests and full 74/74 suite pass. Human visual UAT remains.

## T-003 Web users get honest Ollama runtime control without arbitrary process execution
status: done  owner: dispatcher  blocked-by: -
type: build
acceptance: `npm.cmd test` exits 0; WebRuntimeController tests prove status refresh and copy-command support, while start/stop return structured unsupported errors and never invoke a shell.
notes: Capability interface and Web adapter implemented. Tests prove repeated status probes, fixed copy commands, no start/stop capability, and structured unsupported errors. UI explicitly says DIT Web does not start or stop local runtimes. Tauri remains an isolated future spike.

## T-004 R4 subagent transcripts render across files with a local branch view
status: done  owner: dispatcher  blocked-by: -
type: build
acceptance: R4 fixture loads main and `subagents/*.jsonl`, preserves parent linkage, renders the accepted lightweight branch view, and all automated tests/build pass.
notes: Implemented folder multi-file loading, stable timestamp merge, cross-file UUID parent linkage, expandable subagent group, nested tool results, and lightweight SVG local branch view. Evidence: production preview loaded `src/fixtures/r4/` as 9 spans / 1 branch; full suite 81/81, typecheck and 96-module build pass; user confirmed manual UAT items 1–4 on 2026-07-19.

## T-005 R5 large sessions load responsively with bounded rendering and narrow-screen access
status: in-progress  owner: dispatcher  blocked-by: -
type: build
acceptance: The approved guided Overview, explicit PrimaryView/SessionOrigin, persistent desktop Structure, narrow native drawer, bounded semantic Session Map, Reader Minimap, safe configurable M shortcut, bilingual guide, and all GN-07 performance thresholds are implemented; `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build`, benchmark rendering, and `git diff --check` exit 0. Status may become done only after the user completes the final 390/740/1280 visual UAT in `docs/ACCEPTANCE.md`.
notes: User approved the sole-source contract `docs/PSM_R5_GUIDED_NAVIGATION_v1.0.md` on 2026-07-19. GN-01 through GN-10 are implemented as separate vertical slices. GN-10 separates Section projection focus from preview selection, restores the original low-noise Sidebar glyph vocabulary at a moderate size, uses a four-column structured legend, and removes white graphic fills without changing approved interaction semantics. Production selection evidence keeps the same five Section target IDs and order before and after selecting another landmark. Latest 50.0018 MiB / 29,452-view-item UI evidence: closed Reader DOM max 247, Map DOM max 434, and no horizontal overflow at 390/740/1280; the benchmark reports 18/18 checks pass. Sidebar/map/Close contrast is 8.03:1 / 7.21:1 / 7.92:1. The unchanged ingest/cancel/open-latency/deep-scroll evidence remains 964 ms load, first progress at 66 ms, 379 ms cancellation with the previous document preserved, 134 ms first target, and aligned deep index 28,541. Automated evidence is 131/131 tests plus typecheck, 118-module build, benchmark pass, and diff check. Final user visual and interaction UAT remains open, so this ticket intentionally stays in-progress.

## T-006 R5.5 aligns symbol semantics, stale copy, and evidence summaries before R6
status: todo  owner: dispatcher  blocked-by: -
type: build
acceptance: All six cards SA-01..SA-06 in `docs/PSM_R5.5_SEMANTIC_ALIGNMENT_v0.1.md` are committed as separate vertical slices with their stated per-card acceptance passing (`npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build`, `git diff --check`, plus SA-04 benchmark pass). Legends are derived from single-source constants (SA-INV-5); no surface has a symbol with two meanings; replay is renamed to step-through in UI copy and USER_GUIDE; dead i18n keys removed. Status may become done only after the user completes the combined R5/R5.5 visual UAT (R5 contract §10 + R5.5 contract §4) at 390/740/1280.
notes: Scope ruling 2026-07-20: sidebar tree keeps span-layer glyphs; skeleton legend lives only in the Session Map; explanatory two-layer legend goes to Overview (collapsed, after CTA). Backend pipeline items (adapter unknown-type tolerance, title fallback) are explicitly deferred to BACKLOG, not R6. R6's approved scope stays export-only (ADR-013). T-005 stays in-progress and closes together with this ticket after the combined UAT.

## Archive
