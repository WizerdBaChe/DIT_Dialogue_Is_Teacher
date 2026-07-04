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
    const events: RawEvent[] = [];
    const warnings: string[] = [];
    const meta: ParseResult["meta"] = {
      source: "claude-code",
      tool: "claude-code",
    };

    const lines = raw.split(/\r?\n/);
    let lineNo = 0;

    for (const line of lines) {
      lineNo++;
      const trimmed = line.trim();
      if (!trimmed) continue;

      let o: Record<string, unknown>;
      try {
        o = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        warnings.push(`第 ${lineNo} 行 JSON 解析失敗，已略過。`);
        continue;
      }

      const type = o.type as string | undefined;
      const uuid = o.uuid as string | undefined;
      const parentUuid = (o.parentUuid as string | null | undefined) ?? null;
      const timestamp = (o.timestamp as string | undefined) ?? null;
      const isSidechain = Boolean(o.isSidechain);

      // ---- session 後設資料蒐集 ----
      if (typeof o.sessionId === "string" && !meta.id) meta.id = o.sessionId;
      if (typeof o.cwd === "string" && !meta.projectPath) meta.projectPath = o.cwd;
      if (timestamp && !meta.startedAt) meta.startedAt = timestamp;

      switch (type) {
        case "ai-title": {
          if (typeof o.aiTitle === "string") meta.title = o.aiTitle;
          break;
        }

        case "assistant": {
          const message = o.message as { content?: unknown; model?: string } | undefined;
          if (message && typeof message.model === "string" && !meta.model) meta.model = message.model;
          const content = message?.content;
          if (Array.isArray(content)) {
            for (const block of content as ContentBlock[]) {
              if (!block || typeof block !== "object") continue;
              if (block.type === "text" && block.text?.trim()) {
                events.push({ kind: "assistant_text", uuid, parentUuid, timestamp, isSidechain, text: block.text, raw: block });
              } else if (block.type === "thinking" && block.thinking?.trim()) {
                events.push({ kind: "thinking", uuid, parentUuid, timestamp, isSidechain, text: block.thinking, raw: block });
              } else if (block.type === "tool_use") {
                events.push({
                  kind: "tool_use", uuid, parentUuid, timestamp, isSidechain,
                  toolName: block.name ?? "unknown",
                  toolInput: block.input ?? {},
                  toolUseId: block.id,
                  raw: block,
                });
              }
            }
          } else if (typeof content === "string" && content.trim()) {
            events.push({ kind: "assistant_text", uuid, parentUuid, timestamp, isSidechain, text: content, raw: o });
          }
          break;
        }

        case "user": {
          const message = o.message as { content?: unknown } | undefined;
          const content = message?.content;
          if (typeof content === "string") {
            if (content.trim()) events.push({ kind: "user_text", uuid, parentUuid, timestamp, isSidechain, text: content, raw: o });
          } else if (Array.isArray(content)) {
            for (const block of content as ContentBlock[]) {
              if (!block || typeof block !== "object") continue;
              if (block.type === "text" && block.text?.trim()) {
                events.push({ kind: "user_text", uuid, parentUuid, timestamp, isSidechain, text: block.text, raw: block });
              } else if (block.type === "tool_result") {
                events.push({
                  kind: "tool_result", uuid, parentUuid, timestamp, isSidechain,
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

        // 已知噪音型別：靜默略過。
        case "attachment":
        case "file-history-snapshot":
        case "mode":
        case "last-prompt":
        case "queue-operation":
          break;

        default:
          if (type) warnings.push(`第 ${lineNo} 行未知型別 "${type}"，已略過。`);
          break;
      }
    }

    if (events.length === 0) warnings.push("未從輸入中解析出任何可呈現的事件。");
    return { meta, events, warnings };
  },
};
