/**
 * LLM Provider 工廠 (可插拔)。
 * UI 依 ProviderId 取得對應實作；新增 Provider 只需在此註冊。
 */
import type { ProviderId } from "@/types/spanTree";
import type { LLMProvider } from "./types";
import { noneProvider } from "./none";
import { createOllamaProvider, DEFAULT_OLLAMA_CONFIG, type OllamaConfig } from "./ollama";
import { cloudProvider } from "./cloud";

/** 取得 Provider 實作；ollama 可帶入使用者選定的設定 (model / baseUrl)。 */
export function getProvider(id: ProviderId, opts?: { ollama?: Partial<OllamaConfig> }): LLMProvider {
  switch (id) {
    case "ollama":
      return createOllamaProvider({ ...DEFAULT_OLLAMA_CONFIG, ...opts?.ollama });
    case "cloud":
      return cloudProvider;
    case "none":
    default:
      return noneProvider;
  }
}

export type { LLMProvider, AnnotateContext } from "./types";
export { DEFAULT_OLLAMA_CONFIG, createOllamaProvider, checkOllama, RECOMMENDED_MODELS } from "./ollama";
export type { OllamaStatus, OllamaState, OllamaConfig } from "./ollama";
