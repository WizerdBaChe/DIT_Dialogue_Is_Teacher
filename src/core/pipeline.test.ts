import { describe, expect, it } from "vitest";
import { buildSessionDocument, buildSessionDocumentFromFiles, PipelineError } from "@/core/pipeline";
import { r4MainSession, r4SubagentSession, sampleSession, subagentSession } from "@/fixtures";

/**
 * SIT：pipeline 端到端快照。adapter → normalize → denoise → distill 的完整輸出，
 * 快照凍結，任何後續里程碑改動導致輸出漂移都會在此浮現 (見 PSM §3.2 R1)。
 */
describe("buildSessionDocument (pipeline snapshot)", () => {
  it("matches the snapshot for sampleSession fixture", () => {
    const { doc, warnings } = buildSessionDocument(sampleSession);
    expect(doc).toMatchSnapshot();
    expect(warnings).toMatchSnapshot();
  });

  it("matches the snapshot for subagentSession fixture", () => {
    const { doc, warnings } = buildSessionDocument(subagentSession);
    expect(doc).toMatchSnapshot();
    expect(warnings).toMatchSnapshot();
  });

  it("produces no warnings for the well-formed sample fixture", () => {
    const { warnings } = buildSessionDocument(sampleSession);
    expect(warnings).toEqual([]);
  });

  it("captures isSidechain events from the subagent fixture without throwing", () => {
    const { doc } = buildSessionDocument(subagentSession);
    const subagentGroup = doc.groups.find((group) => group.kind === "subagent");
    expect(subagentGroup?.spanIds.length).toBeGreaterThan(0);
    expect(doc.spans.find((span) => span.id === subagentGroup?.spanIds[0])?.parentId).not.toBeNull();
  });

  it("merges main and subagents/*.jsonl while preserving the cross-file parent branch", () => {
    const { doc, warnings } = buildSessionDocumentFromFiles([
      { path: "main.jsonl", content: r4MainSession },
      { path: "subagents/agent-1.jsonl", content: r4SubagentSession },
    ]);
    const group = doc.groups.find((candidate) => candidate.kind === "subagent");
    const firstBranchSpan = doc.spans.find((span) => span.id === group?.spanIds[0]);
    const parent = doc.spans.find((span) => span.id === firstBranchSpan?.parentId);

    expect(warnings).toEqual([]);
    expect(group?.spanIds).toHaveLength(4);
    expect(parent?.tool?.name).toBe("Task");
    expect(doc.spans.map((span) => span.startedAt)).toEqual([...doc.spans.map((span) => span.startedAt)].sort());
  });

  it("throws PipelineError on empty input", () => {
    expect(() => buildSessionDocument("")).toThrow(PipelineError);
    expect(() => buildSessionDocument("   \n  \n")).toThrow(PipelineError);
  });

  it("throws PipelineError when no adapter can parse the input", () => {
    expect(() => buildSessionDocument("this is not jsonl at all")).toThrow(PipelineError);
  });

  it("throws PipelineError when parsing yields zero renderable spans", () => {
    // 只含噪音型別，adapter 解析成功但沒有任何可呈現節點。
    const noiseOnly = [
      JSON.stringify({ type: "mode", sessionId: "s1" }),
      JSON.stringify({ type: "file-history-snapshot", sessionId: "s1" }),
    ].join("\n");
    expect(() => buildSessionDocument(noiseOnly)).toThrow(PipelineError);
  });
});
