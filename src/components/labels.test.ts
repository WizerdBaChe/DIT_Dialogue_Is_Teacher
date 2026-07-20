import { describe, expect, it } from "vitest";
import {
  GROUP_DOT,
  SPAN_DOT,
  SPAN_LEGEND_ORDER,
  landmarkKindLabel,
} from "./labels";
import {
  CLUSTER_MAP_SYMBOL,
  SKELETON_NODE_KIND_ORDER,
  SKELETON_NODE_SYMBOL,
  SKELETON_RIB_KIND_ORDER,
  SKELETON_RIB_SYMBOL,
  SUBAGENT_MAP_SYMBOL,
} from "@/core/view/sessionMap";
import { messagesFor } from "@/i18n";

const t = messagesFor("zh-TW");

/** Sidebar 圖例實際渲染的符號集合 (與 StructureLegend.tsx 同源常數)。 */
const sidebarLegendSymbols = SPAN_LEGEND_ORDER.map((type) => SPAN_DOT[type]);

/** Session Map 圖例實際渲染的符號集合 (與 SessionMapDialog.tsx 同源常數)。 */
const mapLegendSymbols = [
  ...SKELETON_NODE_KIND_ORDER.map((kind) => SKELETON_NODE_SYMBOL[kind]),
  ...SKELETON_RIB_KIND_ORDER.map((kind) => SKELETON_RIB_SYMBOL[kind]),
  SUBAGENT_MAP_SYMBOL,
  CLUSTER_MAP_SYMBOL,
];

describe("SA-01 legend symbol alignment", () => {
  it("sidebar legend symbols are a subset of SPAN_DOT values ∪ GROUP_DOT", () => {
    const allowed = new Set([...Object.values(SPAN_DOT), GROUP_DOT]);
    for (const symbol of sidebarLegendSymbols) {
      expect(allowed.has(symbol)).toBe(true);
    }
  });

  it("sidebar legend has no internal duplicate symbols", () => {
    expect(new Set(sidebarLegendSymbols).size).toBe(sidebarLegendSymbols.length);
  });

  it("map legend has no internal duplicate symbols", () => {
    expect(new Set(mapLegendSymbols).size).toBe(mapLegendSymbols.length);
  });

  it("map legend excludes SPAN_DOT-exclusive symbols", () => {
    const spanExclusive = [SPAN_DOT.user_msg, SPAN_DOT.tool_use, SPAN_DOT.tool_result, GROUP_DOT];
    for (const symbol of spanExclusive) {
      expect(mapLegendSymbols.includes(symbol)).toBe(false);
    }
  });

  it("landmarkKindLabel resolves node, rib, and subagent kinds from the shared dictionaries", () => {
    expect(landmarkKindLabel(t, {
      type: "landmark", id: "a", viewItemId: "a", stationIndex: 0, kind: "decision",
      label: "", parentStationId: null, ribCount: 0, ribKindCounts: {},
    })).toBe(t.skeletonNode.decision);
    expect(landmarkKindLabel(t, {
      type: "landmark", id: "b", viewItemId: "b", stationIndex: 0, kind: "retry",
      label: "", parentStationId: null, ribCount: 0, ribKindCounts: {},
    })).toBe(t.skeletonRib.retry);
    expect(landmarkKindLabel(t, {
      type: "landmark", id: "c", viewItemId: "c", stationIndex: 0, kind: "subagent",
      label: "", parentStationId: null, ribCount: 0, ribKindCounts: {},
    })).toBe(t.workspace.tabs.subagents);
  });
});
