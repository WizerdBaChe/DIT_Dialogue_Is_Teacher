import type { SessionDocument, SkeletonNodeKind, SkeletonRibKind } from "@/types/spanTree";
import { reportFallback } from "@/core/diagnostics";
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
  /** 全域主線站序 (0-based)；三個縮放層級共用同一套編號。 */
  stationIndex: number;
  /** 掛在站底下的子項序號 (1-based)；主線站本身為 null。 */
  subIndex: number | null;
  kind: SkeletonNodeKind | SkeletonRibKind | "subagent";
  label: string;
  parentStationId: string | null;
  ribCount: number;
  ribKindCounts: Record<string, number>;
  /** 掛在這一站底下的子代理數量；子代理與支線一樣受縮放階梯管，全局層只顯示計數。 */
  subagentCount: number;
}

/** 聚合列的性質：區間聚合，或掛在某一站底下的支線／子代理群組。 */
export type MapClusterKind = "range" | "ribs" | "subagents";

export interface MapCluster {
  type: "cluster";
  id: string;
  sourceViewItemIds: string[];
  firstStationIndex: number;
  lastStationIndex: number;
  count: number;
  kindCounts: Record<string, number>;
  label: string;
  /** 站底下的群組會指向所屬主線站；一般的區間聚合為 null。 */
  parentStationId: string | null;
  groupKind: MapClusterKind;
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
  /** 取景中心：投影以哪一站為中心裁切。與「閱讀位置」是兩件事。 */
  focusStationIndex: number;
  /** 取景中心是不是真的定位成功；false 代表 focusStationIndex 只是不得已的預設值。 */
  focusResolved: boolean;
  /** 閱讀位置所屬的主線站；不在骨架內時為 null。 */
  currentStationIndex: number | null;
  targets: SessionMapTarget[];
  totalStations: number;
  totalRibs: number;
}

/** 沒有文件可投影時的空投影；集中定義，避免呼叫端各自寫一份而漏欄位。 */
export const EMPTY_SESSION_MAP_PROJECTION: SessionMapProjection = {
  level: "global",
  focusStationIndex: 0,
  focusResolved: false,
  currentStationIndex: null,
  targets: [],
  totalStations: 0,
  totalRibs: 0,
};

/**
 * 是否畫在主線 (spine) 上 —— 只有主線站。
 * 支線、子代理與它們的群組列都是站的子項，只進地標清單；
 * 三個縮放層級的圖形因此永遠是同一條主線，不會有節點忽隱忽現或被子代理撐長。
 */
export function isSpineTarget(target: SessionMapTarget): boolean {
  return target.parentStationId === null;
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
      subIndex: ribIndex + 1,
      kind: rib.kind,
      label: rib.label,
      parentStationId: stationId,
      ribCount: 0,
      ribKindCounts: {},
      subagentCount: 0,
    }));
    return {
      stationIndex,
      landmark: {
        type: "landmark",
        id: stationId,
        viewItemId: station.viewItemId,
        stationIndex,
        subIndex: null,
        kind: station.kind,
        label: station.label,
        parentStationId: null,
        ribCount: ribs.length,
        ribKindCounts: countKinds(ribs),
        subagentCount: 0,
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
    const itemIndex = viewIndexById.get(item.id);
    if (itemIndex === undefined) {
      reportFallback("sessionMap/attachSubagent", "subagent-not-in-view-model", { viewItemId: item.id });
      continue;
    }
    let parentStationIndex = 0;
    for (let index = 0; index < model.length; index += 1) {
      const stationViewIndex = viewIndexById.get(model[index].landmark.viewItemId);
      // 位置不明的站不參與掛載判斷；當成 index 0 會把子代理全部吸到第一站。
      if (stationViewIndex === undefined) {
        reportFallback("sessionMap/attachSubagent", "station-not-in-view-model", {
          stationViewItemId: model[index].landmark.viewItemId,
        });
        continue;
      }
      if (stationViewIndex <= itemIndex) parentStationIndex = index;
      else break;
    }
    const parent = model[parentStationIndex];
    parent.subagents.push({
      type: "landmark",
      id: `landmark:subagent:${item.id}`,
      viewItemId: item.id,
      stationIndex: parentStationIndex,
      subIndex: parent.ribs.length + parent.subagents.length + 1,
      kind: "subagent",
      label: item.group.label,
      parentStationId: parent.landmark.id,
      ribCount: 0,
      ribKindCounts: {},
      subagentCount: 0,
    });
  }
  for (const station of model) station.landmark.subagentCount = station.subagents.length;
  return model;
}

/** 找出 viewItem 所屬的主線站；找不到回傳 -1。 */
function findStationIndex(stations: MapStation[], viewItemId: string | null): number {
  if (!viewItemId) return -1;
  return stations.findIndex((station) => (
    station.landmark.viewItemId === viewItemId
    || station.ribs.some((rib) => rib.viewItemId === viewItemId)
    || station.subagents.some((subagent) => subagent.viewItemId === viewItemId)
  ));
}

/**
 * 取景中心站。裁切一定需要一個基準站，所以定位失敗時仍退回第 0 站，
 * 但會回報 resolved=false —— UI 必須改說「無法定位」，不可假裝錨在第 1 站。
 */
function findFocusStation(stations: MapStation[], focusId: string | null): { index: number; resolved: boolean } {
  const index = findStationIndex(stations, focusId);
  if (index >= 0) return { index, resolved: true };
  if (focusId && stations.length > 0) {
    reportFallback("sessionMap/findFocusStation", "focus-id-not-in-skeleton", { focusId, stationCount: stations.length });
  }
  return { index: 0, resolved: false };
}

function makeCluster(
  level: MapZoomLevel,
  landmarks: MapLandmark[],
  parentStationId: string | null = null,
  groupKind: MapClusterKind = "range",
): MapCluster {
  const sourceViewItemIds = [...new Set(landmarks.map((target) => target.viewItemId))];
  const firstStationIndex = Math.min(...landmarks.map((target) => target.stationIndex));
  const lastStationIndex = Math.max(...landmarks.map((target) => target.stationIndex));
  return {
    type: "cluster",
    parentStationId,
    groupKind,
    id: `cluster:${level}:${groupKind}:${firstStationIndex}:${lastStationIndex}`,
    sourceViewItemIds,
    firstStationIndex,
    lastStationIndex,
    count: sourceViewItemIds.length,
    kindCounts: countKinds(landmarks),
    label: firstStationIndex === lastStationIndex
      ? `${firstStationIndex + 1} · ${sourceViewItemIds.length}`
      : `${firstStationIndex + 1}–${lastStationIndex + 1} · ${sourceViewItemIds.length}`,
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

/** 投影的基底單位只有主線站；支線與子代理另外依縮放層級決定要不要展開。 */
function projectionUnits(stations: MapStation[], first = 0, last = stations.length - 1): LandmarkUnit[] {
  return stations.slice(first, last + 1).map((station) => ({
    stationIndex: station.stationIndex,
    landmarks: [station.landmark],
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

/** 區段層要為多少「站的子項摘要列」保留名額 (支線一列、子代理一列)。 */
function stationChildBudget(stations: MapStation[], first: number, last: number): number {
  return stations.slice(first, last + 1)
    .reduce((total, station) => total + (station.ribs.length ? 1 : 0) + (station.subagents.length ? 1 : 0), 0);
}

/**
 * 為範圍內「每一個仍以主線站身分留在投影裡」的站產生子項摘要列 (支線群組 / 子代理群組)。
 * 被聚合掉的站不給群組列，否則清單會出現找不到母節點的孤兒列。
 * 名額不足時焦點站優先，其餘按站序保留。
 */
function stationChildGroups(
  stations: MapStation[],
  first: number,
  last: number,
  baseTargets: SessionMapTarget[],
  budget: number,
  focusStationIndex: number,
): MapCluster[] {
  if (budget <= 0) return [];
  const survivingStationIds = new Set(baseTargets
    .filter((target): target is MapLandmark => target.type === "landmark" && target.parentStationId === null)
    .map((target) => target.id));
  const entries: Array<{ stationIndex: number; cluster: MapCluster }> = [];
  for (const station of stations.slice(first, last + 1)) {
    if (!survivingStationIds.has(station.landmark.id)) continue;
    if (station.ribs.length > 0) {
      entries.push({ stationIndex: station.stationIndex, cluster: makeCluster("section", station.ribs, station.landmark.id, "ribs") });
    }
    if (station.subagents.length > 0) {
      entries.push({ stationIndex: station.stationIndex, cluster: makeCluster("section", station.subagents, station.landmark.id, "subagents") });
    }
  }
  entries.sort((left, right) => {
    const leftFocus = left.stationIndex === focusStationIndex;
    const rightFocus = right.stationIndex === focusStationIndex;
    if (leftFocus !== rightFocus) return leftFocus ? -1 : 1;
    return left.stationIndex - right.stationIndex;
  });
  return entries.slice(0, budget).map((entry) => entry.cluster);
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
  currentViewItemId: string | null = focusId,
): SessionMapProjection {
  const stations = buildMapStations(doc, viewItems);
  const { index: focusStationIndex, resolved: focusResolved } = findFocusStation(stations, focusId);
  const currentIndex = findStationIndex(stations, currentViewItemId);
  const currentStationIndex = currentIndex >= 0 ? currentIndex : null;
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
    // 區段 = 本章節範圍內「每一站」各一列支線／子代理摘要，不是只有焦點站。
    const [first, last] = sectionBounds(stations, focusStationIndex);
    const focusStation = stations[focusStationIndex];
    const maxBaseTargets = Math.max(1, MAX_SECTION_TARGETS - stationChildBudget(stations, first, last));
    targets = boundedTargets(projectionUnits(stations, first, last), level, maxBaseTargets, focusStation?.landmark ?? null);
    targets.push(...stationChildGroups(stations, first, last, targets, MAX_SECTION_TARGETS - targets.length, focusStationIndex));
  } else {
    // 細節 = 焦點鄰近範圍內「每一站」的支線與子代理逐條列出，同樣全範圍生效。
    const first = Math.max(0, focusStationIndex - DETAIL_STATION_RADIUS);
    const last = Math.min(stations.length - 1, focusStationIndex + DETAIL_STATION_RADIUS);
    targets = projectionUnits(stations, first, last).flatMap((unit) => unit.landmarks);
    for (const station of stations.slice(first, last + 1)) targets.push(...station.ribs, ...station.subagents);
  }

  return {
    level,
    focusStationIndex,
    focusResolved,
    currentStationIndex,
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
    target.type === "landmark" && target.parentStationId === null && target.stationIndex === projection.focusStationIndex
  )) ?? null;
}

/**
 * 「你在這裡」該掛在哪個主線節點上。
 * 先找完全命中閱讀位置的節點；閱讀位置若是支線 (不畫在主線上)，退回它所屬的主線站。
 * 回傳 null 代表閱讀位置不在目前投影範圍內，呼叫端應改為提示「目前位置不在此檢視」。
 */
export function resolveCurrentSpineTargetId(
  projection: SessionMapProjection,
  currentViewItemId: string | null,
): string | null {
  if (!currentViewItemId) return null;
  const spine = projection.targets.filter(isSpineTarget);
  const exact = spine.find((target) => target.type === "landmark" && target.viewItemId === currentViewItemId);
  if (exact) return exact.id;
  if (projection.currentStationIndex === null) return null;
  const station = spine.find((target) => (
    target.type === "landmark"
    && target.parentStationId === null
    && target.stationIndex === projection.currentStationIndex
  ));
  return station?.id ?? null;
}

/**
 * 選取的目標若是支線／子代理／聚合節點（不畫在主線上），視覺中心該掛在哪個主線站。
 * 與 resolveCurrentSpineTargetId 同一套邏輯，只是輸入從 viewItemId 換成已知的站序，
 * 讓 SessionMapGraphic 的取景/捲動能對齊到正確的主線節點，而不是誤配到「你在這裡」。
 */
export function resolveStationSpineId(
  projection: SessionMapProjection,
  stationIndex: number | null,
): string | null {
  if (stationIndex === null) return null;
  const spine = projection.targets.filter(isSpineTarget);
  const station = spine.find((target) => (
    target.type === "landmark" && target.parentStationId === null && target.stationIndex === stationIndex
  ));
  return station?.id ?? null;
}

export function canJumpToMapTarget(target: SessionMapTarget | null, viewItems: ViewItem[]): target is MapLandmark {
  if (!target || target.type !== "landmark") return false;
  return viewItems.some((item) => item.id === target.viewItemId);
}
