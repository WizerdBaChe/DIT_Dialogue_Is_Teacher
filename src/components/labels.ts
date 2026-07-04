/** 顯示用文字對照 (集中管理，避免散落各元件)。 */
import type { ProviderId, SkeletonNodeKind, SkeletonRibKind, SpanTag, SpanType } from "@/types/spanTree";

export const SPAN_KIND_LABEL: Record<SpanType, string> = {
  user_msg: "使用者意圖",
  assistant_msg: "回覆",
  thinking: "思考",
  tool_use: "操作",
  tool_result: "結果",
  subagent: "子代理",
  group: "群組",
};

export const TAG_LABEL: Record<SpanTag, string> = {
  milestone: "里程碑",
  decision: "決策點",
  retry: "重試",
  error: "錯誤",
};

export const SPAN_DOT: Record<SpanType, string> = {
  user_msg: "●",
  assistant_msg: "💬",
  thinking: "🧠",
  tool_use: "⚙",
  tool_result: "↳",
  subagent: "🤖",
  group: "📦",
};

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  none: "不講解（純結構，零外傳）",
  ollama: "本地 Ollama（離線）",
  cloud: "雲端 API（需外傳）",
};

/** 魚骨主線節點的種類樣式 (icon + 中文 + CSS class 後綴)。 */
export const SKELETON_NODE_META: Record<SkeletonNodeKind, { icon: string; label: string; cls: string }> = {
  objective: { icon: "🎯", label: "目標", cls: "objective" },
  decision: { icon: "✦", label: "決策", cls: "decision" },
  milestone: { icon: "◆", label: "里程碑", cls: "milestone" },
  outcome: { icon: "🏁", label: "結果", cls: "outcome" },
};

/** 魚骨支線的種類樣式。 */
export const SKELETON_RIB_META: Record<SkeletonRibKind, { icon: string; label: string; cls: string }> = {
  investigation: { icon: "🔍", label: "取證", cls: "investigation" },
  error: { icon: "⚠", label: "錯誤", cls: "error" },
  retry: { icon: "↻", label: "重試", cls: "retry" },
  "edit-loop": { icon: "✎", label: "反覆修改", cls: "edit-loop" },
};

export const PROVIDER_DISCLAIMER: Record<ProviderId, string> = {
  none: "🔒 不講解：僅做本地結構化與降噪，沒有任何資料離開你的裝置。",
  ollama: "🏠 本地 Ollama：講解由你機器上的模型產生，程式碼與紀錄不會外傳。連線狀態與模型設定見下方面板。",
  cloud: "☁️ 雲端 API：你的 session 片段將傳送至外部服務以產生講解。請確認內容不含機密；是否外傳由你知情選擇，責任歸使用者。設定見下方面板（目前為預留骨架，尚未實際接上）。",
};
