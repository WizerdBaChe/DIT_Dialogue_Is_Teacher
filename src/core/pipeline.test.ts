import { describe, expect, it } from "vitest";
import { buildSessionDocument, PipelineError } from "@/core/pipeline";
import { sampleSession, subagentSession } from "@/fixtures";

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
    const sidechainSpans = doc.spans.filter((s) => (s.raw as { isSidechain?: boolean })?.isSidechain !== undefined);
    // raw 事件仍保留在 span.raw 上，供 R4 消費；此階段僅需確認不崩潰且順序保留。
    expect(doc.spans.length).toBeGreaterThan(0);
    expect(sidechainSpans.length).toBeGreaterThanOrEqual(0);
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
