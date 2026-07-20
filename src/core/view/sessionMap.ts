import type { SessionDocument, SkeletonNodeKind, SkeletonRibKind } from "@/types/spanTree";
import { buildFishbone } from "./fishbone";
import type { ViewItem } from "./viewModel";

export const MAX_GLOBAL_TARGETS = 80;
export const MAX_SECTION_TARGETS = 200;
export const DETAIL_STATION_RADIUS = 10;
export const MAX_MOUNTED_DETAIL_RIBS = 120;

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

/** Skeleton 層主線節點記號 (Session Map 專屬，與 Sidebar 的 span 層記號不共用符號)。 */
export const SKELETON_NODE_SYMBOL: Record<SkeletonNodeKind, string> = {
  objective: "□",
  decision: "◇",
  milestone: "⬡",
  outcome: "▰",
};

/** Skeleton 層支線記號。 */
export const SKELETON_RIB_SYMBOL: Record<SkeletonRibKind, string> = {
  investigation: "├",
  error: "△",
  retry: "○",
  "edit-loop": "◆",
};

/** Session Map 地標清單顯示順序。 */
export const SKELETON_NODE_KIND_ORDER: SkeletonNodeKind[] = ["objective", "decision", "milestone", "outcome"];
export const SKELETON_RIB_KIND_ORDER: SkeletonRibKind[] = ["investigation", "error", "retry", "edit-loop"];

/** 子代理地標記號 (與 edit-loop 支線的 ◆ 區分，避免 Map 圖例一符多義)。 */
export const SUBAGENT_MAP_SYMBOL = "⬠";

/** 聚合區段記號。 */
export const CLUSTER_MAP_SYMBOL = "▦";

export interface SessionMapProjection {
  level: MapZoomLevel;
  focusStationIndex: number;
  targets: SessionMapTarget[];
  totalStations: number;
  totalRibs: number;
}

export interface SessionMapGraphicLayout {
  width: number;
  height: number;
  nodeY: number;
  xPositions: number[];
  spineStart: number;
  spineEnd: number;
}

const MAP_GRAPHIC_MIN_WIDTH = 720;
const MAP_GRAPHIC_SIDE_PADDING = 90;
const MAP_GRAPHIC_NODE_GAP = 180;

export function buildSessionMapGraphicLayout(targetCount: number): SessionMapGraphicLayout {
  const count = Math.max(0, Math.floor(targetCount));
  const width = Math.max(
    MAP_GRAPHIC_MIN_WIDTH,
    count > 1 ? MAP_GRAPHIC_SIDE_PADDING * 2 + (count - 1) * MAP_GRAPHIC_NODE_GAP : MAP_GRAPHIC_MIN_WIDTH,
  );
  const nodeY = 118;
  const xPositions = count === 0
    ? []
    : count === 1
      ? [width / 2]
      : Array.from({ length: count }, (_, index) => (
        MAP_GRAPHIC_SIDE_PADDING + index * ((width - MAP_GRAPHIC_SIDE_PADDING * 2) / (count - 1))
      ));
  const first = xPositions[0] ?? width / 2;
  const last = xPositions[xPositions.length - 1] ?? first;

  return {
    width,
    height: 280,
    nodeY,
    xPositions,
    spineStart: first,
    spineEnd: last,
  };
}

interface MapStation {
  stationIndex: number;
  landmark: MapLandmark;
  ribs: MapLandmark[];
  subagents: MapLandmark[];
}

interface LandmarkUnit {
  stationIndex: number;
  landmarks: MapLandmark[];
}

function countKinds(targets: MapLandmark[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const target of targets) counts[target.kind] = (counts[target.kind] ?? 0) + 1;
  return counts;
}

function buildMapStations(doc: SessionDocument, viewItems: ViewItem[]): MapStation[] {
  const stations = buildFishbone(doc, viewItems);
  const viewIndexById = new Map(viewItems.map((item, index) => [item.id, index]));
  const model: MapStation[] = stations.map((station, stationIndex) => {
    const stationId = `landmark:station:${stationIndex}:${station.viewItemId}`;
    const ribs = station.ribs.map<MapLandmark>((rib, ribIndex) => ({
      type: "landmark",
      id: `landmark:rib:${stationIndex}:${ribIndex}:${rib.viewItemId}`,
      viewItemId: rib.viewItemId,
      stationIndex,
      kind: rib.kind,
      label: rib.label,
      parentStationId: stationId,
      ribCount: 0,
      ribKindCounts: {},
    }));
    return {
      stationIndex,
      landmark: {
        type: "landmark",
        id: stationId,
        viewItemId: station.viewItemId,
        stationIndex,
        kind: station.kind,
        label: station.label,
        parentStationId: null,
        ribCount: ribs.length,
        ribKindCounts: countKinds(ribs),
      },
      ribs,
      subagents: [],
    };
  });

  const referencedIds = new Set(model.flatMap((station) => [
    station.landmark.viewItemId,
    ...station.ribs.map((rib) => rib.viewItemId),
  ]));
  for (const item of viewItems) {
    if (item.type !== "group" || item.group.kind !== "subagent" || referencedIds.has(item.id) || model.length === 0) continue;
    const itemIndex = viewIndexById.get(item.id) ?? 0;
    let parentStationIndex = 0;
    for (let index = 0; index < model.length; index += 1) {
      const stationViewIndex = viewIndexById.get(model[index].landmark.viewItemId) ?? 0;
      if (stationViewIndex <= itemIndex) parentStationIndex = index;
      else break;
    }
    const parent = model[parentStationIndex];
    parent.subagents.push({
      type: "landmark",
      id: `landmark:subagent:${item.id}`,
      viewItemId: item.id,
      stationIndex: parentStationIndex,
      kind: "subagent",
      label: item.group.label,
      parentStationId: parent.landmark.id,
      ribCount: 0,
      ribKindCounts: {},
    });
  }
  return model;
}

function findFocusStation(stations: MapStation[], focusId: string | null): number {
  if (!focusId) return 0;
  const index = stations.findIndex((station) => (
    station.landmark.viewItemId === focusId
    || station.ribs.some((rib) => rib.viewItemId === focusId)
    || station.subagents.some((subagent) => subagent.viewItemId === focusId)
  ));
  return index >= 0 ? index : 0;
}

function makeCluster(level: MapZoomLevel, landmarks: MapLandmark[]): MapCluster {
  const sourceViewItemIds = [...new Set(landmarks.map((target) => target.viewItemId))];
  const firstStationIndex = Math.min(...landmarks.map((target) => target.stationIndex));
  const lastStationIndex = Math.max(...landmarks.map((target) => target.stationIndex));
  return {
    type: "cluster",
    id: `cluster:${level}:${firstStationIndex}:${lastStationIndex}`,
    sourceViewItemIds,
    firstStationIndex,
    lastStationIndex,
    count: sourceViewItemIds.length,
    kindCounts: countKinds(landmarks),
    label: `${firstStationIndex + 1}–${lastStationIndex + 1} · ${sourceViewItemIds.length}`,
  };
}

function partitionUnits(units: LandmarkUnit[], groupCount: number, level: MapZoomLevel): MapCluster[] {
  const count = Math.min(Math.max(0, groupCount), units.length);
  if (count === 0) return [];
  const clusters: MapCluster[] = [];
  for (let group = 0; group < count; group += 1) {
    const start = Math.floor((group * units.length) / count);
    const end = Math.floor(((group + 1) * units.length) / count);
    const landmarks = units.slice(start, end).flatMap((unit) => unit.landmarks);
    if (landmarks.length > 0) clusters.push(makeCluster(level, landmarks));
  }
  return clusters;
}

function allocateSideGroups(leftCount: number, rightCount: number, available: number): [number, number] {
  if (leftCount === 0) return [0, Math.min(rightCount, available)];
  if (rightCount === 0) return [Math.min(leftCount, available), 0];
  const usable = Math.max(2, available);
  let left = Math.round((usable * leftCount) / (leftCount + rightCount));
  left = Math.max(1, Math.min(leftCount, left));
  let right = Math.max(1, Math.min(rightCount, usable - left));
  if (left + right > available) {
    if (left > right) left -= 1;
    else right -= 1;
  }
  return [left, right];
}

function boundedTargets(
  units: LandmarkUnit[],
  level: MapZoomLevel,
  maxTargets: number,
  preserve: MapLandmark | null,
): SessionMapTarget[] {
  const allLandmarks = units.flatMap((unit) => unit.landmarks);
  if (allLandmarks.length <= maxTargets) return allLandmarks;
  if (!preserve) return partitionUnits(units, maxTargets, level);

  const preserveUnitIndex = units.findIndex((unit) => unit.landmarks.some((target) => target.id === preserve.id));
  if (preserveUnitIndex < 0) return partitionUnits(units, maxTargets, level);
  const preserveUnit = units[preserveUnitIndex];
  const leftover = preserveUnit.landmarks.filter((target) => target.id !== preserve.id);
  const leftoverCluster = leftover.length > 0 ? makeCluster(level, leftover) : null;
  const clusterBudget = maxTargets - 1 - (leftoverCluster ? 1 : 0);
  const leftUnits = units.slice(0, preserveUnitIndex);
  const rightUnits = units.slice(preserveUnitIndex + 1);
  const [leftGroups, rightGroups] = allocateSideGroups(leftUnits.length, rightUnits.length, clusterBudget);

  return [
    ...partitionUnits(leftUnits, leftGroups, level),
    preserve,
    ...(leftoverCluster ? [leftoverCluster] : []),
    ...partitionUnits(rightUnits, rightGroups, level),
  ];
}

function projectionUnits(stations: MapStation[], first = 0, last = stations.length - 1): LandmarkUnit[] {
  return stations.slice(first, last + 1).map((station) => ({
    stationIndex: station.stationIndex,
    landmarks: [station.landmark, ...station.subagents],
  }));
}

function sectionBounds(stations: MapStation[], focusStationIndex: number): [number, number] {
  const isBoundary = (kind: MapLandmark["kind"]) => kind === "objective" || kind === "milestone" || kind === "outcome";
  let first = 0;
  let last = stations.length - 1;
  for (let index = focusStationIndex - 1; index >= 0; index -= 1) {
    if (isBoundary(stations[index].landmark.kind)) {
      first = index;
      break;
    }
  }
  for (let index = focusStationIndex + 1; index < stations.length; index += 1) {
    if (isBoundary(stations[index].landmark.kind)) {
      last = index;
      break;
    }
  }
  return [first, last];
}

function sortTargets(targets: SessionMapTarget[], viewItems: ViewItem[]): SessionMapTarget[] {
  const viewIndexById = new Map(viewItems.map((item, index) => [item.id, index]));
  return targets.slice().sort((left, right) => {
    const leftStation = left.type === "landmark" ? left.stationIndex : left.firstStationIndex;
    const rightStation = right.type === "landmark" ? right.stationIndex : right.firstStationIndex;
    if (leftStation !== rightStation) return leftStation - rightStation;
    const leftId = left.type === "landmark" ? left.viewItemId : left.sourceViewItemIds[0];
    const rightId = right.type === "landmark" ? right.viewItemId : right.sourceViewItemIds[0];
    const leftIndex = viewIndexById.get(leftId) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = viewIndexById.get(rightId) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.id.localeCompare(right.id);
  });
}

export function buildSessionMapProjection(
  doc: SessionDocument,
  viewItems: ViewItem[],
  level: MapZoomLevel,
  focusId: string | null,
): SessionMapProjection {
  const stations = buildMapStations(doc, viewItems);
  const focusStationIndex = findFocusStation(stations, focusId);
  let targets: SessionMapTarget[] = [];

  if (level === "global") {
    const units = projectionUnits(stations);
    const exactFocus = units.flatMap((unit) => unit.landmarks).find((target) => target.viewItemId === focusId) ?? null;
    const focusKnown = Boolean(focusId) && stations.some((station) => (
      station.landmark.viewItemId === focusId
      || station.ribs.some((rib) => rib.viewItemId === focusId)
      || station.subagents.some((subagent) => subagent.viewItemId === focusId)
    ));
    const preserve = focusKnown ? exactFocus ?? stations[focusStationIndex]?.landmark ?? null : null;
    targets = boundedTargets(units, level, MAX_GLOBAL_TARGETS, preserve);
  } else if (level === "section") {
    const [first, last] = sectionBounds(stations, focusStationIndex);
    const focusStation = stations[focusStationIndex];
    const ribCluster = focusStation?.ribs.length ? makeCluster(level, focusStation.ribs) : null;
    const maxBaseTargets = MAX_SECTION_TARGETS - (ribCluster ? 1 : 0);
    targets = boundedTargets(projectionUnits(stations, first, last), level, maxBaseTargets, focusStation?.landmark ?? null);
    if (ribCluster) targets.push(ribCluster);
  } else {
    const first = Math.max(0, focusStationIndex - DETAIL_STATION_RADIUS);
    const last = Math.min(stations.length - 1, focusStationIndex + DETAIL_STATION_RADIUS);
    const focusStation = stations[focusStationIndex];
    targets = projectionUnits(stations, first, last).flatMap((unit) => unit.landmarks);
    if (focusStation) targets.push(...focusStation.ribs);
  }

  return {
    level,
    focusStationIndex,
    targets: sortTargets(targets, viewItems),
    totalStations: stations.length,
    totalRibs: stations.reduce((total, station) => total + station.ribs.length, 0),
  };
}

export function buildGlobalSessionMapProjection(
  doc: SessionDocument,
  viewItems: ViewItem[],
  currentViewItemId: string | null,
): SessionMapProjection {
  return buildSessionMapProjection(doc, viewItems, "global", currentViewItemId);
}

export function resolveSessionMapSelection(
  projection: SessionMapProjection,
  selectionId: string | null,
): SessionMapTarget | null {
  if (selectionId) {
    const selected = projection.targets.find((target) => (
      target.id === selectionId || (target.type === "landmark" && target.viewItemId === selectionId)
    ));
    if (selected) return selected;
  }
  return projection.targets.find((target) => (
    target.type === "landmark" && target.stationIndex === projection.focusStationIndex
  )) ?? null;
}

export function canJumpToMapTarget(target: SessionMapTarget | null, viewItems: ViewItem[]): target is MapLandmark {
  if (!target || target.type !== "landmark") return false;
  return viewItems.some((item) => item.id === target.viewItemId);
}
