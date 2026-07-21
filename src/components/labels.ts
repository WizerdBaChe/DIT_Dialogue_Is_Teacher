/**
 * 與語言無關的視覺常數 (節點記號、CSS class 後綴)。
 * 所有面向使用者的文字已移入 src/i18n/locales.ts；此檔只留純視覺對照。
 * 依 ADR-016：一律用排印/幾何記號，不用 emoji。
 */
import type { SkeletonNodeKind, SkeletonRibKind, SpanType } from "@/types/spanTree";
import type { MapLandmark, SessionMapTarget } from "@/core/view/sessionMap";
import type { Messages } from "@/i18n";

/** 側欄樹狀目錄的節點記號 (幾何字元，非 emoji)。 */
export const SPAN_DOT: Record<SpanType, string> = {
  user_msg: "●",
  assistant_msg: "○",
  thinking: "◇",
  tool_use: "▸",
  tool_result: "↳",
  subagent: "◆",
  group: "■",
};

/** 群組卡片的節點記號。 */
export const GROUP_DOT = "■";

/** Span 層圖例的顯示順序 (Sidebar/Overview 說明圖例共用)。 */
export const SPAN_LEGEND_ORDER: SpanType[] = [
  "user_msg",
  "assistant_msg",
  "thinking",
  "tool_use",
  "tool_result",
  "subagent",
  "group",
];

/** 地圖地標種類 → 顯示文字 (span/skeleton 共用命名，Session Map 圖與地標清單同源)。 */
export function landmarkKindLabel(t: Messages, landmark: MapLandmark): string {
  if (landmark.kind === "subagent") return t.workspace.tabs.subagents;
  if (landmark.kind === "objective" || landmark.kind === "decision" || landmark.kind === "milestone" || landmark.kind === "outcome") {
    return t.skeletonNode[landmark.kind];
  }
  return t.skeletonRib[landmark.kind];
}

/**
 * 地圖節點序號：一律採全域主線站序，三個縮放層級不變。
 * 主線站 = `3`；掛在站底下的支線/子代理 = `3.2`；區間聚合 = `3–7`。
 */
export function mapTargetOrdinal(target: SessionMapTarget): string {
  if (target.type === "cluster") {
    return target.firstStationIndex === target.lastStationIndex
      ? `${target.firstStationIndex + 1}`
      : `${target.firstStationIndex + 1}–${target.lastStationIndex + 1}`;
  }
  return target.subIndex === null
    ? `${target.stationIndex + 1}`
    : `${target.stationIndex + 1}.${target.subIndex}`;
}

/** 魚骨主線節點種類 → CSS class 後綴。 */
export const SKELETON_NODE_CLS: Record<SkeletonNodeKind, string> = {
  objective: "objective",
  decision: "decision",
  milestone: "milestone",
  outcome: "outcome",
};

/** 魚骨支線種類 → CSS class 後綴。 */
export const SKELETON_RIB_CLS: Record<SkeletonRibKind, string> = {
  investigation: "investigation",
  error: "error",
  retry: "retry",
  "edit-loop": "edit-loop",
};
