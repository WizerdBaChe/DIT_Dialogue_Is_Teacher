/**
 * OpenCode-backed cloud annotation provider.
 * DIT talks only to a loopback OpenCode server; provider credentials stay in OpenCode.
 */
import type { Annotation } from "@/types/spanTree";
import type { PrivacyEnvelope } from "@/core/privacy";
import { buildSystemPrompt } from "./prompt";

export interface OpenCodeConfig {
  baseUrl: string;
  providerID: string;
  modelID: string;
  agent: string;
  timeoutMs: number;
}

export const DEFAULT_OPENCODE_CONFIG: OpenCodeConfig = {
  baseUrl: "http://127.0.0.1:4096",
  providerID: "opencode",
  modelID: "deepseek-v4-flash-free",
  agent: "dit-annotator",
  timeoutMs: 120000,
};

export const OPENCODE_AGENT_VERSION = "1.0.0";

export type OpenCodeState = "checking" | "ready" | "offline" | "provider-missing" | "model-missing" | "agent-missing";

export interface OpenCodeStatus {
  state: OpenCodeState;
  baseUrl: string;
  version: string | null;
  models: string[];
  message: string;
}

interface OpenCodeProviderInfo {
  id?: string;
  models?: Record<string, unknown>;
}

interface OpenCodeProviderResponse {
  all?: OpenCodeProviderInfo[];
  connected?: string[];
}

interface OpenCodeAgentInfo {
  name?: string;
}

interface OpenCodeMessageResponse {
  parts?: Array<{ type?: string; text?: string }>;
}

function trimBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

async function responseError(response: Response): Promise<string> {
  const body = (await response.text()).trim();
  return body ? `HTTP ${response.status}: ${body.slice(0, 300)}` : `HTTP ${response.status}`;
}

export async function checkOpenCode(
  config: Pick<OpenCodeConfig, "baseUrl" | "providerID" | "modelID" | "agent"> = DEFAULT_OPENCODE_CONFIG,
): Promise<OpenCodeStatus> {
  const baseUrl = trimBaseUrl(config.baseUrl);
  const base = { baseUrl, version: null, models: [] as string[] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const [healthResponse, providerResponse, agentResponse] = await Promise.all([
      fetch(`${baseUrl}/global/health`, { signal: controller.signal }),
      fetch(`${baseUrl}/provider`, { signal: controller.signal }),
      fetch(`${baseUrl}/agent`, { signal: controller.signal }),
    ]);
    if (!healthResponse.ok) return { ...base, state: "offline", message: await responseError(healthResponse) };
    if (!providerResponse.ok) return { ...base, state: "offline", message: await responseError(providerResponse) };
    if (!agentResponse.ok) return { ...base, state: "offline", message: await responseError(agentResponse) };

    const health = (await healthResponse.json()) as { healthy?: boolean; version?: string };
    const providers = (await providerResponse.json()) as OpenCodeProviderResponse;
    const agents = (await agentResponse.json()) as OpenCodeAgentInfo[];
    const version = health.version ?? null;
    if (!health.healthy) return { ...base, version, state: "offline", message: "OpenCode server reported unhealthy." };

    const connected = new Set(providers.connected ?? []);
    const provider = (providers.all ?? []).find((item) => item.id === config.providerID && connected.has(config.providerID));
    if (!provider) {
      return { ...base, version, state: "provider-missing", message: `OpenCode provider "${config.providerID}" is not connected.` };
    }

    const models = Object.keys(provider.models ?? {}).sort();
    if (!models.includes(config.modelID)) {
      return { ...base, version, models, state: "model-missing", message: `OpenCode model "${config.providerID}/${config.modelID}" is unavailable.` };
    }
    if (!agents.some((item) => item.name === config.agent)) {
      return { ...base, version, models, state: "agent-missing", message: `OpenCode agent "${config.agent}" is unavailable.` };
    }
    return { ...base, version, models, state: "ready", message: `OpenCode ${version ?? ""} is ready.`.trim() };
  } catch (error) {
    const reason = (error as Error).name === "AbortError"
      ? "connection timed out"
      : error instanceof TypeError
        ? "the loopback server is offline or this page origin is not allowed by CORS"
        : (error as Error).message;
    return { ...base, state: "offline", message: `Cannot reach OpenCode at ${baseUrl}: ${reason}` };
  } finally {
    clearTimeout(timer);
  }
}

function coerceConfidence(value: unknown): number {
  if (typeof value === "number" && value >= 0 && value <= 1) return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 1) return numeric;
    const normalized = value.toLowerCase();
    if (normalized === "high") return 0.85;
    if (normalized === "medium") return 0.6;
    if (normalized === "low") return 0.35;
  }
  return 0.6;
}

function parseAnnotation(content: string): Annotation {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("OpenCode returned no JSON object.");
  const value = JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
  const text = (item: unknown) => (typeof item === "string" ? item.trim() : "");
  const annotation: Annotation = {
    what: text(value.what),
    why: text(value.why),
    generalLesson: text(value.generalLesson ?? value.general_lesson),
    confidence: coerceConfidence(value.confidence),
    provider: "cloud",
  };
  if (!annotation.what || !annotation.why || !annotation.generalLesson) {
    throw new Error("OpenCode returned incomplete annotation JSON.");
  }
  return annotation;
}

const DISABLED_TOOLS: Record<string, boolean> = {
  bash: false,
  edit: false,
  glob: false,
  grep: false,
  list: false,
  lsp: false,
  question: false,
  read: false,
  skill: false,
  task: false,
  todowrite: false,
  webfetch: false,
  websearch: false,
  write: false,
};

export interface OpenCodeTransport {
  annotate(envelope: PrivacyEnvelope, locale?: "zh-TW" | "en"): Promise<Annotation>;
}

export function createOpenCodeTransport(config: OpenCodeConfig = DEFAULT_OPENCODE_CONFIG): OpenCodeTransport {
  return {
    async annotate(envelope: PrivacyEnvelope, locale?: "zh-TW" | "en"): Promise<Annotation> {
      const baseUrl = trimBaseUrl(config.baseUrl);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      let sessionID: string | null = null;
      try {
        const sessionResponse = await fetch(`${baseUrl}/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ title: "DIT privacy-reviewed annotation" }),
        });
        if (!sessionResponse.ok) throw new Error(`Cannot create OpenCode session: ${await responseError(sessionResponse)}`);
        const session = (await sessionResponse.json()) as { id?: string };
        if (!session.id) throw new Error("OpenCode session response did not include an id.");
        sessionID = session.id;

        const messageResponse = await fetch(`${baseUrl}/session/${encodeURIComponent(sessionID)}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model: { providerID: config.providerID, modelID: config.modelID },
            agent: config.agent,
            system: buildSystemPrompt(locale),
            tools: DISABLED_TOOLS,
            parts: [{ type: "text", text: envelope.sanitizedText }],
          }),
        });
        if (!messageResponse.ok) throw new Error(`OpenCode annotation failed: ${await responseError(messageResponse)}`);
        const message = (await messageResponse.json()) as OpenCodeMessageResponse;
        const content = (message.parts ?? [])
          .filter((part) => part.type === "text" && typeof part.text === "string")
          .map((part) => part.text)
          .join("\n")
          .trim();
        if (!content) throw new Error("OpenCode returned no text response.");
        return parseAnnotation(content);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          throw new Error(`OpenCode timed out after ${config.timeoutMs / 1000}s.`);
        }
        if (error instanceof TypeError) {
          throw new Error(
            `Cannot reach OpenCode at ${baseUrl}. Start the loopback server and allow this page origin in OpenCode CORS settings.`,
          );
        }
        throw error;
      } finally {
        clearTimeout(timer);
        if (sessionID) {
          void fetch(`${baseUrl}/session/${encodeURIComponent(sessionID)}`, { method: "DELETE" }).catch(() => undefined);
        }
      }
    },
  };
}
