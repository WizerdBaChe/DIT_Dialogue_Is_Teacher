import { describe, expect, it } from "vitest";
import { buildSessionDocument, buildSessionDocumentFromFiles } from "@/core/pipeline";
import { buildViewModel } from "./viewModel";
import { r4MainSession, r4SubagentSession, sampleSession } from "@/fixtures";
import { buildGlobalSessionMapProjection, canJumpToMapTarget, type MapCluster } from "./sessionMap";

describe("global session map projection", () => {
  it("maps every landmark to a real ViewItem id", () => {
    const { doc } = buildSessionDocument(sampleSession);
    const viewItems = buildViewModel(doc);
    const projection = buildGlobalSessionMapProjection(doc, viewItems, viewItems[0]?.id ?? null);
    const viewItemIds = new Set(viewItems.map((item) => item.id));

    expect(projection.level).toBe("global");
    expect(projection.targets.length).toBeGreaterThan(0);
    for (const target of projection.targets) {
      expect(target.type).toBe("landmark");
      if (target.type === "landmark") expect(viewItemIds.has(target.viewItemId)).toBe(true);
    }
  });

  it("keeps cross-file subagent landmarks traceable and ordered", () => {
    const { doc } = buildSessionDocumentFromFiles([
      { path: "main.jsonl", content: r4MainSession },
      { path: "subagents/agent-1.jsonl", content: r4SubagentSession },
    ]);
    const viewItems = buildViewModel(doc);
    const subagentItem = viewItems.find((item) => item.type === "group" && item.group.kind === "subagent");
    expect(subagentItem).toBeTruthy();
    const projection = buildGlobalSessionMapProjection(doc, viewItems, subagentItem?.id ?? null);
    const subagent = projection.targets.find((target) => target.type === "landmark" && target.kind === "subagent");

    expect(subagent?.type).toBe("landmark");
    if (subagent?.type === "landmark") {
      expect(viewItems.some((item) => item.id === subagent.viewItemId)).toBe(true);
      expect(subagent.parentStationId).toBeTruthy();
      expect(projection.focusStationIndex).toBe(subagent.stationIndex);
    }
  });

  it("returns a readable empty projection without a skeleton", () => {
    const { doc } = buildSessionDocument(sampleSession);
    const withoutSkeleton = { ...doc, skeleton: undefined };
    const viewItems = buildViewModel(withoutSkeleton);
    const projection = buildGlobalSessionMapProjection(withoutSkeleton, viewItems, null);

    expect(projection.targets).toEqual([]);
    expect(projection.totalStations).toBe(0);
    expect(projection.totalRibs).toBe(0);
  });

  it("allows only real landmarks to jump", () => {
    const { doc } = buildSessionDocument(sampleSession);
    const viewItems = buildViewModel(doc);
    const landmark = buildGlobalSessionMapProjection(doc, viewItems, null).targets[0];
    const cluster: MapCluster = {
      type: "cluster",
      id: "cluster:global:0:4",
      sourceViewItemIds: viewItems.slice(0, 5).map((item) => item.id),
      firstStationIndex: 0,
      lastStationIndex: 4,
      count: 5,
      kindCounts: {},
      label: "Five steps",
    };

    expect(canJumpToMapTarget(landmark, viewItems)).toBe(true);
    expect(canJumpToMapTarget(cluster, viewItems)).toBe(false);
    expect(canJumpToMapTarget(null, viewItems)).toBe(false);
  });
});
