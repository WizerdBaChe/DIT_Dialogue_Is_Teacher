/**
 * 與語言無關的視覺常數 (節點記號、CSS class 後綴)。
 * 所有面向使用者的文字已移入 src/i18n/locales.ts；此檔只留純視覺對照。
 * 依 ADR-016：一律用排印/幾何記號，不用 emoji。
 */
import type { SkeletonNodeKind, SkeletonRibKind, SpanType } from "@/types/spanTree";

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
