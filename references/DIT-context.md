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
