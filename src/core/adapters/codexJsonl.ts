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
 * - `custom_tool_call.name` 恆為 `"exec"`；真實工具名藏在 `input` 的 `tools.<name>(...)` 呼叫裡，
 *   用正則抽取，抽不到才退回 `"exec"`（§B4.3，R7-INV-8：推測失敗必須降級＋warning，不得裝作正確）。
 * - `patch_apply_end`／`mcp_tool_call_end`／`web_search_end` 的 `call_id` 是 `exec-<uuid>`，
 *   跟 `custom_tool_call` 的 `call_XXXX` 不同命名空間，不能用 id 對映；改以「同一 turn_id、工具名
 *   相容、且尚未收到該類子事件」就近向前配對到最近一個 exec `tool_use`（§B4.4）。turn_id 取自
 *   `custom_tool_call.internal_chat_message_metadata_passthrough.turn_id`（子事件則直接在
 *   payload.turn_id）；任一邊缺 turn_id 時退回純工具名比對——這是防禦性正確性修正（真實多執行緒／
 *   子代理協作樣本裡，不同 turn 的 exec 呼叫會交錯出現，不限定 turn 可能誤配到別的執行緒），
 *   不是靠這批樣本量出來的效果：R7B-05 用兩份含子代理事件與大量 compaction 的真實樣本核對時，
 *   19/26 筆 `patch_apply_end` 配對成功、7 筆降級為獨立事件，**確認過剩下 7 筆並非誤判或配對邏輯
 *   缺陷**——這些 `patch_apply_end` 對應的 `apply_patch` 呼叫發生在該 session 兩次 `context_compacted`
 *   （歷史壓縮）**之前**，原始呼叫已被壓縮摘要取代、不在目前事件流中，屬於真實的「原始呼叫不存在」
 *   情境，此時降級為獨立事件＋warning 正是 R7-INV-8／R7-INV-10 要的行為，不該被「修好」。
 *   配對失敗降級為獨立 `unknown` 事件＋warning，不得猜測歸屬。
 * - `turn_aborted`／`thread_rolled_back`／`context_compacted` 各出一則自我解釋的 `unknown` 事件，
 *   插在原時序位置；被中斷/撤回的原始步驟本身照常呈現（§B4.5）。
 * - Codex 官方的 auto-review（Guardian Approval）審查子代理會把「先前歷史全文轉述＋JSON 裁決」
 *   以一般 `response_item/message`（role=user 轉述、role=assistant 裁決）記錄進同一個 rollout
 *   檔案。這不是零內容 metadata（有真實的 allow/deny/escalate 裁決），也不是白名單前言（不是
 *   `<tag>` 包裹），故不落入既有兩種淨化路徑：改以「轉述文字的已知簽名句 + 緊接著的下一則
 *   assistant 訊息」配對，各自精簡成一則自我解釋的標記卡（沿用 turn_aborted 的既有慣例），裁決
 *   結果原樣顯示、不隱藏；並在 `finish()` 累計一則聚合 warning（見 R7.5 §W8）。
 *
 * 容錯原則：單行 JSON 解析失敗只記 warning 並跳過，絕不整體拋例外。
 */
import type { SourceAdapter, ParseResult, RawEvent } from "./types";
import { stripInjectedPreamble } from "@/core/text/preamble";

/** `custom_tool_call.name` 恆為 "exec"；真實工具名藏在 input 的 `tools.<name>(...)` 呼叫裡。 */
const EXEC_TOOL_NAME_RE = /tools\.([A-Za-z_][\w]*)\s*\(/;

function isPairableExecToolName(name: string): boolean {
  return name === "apply_patch" || name === "web__run" || name.startsWith("mcp__");
}

function asStringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Codex auto-review 審查子代理轉述先前歷史的固定開頭（首輪／增量輪共用前綴）。 */
const AUTO_REVIEW_DUMP_PREFIX = "The following is the Codex agent history";

function isAutoReviewDump(text: string): boolean {
  return text.trim().startsWith(AUTO_REVIEW_DUMP_PREFIX);
}

const AUTO_REVIEW_OUTCOME_LABELS: Record<string, string> = {
  allow: "允許",
  deny: "拒絕",
  escalate: "升級為人工確認",
};

/** 裁決訊息恆為短 JSON（`{"outcome":"allow"}` 之類）；解析不出來就不裝作看懂，退回當一般內容處理。 */
function parseAutoReviewOutcome(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || trimmed.length > 200) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const outcome = (parsed as { outcome?: unknown }).outcome;
  if (typeof outcome !== "string") return undefined;
  return AUTO_REVIEW_OUTCOME_LABELS[outcome] ?? `未知結果代碼 "${outcome}"`;
}

interface PendingExecCall {
  toolName: string;
  turnId: string | undefined;
  toolUse: RawEvent;
  toolResult: RawEvent | null;
}

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

export class CodexJsonlAccumulator {
  private readonly events: RawEvent[] = [];
  private readonly unknownTypeCounts = new Map<string, number>();
  private readonly oneOffWarnings: string[] = [];
  private readonly meta: ParseResult["meta"] = {
    source: "codex",
    tool: "codex",
  };
  private sawSessionMeta = false;
  private lineNo = 0;
  /** 相鄰的 event_msg/agent_reasoning 碎片要合併成一個 thinking span (§B1 F-6)。 */
  private lastThinkingFromAgentReasoning: RawEvent | null = null;
  /** 尚未收到 patch_apply_end／mcp_tool_call_end／web_search_end 的相容 exec 呼叫，依開啟順序排列。 */
  private readonly pendingExecCallOrder: PendingExecCall[] = [];
  private readonly pendingExecCallsByCallId = new Map<string, PendingExecCall>();
  /** 已知零內容的子代理協調 metadata 筆數（R7-INV-7 v2／§3.2）：靜默丟棄，不落卡片，只計入聚合診斷。 */
  private droppedNoiseCount = 0;
  /** Codex auto-review 審查子代理精簡成標記卡的筆數（含轉述與裁決兩種），供 finish() 聚合成一次性提示。 */
  private autoReviewNoiseCount = 0;
  /** 剛遇到 auto-review 轉述，下一則 assistant 訊息若是裁決 JSON 就配對精簡；不是的話當一般內容處理。 */
  private awaitingAutoReviewVerdict = false;

  private dropKnownNoise(): void {
    this.droppedNoiseCount += 1;
  }

  private recordUnknown(type: string): void {
    this.unknownTypeCounts.set(type, (this.unknownTypeCounts.get(type) ?? 0) + 1);
    this.events.push({ kind: "unknown", timestamp: null, text: `未知事件：${type}`, raw: type });
  }

  private pushEvent(event: RawEvent): void {
    this.lastThinkingFromAgentReasoning = null;
    this.events.push(event);
  }

  /**
   * 就近向前找到最近一個「工具名相容且尚未被消耗」的 exec 呼叫；找到即從候選中移除。
   * 子事件帶 turn_id 時嚴格限定同一 turn（多執行緒／子代理協作時，不同 turn 的呼叫會交錯，
   * 不限定 turn 會誤配到別的執行緒——找不到同 turn 的相容呼叫就直接算配對失敗，不跨 turn 退讓）；
   * 子事件沒有 turn_id 時才退回純工具名比對（沒有範圍可限定，只能盡力而為）。
   */
  private consumeNearestPendingExec(
    isCompatible: (toolName: string) => boolean,
    turnId: string | undefined,
  ): PendingExecCall | undefined {
    for (let i = this.pendingExecCallOrder.length - 1; i >= 0; i -= 1) {
      const entry = this.pendingExecCallOrder[i];
      if (!isCompatible(entry.toolName)) continue;
      if (turnId ? entry.turnId === turnId : true) {
        return this.pendingExecCallOrder.splice(i, 1)[0];
      }
    }
    return undefined;
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

    if (topType === "inter_agent_communication_metadata") {
      this.dropKnownNoise();
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
        const flattened = flattenTextBlocks(payload?.content);

        if (role !== "assistant" && isAutoReviewDump(flattened)) {
          this.autoReviewNoiseCount += 1;
          this.awaitingAutoReviewVerdict = true;
          this.pushEvent({
            kind: "unknown",
            timestamp,
            text: "Codex 自動核准審查（auto-review）：機器轉述先前歷史供裁決用，無教學價值，已精簡顯示",
            raw: payload,
          });
          return;
        }

        if (role === "assistant" && this.awaitingAutoReviewVerdict) {
          this.awaitingAutoReviewVerdict = false;
          const outcome = parseAutoReviewOutcome(flattened);
          if (outcome) {
            this.autoReviewNoiseCount += 1;
            this.pushEvent({ kind: "unknown", timestamp, text: `Codex 自動核准審查結果：${outcome}`, raw: payload });
            return;
          }
          // 不是預期的裁決 JSON，不裝作看懂，落回一般內容處理（下方）。
        }

        const text = stripInjectedPreamble(flattened);
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
        const input = payload?.input;
        const match = typeof input === "string" ? EXEC_TOOL_NAME_RE.exec(input) : null;
        const toolName = match?.[1];
        if (!toolName) this.oneOffWarnings.push(`無法從 exec input 抽出工具名（行 ${this.lineNo}）。`);
        const event: RawEvent = {
          kind: "tool_use",
          timestamp,
          toolName: toolName ?? "exec",
          toolInput: { raw: input },
          toolUseId: typeof callId === "string" ? callId : undefined,
          raw: payload,
        };
        this.pushEvent(event);
        if (toolName && isPairableExecToolName(toolName) && typeof callId === "string") {
          const passthrough = payload?.internal_chat_message_metadata_passthrough as { turn_id?: unknown } | undefined;
          const turnId = typeof passthrough?.turn_id === "string" ? passthrough.turn_id : undefined;
          const entry: PendingExecCall = { toolName, turnId, toolUse: event, toolResult: null };
          this.pendingExecCallOrder.push(entry);
          this.pendingExecCallsByCallId.set(callId, entry);
        }
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
        const event: RawEvent = {
          kind: "tool_result",
          timestamp,
          text: flattenOutput(payload?.output),
          toolUseId: typeof callId === "string" ? callId : undefined,
          isError: false,
          raw: payload,
        };
        this.pushEvent(event);
        if (typeof callId === "string") {
          const pending = this.pendingExecCallsByCallId.get(callId);
          if (pending) pending.toolResult = event;
        }
        return;
      }

      case "agent_message":
        // 子代理間通訊，零可讀內容；本輪靜默丟棄 + 聚合診斷 (R7-INV-7 v2，見 R7.5 §3.2)。
        this.dropKnownNoise();
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

    if (subType === "patch_apply_end") {
      const entry = this.consumeNearestPendingExec((name) => name === "apply_patch", asStringOrUndefined(payload?.turn_id));
      if (!entry) {
        this.oneOffWarnings.push(`patch_apply_end 找不到對應的 apply_patch 呼叫，已降級為獨立事件。`);
        this.pushEvent({ kind: "unknown", timestamp, text: "套用修改（找不到對應的呼叫）", raw: payload });
        return;
      }
      entry.toolUse.toolInput = { ...entry.toolUse.toolInput, changes: payload?.changes };
      if (entry.toolResult) {
        const success = Boolean(payload?.success);
        const detail = success ? String(payload?.stdout ?? "") : `[修改失敗] ${String(payload?.stderr ?? "")}`;
        entry.toolResult.text = [entry.toolResult.text, detail].filter(Boolean).join("\n");
      }
      return;
    }

    if (subType === "mcp_tool_call_end") {
      const entry = this.consumeNearestPendingExec((name) => name.startsWith("mcp__"), asStringOrUndefined(payload?.turn_id));
      if (!entry) {
        this.oneOffWarnings.push(`mcp_tool_call_end 找不到對應的 mcp__* 呼叫，已降級為獨立事件。`);
        this.pushEvent({ kind: "unknown", timestamp, text: "MCP 工具呼叫（找不到對應的呼叫）", raw: payload });
        return;
      }
      const invocation = payload?.invocation as { server?: unknown; tool?: unknown; arguments?: unknown } | undefined;
      if (invocation?.arguments && typeof invocation.arguments === "object") {
        entry.toolUse.toolInput = invocation.arguments as Record<string, unknown>;
      }
      if (typeof invocation?.server === "string" && typeof invocation?.tool === "string") {
        entry.toolUse.toolName = `mcp__${invocation.server}__${invocation.tool}`;
      }
      if (entry.toolResult) {
        const result = payload?.result as { Ok?: { content?: unknown } } | undefined;
        const content = result?.Ok?.content;
        if (content !== undefined) {
          const detail = typeof content === "string" ? content : flattenTextBlocks(content);
          entry.toolResult.text = [entry.toolResult.text, detail].filter(Boolean).join("\n");
        }
      }
      return;
    }

    if (subType === "web_search_end") {
      const entry = this.consumeNearestPendingExec((name) => name === "web__run", asStringOrUndefined(payload?.turn_id));
      if (!entry) {
        this.oneOffWarnings.push(`web_search_end 找不到對應的 web__run 呼叫，已降級為獨立事件。`);
        this.pushEvent({ kind: "unknown", timestamp, text: "網頁搜尋（找不到對應的呼叫）", raw: payload });
        return;
      }
      entry.toolUse.toolInput = { ...entry.toolUse.toolInput, query: payload?.query };
      return;
    }

    if (subType === "turn_aborted") {
      this.pushEvent({ kind: "unknown", timestamp, text: `此回合被中斷（原因：${String(payload?.reason ?? "未知")}）`, raw: payload });
      return;
    }

    if (subType === "thread_rolled_back") {
      this.pushEvent({
        kind: "unknown",
        timestamp,
        text: `之前 ${String(payload?.num_turns ?? "?")} 個回合已被使用者撤回，以下內容仍保留供對照`,
        raw: payload,
      });
      return;
    }

    if (subType === "context_compacted") {
      this.pushEvent({ kind: "unknown", timestamp, text: "對話歷史在此處被壓縮，之後的上下文已重整", raw: payload });
      return;
    }

    if (subType === "sub_agent_activity") {
      // 生命週期訊號，零可讀內容；本輪靜默丟棄 + 聚合診斷 (R7-INV-7 v2，見 R7.5 §3.2)。
      this.dropKnownNoise();
      return;
    }

    if (NO_EVENT_EVENT_MSG_TYPES.has(subType)) return;

    this.recordUnknown(`event_msg/${subType}`);
  }

  finish(): ParseResult {
    const warnings: string[] = [...this.oneOffWarnings];
    for (const [type, count] of this.unknownTypeCounts) {
      warnings.push(
        type === "__parse_error__"
          ? `${count} 行 JSON 解析失敗，已略過。`
          : `未知型別 "${type}" ×${count}，已寬容收納。`,
      );
    }
    if (this.droppedNoiseCount > 0) {
      warnings.push(
        `略過 ${this.droppedNoiseCount} 筆子代理協調事件（inter_agent_communication_metadata／sub_agent_activity／agent_message，無可呈現內容）。`,
      );
    }
    if (this.autoReviewNoiseCount > 0) {
      warnings.push(
        `偵測到 ${this.autoReviewNoiseCount} 筆 Codex 自動核准審查（auto-review）記錄，內容多為機器轉述歷史與 JSON 裁決，通常無教學價值；已在原時序位置精簡為標記卡，原始資料未被刪除。`,
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
