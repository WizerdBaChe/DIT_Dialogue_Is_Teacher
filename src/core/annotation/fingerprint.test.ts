import { describe, expect, it } from "vitest";
import type { Span } from "@/types/spanTree";
import { buildAnnotationCacheKey, fingerprintItem } from "./fingerprint";

const span: Span = {
  id: "span-1",
  parentId: null,
  order: 1,
  type: "assistant_msg",
  startedAt: null,
  durationMs: null,
  summary: "Summary",
  text: "Original text",
  tags: [],
  raw: { ignored: true },
};

const provenance = {
  providerId: "ollama" as const,
  modelId: "qwen2.5-coder:7b",
  promptVersion: "2.0.0",
  locale: "zh-TW" as const,
  privacyPolicyId: null,
  privacyPolicyVersion: null,
};

describe("annotation fingerprints", () => {
  it("ignores raw trace noise but invalidates changed learning input and previous summary", async () => {
    const original = await fingerprintItem(span, "Before");
    await expect(fingerprintItem({ ...span, raw: { changed: true } }, "Before")).resolves.toBe(original);
    await expect(fingerprintItem({ ...span, text: "Changed text" }, "Before")).resolves.not.toBe(original);
    await expect(fingerprintItem(span, "Changed previous summary")).resolves.not.toBe(original);
  });

  it("invalidates cache keys when model, prompt, locale, or privacy policy changes", async () => {
    const itemFingerprint = await fingerprintItem(span);
    const baseline = await buildAnnotationCacheKey(itemFingerprint, provenance);
    const changes = [
      { ...provenance, modelId: "another-model" },
      { ...provenance, promptVersion: "3.0.0" },
      { ...provenance, locale: "en" as const },
      { ...provenance, providerId: "opencode" as const, privacyPolicyId: "balanced", privacyPolicyVersion: "1.0.0" },
    ];
    for (const changed of changes) {
      await expect(buildAnnotationCacheKey(itemFingerprint, changed)).resolves.not.toBe(baseline);
    }
  });
});
