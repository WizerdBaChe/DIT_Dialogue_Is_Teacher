import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, type SessionDocument, type Span } from "@/types/spanTree";
import { buildViewModel } from "./viewModel";
import { buildFishbone } from "./fishbone";

function span(id: string, order: number, type: Span["type"], parentId: string | null = null): Span {
  return {
    id,
    parentId,
    order,
    type,
    startedAt: null,
    durationMs: null,
    summary: id,
    text: id,
    tags: [],
    raw: {},
  };
}

/** 骨架節點指向的 span 不是 top-level viewItem：一個被收進群組、一個巢狀在 tool_use 底下。 */
function docWithHiddenSpans(): SessionDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    session: { id: "s", source: "paste", tool: "test", title: "t", projectPath: null, startedAt: null, model: null },
    spans: [
      span("user-1", 0, "user_msg"),
      span("edit-a", 1, "tool_use"),
      span("edit-b", 2, "tool_use"),
      span("call-1", 3, "tool_use"),
      span("result-1", 4, "tool_result", "call-1"),
    ],
    groups: [{ id: "group-1", kind: "edit-loop", label: "Edit loop", spanIds: ["edit-a", "edit-b"] }],
    skeleton: {
      schemaVersion: SCHEMA_VERSION,
      nodes: [
        { spanId: "user-1", kind: "objective", label: "目標", order: 0 },
        { spanId: "edit-b", kind: "decision", label: "群組內的決策", order: 2 },
        { spanId: "result-1", kind: "outcome", label: "巢狀的結果", order: 4 },
      ],
      ribs: [],
    },
  };
}

describe("fishbone view item resolution", () => {
  it("maps a skeleton node onto the card that carries it, never onto the first item", () => {
    const doc = docWithHiddenSpans();
    const viewItems = buildViewModel(doc);
    const stations = buildFishbone(doc, viewItems);
    const firstItemId = viewItems[0].id;

    expect(stations).toHaveLength(3);
    // 群組成員 → 群組卡片；巢狀 tool_result → 其 tool_use 卡片。
    expect(stations[1].viewItemId).toBe("group-1");
    expect(stations[2].viewItemId).toBe("call-1");
    // 舊行為把兩者都退回 viewItems[0]，造成重複位置與錯誤跳轉。
    expect(stations.filter((station) => station.viewItemId === firstItemId)).toHaveLength(1);
    expect(new Set(stations.map((station) => station.viewItemId)).size).toBe(stations.length);
  });

  it("drops a skeleton node whose span is absent instead of pointing it at the first item", () => {
    const doc = docWithHiddenSpans();
    doc.skeleton!.nodes.push({ spanId: "ghost", kind: "milestone", label: "不存在", order: 9 });
    const viewItems = buildViewModel(doc);
    const stations = buildFishbone(doc, viewItems);

    expect(stations.map((station) => station.label)).not.toContain("不存在");
    expect(stations).toHaveLength(3);
  });

  it("resolves group ribs by group id and keeps every rib on a real card", () => {
    const doc = docWithHiddenSpans();
    doc.skeleton!.ribs = [
      { spanId: "edit-a", groupId: "group-1", attachTo: "user-1", kind: "edit-loop", label: "編輯迴圈", order: 1 },
      { spanId: "result-1", attachTo: "user-1", kind: "investigation", label: "取證", order: 4 },
      { spanId: "ghost", attachTo: "user-1", kind: "error", label: "不存在", order: 5 },
    ];
    const viewItems = buildViewModel(doc);
    const viewItemIds = new Set(viewItems.map((item) => item.id));
    const ribs = buildFishbone(doc, viewItems).flatMap((station) => station.ribs);

    expect(ribs.map((rib) => rib.label)).toEqual(["編輯迴圈", "取證"]);
    for (const rib of ribs) expect(viewItemIds.has(rib.viewItemId)).toBe(true);
  });
});
