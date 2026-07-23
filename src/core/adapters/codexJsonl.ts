/**
 * CodexJsonlAdapter
 * 解析 Codex CLI 的 session transcript (`~/.codex/sessions/**\/rollout-*.jsonl`)。
 *
 * 已驗證的真實格式 (見 docs/PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md Part B，
 * 與 docs/R7B_BASELINE_2026-07-23.md 的額外樣本核對)：
 * - 每行一個 `{ timestamp, type, payload }` 信封；`type` 為頂層分類，`payload.type` 才是細分。
 * - 沒有 Claude Code 式的 `uuid`／`parentUuid` 巢狀鏈；`response_item/custom_tool_call` 與
 *   `response_item/function_call` 用同一個 `call_id` 給自己與對應的 `_output`，兩者以此配對即可，
 *   不需要額外的 id 對映。
 * - 型別白名單外一律寬容收納為 `unknown`，warning 依型別聚合成「型別 ×N」，不逐行各自一條
 *   （R7-INV-7：不得靜默丟棄，也不得洗版）。
 * - `patch_apply_end`／`mcp_tool_call_end`／`web_search_end` 這三種巢狀子事件，以及
 *   `turn_aborted`／`thread_rolled_back`／`context_compacted` 這三種生命週期標記，本卡
 *   (R7B-02) 先落白名單但不產生額外內容，實際配對與標記文字由 R7B-04 補齊
 *   （§B4.4／§B4.5），避免兩張卡的邏輯混在一起難以個別驗證。
 *
 * 容錯原則：單行 JSON 解析失敗只記 warning 並跳過，絕不整體拋例外。
 */
import type { SourceAdapter, ParseResult, RawEvent } from "./types";

interface CodexContentBlock {
  type?: string;
  text?: string;
  encrypted_content?: string;
}

interface CodexPayload {
  type?: string;
  [key: string]: unknown;
}

interface CodexRecord {
  timestamp?: string;
  type?: string;
  payload?: CodexPayload;
}

/** 把 Codex 的 `input_text` 區塊陣列攤平成純文字（跟 Claude Code 的 flattenResultContent 同類但格式不同）。 */
function flattenTextBlocks(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object" && "text" in block) return String((block as CodexContentBlock).text ?? "");
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/** `custom_tool_call_output`／`function_call_output` 的 output 一律是 input_text 區塊陣列。 */
function flattenOutput(output: unknown): string {
  return flattenTextBlocks(output);
}

const NO_EVENT_EVENT_MSG_TYPES = new Set([
  "user_message",
  "agent_message",
  "task_started",
  "task_complete",
  "token_count",
  "turn_context",
]);

/** 白名單內、本卡先不產生內容的巢狀子事件／生命週期標記 (R7B-04 補齊)。 */
const DEFERRED_TO_R7B04 = new Set([
  "patch_apply_end",
  "mcp_tool_call_end",
  "web_search_end",
  "turn_aborted",
  "thread_rolled_back",
  "context_compacted",
]);

export class CodexJsonlAccumulator {
  private readonly events: RawEvent[] = [];
  private readonly unknownTypeCounts = new Map<string, number>();
  private readonly meta: ParseResult["meta"] = {
    source: "codex",
    tool: "codex",
  };
  private sawSessionMeta = false;
  private lineNo = 0;
  /** 相鄰的 event_msg/agent_reasoning 碎片要合併成一個 thinking span (§B1 F-6)。 */
  private lastThinkingFromAgentReasoning: RawEvent | null = null;

  private recordUnknown(type: string): void {
    this.unknownTypeCounts.set(type, (this.unknownTypeCounts.get(type) ?? 0) + 1);
    this.events.push({ kind: "unknown", timestamp: null, text: `未知事件：${type}`, raw: type });
  }

  private pushEvent(event: RawEvent): void {
    this.lastThinkingFromAgentReasoning = null;
    this.events.push(event);
  }

  pushLine(line: string): void {
    this.lineNo += 1;
    const trimmed = line.trim();
    if (!trimmed) return;

    let record: CodexRecord;
    try {
      record = JSON.parse(trimmed) as CodexRecord;
    } catch {
      this.unknownTypeCounts.set("__parse_error__", (this.unknownTypeCounts.get("__parse_error__") ?? 0) + 1);
      return;
    }

    const timestamp = record.timestamp ?? null;
    if (timestamp && !this.meta.startedAt) this.meta.startedAt = timestamp;

    const topType = record.type;
    const payload = record.payload;

    if (topType === "session_meta") {
      // F-5：session_meta 因 resume 常重複，內容相同，取第一筆即可。
      if (!this.sawSessionMeta) {
        this.sawSessionMeta = true;
        const id = payload?.session_id ?? payload?.id;
        if (typeof id === "string") this.meta.id = id;
        const cwd = payload?.cwd;
        if (typeof cwd === "string") this.meta.projectPath = cwd;
      }
      return;
    }

    if (topType === "compacted") {
      // replacement_history 是整段歷史重複，不照收；context_compacted 的 event_msg 會補一則標記。
      return;
    }

    if (topType === "world_state") return;
    if (topType === "turn_context") return;

    if (topType === "response_item") {
      this.handleResponseItem(payload, timestamp);
      return;
    }

    if (topType === "event_msg") {
      this.handleEventMsg(payload, timestamp);
      return;
    }

    if (topType) this.recordUnknown(topType);
  }

  private handleResponseItem(payload: CodexPayload | undefined, timestamp: string | null): void {
    const subType = payload?.type;
    if (!subType) return;

    switch (subType) {
      case "message": {
        const role = payload?.role;
        if (role === "developer") return; // 系統提示注入，非對話內容。
        const text = flattenTextBlocks(payload?.content);
        if (!text.trim()) return;
        this.pushEvent({
          kind: role === "assistant" ? "assistant_text" : "user_text",
          timestamp,
          text,
          raw: payload,
        });
        return;
      }

      case "reasoning": {
        // encrypted_content 無法還原；只有 summary 有明文時才出事件，空則略過 (F-6)。
        const summary = payload?.summary;
        const text = Array.isArray(summary) ? flattenTextBlocks(summary) : "";
        if (!text.trim()) return;
        this.pushEvent({ kind: "thinking", timestamp, text, raw: payload });
        return;
      }

      case "custom_tool_call": {
        const callId = payload?.call_id;
        this.pushEvent({
          kind: "tool_use",
          timestamp,
          toolName: typeof payload?.name === "string" ? payload.name : "exec",
          toolInput: { raw: payload?.input },
          toolUseId: typeof callId === "string" ? callId : undefined,
          raw: payload,
        });
        return;
      }

      case "function_call": {
        const callId = payload?.call_id;
        const args = payload?.arguments;
        let toolInput: Record<string, unknown>;
        if (typeof args === "string") {
          try {
            toolInput = JSON.parse(args) as Record<string, unknown>;
          } catch {
            toolInput = { raw: args };
          }
        } else {
          toolInput = { raw: args };
        }
        this.pushEvent({
          kind: "tool_use",
          timestamp,
          toolName: typeof payload?.name === "string" ? payload.name : "unknown",
          toolInput,
          toolUseId: typeof callId === "string" ? callId : undefined,
          raw: payload,
        });
        return;
      }

      case "custom_tool_call_output":
      case "function_call_output": {
        const callId = payload?.call_id;
        this.pushEvent({
          kind: "tool_result",
          timestamp,
          text: flattenOutput(payload?.output),
          toolUseId: typeof callId === "string" ? callId : undefined,
          isError: false,
          raw: payload,
        });
        return;
      }

      case "agent_message":
        // 子代理間通訊；本卡刻意不建立專屬呈現 (見 R7B_BASELINE_2026-07-23.md 觀察 2)。
        this.recordUnknown(`response_item/${subType}`);
        return;

      default:
        this.recordUnknown(`response_item/${subType}`);
    }
  }

  private handleEventMsg(payload: CodexPayload | undefined, timestamp: string | null): void {
    const subType = payload?.type;
    if (!subType) return;

    if (subType === "agent_reasoning") {
      const text = typeof payload?.text === "string" ? payload.text : "";
      if (!text.trim()) return;
      if (this.lastThinkingFromAgentReasoning) {
        // 相鄰碎片合併，不各自成一個 span (§B1 F-6)。
        this.lastThinkingFromAgentReasoning.text = `${this.lastThinkingFromAgentReasoning.text ?? ""}\n${text}`;
        return;
      }
      const event: RawEvent = { kind: "thinking", timestamp, text, raw: payload };
      this.events.push(event);
      this.lastThinkingFromAgentReasoning = event;
      return;
    }

    if (subType === "thread_settings_applied") {
      const settings = payload?.thread_settings as { model?: unknown } | undefined;
      if (settings && typeof settings.model === "string" && !this.meta.model) this.meta.model = settings.model;
      return;
    }

    if (NO_EVENT_EVENT_MSG_TYPES.has(subType)) return;
    if (DEFERRED_TO_R7B04.has(subType)) return; // 白名單內，R7B-04 補實際配對/標記內容。

    this.recordUnknown(`event_msg/${subType}`);
  }

  finish(): ParseResult {
    const warnings: string[] = [];
    for (const [type, count] of this.unknownTypeCounts) {
      warnings.push(
        type === "__parse_error__"
          ? `${count} 行 JSON 解析失敗，已略過。`
          : `未知型別 "${type}" ×${count}，已寬容收納。`,
      );
    }
    if (this.events.length === 0) warnings.push("未從輸入中解析出任何可呈現的事件。");
    return { meta: this.meta, events: this.events, warnings };
  }
}

export const codexJsonlAdapter: SourceAdapter = {
  id: "codex",

  canParse(raw: string): boolean {
    const firstLine = raw.split(/\r?\n/).find((l) => l.trim().length > 0);
    if (!firstLine) return false;
    try {
      const o = JSON.parse(firstLine) as Record<string, unknown>;
      return (
        typeof o.type === "string"
        && ["session_meta", "response_item", "event_msg", "turn_context"].includes(o.type)
        && typeof o.payload === "object"
        && o.payload !== null
      );
    } catch {
      return false;
    }
  },

  parse(raw: string): ParseResult {
    const accumulator = new CodexJsonlAccumulator();
    for (const line of raw.split(/\r?\n/)) accumulator.pushLine(line);
    return accumulator.finish();
  },

  createAccumulator(): CodexJsonlAccumulator {
    return new CodexJsonlAccumulator();
  },
};
