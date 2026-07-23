/**
 * LLM Provider 工廠 (可插拔)。
 * UI 依 ProviderId 取得對應實作；新增 Provider 只需在此註冊。
 */
import type { ProviderId } from "@/types/spanTree";
import type { LLMProvider } from "./types";
import { noneProvider } from "./none";
import { createOllamaProvider, DEFAULT_OLLAMA_CONFIG, type OllamaConfig } from "./ollama";
import { createGenericProvider, type GenericEndpointConfig } from "./genericProvider";
import { createAnthropicProvider, type AnthropicConfig } from "./anthropicProvider";
import { getPreset, type GenericChatPresetId } from "./presets";

const GENERIC_CHAT_PRESET_IDS: readonly GenericChatPresetId[] = ["lmstudio", "jan", "openrouter", "groq", "custom"];

function isGenericChatPreset(id: ProviderId): id is GenericChatPresetId {
  return (GENERIC_CHAT_PRESET_IDS as readonly string[]).includes(id);
}

/** Return providers that can safely accept raw local spans. OpenCode requires a PrivacyEnvelope. */
export function getProvider(
  id: Exclude<ProviderId, "cloud">,
  opts?: { ollama?: Partial<OllamaConfig>; generic?: GenericEndpointConfig; anthropic?: AnthropicConfig },
): LLMProvider {
  if (id === "ollama") return createOllamaProvider({ ...DEFAULT_OLLAMA_CONFIG, ...opts?.ollama });
  if (id === "anthropic-byok" && opts?.anthropic) return createAnthropicProvider(opts.anthropic);
  if (isGenericChatPreset(id) && opts?.generic) return createGenericProvider(id, getPreset(id), opts.generic);
  return noneProvider;
}

export type { LLMProvider, AnnotateContext } from "./types";
export { DEFAULT_OLLAMA_CONFIG, createOllamaProvider, checkOllama, RECOMMENDED_MODELS } from "./ollama";
export type { OllamaStatus, OllamaState, OllamaConfig } from "./ollama";
export { DEFAULT_OPENCODE_CONFIG, OPENCODE_AGENT_VERSION, createOpenCodeTransport, checkOpenCode } from "./cloud";
export type { OpenCodeConfig, OpenCodeState, OpenCodeStatus, OpenCodeTransport } from "./cloud";
export { PROVIDER_PRESETS, PRESET_ORDER, getPreset, ANTHROPIC_BROWSER_HEADER } from "./presets";
export type { PresetId, GenericChatPresetId, ProviderPreset, PresetKind, PresetCost } from "./presets";
export { checkGenericEndpoint, DEFAULT_GENERIC_TIMEOUT_MS, createGenericTransport } from "./genericProvider";
export type { GenericEndpointConfig, GenericTransport } from "./genericProvider";
export { checkAnthropic, DEFAULT_ANTHROPIC_CONFIG, createAnthropicTransport } from "./anthropicProvider";
export type { AnthropicConfig, AnthropicTransport } from "./anthropicProvider";
export type { EndpointState, EndpointStatus } from "./endpointStatus";
export { isGenericChatPreset };
