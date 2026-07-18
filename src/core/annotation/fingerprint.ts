import type { SessionDocument, Span } from "@/types/spanTree";
import type { AnnotationProvenance } from "./contracts";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function fingerprintItem(span: Span, previousSummary?: string): Promise<string> {
  return sha256(canonicalJson({
    previousSummary: previousSummary ?? null,
    span: {
      id: span.id,
      type: span.type,
      summary: span.summary,
      text: span.text,
      tool: span.tool,
      result: span.result,
      tags: span.tags,
    },
  }));
}

export async function fingerprintSession(doc: SessionDocument): Promise<string> {
  return sha256(canonicalJson({
    schemaVersion: doc.schemaVersion,
    source: doc.session.source,
    sessionId: doc.session.id,
  }));
}

export async function buildAnnotationCacheKey(
  itemFingerprint: string,
  provenance: Omit<AnnotationProvenance, "createdAt">,
): Promise<string> {
  return sha256(canonicalJson({ annotationSchemaVersion: "1", itemFingerprint, ...provenance }));
}
