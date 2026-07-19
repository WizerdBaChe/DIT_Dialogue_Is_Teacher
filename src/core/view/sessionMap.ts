import type { SessionDocument, SkeletonNodeKind, SkeletonRibKind } from "@/types/spanTree";
import { buildFishbone } from "./fishbone";
import type { ViewItem } from "./viewModel";

export type MapZoomLevel = "global" | "section" | "detail";

export interface MapLandmark {
  type: "landmark";
  id: string;
  viewItemId: string;
  stationIndex: number;
  kind: SkeletonNodeKind | SkeletonRibKind | "subagent";
  label: string;
  parentStationId: string | null;
  ribCount: number;
  ribKindCounts: Record<string, number>;
}

export interface MapCluster {
  type: "cluster";
  id: string;
  sourceViewItemIds: string[];
  firstStationIndex: number;
  lastStationIndex: number;
  count: number;
  kindCounts: Record<string, number>;
  label: string;
}

export type SessionMapTarget = MapLandmark | MapCluster;

export interface SessionMapProjection {
  level: MapZoomLevel;
  focusStationIndex: number;
  targets: SessionMapTarget[];
  totalStations: number;
  totalRibs: number;
}

function countRibKinds(kinds: SkeletonRibKind[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const kind of kinds) counts[kind] = (counts[kind] ?? 0) + 1;
  return counts;
}

export function buildGlobalSessionMapProjection(
  doc: SessionDocument,
  viewItems: ViewItem[],
  currentViewItemId: string | null,
): SessionMapProjection {
  const stations = buildFishbone(doc, viewItems);
  const viewIndexById = new Map(viewItems.map((item, index) => [item.id, index]));
  const stationLandmarks = stations.map<MapLandmark>((station, stationIndex) => ({
    type: "landmark",
    id: `landmark:station:${stationIndex}:${station.viewItemId}`,
    viewItemId: station.viewItemId,
    stationIndex,
    kind: station.kind,
    label: station.label,
    parentStationId: null,
    ribCount: station.ribs.length,
    ribKindCounts: countRibKinds(station.ribs.map((rib) => rib.kind)),
  }));
  const referencedIds = new Set(stations.flatMap((station) => [
    station.viewItemId,
    ...station.ribs.map((rib) => rib.viewItemId),
  ]));

  const subagentLandmarks: MapLandmark[] = [];
  for (const item of viewItems) {
    if (item.type !== "group" || item.group.kind !== "subagent" || referencedIds.has(item.id) || stations.length === 0) continue;
    const itemIndex = viewIndexById.get(item.id) ?? 0;
    let parentStationIndex = 0;
    for (let index = 0; index < stations.length; index += 1) {
      const stationViewIndex = viewIndexById.get(stations[index].viewItemId) ?? 0;
      if (stationViewIndex <= itemIndex) parentStationIndex = index;
      else break;
    }
    subagentLandmarks.push({
      type: "landmark",
      id: `landmark:subagent:${item.id}`,
      viewItemId: item.id,
      stationIndex: parentStationIndex,
      kind: "subagent",
      label: item.group.label,
      parentStationId: stationLandmarks[parentStationIndex]?.id ?? null,
      ribCount: 0,
      ribKindCounts: {},
    });
  }

  const targets = [...stationLandmarks, ...subagentLandmarks].sort((left, right) => {
    const leftIndex = viewIndexById.get(left.viewItemId) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = viewIndexById.get(right.viewItemId) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.stationIndex - right.stationIndex || left.id.localeCompare(right.id);
  });

  let focusStationIndex = stations.findIndex((station) => (
    station.viewItemId === currentViewItemId
    || station.ribs.some((rib) => rib.viewItemId === currentViewItemId)
  ));
  if (focusStationIndex < 0) {
    focusStationIndex = subagentLandmarks.find((target) => target.viewItemId === currentViewItemId)?.stationIndex ?? 0;
  }

  return {
    level: "global",
    focusStationIndex,
    targets,
    totalStations: stations.length,
    totalRibs: stations.reduce((total, station) => total + station.ribs.length, 0),
  };
}

export function canJumpToMapTarget(target: SessionMapTarget | null, viewItems: ViewItem[]): target is MapLandmark {
  if (!target || target.type !== "landmark") return false;
  return viewItems.some((item) => item.id === target.viewItemId);
}
