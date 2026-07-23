/**
 * Generic OpenAI-chat-compatible endpoint provider (R8 — covers lmstudio / jan / openrouter /
 * groq / custom presets, see presets.ts). Ollama keeps its existing native client (ollama.ts);
 * the OpenCode local-proxy keeps its existing native client (cloud.ts) — see ADR-032 in the R8
 * PSM doc for why those two are not routed through this generic client this round.
 */
import type { Annotation, Span } from "@/types/spanTree";
import type { LLMProvider, AnnotateContext } from "./types";
import type { GenericChatPresetId, ProviderPreset } from "./presets";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import { classifyUnreachable, type EndpointStatus } from "./endpointStatus";

export interface GenericEndpointConfig {
  baseUrl: string;
  model: string;
  /** Empty string = no key supplied yet. */
  apiKey: string;
  timeoutMs: number;
}

export const DEFAULT_GENERIC_TIMEOUT_MS = 60000;

function trimBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function authHeaders(preset: ProviderPreset, apiKey: string): Record<string, string> {
  if (!preset.needsKey || !apiKey) return {};
  return { Authorization: `Bearer ${apiKey}` };
}

interface OpenAIModelsResponse {
  data?: Array<{ id?: string }>;
}

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

/**
 * Probes `${baseUrl}/models` — a metadata listing endpoint, not an inference call, so this never
 * consumes paid quota and is safe to call automatically on preset switch / recheck.
 */
export async function checkGenericEndpoint(
  preset: ProviderPreset,
  config: Pick<GenericEndpointConfig, "baseUrl" | "model" | "apiKey">,
): Promise<EndpointStatus> {
  const baseUrl = trimBaseUrl(config.baseUrl);
  const base = { baseUrl, model: config.model, models: [] as string[] };
  if (!baseUrl) {
    return { ...base, state: "offline", message: "No endpoint URL configured." };
  }
  if (preset.needsKey && !config.apiKey.trim()) {
    return { ...base, state: "auth-missing", message: "An API key is required for this endpoint." };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: authHeaders(preset, config.apiKey),
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) {
      return { ...base, state: "auth-missing", message: `HTTP ${res.status}: the API key was rejected.` };
    }
    if (!res.ok) {
      return { ...base, state: "offline", message: `HTTP ${res.status} from ${baseUrl}/models.` };
    }
    const data = (await res.json()) as OpenAIModelsResponse;
    const models = (data.data ?? []).map((m) => m.id ?? "").filter(Boolean).sort();
    if (models.length === 0) {
      return { ...base, state: "no-model", message: "Connected, but no models are available." };
    }
    const has = !config.model || models.includes(config.model);
    return {
      ...base,
      models,
      state: has ? "ready" : "model-missing",
      message: has ? `Ready.` : `Connected, but model "${config.model}" was not found.`,
    };
  } catch (error) {
    const timedOut = (error as Error).name === "AbortError";
    if (timedOut) return { ...base, state: "offline", message: "Connection timed out." };
    const state = classifyUnreachable(preset.browserReach, preset.kind);
    const reason = state === "cors-blocked"
      ? `Cannot reach ${baseUrl}: blocked by the browser (CORS) — this endpoint may not allow direct browser calls.`
      : state === "proxy-missing"
        ? `Cannot reach ${baseUrl}: is the local proxy running?`
        : `Cannot reach ${baseUrl}: is the local server running?`;
    return { ...base, state, message: reason };
  } finally {
    clearTimeout(timer);
  }
}

function coerceAnnotation(raw: unknown, providerId: GenericChatPresetId): Annotation {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) => (typeof v === "number" && v >= 0 && v <= 1 ? v : 0.6);
  return {
    what: str(o.what),
    why: str(o.why),
    generalLesson: str(o.generalLesson ?? o.general_lesson),
    confidence: num(o.confidence),
    provider: providerId,
  };
}

/** Shared call used by both the plain provider (raw span) and the privacy-wrapped transport (sanitized text). */
async function callChatCompletions(
  presetId: GenericChatPresetId,
  preset: ProviderPreset,
  config: GenericEndpointConfig,
  systemPrompt: string,
  userContent: string,
): Promise<Annotation> {
  const baseUrl = trimBaseUrl(config.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(preset, config.apiKey) },
    signal: controller.signal,
    body: JSON.stringify({
      model: config.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  })
    .catch((e: unknown) => {
      const msg = (e as Error).name === "AbortError"
        ? `Timed out after ${config.timeoutMs / 1000}s.`
        : `Cannot reach ${baseUrl}: ${(e as Error).message}`;
      throw new Error(msg);
    })
    .finally(() => clearTimeout(timer));

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("The API key was rejected.");
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
  const data = (await res.json()) as OpenAIChatResponse;
  if (data.error) throw new Error(data.error.message ?? "The endpoint returned an error.");
  const content = data.choices?.[0]?.message?.content ?? "";
  try {
    return coerceAnnotation(JSON.parse(content), presetId);
  } catch {
    return { what: content.slice(0, 300), why: "", generalLesson: "", confidence: 0.4, provider: presetId };
  }
}

export function createGenericProvider(
  presetId: GenericChatPresetId,
  preset: ProviderPreset,
  config: GenericEndpointConfig,
): LLMProvider {
  return {
    id: presetId,
    sendsDataOut: preset.sendsDataOut,
    async annotate(span: Span, ctx: AnnotateContext): Promise<Annotation | null> {
      return callChatCompletions(presetId, preset, config, buildSystemPrompt(ctx.locale), buildUserPrompt(span, ctx));
    },
  };
}

/** Privacy-wrapped transport: takes an already-sanitized `PrivacyEnvelope` instead of a raw span. */
export interface GenericTransport {
  annotate(envelope: { sanitizedText: string }, locale?: "zh-TW" | "en"): Promise<Annotation>;
}

export function createGenericTransport(
  presetId: GenericChatPresetId,
  preset: ProviderPreset,
  config: GenericEndpointConfig,
): GenericTransport {
  return {
    annotate: (envelope, locale) => callChatCompletions(presetId, preset, config, buildSystemPrompt(locale), envelope.sanitizedText),
  };
}
