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
acceptance: A deterministic 50 MiB main-plus-subagents corpus loads without crash; reading/parsing/organizing/validating/ready progress is visible; cancellation preserves the previous valid document; 10,000-item Sidebar and MainView each keep list-related mounted DOM at or below 250; 390x844 preserves explicit structure access, horizontal fishbone navigation, detail access, bilingual readability, keyboard focus, and exact R4 ordering/linkage semantics; `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build`, and `git diff --check` exit 0.
notes: User approved `@tanstack/react-virtual`, fast-forward integration of `b90842d`, and later D1–D3 visual remediation on 2026-07-19. Baseline: about 71.0 s load, 118,163 cognitive DOM elements, 383,276 dense DOM elements, and about 5.4 s dense transition. Streaming implementation measured 1,389 ms load, progress at 322 ms, and cancel at 319 ms. After the original 1–7 UAT passed, user screenshots showed the all-at-once header/sidebar/fishbone/subagent layout still consumed useful space; it was replaced by a default-collapsed settings tray and mutually exclusive Reader/Fishbone/Subagents/Structure workspaces. Latest 50 MiB 390x844 totals are 129/116/137/128 DOM elements with one tabpanel; 740x1113 and desktop compact bars are 56 px, 390x844 is 92.7 px, all without document overflow. Deep selection, next-step, manual-selection-over-playing, bilingual and keyboard tab checks pass. Automated evidence: 95/95 tests, typecheck, 110-module build, diff check. On 2026-07-19 the user rejected Structure-as-tab and the unguided Reader entry, then approved consolidating D4–D6 and G1–G4 into one sole-source construction contract: persistent desktop Structure, narrow left drawer, Overview entry/guide, fishbone Reader minimap plus modal map, accessible `M`, and existing SVG. `docs/PSM_R5_GUIDED_NAVIGATION_v1.0.md` now records the approved semantics as eight sequential work cards and has passed its structural and self-consistency checks; product code remains unchanged pending user review of that contract.

## Archive
