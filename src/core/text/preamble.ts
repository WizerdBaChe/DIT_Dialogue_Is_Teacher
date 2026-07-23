/**
 * Source-injected preamble 剝除（PSM R7.5 §3.1／R7.5-INV-1／INV-3）。
 * 跨來源共用的白名單版剝除：只吃掉已知注入標籤包裹的前置區塊，以及 `#` 標頭附件；
 * 白名單外的 `<tag>` 一律視為使用者內容、原樣保留，避免誤剝使用者貼上的真實 XML/HTML。
 */

/** 已知注入標籤白名單（單一定義點；新增來源只改這裡）。 */
export const INJECTION_TAGS = [
  "recommended_plugins",
  "INSTRUCTIONS",
  "environment_context",
  "command-name",
  "command-message",
  "command-args",
  "local-command-stdout",
  "system-reminder",
] as const;

const TAG_PATTERN = INJECTION_TAGS.map((tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const INJECTION_XML_BLOCK_RE = new RegExp(`^<(${TAG_PATTERN})>[\\s\\S]*?<\\/\\1>`);
const HEADER_LINE_RE = /^#[^\n]*\n?/;
const HEADER_CONTINUATION_RE = /^(?:[ \t]+[^\n]*\n?|[-*][ \t][^\n]*\n?|\d+[.)][ \t][^\n]*\n?|[ \t]*\n)/;
/** 安全上限，避免病態輸入 (標籤永不閉合等) 造成無限迴圈；真實訊息不會疊這麼多層。 */
const STRIP_ITERATION_LIMIT = 50;

/**
 * 剝除合成的附件／系統前言區塊，直到遇到真正的一般文字行為止：
 * - 白名單標籤（`INJECTION_TAGS`）包裹的區塊，即使收尾標籤跟下一段標頭黏在同一行
 *   （`</recommended_plugins># AGENTS.md instructions`）也能正確處理，因為是對整段文字
 *   做正則比對，不是逐行狀態機。
 * - 以 `#` 開頭的標頭行，及其後續縮排／清單內容（如 Codex 的「# Files mentioned by the
 *   user」附件展開）。
 * 白名單外的 `<tag>`（如使用者自己貼上的 XML/HTML）不匹配，原樣保留。
 * 找不到對應收尾標籤／不再匹配任何一種區塊時就停止，不猜測、保留原文。
 */
export function stripInjectedPreamble(text: string): string {
  let result = text.replace(/^\s+/, "");
  for (let i = 0; i < STRIP_ITERATION_LIMIT; i += 1) {
    const xmlMatch = INJECTION_XML_BLOCK_RE.exec(result);
    if (xmlMatch) {
      result = result.slice(xmlMatch[0].length).replace(/^\s+/, "");
      continue;
    }
    const headerMatch = HEADER_LINE_RE.exec(result);
    if (headerMatch) {
      let rest = result.slice(headerMatch[0].length);
      let contMatch: RegExpExecArray | null;
      while ((contMatch = HEADER_CONTINUATION_RE.exec(rest))) rest = rest.slice(contMatch[0].length);
      result = rest.replace(/^\s+/, "");
      continue;
    }
    break;
  }
  return result;
}
