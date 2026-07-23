/**
 * ClaudeCodeJsonlAdapter
 * 解析 Claude Code 的 session transcript (~/.claude/projects/<專案>/*.jsonl)。
 *
 * 已驗證的真實格式 (見 RPD)：
 * - 每行一個 JSON 物件，有 `type` 欄位。
 * - type === "assistant"：message.content[] 含 text / tool_use / thinking 區塊。
 * - type === "user"：message.content 可為字串，或含 text / tool_result 區塊的陣列。
 * - type === "ai-title"：提供 session 標題。
 * - 其餘 (attachment / file-history-snapshot / mode / last-prompt / queue-operation) 為噪音，略過。
 *
 * 容錯原則 (可自檢)：單行 JSON 解析失敗只記 warning 並跳過，絕不整體拋例外。
 */
import type { SourceAdapter, ParseResult, RawEvent } from "./types";
import { stripInjectedPreamble } from "@/core/text/preamble";

interface ContentBlock {
  type?: string;
  text?: string;
  thinking?: string;
  // tool_use
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  // tool_result
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

/** 將 tool_result 的 content (字串或區塊陣列) 攤平成純文字。 */
function flattenResultContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === "string") return c;
        if (c && typeof c === "object" && "text" in c) return String((c as ContentBlock).text ?? "");
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object" && "text" in (content as object)) {
    return String((content as ContentBlock).text ?? "");
  }
  return "";
}

/** Incremental Claude Code JSONL parser used by both string fixtures and streamed files. */
export class ClaudeCodeJsonlAccumulator {
  private readonly events: RawEvent[] = [];
  private readonly warnings: string[] = [];
  private readonly meta: ParseResult["meta"] = {
    source: "claude-code",
    tool: "claude-code",
  };
  private lineNo = 0;

  pushLine(line: string): void {
    this.lineNo += 1;
    const trimmed = line.trim();
    if (!trimmed) return;

    let record: Record<string, unknown>;
    try {
      record = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      this.warnings.push(`第 ${this.lineNo} 行 JSON 解析失敗，已略過。`);
      return;
    }

    const type = record.type as string | undefined;
    const uuid = record.uuid as string | undefined;
    const parentUuid = (record.parentUuid as string | null | undefined) ?? null;
    const timestamp = (record.timestamp as string | undefined) ?? null;
    const isSidechain = Boolean(record.isSidechain);

    if (typeof record.sessionId === "string" && !this.meta.id) this.meta.id = record.sessionId;
    if (typeof record.cwd === "string" && !this.meta.projectPath) this.meta.projectPath = record.cwd;
    if (timestamp && !this.meta.startedAt) this.meta.startedAt = timestamp;

    switch (type) {
      case "ai-title": {
        if (typeof record.aiTitle === "string") this.meta.title = record.aiTitle;
        break;
      }

      case "assistant": {
        const message = record.message as { content?: unknown; model?: string } | undefined;
        if (message && typeof message.model === "string" && !this.meta.model) this.meta.model = message.model;
        const content = message?.content;
        if (Array.isArray(content)) {
          for (const block of content as ContentBlock[]) {
            if (!block || typeof block !== "object") continue;
            if (block.type === "text" && block.text?.trim()) {
              this.events.push({ kind: "assistant_text", uuid, parentUuid, timestamp, isSidechain, text: block.text, raw: block });
            } else if (block.type === "thinking" && block.thinking?.trim()) {
              this.events.push({ kind: "thinking", uuid, parentUuid, timestamp, isSidechain, text: block.thinking, raw: block });
            } else if (block.type === "tool_use") {
              this.events.push({
                kind: "tool_use",
                uuid,
                parentUuid,
                timestamp,
                isSidechain,
                toolName: block.name ?? "unknown",
                toolInput: block.input ?? {},
                toolUseId: block.id,
                raw: block,
              });
            }
          }
        } else if (typeof content === "string" && content.trim()) {
          this.events.push({ kind: "assistant_text", uuid, parentUuid, timestamp, isSidechain, text: content, raw: record });
        }
        break;
      }

      case "user": {
        const message = record.message as { content?: unknown } | undefined;
        const content = message?.content;
        if (typeof content === "string") {
          const text = stripInjectedPreamble(content);
          if (text.trim()) this.events.push({ kind: "user_text", uuid, parentUuid, timestamp, isSidechain, text, raw: record });
        } else if (Array.isArray(content)) {
          for (const block of content as ContentBlock[]) {
            if (!block || typeof block !== "object") continue;
            if (block.type === "text" && block.text?.trim()) {
              const text = stripInjectedPreamble(block.text);
              if (text.trim()) this.events.push({ kind: "user_text", uuid, parentUuid, timestamp, isSidechain, text, raw: block });
            } else if (block.type === "tool_result") {
              this.events.push({
                kind: "tool_result",
                uuid,
                parentUuid,
                timestamp,
                isSidechain,
                text: flattenResultContent(block.content),
                toolUseId: block.tool_use_id,
                isError: Boolean(block.is_error),
                raw: block,
              });
            }
          }
        }
        break;
      }

      case "attachment":
      case "file-history-snapshot":
      case "mode":
      case "last-prompt":
      case "queue-operation":
        break;

      default:
        if (type) this.warnings.push(`第 ${this.lineNo} 行未知型別 "${type}"，已略過。`);
    }
  }

  finish(): ParseResult {
    if (this.events.length === 0) this.warnings.push("未從輸入中解析出任何可呈現的事件。");
    return { meta: this.meta, events: this.events, warnings: this.warnings };
  }
}

export const claudeCodeJsonlAdapter: SourceAdapter = {
  id: "claude-code",

  canParse(raw: string): boolean {
    const firstLine = raw.split(/\r?\n/).find((l) => l.trim().length > 0);
    if (!firstLine) return false;
    try {
      const o = JSON.parse(firstLine) as Record<string, unknown>;
      // CC 行普遍帶有 "type" 與 sessionId / message 等欄位。
      return typeof o.type === "string" && ("sessionId" in o || "message" in o || "aiTitle" in o);
    } catch {
      return false;
    }
  },

  parse(raw: string): ParseResult {
    const accumulator = new ClaudeCodeJsonlAccumulator();
    for (const line of raw.split(/\r?\n/)) accumulator.pushLine(line);
    return accumulator.finish();
  },

  createAccumulator(): ClaudeCodeJsonlAccumulator {
    return new ClaudeCodeJsonlAccumulator();
  },
};
