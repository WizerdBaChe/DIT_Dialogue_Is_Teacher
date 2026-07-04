import { describe, expect, it } from "vitest";
import { distill } from "@/core/distill/distiller";
import type { Span, SessionDocument, SpanGroup } from "@/types/spanTree";

function span(partial: Partial<Span> & Pick<Span, "id" | "type" | "order">): Span {
  return {
    parentId: null,
    startedAt: null,
    durationMs: null,
    summary: partial.text ?? "",
    text: "",
    tags: [],
    raw: null,
    ...partial,
  };
}

function doc(spans: Span[], groups: SpanGroup[] = []): SessionDocument {
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
    groups,
  };
}

describe("distill — spine: objective", () => {
  it("picks the FIRST user_msg as objective (positive)", () => {
    const spans = [
      span({ id: "s0", type: "user_msg", order: 0, summary: "第一個任務" }),
      span({ id: "s1", type: "user_msg", order: 1, summary: "第二個任務" }),
    ];
    const out = distill(doc(spans));
    const objective = out.skeleton!.nodes.find((n) => n.kind === "objective");
    expect(objective?.spanId).toBe("s0");
  });

  it("has no objective node when there is no user_msg at all (negative)", () => {
    const spans = [span({ id: "s0", type: "assistant_msg", order: 0, summary: "hi" })];
    const out = distill(doc(spans));
    expect(out.skeleton!.nodes.find((n) => n.kind === "objective")).toBeUndefined();
  });
});

describe("distill — spine: decision", () => {
  it("promotes every span tagged 'decision' to a spine decision node (positive)", () => {
    const spans = [
      span({ id: "s0", type: "user_msg", order: 0 }),
      span({ id: "s1", type: "thinking", order: 1, tags: ["decision"], summary: "改用 filter" }),
    ];
    const out = distill(doc(spans));
    const decision = out.skeleton!.nodes.find((n) => n.kind === "decision");
    expect(decision?.spanId).toBe("s1");
  });

  it("does NOT create a decision node for an untagged thinking span (negative)", () => {
    const spans = [
      span({ id: "s0", type: "user_msg", order: 0 }),
      span({ id: "s1", type: "thinking", order: 1, tags: [], summary: "先讀檔案" }),
    ];
    const out = distill(doc(spans));
    expect(out.skeleton!.nodes.find((n) => n.kind === "decision")).toBeUndefined();
  });
});

describe("distill — spine: outcome", () => {
  it("picks the LAST span as outcome when it is not already on the spine (positive)", () => {
    const spans = [
      span({ id: "s0", type: "user_msg", order: 0 }),
      span({ id: "s1", type: "assistant_msg", order: 1, summary: "完成總結" }),
    ];
    const out = distill(doc(spans));
    const outcome = out.skeleton!.nodes.find((n) => n.kind === "outcome");
    expect(outcome?.spanId).toBe("s1");
  });

  it("does NOT duplicate an outcome node when the last span is already the objective (negative)", () => {
    // 只有一個 span，同時是第一個 user_msg 也是最後一個 span。
    const spans = [span({ id: "s0", type: "user_msg", order: 0 })];
    const out = distill(doc(spans));
    expect(out.skeleton!.nodes).toHaveLength(1);
    expect(out.skeleton!.nodes[0].kind).toBe("objective");
  });
});

describe("distill — rib: investigation", () => {
  it("creates an investigation rib for a Read/Grep/etc tool_use off the spine (positive)", () => {
    const spans = [
      span({ id: "s0", type: "user_msg", order: 0 }),
      span({ id: "s1", type: "tool_use", order: 1, tool: { name: "Grep", params: {} } }),
      span({ id: "s2", type: "assistant_msg", order: 2, summary: "結束" }),
    ];
    const out = distill(doc(spans));
    const rib = out.skeleton!.ribs.find((r) => r.spanId === "s1");
    expect(rib?.kind).toBe("investigation");
    expect(rib?.attachTo).toBe("s0");
  });

  it("does NOT create an investigation rib for a non-investigation tool like Bash (negative)", () => {
    const spans = [
      span({ id: "s0", type: "user_msg", order: 0 }),
      span({ id: "s1", type: "tool_use", order: 1, tool: { name: "Bash", params: {} } }),
      span({ id: "s2", type: "assistant_msg", order: 2, summary: "結束" }),
    ];
    const out = distill(doc(spans));
    expect(out.skeleton!.ribs.find((r) => r.spanId === "s1")).toBeUndefined();
  });
});

describe("distill — rib: error / retry", () => {
  it("creates an error rib for a span tagged 'error' (positive)", () => {
    const spans = [
      span({ id: "s0", type: "user_msg", order: 0 }),
      span({ id: "s1", type: "tool_use", order: 1, tags: ["error"], tool: { name: "Bash", params: {} } }),
      span({ id: "s2", type: "assistant_msg", order: 2, summary: "結束" }),
    ];
    const out = distill(doc(spans));
    expect(out.skeleton!.ribs.find((r) => r.spanId === "s1")?.kind).toBe("error");
  });

  it("creates a retry rib for a span tagged 'retry' (positive)", () => {
    const spans = [
      span({ id: "s0", type: "user_msg", order: 0 }),
      span({ id: "s1", type: "tool_use", order: 1, tags: ["retry"], tool: { name: "Bash", params: {} } }),
      span({ id: "s2", type: "assistant_msg", order: 2, summary: "結束" }),
    ];
    const out = distill(doc(spans));
    expect(out.skeleton!.ribs.find((r) => r.spanId === "s1")?.kind).toBe("retry");
  });

  it("does NOT create a rib for an untagged, non-investigation tool_use (negative)", () => {
    const spans = [
      span({ id: "s0", type: "user_msg", order: 0 }),
      span({ id: "s1", type: "tool_use", order: 1, tool: { name: "Bash", params: {} } }),
      span({ id: "s2", type: "assistant_msg", order: 2, summary: "結束" }),
    ];
    const out = distill(doc(spans));
    expect(out.skeleton!.ribs.find((r) => r.spanId === "s1")).toBeUndefined();
  });

  it("skips tool_result spans even when tagged error (bubbled up to parent tool_use instead)", () => {
    const spans = [
      span({ id: "s0", type: "user_msg", order: 0 }),
      span({ id: "s1", type: "tool_use", order: 1, tags: ["error"], tool: { name: "Bash", params: {} } }),
      span({ id: "s2", type: "tool_result", order: 2, parentId: "s1", tags: ["error"], result: { isError: true, text: "x" } }),
      span({ id: "s3", type: "assistant_msg", order: 3, summary: "結束" }),
    ];
    const out = distill(doc(spans));
    expect(out.skeleton!.ribs.find((r) => r.spanId === "s2")).toBeUndefined();
    expect(out.skeleton!.ribs.find((r) => r.spanId === "s1")?.kind).toBe("error");
  });
});

describe("distill — rib: edit-loop", () => {
  it("creates ONE edit-loop rib per group, represented by its first member (positive)", () => {
    const spans = [
      span({ id: "s0", type: "user_msg", order: 0 }),
      span({ id: "s1", type: "tool_use", order: 1, tool: { name: "Edit", params: { file_path: "a.ts" } } }),
      span({ id: "s2", type: "tool_use", order: 2, tool: { name: "Edit", params: { file_path: "a.ts" } } }),
      span({ id: "s3", type: "assistant_msg", order: 3, summary: "結束" }),
    ];
    const groups: SpanGroup[] = [{ id: "group-0", label: "反覆修改 a.ts", spanIds: ["s1", "s2"], kind: "edit-loop" }];
    const out = distill(doc(spans, groups));
    const ribs = out.skeleton!.ribs.filter((r) => r.groupId === "group-0");
    expect(ribs).toHaveLength(1);
    expect(ribs[0].spanId).toBe("s1");
    expect(ribs[0].kind).toBe("edit-loop");
  });

  it("does NOT create a rib for a span with no group and no tag (negative, covered by baseline)", () => {
    const spans = [
      span({ id: "s0", type: "user_msg", order: 0 }),
      span({ id: "s1", type: "assistant_msg", order: 1, summary: "只是講話" }),
      span({ id: "s2", type: "assistant_msg", order: 2, summary: "結束" }),
    ];
    const out = distill(doc(spans));
    expect(out.skeleton!.ribs.find((r) => r.spanId === "s1")).toBeUndefined();
  });
});
