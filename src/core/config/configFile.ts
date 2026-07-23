/**
 * Runtime-fetched `dit.config.json` (R8 §7 tier 1 — persisted keys for users who run DIT via a
 * local HTTP server, e.g. `scripts/start-dit.ps1`). Never bundled, never git-tracked (INV-R8-3);
 * see `dit.config.example.json` at the repo root for the shape.
 *
 * `file://` direct-open cannot `fetch` a sibling file (CORS) — that failure, and a missing or
 * malformed file, all degrade silently to `null` (tier 2: in-memory paste) rather than throwing,
 * since a config file is always optional.
 */
import type { PresetId } from "@/core/llm";

export interface DitConfigFile {
  activePreset?: PresetId;
  keys?: Partial<Record<PresetId, string>>;
  custom?: { baseUrl?: string; model?: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Best-effort parse; never throws. Unknown/malformed shapes degrade to an empty config. */
function coerce(raw: unknown): DitConfigFile {
  if (!isRecord(raw)) return {};
  const keys = isRecord(raw.keys)
    ? Object.fromEntries(Object.entries(raw.keys).filter(([, v]) => typeof v === "string"))
    : undefined;
  const custom = isRecord(raw.custom)
    ? {
        baseUrl: typeof raw.custom.baseUrl === "string" ? raw.custom.baseUrl : undefined,
        model: typeof raw.custom.model === "string" ? raw.custom.model : undefined,
      }
    : undefined;
  return {
    activePreset: typeof raw.activePreset === "string" ? (raw.activePreset as PresetId) : undefined,
    keys,
    custom,
  };
}

/** Fetches `./dit.config.json` relative to the current page. Returns `null` on any failure. */
export async function loadConfigFile(): Promise<DitConfigFile | null> {
  try {
    const res = await fetch("./dit.config.json", { cache: "no-store" });
    if (!res.ok) return null;
    return coerce(await res.json());
  } catch {
    return null;
  }
}
