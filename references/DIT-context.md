# DIT — Domain Glossary
<!-- One definition per term. Updated live, never batched. English only. -->

- **Primary View** (2026-07-19): The mutually exclusive central content state, limited to Overview, Reader, or Subagents.
- **Overview** (2026-07-19): The reusable session-orientation surface that explains the current session and provides the first actionable learning steps.
- **Session Origin** (2026-07-19): The provenance flag indicating whether the current document came from the built-in sample or user input; it affects orientation copy only.
- **Structure Sidebar** (2026-07-19): The persistent desktop or drawer-based narrow-screen textual navigator for the current session.
- **Current Position** (2026-07-19): The selected or playing ViewItem index and total count; it does not represent learning completion.
- **Minimap** (2026-07-19): The bounded Reader overlay that previews the session shape and current position and opens the Session Map.
- **Session Map** (2026-07-19): The modal fishbone-based global navigation surface with semantic zoom, preview selection, and explicit jumps to Reader items.
- **Map Landmark** (2026-07-19): A map target backed by exactly one real ViewItem id and therefore eligible for Reader navigation.
- **Map Cluster** (2026-07-19): A deterministic visual aggregation of consecutive real items that can refocus or zoom the map but cannot directly navigate to Reader.
- **Semantic Zoom** (2026-07-19): A map-level transition that changes the categories and aggregation of visible information instead of merely scaling identical graphics.
- **Endpoint Provider** (2026-07-24): The single pluggable teaching-layer provider that replaces the old `ollama`/`cloud` split and talks to any OpenAI-compatible (or Anthropic-messages) endpoint, driven entirely by the selected Preset's metadata.
- **Preset** (2026-07-24): A named endpoint configuration plus metadata (kind, transport, needsKey, sendsDataOut, cost, browserReach, modelsProbe) that fully determines the provider panel's UI affordances.
- **Local Proxy** (2026-07-24): A localhost server (opencode / LiteLLM) that relays DIT's calls to a cloud provider the browser cannot reach directly because of CORS; the API key stays in the proxy, not the browser.
- **BYOK** (2026-07-24): Bring Your Own Key — the user supplies their own API key to reach a browser-directable cloud (Anthropic) or to configure a Local Proxy.
- **Config File** (2026-07-24): `dit.config.json`, an app-sibling file fetched at runtime to persist BYOK keys across sessions; it is git-ignored, excluded from `dist/` and exports, and never rendered into the UI.
- **Source Profile** (2026-08-14): a `SourceId`-keyed table (`core/source/profiles.ts`) of edit/investigation/ambiguous tool sets and file-path key shapes, resolved once at normalize time so `denoise()`/`distill()` classify spans per-harness instead of matching hardcoded Claude Code tool names against every source.
- **Outcome-unknown** (2026-08-14): `ResultInfo.outcomeUnknown` — true when the source recorded no success/failure signal for a tool call at all (e.g. Codex plain `exec`), distinct from `isError: false` (source said it succeeded). Exists so "not recorded" is never silently coerced into "succeeded".
- **r11-release-readiness** (2026-08-15): round id for the fix-up pass whose exit condition is D-004's merge gate — the three 2026-08-03 release blockers plus the seven defects the 2026-08-15 manual UAT surfaced. Deliberately not a feature round.
- **r11.1-text-rendering** (2026-08-15): round id reserved for the Markdown/LaTeX render layer split out of R11. Design guidance already exists at `docs/design/DIT_TEXT_RENDERING.md`; no code written.
- **Skeleton coverage** (2026-08-15): the share of a session's spans that become spine nodes rather than ribs. A session whose spine is only {start, end} has near-zero coverage and reads as a flat list of side branches — the R11-M5 symptom on Codex sources. Distinct from *parity*, which compares two sources' outputs and can pass while both are impoverished.
- **Disclosure** (2026-08-16): the D-006 mechanism — when a detector finds something it is not going to redact, the export says so with a count (「另偵測到 N 筆疑似高熵字串（未遮）」) rather than staying silent. Distinct from *redaction*, which removes the value. The count is by **containment**, not overlap: a string half-covered by another rule still has characters in the output, so it still counts. Reporting a redaction that did not happen is the failure this exists to prevent.
- **r10.1-codex-session-provenance** (2026-08-15): round id for the RCA into Codex exec-name resolution and `*_end` event pairing failures, opened after manual UAT on r10-source-awareness surfaced duplicate-looking cards and leaked wrapper tags. Root cause and a P0-P3 remediation plan exist; implementation not started as of Phase 13.
