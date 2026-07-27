/**
 * ClaudeCodeJsonlAdapter
 * 解析 Claude Code 的 session transcript (~/.claude/projects/<專案>/*.jsonl)。
 *
 * 已驗證的真實格式 (R9 全量掃描 140 個真實 .jsonl，見 PSM_R9 §1 RC-2)：
 * - 每行一個 JSON 物件，有 `type` 欄位。
 * - type === "assistant"：message.content[] 含 text / tool_use / thinking 區塊。
 * - type === "user"：message.content 可為字串，或含 text / tool_result 區塊的陣列。
 * - type === "custom-title" / "ai-title"：session 標題；custom（使用者手設）優先於 ai。
 * - type === "system"：**標準格式，不是特殊狀況**。以 `subtype` 分流 (見 SYSTEM_SUBTYPE_POLICY)：
 *     · compact_boundary — 對話在此被壓縮，先前歷史已被摘要取代。對「因果骨架」是結構性事件。
 *     · api_error / model_refusal_fallback — 真實發生過的事件。
 *     · stop_hook_summary / turn_duration / local_command — 無呈現內容的噪音。
 *   R9 之前這 539 筆全部落在未知型別分支，害得純對話 session 也會彈出強制提示 (RC-3)。
 * - type === "pr-link"：該 session 產出的 PR，收進 meta.prLinks。
 * - 其餘 (attachment / file-history-snapshot / mode / last-prompt / queue-operation /
 *   permission-mode) 為噪音，靜默略過。
 *
 * 容錯原則 (可自檢)：單行 JSON 解析失敗只記診斷並跳過，絕不整體拋例外；未知型別聚合成
 * 「型別 ×N」一則，不逐行洗版 (與 codexJsonl 同一紀律)。
 */
import type { Diagnostic } from "@/core/diagnostics/contracts";
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

/**
 * `type: "system"` 的處置政策。
 * "marker" = 在原時序位置產生一則自我解釋的標記事件（沿用 codexJsonl 對 turn_aborted /
 * context_compacted 的既有慣例，不另立第二套）；"noise" = 靜默略過，只計入 info 診斷。
 * 表外的 subtype 一律當 marker + 一則 info 診斷：不靜默丟棄，也不升級成警告。
 */
export type SystemSubtypePolicy = "marker" | "noise";

export const SYSTEM_SUBTYPE_POLICY: Record<string, SystemSubtypePolicy> = {
  compact_boundary: "marker",
  api_error: "marker",
  model_refusal_fallback: "marker",
  stop_hook_summary: "noise",
  turn_duration: "noise",
  local_command: "noise",
};

/** 完全沒有呈現價值、也不需要讓使用者知道的頂層型別。 */
const SILENT_NOISE_TYPES = new Set([
  "attachment",
  "file-history-snapshot",
  "mode",
  "last-prompt",
  "queue-operation",
  "permission-mode",
]);

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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

/** 標記事件的文字。與 codexJsonl 一樣寫成自我解釋的一句話，讀者不必知道 subtype 是什麼。 */
function markerText(subtype: string, record: Record<string, unknown>): string {
  if (subtype === "compact_boundary") {
    const metadata = asRecord(record.compactMetadata);
    const trigger = metadata?.trigger === "manual" ? "手動" : "自動";
    const preTokens = typeof metadata?.preTokens === "number" ? `，壓縮前約 ${metadata.preTokens} tokens` : "";
    return `對話歷史在此處被${trigger}壓縮${preTokens}；在這之前的內容已被摘要取代，原文不在這個檔案裡`;
  }
  if (subtype === "api_error") {
    const error = asRecord(record.error);
    const status = typeof error?.status === "number" ? `HTTP ${error.status}` : "未知狀態";
    const message = typeof error?.message === "string" ? error.message : "";
    return `API 呼叫發生錯誤（${status}）${message ? `：${message}` : ""}`;
  }
  if (subtype === "model_refusal_fallback") {
    const direction = typeof record.direction === "string" ? record.direction : "unknown";
    return `模型安全機制攔截了這一則訊息（處置：${direction}），系統改用備援路徑重試`;
  }
  const content = typeof record.content === "string" && record.content.trim() ? `：${record.content}` : "";
  return `系統事件「${subtype}」${content}`;
}

/** Incremental Claude Code JSONL parser used by both string fixtures and streamed files. */
export class ClaudeCodeJsonlAccumulator {
  private readonly events: RawEvent[] = [];
  private readonly meta: ParseResult["meta"] = {
    source: "claude-code",
    tool: "claude-code",
  };
  private lineNo = 0;

  // 聚合計數：診斷只在 finish() 產生，避免逐行洗版。
  private lineParseFailures = 0;
  private noiseSkipped = 0;
  private markersEmitted = 0;
  private readonly unknownTypeCounts = new Map<string, number>();
  private readonly unknownSubtypeCounts = new Map<string, number>();
  /** custom-title 一旦出現就鎖住標題，後續的 ai-title 不得覆蓋。 */
  private customTitleSeen = false;

  pushLine(line: string): void {
    this.lineNo += 1;
    const trimmed = line.trim();
    if (!trimmed) return;

    let record: Record<string, unknown>;
    try {
      record = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      this.lineParseFailures += 1;
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
      // 標題：一個檔案可能有多筆（改標題會再寫一行），取最後一筆才是現行標題。
      // 使用者手設的 custom-title 永遠勝過 AI 生成的 ai-title，不論出現順序。
      case "custom-title": {
        if (typeof record.customTitle === "string" && record.customTitle.trim()) {
          this.meta.title = record.customTitle;
          this.customTitleSeen = true;
        }
        break;
      }

      case "ai-title": {
        if (!this.customTitleSeen && typeof record.aiTitle === "string" && record.aiTitle.trim()) {
          this.meta.title = record.aiTitle;
        }
        break;
      }

      case "pr-link": {
        const url = record.prUrl;
        if (typeof url === "string") {
          (this.meta.prLinks ??= []).push({
            number: typeof record.prNumber === "number" ? record.prNumber : null,
            url,
            repository: typeof record.prRepository === "string" ? record.prRepository : null,
          });
        }
        break;
      }

      case "system": {
        const subtype = typeof record.subtype === "string" ? record.subtype : "";
        const policy = SYSTEM_SUBTYPE_POLICY[subtype];
        if (policy === "noise") {
          this.noiseSkipped += 1;
          break;
        }
        if (!policy) {
          // 沒見過的 subtype：照樣顯示（不靜默丟棄），但只給 info——這是「新版 CLI 多了東西」，
          // 不是「檔案壞了」，不該把使用者攔在強制彈窗前面 (R9 D5)。
          this.unknownSubtypeCounts.set(subtype || "(未指定)", (this.unknownSubtypeCounts.get(subtype || "(未指定)") ?? 0) + 1);
        }
        this.markersEmitted += 1;
        this.events.push({
          kind: "unknown",
          uuid,
          parentUuid,
          timestamp,
          isSidechain,
          text: markerText(subtype, record),
          raw: record,
        });
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

      default:
        if (type && SILENT_NOISE_TYPES.has(type)) this.noiseSkipped += 1;
        else if (type) this.unknownTypeCounts.set(type, (this.unknownTypeCounts.get(type) ?? 0) + 1);
    }
  }

  finish(): ParseResult {
    const diagnostics: Diagnostic[] = [];

    if (this.lineParseFailures > 0) {
      diagnostics.push({ tier: "warn", code: "LINE_PARSE_FAILED", count: this.lineParseFailures });
    }
    for (const [type, count] of this.unknownTypeCounts) {
      diagnostics.push({ tier: "warn", code: "UNKNOWN_RECORD_TYPE", detail: type, count });
    }
    for (const [subtype, count] of this.unknownSubtypeCounts) {
      diagnostics.push({ tier: "info", code: "UNKNOWN_SYSTEM_SUBTYPE", detail: subtype, count });
    }
    if (this.markersEmitted > 0) {
      diagnostics.push({ tier: "info", code: "MARKERS_EMITTED", count: this.markersEmitted });
    }
    if (this.noiseSkipped > 0) {
      diagnostics.push({ tier: "info", code: "NOISE_SKIPPED", count: this.noiseSkipped });
    }
    if (this.events.length === 0) {
      diagnostics.push({ tier: "warn", code: "NO_EVENTS" });
    }

    return { meta: this.meta, events: this.events, diagnostics };
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
