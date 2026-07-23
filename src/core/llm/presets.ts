/**
 * Endpoint Provider Preset registry (R8 — Provider Openness).
 * A preset is metadata only; the concrete transport lives in genericProvider.ts / anthropicProvider.ts
 * (OpenAI-chat-compatible endpoints) or ollama.ts / cloud.ts (kept as-is, see ADR-032 in the R8 PSM doc
 * for why `ollama` and `local-proxy` are not routed through the generic transport this round).
 */

export type PresetId =
  | "ollama"
  | "lmstudio"
  | "jan"
  | "anthropic-byok"
  | "openrouter"
  | "groq"
  | "local-proxy"
  | "custom";

/** Presets whose annotation transport is the new generic OpenAI-chat-compatible client (this round). */
export type GenericChatPresetId = "lmstudio" | "jan" | "openrouter" | "groq" | "custom";

export type PresetKind = "local" | "cloud" | "proxy";
export type PresetTransport = "openai-chat" | "anthropic-messages" | "opencode-native";
export type ModelsProbe = "ollama-tags" | "openai-models" | "static";
export type PresetCost = "free" | "metered" | "subscription";
export type BrowserReach = "direct" | "needs-proxy";

export interface ProviderPreset {
  id: PresetId;
  kind: PresetKind;
  /** Default endpoint; "custom" leaves this blank for the user to fill in. */
  baseUrl: string;
  transport: PresetTransport;
  needsKey: boolean;
  extraHeaders?: Record<string, string>;
  /** true → every call must go through the Privacy Envelope (INV-R8-1). */
  sendsDataOut: boolean;
  /** non-"free" → a one-time consent gate before the first call in scope (INV-R8-4). */
  cost: PresetCost;
  browserReach: BrowserReach;
  modelsProbe: ModelsProbe;
}

/** Anthropic requires this header to allow direct browser calls (M0-verified 2026-07-24, see R8 PSM doc). */
export const ANTHROPIC_BROWSER_HEADER = "anthropic-dangerous-direct-browser-access";

export const PROVIDER_PRESETS: Record<PresetId, ProviderPreset> = {
  ollama: {
    id: "ollama",
    kind: "local",
    baseUrl: "http://localhost:11434",
    transport: "openai-chat",
    needsKey: false,
    sendsDataOut: false,
    cost: "free",
    browserReach: "direct",
    modelsProbe: "ollama-tags",
  },
  lmstudio: {
    id: "lmstudio",
    kind: "local",
    baseUrl: "http://localhost:1234/v1",
    transport: "openai-chat",
    needsKey: false,
    sendsDataOut: false,
    cost: "free",
    browserReach: "direct",
    modelsProbe: "openai-models",
  },
  jan: {
    id: "jan",
    kind: "local",
    baseUrl: "http://127.0.0.1:1337/v1",
    transport: "openai-chat",
    needsKey: false,
    sendsDataOut: false,
    cost: "free",
    browserReach: "direct",
    modelsProbe: "openai-models",
  },
  "anthropic-byok": {
    id: "anthropic-byok",
    kind: "cloud",
    baseUrl: "https://api.anthropic.com",
    transport: "anthropic-messages",
    needsKey: true,
    extraHeaders: { [ANTHROPIC_BROWSER_HEADER]: "true" },
    sendsDataOut: true,
    cost: "metered",
    browserReach: "direct",
    modelsProbe: "static",
  },
  // ADR-031: M0 (2026-07-24) confirmed OpenRouter reaches the server directly (HTTP 401 on a
  // dummy key, not a CORS-blocked TypeError) — promoted from "needs-proxy" to a direct preset.
  openrouter: {
    id: "openrouter",
    kind: "cloud",
    baseUrl: "https://openrouter.ai/api/v1",
    transport: "openai-chat",
    needsKey: true,
    sendsDataOut: true,
    cost: "metered",
    browserReach: "direct",
    modelsProbe: "openai-models",
  },
  // ADR-031: M0 (2026-07-24) confirmed Groq reaches the server directly (HTTP 401 on a dummy
  // key, not a CORS-blocked TypeError) — promoted from "needs-proxy" to a direct preset.
  groq: {
    id: "groq",
    kind: "cloud",
    baseUrl: "https://api.groq.com/openai/v1",
    transport: "openai-chat",
    needsKey: true,
    sendsDataOut: true,
    cost: "metered",
    browserReach: "direct",
    modelsProbe: "openai-models",
  },
  "local-proxy": {
    id: "local-proxy",
    kind: "proxy",
    baseUrl: "http://127.0.0.1:4096",
    transport: "opencode-native",
    needsKey: false,
    sendsDataOut: true,
    cost: "metered",
    browserReach: "direct",
    modelsProbe: "static",
  },
  custom: {
    id: "custom",
    kind: "cloud",
    baseUrl: "",
    transport: "openai-chat",
    needsKey: true,
    sendsDataOut: true,
    cost: "metered",
    browserReach: "needs-proxy",
    modelsProbe: "openai-models",
  },
};

export const PRESET_ORDER: PresetId[] = [
  "ollama",
  "lmstudio",
  "jan",
  "anthropic-byok",
  "openrouter",
  "groq",
  "local-proxy",
  "custom",
];

export function getPreset(id: PresetId): ProviderPreset {
  return PROVIDER_PRESETS[id];
}
