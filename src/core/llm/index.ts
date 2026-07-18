/**
 * LLM Provider 工廠 (可插拔)。
 * UI 依 ProviderId 取得對應實作；新增 Provider 只需在此註冊。
 */
import type { ProviderId } from "@/types/spanTree";
import type { LLMProvider } from "./types";
import { noneProvider } from "./none";
import { createOllamaProvider, DEFAULT_OLLAMA_CONFIG, type OllamaConfig } from "./ollama";

/** Return providers that can safely accept raw local spans. OpenCode requires a PrivacyEnvelope. */
export function getProvider(id: Exclude<ProviderId, "cloud">, opts?: { ollama?: Partial<OllamaConfig> }): LLMProvider {
  switch (id) {
    case "ollama":
      return createOllamaProvider({ ...DEFAULT_OLLAMA_CONFIG, ...opts?.ollama });
    case "none":
    default:
      return noneProvider;
  }
}

export type { LLMProvider, AnnotateContext } from "./types";
export { DEFAULT_OLLAMA_CONFIG, createOllamaProvider, checkOllama, RECOMMENDED_MODELS } from "./ollama";
export type { OllamaStatus, OllamaState, OllamaConfig } from "./ollama";
export { DEFAULT_OPENCODE_CONFIG, OPENCODE_AGENT_VERSION, createOpenCodeTransport, checkOpenCode } from "./cloud";
export type { OpenCodeConfig, OpenCodeState, OpenCodeStatus, OpenCodeTransport } from "./cloud";
