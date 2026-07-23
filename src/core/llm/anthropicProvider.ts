/**
 * Anthropic Messages API provider (R8 — anthropic-byok preset).
 * Browser-direct is only possible with the `anthropic-dangerous-direct-browser-access` header
 * (M0-verified 2026-07-24: without it the request never reaches the server — a CORS TypeError;
 * with it, the server answers with a real HTTP status). BYOK: the key stays client-side, never
 * hardcoded (INV-R8-7) and never logged/exported (INV-R8-2).
 */
import type { Annotation, Span } from "@/types/spanTree";
import type { LLMProvider, AnnotateContext } from "./types";
import { ANTHROPIC_BROWSER_HEADER } from "./presets";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import { classifyUnreachable, type EndpointStatus } from "./endpointStatus";

export interface AnthropicConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
}

export const DEFAULT_ANTHROPIC_CONFIG: AnthropicConfig = {
  baseUrl: "https://api.anthropic.com",
  model: "claude-sonnet-4-5-20250929",
  apiKey: "",
  timeoutMs: 60000,
};

const ANTHROPIC_VERSION = "2023-06-01";

function headers(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    [ANTHROPIC_BROWSER_HEADER]: "true",
  };
}

interface AnthropicModelsResponse {
  data?: Array<{ id?: string }>;
}

interface AnthropicMessagesResponse {
  content?: Array<{ type?: string; text?: string }>;
  error?: { message?: string };
}

/**
 * GET /v1/models is a metadata listing endpoint (not an inference call): it never consumes paid
 * quota, so it is safe to call automatically on preset switch / recheck.
 */
export async function checkAnthropic(
  config: Pick<AnthropicConfig, "baseUrl" | "apiKey" | "model">,
): Promise<EndpointStatus> {
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
  const base = { baseUrl, model: config.model, models: [] as string[] };
  if (!config.apiKey.trim()) {
    return { ...base, state: "auth-missing", message: "An Anthropic API key is required." };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${baseUrl}/v1/models`, { headers: headers(config.apiKey), signal: controller.signal });
    if (res.status === 401 || res.status === 403) {
      return { ...base, state: "auth-missing", message: `HTTP ${res.status}: the API key was rejected.` };
    }
    if (!res.ok) {
      return { ...base, state: "offline", message: `HTTP ${res.status} from ${baseUrl}/v1/models.` };
    }
    const data = (await res.json()) as AnthropicModelsResponse;
    const models = (data.data ?? []).map((m) => m.id ?? "").filter(Boolean);
    const has = !config.model || models.length === 0 || models.includes(config.model);
    return { ...base, models, state: has ? "ready" : "model-missing", message: has ? "Ready." : `Model "${config.model}" was not found.` };
  } catch (error) {
    if ((error as Error).name === "AbortError") return { ...base, state: "offline", message: "Connection timed out." };
    const state = classifyUnreachable("direct", "cloud");
    return {
      ...base,
      state,
      message: `Cannot reach ${baseUrl}: blocked by the browser (missing header?) or offline.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function coerceAnnotation(raw: unknown): Annotation {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) => (typeof v === "number" && v >= 0 && v <= 1 ? v : 0.6);
  return {
    what: str(o.what),
    why: str(o.why),
    generalLesson: str(o.generalLesson ?? o.general_lesson),
    confidence: num(o.confidence),
    provider: "anthropic-byok",
  };
}

/** Shared call used by both the plain provider (raw span) and the privacy-wrapped transport (sanitized text). */
async function callMessages(config: AnthropicConfig, systemPrompt: string, userContent: string): Promise<Annotation> {
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers(config.apiKey) },
    signal: controller.signal,
    body: JSON.stringify({
      model: config.model,
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  })
    .catch((e: unknown) => {
      const msg = (e as Error).name === "AbortError"
        ? `Timed out after ${config.timeoutMs / 1000}s.`
        : `Cannot reach Anthropic at ${baseUrl}: ${(e as Error).message}`;
      throw new Error(msg);
    })
    .finally(() => clearTimeout(timer));

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("The Anthropic API key was rejected.");
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
  const data = (await res.json()) as AnthropicMessagesResponse;
  if (data.error) throw new Error(data.error.message ?? "Anthropic returned an error.");
  const content = (data.content ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
  if (!content) throw new Error("Anthropic returned no text response.");
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { what: content.slice(0, 300), why: "", generalLesson: "", confidence: 0.4, provider: "anthropic-byok" };
  }
  return coerceAnnotation(JSON.parse(content.slice(start, end + 1)));
}

export function createAnthropicProvider(config: AnthropicConfig): LLMProvider {
  return {
    id: "anthropic-byok",
    sendsDataOut: true,
    async annotate(span: Span, ctx: AnnotateContext): Promise<Annotation | null> {
      return callMessages(config, buildSystemPrompt(ctx.locale), buildUserPrompt(span, ctx));
    },
  };
}

/** Privacy-wrapped transport: takes an already-sanitized `PrivacyEnvelope` instead of a raw span. */
export interface AnthropicTransport {
  annotate(envelope: { sanitizedText: string }, locale?: "zh-TW" | "en"): Promise<Annotation>;
}

export function createAnthropicTransport(config: AnthropicConfig): AnthropicTransport {
  return {
    annotate: (envelope, locale) => callMessages(config, buildSystemPrompt(locale), envelope.sanitizedText),
  };
}
