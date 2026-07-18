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

## Archive
