/**
 * 逐節點講解的 prompt 組裝 (與 Provider 解耦，便於共用與調校)。
 * 要求模型回傳嚴格 JSON：{ what, why, generalLesson, confidence }。
 * 輸出語言跟隨 UI 語言 (R7)：locale 決定 system/user prompt 的措辭與要求的回覆語言。
 */
import type { Span } from "@/types/spanTree";
import type { AnnotateContext } from "./types";

type PromptLocale = "zh-TW" | "en";

const SYSTEM_PROMPT_BY_LOCALE: Record<PromptLocale, string> = {
  "zh-TW":
    "你是一位資深工程師，正在把 AI coding agent 的單一操作步驟解說給想學習的開發者聽。" +
    "請只輸出 JSON 物件，欄位為 what(這步在做什麼)、why(為什麼這樣做)、generalLesson(可遷移的通用做法)、confidence(0~1 數字)。" +
    "用繁體中文，每欄一到兩句、精煉、聚焦可學習的重點，不要客套。",
  en:
    "You are a senior engineer explaining a single action step of an AI coding agent to a developer who wants to learn. " +
    "Output only a JSON object with fields what (what this step does), why (why it's done this way), generalLesson (a transferable general practice), and confidence (a number 0-1). " +
    "Write in English, one or two sentences per field, concise, focused on the learnable point, no pleasantries.",
};

/** 取得對應語言的 system prompt (未指定時預設繁體中文)。 */
export function buildSystemPrompt(locale: PromptLocale = "zh-TW"): string {
  return SYSTEM_PROMPT_BY_LOCALE[locale];
}

/** 保留舊名以相容 (預設繁中)；新程式請改用 buildSystemPrompt(locale)。 */
export const SYSTEM_PROMPT = SYSTEM_PROMPT_BY_LOCALE["zh-TW"];

const USER_LABELS: Record<PromptLocale, { task: string; prev: string; step: string; params: string; output: string; content: string; emit: string }> = {
  "zh-TW": { task: "任務主題", prev: "上一步", step: "本步驟", params: "參數", output: "輸出(節錄)", content: "內容", emit: "請輸出 JSON。" },
  en: { task: "Task", prev: "Previous step", step: "This step", params: "Params", output: "Output (excerpt)", content: "Content", emit: "Output JSON." },
};

/** 把 span 濃縮成精簡的描述文字 (避免把超長輸出整包丟給小模型)。 */
function describeSpan(span: Span, L: (typeof USER_LABELS)[PromptLocale]): string {
  const head = `[${span.type}] ${span.summary}`;
  if (span.type === "tool_use" && span.tool) {
    return `${head}\n${L.params}: ${JSON.stringify(span.tool.params).slice(0, 400)}`;
  }
  if (span.type === "tool_result" && span.result) {
    return `${head}\n${L.output}: ${span.result.text.slice(0, 400)}`;
  }
  return `${head}\n${L.content}: ${span.text.slice(0, 600)}`;
}

export function buildUserPrompt(span: Span, ctx: AnnotateContext): string {
  const L = USER_LABELS[ctx.locale ?? "zh-TW"];
  return [
    `${L.task}：${ctx.sessionTitle}`,
    ctx.prevSummary ? `${L.prev}：${ctx.prevSummary}` : null,
    `${L.step}：\n${describeSpan(span, L)}`,
    L.emit,
  ]
    .filter(Boolean)
    .join("\n\n");
}
