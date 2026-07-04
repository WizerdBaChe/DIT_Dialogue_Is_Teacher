/**
 * 逐節點講解的 prompt 組裝 (與 Provider 解耦，便於共用與調校)。
 * 要求模型回傳嚴格 JSON：{ what, why, generalLesson, confidence }。
 */
import type { Span } from "@/types/spanTree";
import type { AnnotateContext } from "./types";

export const SYSTEM_PROMPT =
  "你是一位資深工程師，正在把 AI coding agent 的單一操作步驟解說給想學習的開發者聽。" +
  "請只輸出 JSON 物件，欄位為 what(這步在做什麼)、why(為什麼這樣做)、generalLesson(可遷移的通用做法)、confidence(0~1 數字)。" +
  "用繁體中文，每欄一到兩句、精煉、聚焦可學習的重點，不要客套。";

/** 把 span 濃縮成精簡的描述文字 (避免把超長輸出整包丟給小模型)。 */
function describeSpan(span: Span): string {
  const head = `[${span.type}] ${span.summary}`;
  if (span.type === "tool_use" && span.tool) {
    return `${head}\n參數: ${JSON.stringify(span.tool.params).slice(0, 400)}`;
  }
  if (span.type === "tool_result" && span.result) {
    return `${head}\n輸出(節錄): ${span.result.text.slice(0, 400)}`;
  }
  return `${head}\n內容: ${span.text.slice(0, 600)}`;
}

export function buildUserPrompt(span: Span, ctx: AnnotateContext): string {
  return [
    `任務主題：${ctx.sessionTitle}`,
    ctx.prevSummary ? `上一步：${ctx.prevSummary}` : null,
    `本步驟：\n${describeSpan(span)}`,
    "請輸出 JSON。",
  ]
    .filter(Boolean)
    .join("\n\n");
}
