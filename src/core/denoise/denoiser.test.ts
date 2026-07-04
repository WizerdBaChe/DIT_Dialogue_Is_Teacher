import { describe, expect, it } from "vitest";
import { denoise } from "@/core/denoise/denoiser";
import type { Span, SessionDocument } from "@/types/spanTree";

function span(partial: Partial<Span> & Pick<Span, "id" | "type" | "order">): Span {
  return {
    parentId: null,
    startedAt: null,
    durationMs: null,
    summary: "",
    text: "",
    tags: [],
    raw: null,
    ...partial,
  };
}

function doc(spans: Span[]): SessionDocument {
  return {
    schemaVersion: "0.1",
    session: {
      id: "s",
      source: "claude-code",
      tool: "claude-code",
      title: "t",
      projectPath: null,
      startedAt: null,
      model: null,
    },
    spans,
    groups: [],
  };
}

describe("denoise — rule 1: milestone", () => {
  it("tags every user_msg as milestone (positive)", () => {
    const spans = [
      span({ id: "s0", type: "user_msg", order: 0 }),
      span({ id: "s1", type: "user_msg", order: 1 }),
    ];
    const out = denoise(doc(spans));
    expect(out.spans[0].tags).toContain("milestone");
    expect(out.spans[1].tags).toContain("milestone");
  });

  it("tags the last successful tool_result and its parent as milestone (positive)", () => {
    const spans = [
      span({ id: "s0", type: "user_msg", order: 0 }),
      span({ id: "s1", type: "tool_use", order: 1, tool: { name: "Bash", params: {} } }),
      span({ id: "s2", type: "tool_result", order: 2, parentId: "s1", result: { isError: false, text: "ok" } }),
    ];
    const out = denoise(doc(spans));
    expect(out.spans.find((s) => s.id === "s2")!.tags).toContain("milestone");
    expect(out.spans.find((s) => s.id === "s1")!.tags).toContain("milestone");
  });

  it("does NOT tag milestone when the last tool_result is an error (negative)", () => {
    const spans = [
      span({ id: "s0", type: "user_msg", order: 0 }),
      span({ id: "s1", type: "tool_use", order: 1, tool: { name: "Bash", params: {} } }),
      span({ id: "s2", type: "tool_result", order: 2, parentId: "s1", result: { isError: true, text: "boom" } }),
    ];
    const out = denoise(doc(spans));
    expect(out.spans.find((s) => s.id === "s2")!.tags).not.toContain("milestone");
  });
});

describe("denoise — rule 2: error / retry", () => {
  it("tags an error tool_result and bubbles the tag to its parent tool_use (positive)", () => {
    const spans = [
      span({ id: "s0", type: "tool_use", order: 0, tool: { name: "Bash", params: {} } }),
      span({ id: "s1", type: "tool_result", order: 1, parentId: "s0", result: { isError: true, text: "fail" } }),
    ];
    const out = denoise(doc(spans));
    expect(out.spans.find((s) => s.id === "s1")!.tags).toContain("error");
    expect(out.spans.find((s) => s.id === "s0")!.tags).toContain("error");
  });

  it("does NOT tag error on a successful tool_result (negative)", () => {
    const spans = [
      span({ id: "s0", type: "tool_use", order: 0, tool: { name: "Bash", params: {} } }),
      span({ id: "s1", type: "tool_result", order: 1, parentId: "s0", result: { isError: false, text: "ok" } }),
    ];
    const out = denoise(doc(spans));
    expect(out.spans.find((s) => s.id === "s1")!.tags).not.toContain("error");
  });

  it("tags retry when the SAME tool is called again right after an error (positive)", () => {
    const spans = [
      span({ id: "s0", type: "tool_use", order: 0, tool: { name: "Bash", params: {} } }),
      span({ id: "s1", type: "tool_result", order: 1, parentId: "s0", result: { isError: true, text: "fail" } }),
      span({ id: "s2", type: "tool_use", order: 2, tool: { name: "Bash", params: {} } }),
    ];
    const out = denoise(doc(spans));
    expect(out.spans.find((s) => s.id === "s2")!.tags).toContain("retry");
  });

  it("does NOT tag retry when a DIFFERENT tool is called after an error (negative)", () => {
    const spans = [
      span({ id: "s0", type: "tool_use", order: 0, tool: { name: "Bash", params: {} } }),
      span({ id: "s1", type: "tool_result", order: 1, parentId: "s0", result: { isError: true, text: "fail" } }),
      span({ id: "s2", type: "tool_use", order: 2, tool: { name: "Read", params: {} } }),
    ];
    const out = denoise(doc(spans));
    expect(out.spans.find((s) => s.id === "s2")!.tags).not.toContain("retry");
  });
});

describe("denoise — rule 4: decision", () => {
  it("tags a thinking span containing decision vocabulary (positive)", () => {
    const spans = [span({ id: "s0", type: "thinking", order: 0, text: "我決定改用 filter 回傳新陣列。" })];
    const out = denoise(doc(spans));
    expect(out.spans[0].tags).toContain("decision");
  });

  it("does NOT tag a thinking span without decision vocabulary (negative)", () => {
    const spans = [span({ id: "s0", type: "thinking", order: 0, text: "先讀檔案確認現況。" })];
    const out = denoise(doc(spans));
    expect(out.spans[0].tags).not.toContain("decision");
  });

  it("does NOT tag decision vocabulary appearing in assistant_msg (only thinking counts)", () => {
    const spans = [span({ id: "s0", type: "assistant_msg", order: 0, text: "我決定改用 filter。" })];
    const out = denoise(doc(spans));
    expect(out.spans[0].tags).not.toContain("decision");
  });
});

describe("denoise — rule 3: edit-loop grouping", () => {
  it("groups 2+ consecutive edits to the SAME file (positive)", () => {
    const spans = [
      span({ id: "s0", type: "tool_use", order: 0, tool: { name: "Edit", params: { file_path: "a.ts" } } }),
      span({ id: "s1", type: "tool_result", order: 1, parentId: "s0", result: { isError: false, text: "ok" } }),
      span({ id: "s2", type: "tool_use", order: 2, tool: { name: "Edit", params: { file_path: "a.ts" } } }),
      span({ id: "s3", type: "tool_result", order: 3, parentId: "s2", result: { isError: false, text: "ok" } }),
    ];
    const out = denoise(doc(spans));
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0].kind).toBe("edit-loop");
    expect(out.groups[0].spanIds).toEqual(["s0", "s2"]);
  });

  it("is transparent to thinking/assistant_msg between edits (does not break the run)", () => {
    const spans = [
      span({ id: "s0", type: "tool_use", order: 0, tool: { name: "Edit", params: { file_path: "a.ts" } } }),
      span({ id: "s1", type: "thinking", order: 1, text: "還有一處要修。" }),
      span({ id: "s2", type: "assistant_msg", order: 2, text: "順手修一下。" }),
      span({ id: "s3", type: "tool_use", order: 3, tool: { name: "Edit", params: { file_path: "a.ts" } } }),
    ];
    const out = denoise(doc(spans));
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0].spanIds).toEqual(["s0", "s3"]);
  });

  it("does NOT group a single edit, or edits interrupted by a different tool (negative)", () => {
    const spans = [
      span({ id: "s0", type: "tool_use", order: 0, tool: { name: "Edit", params: { file_path: "a.ts" } } }),
      span({ id: "s1", type: "tool_use", order: 1, tool: { name: "Bash", params: {} } }),
      span({ id: "s2", type: "tool_use", order: 2, tool: { name: "Edit", params: { file_path: "a.ts" } } }),
    ];
    const out = denoise(doc(spans));
    expect(out.groups).toHaveLength(0);
  });

  it("does NOT group consecutive edits to DIFFERENT files (negative)", () => {
    const spans = [
      span({ id: "s0", type: "tool_use", order: 0, tool: { name: "Edit", params: { file_path: "a.ts" } } }),
      span({ id: "s1", type: "tool_use", order: 1, tool: { name: "Edit", params: { file_path: "b.ts" } } }),
    ];
    const out = denoise(doc(spans));
    expect(out.groups).toHaveLength(0);
  });
});
