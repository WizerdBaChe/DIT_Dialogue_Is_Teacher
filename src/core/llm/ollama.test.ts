import { afterEach, describe, expect, it, vi } from "vitest";
import type { Span } from "@/types/spanTree";
import { createOllamaProvider, DEFAULT_OLLAMA_CONFIG } from "./ollama";

const span: Span = {
  id: "span-1",
  parentId: null,
  order: 1,
  type: "tool_use",
  startedAt: null,
  durationMs: null,
  summary: "Read architecture.md",
  text: "Read architecture.md",
  tool: { name: "Read", params: { file_path: "docs/architecture.md" } },
  tags: [],
  raw: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createOllamaProvider error messages", () => {
  it("reports a readable timeout", async () => {
    const error = new Error("request aborted");
    error.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));

    await expect(createOllamaProvider({ ...DEFAULT_OLLAMA_CONFIG, timeoutMs: 30_000 }).annotate(span, {
      sessionTitle: "Review implementation",
      locale: "zh-TW",
    })).rejects.toThrow("Ollama 逾時 (>30s)，已中止。");
  });

  it("reports a readable disconnect with recovery guidance", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(createOllamaProvider(DEFAULT_OLLAMA_CONFIG).annotate(span, {
      sessionTitle: "Review implementation",
      locale: "zh-TW",
    })).rejects.toThrow(/無法連線到 Ollama .*請確認 Ollama 已啟動並設定 OLLAMA_ORIGINS/);
  });
});
