import { describe, expect, it } from "vitest";
import type { Span } from "@/types/spanTree";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";

const toolSpan: Span = {
  id: "tool-1",
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

describe("annotation prompts", () => {
  it.each(["zh-TW", "en"] as const)("requires grounded, non-invented explanations in %s", (locale) => {
    const prompt = buildSystemPrompt(locale);

    expect(prompt).toMatch(locale === "zh-TW" ? /不得虛構/ : /Do not invent/);
    expect(prompt).toMatch(locale === "zh-TW" ? /資訊不足/ : /context is insufficient/);
    expect(prompt).toMatch(locale === "zh-TW" ? /不是換句話重述/ : /instead of paraphrasing/);
    if (locale === "zh-TW") expect(prompt).toMatch(/不得混入簡體字/);
  });

  it("supplies the task, previous step, exact tool, and parameters", () => {
    const prompt = buildUserPrompt(toolSpan, {
      sessionTitle: "Review the current implementation",
      prevSummary: "Inspect the progress ledger",
      locale: "en",
    });

    expect(prompt).toContain("Task：Review the current implementation");
    expect(prompt).toContain("Previous step：Inspect the progress ledger");
    expect(prompt).toContain("[tool_use] Read architecture.md");
    expect(prompt).toContain('"file_path":"docs/architecture.md"');
  });
});
