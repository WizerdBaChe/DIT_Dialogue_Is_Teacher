import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSessionDocument, buildSessionDocumentFromFiles } from "@/core/pipeline";
import { buildViewModel } from "./viewModel";
import { r4MainSession, r4SubagentSession, sampleSession } from "@/fixtures";
import { SCHEMA_VERSION, type SessionDocument, type Span } from "@/types/spanTree";
import {
  MAX_GLOBAL_TARGETS,
  MAX_MOUNTED_DETAIL_RIBS,
  MAX_SECTION_TARGETS,
  buildGlobalSessionMapProjection,
  buildSessionMapGraphicLayout,
  buildSessionMapProjection,
  canJumpToMapTarget,
  isSpineTarget,
  resolveCurrentSpineTargetId,
  resolveSessionMapSelection,
  type MapCluster,
} from "./sessionMap";
import { mapTargetOrdinal } from "@/components/labels";
import { getFallbackReport, resetFallbackReport } from "@/core/diagnostics";

function createLargeMapFixture(stationCount: number, ribCount = 0): { doc: SessionDocument; viewItems: ReturnType<typeof buildViewModel> } {
  const stationSpans: Span[] = Array.from({ length: stationCount }, (_, index) => ({
    id: `station-${index}`,
    parentId: null,
    order: index,
    type: "assistant_msg",
    startedAt: null,
    durationMs: null,
    summary: `Station ${index}`,
    text: `Station ${index}`,
    tags: [],
    raw: {},
  }));
  const ribSpans: Span[] = Array.from({ length: ribCount }, (_, index) => ({
    id: `rib-${index}`,
    parentId: null,
    order: stationCount + index,
    type: "thinking",
    startedAt: null,
    durationMs: null,
    summary: `Rib ${index}`,
    text: `Rib ${index}`,
    tags: [],
    raw: {},
  }));
  const doc: SessionDocument = {
    schemaVersion: SCHEMA_VERSION,
    session: {
      id: "map-fixture",
      source: "paste",
      tool: "test",
      title: "Map fixture",
      projectPath: null,
      startedAt: null,
      model: null,
    },
    spans: [...stationSpans, ...ribSpans],
    groups: [],
    skeleton: {
      schemaVersion: SCHEMA_VERSION,
      nodes: stationSpans.map((span, index) => ({ spanId: span.id, kind: "decision", label: span.summary, order: index })),
      ribs: ribSpans.map((span, index) => ({
        spanId: span.id,
        attachTo: stationSpans[0]?.id ?? "missing",
        kind: "investigation",
        label: span.summary,
        order: stationCount + index,
      })),
    },
  };
  return { doc, viewItems: buildViewModel(doc) };
}

describe("global session map projection", () => {
  it("centers four targets and ends the spine at the first and last target", () => {
    const layout = buildSessionMapGraphicLayout(4);

    expect(layout.xPositions).toEqual([90, 270, 450, 630]);
    expect(layout.spineStart).toBe(layout.xPositions[0]);
    expect(layout.spineEnd).toBe(layout.xPositions[3]);
    expect((layout.spineStart + layout.spineEnd) / 2).toBe(layout.width / 2);
  });

  it("does not create a trailing spine for empty or single-target maps", () => {
    const empty = buildSessionMapGraphicLayout(0);
    const single = buildSessionMapGraphicLayout(1);

    expect(empty.xPositions).toEqual([]);
    expect(empty.spineStart).toBe(empty.spineEnd);
    expect(single.xPositions).toEqual([single.width / 2]);
    expect(single.spineStart).toBe(single.spineEnd);
  });

  it("keeps section membership stable while previewing a different target", () => {
    const { doc, viewItems } = createLargeMapFixture(6);
    const focusId = viewItems[1].id;
    const before = buildSessionMapProjection(doc, viewItems, "section", focusId);
    const previewTarget = before.targets.find((target) => (
      target.type === "landmark" && target.viewItemId !== focusId
    ));

    expect(previewTarget).toBeTruthy();
    expect(resolveSessionMapSelection(before, previewTarget?.id ?? null)?.id).toBe(previewTarget?.id);
    expect(buildSessionMapProjection(doc, viewItems, "section", focusId).targets.map((target) => target.id))
      .toEqual(before.targets.map((target) => target.id));
  });

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
    const focusId = subagentItem?.id ?? null;

    // 全局層：子代理收在站上只留計數，主線不會被子代理撐長。
    const global = buildGlobalSessionMapProjection(doc, viewItems, focusId);
    expect(global.targets.some((target) => target.type === "landmark" && target.kind === "subagent")).toBe(false);
    expect(global.targets.some((target) => (
      target.type === "landmark" && target.parentStationId === null && target.subagentCount > 0
    ))).toBe(true);

    // 細節層：子代理逐個列出，且仍能追回真實的 ViewItem。
    const detail = buildSessionMapProjection(doc, viewItems, "detail", focusId, focusId);
    const subagent = detail.targets.find((target) => target.type === "landmark" && target.kind === "subagent");

    expect(subagent?.type).toBe("landmark");
    if (subagent?.type === "landmark") {
      expect(viewItems.some((item) => item.id === subagent.viewItemId)).toBe(true);
      expect(subagent.parentStationId).toBeTruthy();
      expect(isSpineTarget(subagent)).toBe(false);
      expect(detail.focusStationIndex).toBe(subagent.stationIndex);
    }

    // 區段層：每站一列子代理摘要。
    const section = buildSessionMapProjection(doc, viewItems, "section", focusId, focusId);
    expect(section.targets.some((target) => target.type === "cluster" && target.groupKind === "subagents")).toBe(true);
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
      parentStationId: null,
      groupKind: "range",
    };

    expect(canJumpToMapTarget(landmark, viewItems)).toBe(true);
    expect(canJumpToMapTarget(cluster, viewItems)).toBe(false);
    expect(canJumpToMapTarget(null, viewItems)).toBe(false);
  });

  it.each([0, 1, 80])("keeps %i stations as bounded real global targets", (stationCount) => {
    const { doc, viewItems } = createLargeMapFixture(stationCount);
    const projection = buildSessionMapProjection(doc, viewItems, "global", viewItems[0]?.id ?? null);

    expect(projection.targets.length).toBeLessThanOrEqual(MAX_GLOBAL_TARGETS);
    expect(projection.targets.every((target) => target.type === "landmark")).toBe(true);
  });

  it("clusters 81 stations while preserving the active station and every source id", () => {
    const { doc, viewItems } = createLargeMapFixture(81);
    const activeId = viewItems[40].id;
    const projection = buildSessionMapProjection(doc, viewItems, "global", activeId);
    const representedIds = projection.targets.flatMap((target) => (
      target.type === "landmark" ? [target.viewItemId] : target.sourceViewItemIds
    ));

    expect(projection.targets.length).toBeLessThanOrEqual(MAX_GLOBAL_TARGETS);
    expect(projection.targets.some((target) => target.type === "landmark" && target.viewItemId === activeId)).toBe(true);
    expect(new Set(representedIds)).toEqual(new Set(viewItems.map((item) => item.id)));
    for (const cluster of projection.targets.filter((target) => target.type === "cluster")) {
      expect("viewItemId" in cluster).toBe(false);
    }
  });

  it("bounds 10,000 stations deterministically at global and section levels", () => {
    const { doc, viewItems } = createLargeMapFixture(10_000);
    const focusId = viewItems[5_000].id;
    const globalA = buildSessionMapProjection(doc, viewItems, "global", focusId);
    const globalB = buildSessionMapProjection(doc, viewItems, "global", focusId);
    const section = buildSessionMapProjection(doc, viewItems, "section", focusId);

    expect(globalA.targets.length).toBeLessThanOrEqual(MAX_GLOBAL_TARGETS);
    expect(section.targets.length).toBeLessThanOrEqual(MAX_SECTION_TARGETS);
    expect(globalA.targets).toEqual(globalB.targets);
    expect(new Set(globalA.targets.map((target) => target.id)).size).toBe(globalA.targets.length);
    const clusteredSourceIds = globalA.targets.flatMap((target) => (
      target.type === "landmark" ? [target.viewItemId] : target.sourceViewItemIds
    ));
    expect(clusteredSourceIds).toEqual(viewItems.map((item) => item.id));
  });

  it("uses only clusters when the active id is missing from a large session", () => {
    const { doc, viewItems } = createLargeMapFixture(81);
    const projection = buildSessionMapProjection(doc, viewItems, "global", "missing-active");

    expect(projection.targets.length).toBeLessThanOrEqual(MAX_GLOBAL_TARGETS);
    expect(projection.targets.every((target) => target.type === "cluster")).toBe(true);
  });

  it("keeps all detail ribs in the virtual source while publishing the mount cap", () => {
    const { doc, viewItems } = createLargeMapFixture(1, 150);
    const detail = buildSessionMapProjection(doc, viewItems, "detail", viewItems[0].id);
    const detailRibs = detail.targets.filter((target) => target.type === "landmark" && target.parentStationId !== null);

    expect(detailRibs).toHaveLength(150);
    expect(MAX_MOUNTED_DETAIL_RIBS).toBe(120);
  });

  it("keeps a section with a rib cluster within the 200-target cap", () => {
    const { doc, viewItems } = createLargeMapFixture(1_000, 300);
    const focusId = viewItems[999].id;
    const section = buildSessionMapProjection(doc, viewItems, "section", focusId);
    const ribCluster = section.targets.find((target) => target.type === "cluster" && target.firstStationIndex === 999);

    expect(section.targets.length).toBeLessThanOrEqual(MAX_SECTION_TARGETS);
    expect(ribCluster?.type).toBe("cluster");
    expect(canJumpToMapTarget(ribCluster ?? null, viewItems)).toBe(false);
  });
});

describe("session map position semantics", () => {
  beforeEach(() => {
    resetFallbackReport();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("keeps you-are-here on the reading position when the focus station differs", () => {
    const { doc, viewItems } = createLargeMapFixture(6);
    const currentId = viewItems[0].id;
    const focusId = viewItems[4].id;
    const projection = buildSessionMapProjection(doc, viewItems, "section", focusId, currentId);
    const currentTargetId = resolveCurrentSpineTargetId(projection, currentId);
    const currentTarget = projection.targets.find((target) => target.id === currentTargetId);

    expect(projection.focusStationIndex).toBe(4);
    expect(projection.currentStationIndex).toBe(0);
    expect(currentTarget?.type).toBe("landmark");
    if (currentTarget?.type === "landmark") expect(currentTarget.viewItemId).toBe(currentId);
    // 全圖唯一：只有一個節點能是「你在這裡」。
    expect(projection.targets.filter((target) => target.id === currentTargetId)).toHaveLength(1);
  });

  it("falls back to the parent station when the reading position is a rib", () => {
    const { doc, viewItems } = createLargeMapFixture(3, 4);
    const ribItemId = viewItems.find((item) => item.id.includes("rib-0"))?.id ?? viewItems[3].id;
    const projection = buildSessionMapProjection(doc, viewItems, "detail", ribItemId, ribItemId);
    const currentTargetId = resolveCurrentSpineTargetId(projection, ribItemId);
    const currentTarget = projection.targets.find((target) => target.id === currentTargetId);

    expect(currentTarget?.type).toBe("landmark");
    if (currentTarget?.type === "landmark") expect(currentTarget.parentStationId).toBeNull();
    expect(isSpineTarget(currentTarget!)).toBe(true);
  });

  it("reports no you-are-here when the reading position is outside the skeleton", () => {
    const { doc, viewItems } = createLargeMapFixture(4);
    const projection = buildSessionMapProjection(doc, viewItems, "global", viewItems[0].id, "not-a-view-item");

    expect(projection.currentStationIndex).toBeNull();
    expect(resolveCurrentSpineTargetId(projection, "not-a-view-item")).toBeNull();
  });

  it("never draws ribs or rib groups on the spine at any zoom level", () => {
    const { doc, viewItems } = createLargeMapFixture(3, 5);
    const focusId = viewItems[0].id;

    for (const level of ["global", "section", "detail"] as const) {
      const projection = buildSessionMapProjection(doc, viewItems, level, focusId, focusId);
      for (const target of projection.targets.filter(isSpineTarget)) {
        if (target.type === "cluster") expect(target.parentStationId).toBeNull();
        else expect(target.parentStationId === null || target.kind === "subagent").toBe(true);
      }
    }
  });

  it("expands ribs for every station in range, not only the focused one", () => {
    const { doc } = buildSessionDocument(sampleSession);
    const viewItems = buildViewModel(doc);
    const global = buildGlobalSessionMapProjection(doc, viewItems, null);
    const stationsWithRibs = global.targets.filter((target) => (
      target.type === "landmark" && target.parentStationId === null && target.ribCount > 0
    ));
    expect(stationsWithRibs.length).toBeGreaterThan(1);
    // 刻意把焦點放在一個沒有支線的站，舊行為會得到 0 列支線。
    const ribless = global.targets.find((target) => (
      target.type === "landmark" && target.parentStationId === null && target.ribCount === 0
    ));
    expect(ribless?.type).toBe("landmark");
    const focusId = ribless?.type === "landmark" ? ribless.viewItemId : null;

    const section = buildSessionMapProjection(doc, viewItems, "section", focusId, focusId);
    const ribGroups = section.targets.filter((target) => target.type === "cluster" && target.parentStationId !== null);
    expect(ribGroups).toHaveLength(stationsWithRibs.length);

    const detail = buildSessionMapProjection(doc, viewItems, "detail", focusId, focusId);
    const ribRows = detail.targets.filter((target) => (
      target.type === "landmark" && target.parentStationId !== null && target.kind !== "subagent"
    ));
    const totalRibs = stationsWithRibs.reduce((sum, target) => (
      sum + (target.type === "landmark" ? target.ribCount : 0)
    ), 0);
    expect(ribRows).toHaveLength(totalRibs);
  });

  it("never emits a rib group for a station that was collapsed into a cluster", () => {
    const { doc, viewItems } = createLargeMapFixture(1_000, 300);
    const section = buildSessionMapProjection(doc, viewItems, "section", viewItems[999].id, viewItems[999].id);
    const stationIds = new Set(section.targets
      .filter((target) => target.type === "landmark" && target.parentStationId === null)
      .map((target) => target.id));

    expect(section.targets.length).toBeLessThanOrEqual(MAX_SECTION_TARGETS);
    for (const group of section.targets.filter((target) => target.type === "cluster" && target.parentStationId !== null)) {
      expect(stationIds.has(group.parentStationId!)).toBe(true);
    }
  });

  it("flags an unresolved focus instead of silently anchoring on the first station", () => {
    const { doc, viewItems } = createLargeMapFixture(6);

    const resolved = buildSessionMapProjection(doc, viewItems, "section", viewItems[3].id, viewItems[3].id);
    expect(resolved.focusResolved).toBe(true);
    expect(resolved.focusStationIndex).toBe(3);

    const unresolved = buildSessionMapProjection(doc, viewItems, "section", "not-a-view-item", viewItems[0].id);
    expect(unresolved.focusResolved).toBe(false);
    // 仍需要一個基準站才能裁切，但呼叫端必須看得出來這是預設值而不是真實定位。
    expect(unresolved.focusStationIndex).toBe(0);
    expect(getFallbackReport().some((record) => record.reason === "focus-id-not-in-skeleton")).toBe(true);
  });

  it("gives a station the same ordinal at every zoom level", () => {
    const { doc, viewItems } = createLargeMapFixture(9);
    const focusId = viewItems[5].id;
    const ordinals = (["global", "section", "detail"] as const).map((level) => {
      const projection = buildSessionMapProjection(doc, viewItems, level, focusId, focusId);
      const station = projection.targets.find((target) => (
        target.type === "landmark" && target.viewItemId === focusId
      ));
      return station ? mapTargetOrdinal(station) : null;
    });

    expect(ordinals).toEqual(["6", "6", "6"]);
  });
});
