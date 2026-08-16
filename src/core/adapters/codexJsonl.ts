/**
 * CodexJsonlAdapter
 * 解析 Codex CLI 的 session transcript (`~/.codex/sessions/**\/rollout-*.jsonl`)。
 *
 * 已驗證的真實格式 (見 docs/rounds/r7-multi-source-and-layout/PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md Part B，
 * 與 docs/rounds/r7-multi-source-and-layout/R7B_BASELINE_2026-07-23.md 的額外樣本核對)：
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
import type { Diagnostic } from "@/core/diagnostics/contracts";
import type { SourceAdapter, ParseResult, RawEvent, RawEventKind } from "./types";
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

/**
 * R11.2 R1：匯出給 `sessionIndexer.ts`。這段轉述文字掛的是 `role: "user"` 信封，但不是真人打的字
 * ——分類與標題來源都不能把它當成真人回合，否則「第一則真人訊息」會變成一整份機器轉述的歷史。
 */
export function isAutoReviewDump(text: string): boolean {
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

/**
 * 把 Codex 的 `input_text` 區塊陣列攤平成純文字（跟 Claude Code 的 flattenResultContent 同類但格式不同）。
 *
 * R11.2 R1：匯出給 `sessionIndexer.ts` 重用，讓表頭掃描讀 Codex 的 `response_item/message.content`
 * 時跟這支 adapter 用同一份攤平邏輯——不要另外寫一份會慢慢長歪的複本。
 */
export function flattenTextBlocks(content: unknown): string {
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

/**
 * R11 M4 WC-4.4(1)：`[external_agent_tool_call: <Name>]…[/external_agent_tool_call]` 與
 * `[external_agent_tool_result]`／`[external_agent_tool_result: error]`…`[/external_agent_tool_result]`
 * 是這台機器上「Codex 呼叫外部 agent 工具」時，工具呼叫/結果邊界的方括號包裝，出現在
 * `response_item/message`（role=assistant）的內文裡——不是 `INJECTION_TAGS` 白名單處理的角括號
 * 前言區塊（那組只認 `<tag>…</tag>` 且只在文字最開頭剝除一次）；這組是方括號、可能出現在文字
 * 中段、同一則訊息裡可能重複多次。summary/title 目前直接取整段文字的前 90 字，於是包裝標記本身
 * （常常比真正內容更早出現）被當成卡片標題，吃掉真正的內容。
 *
 * 實測本機 358 份 rollout：50,221 次出現，全部在 response_item/message（role=assistant）；
 * 99.99%（50,218/50,221）包裝本身完整（開頭在段落起點、有對應收尾標籤、收尾後沒有殘留文字），
 * 只有 3 例是「先有真人可讀的敘述句，後面才接上包裝」。因此只拿掉標記本身（開頭／收尾兩種
 * token），中間與前後的內容原樣保留——不是新的剝除規則，是「不要把它當標題來源」的最小修正。
 */
const EXTERNAL_AGENT_WRAPPER_RE = /\[\/?external_agent_tool_(?:call|result)(?::[^\]]*)?\]\n?/g;

function stripExternalAgentWrapperMarkers(text: string): string {
  return text.replace(EXTERNAL_AGENT_WRAPPER_RE, "");
}

/**
 * `agent_message` 的 `author`／`recipient` 是執行緒路徑（`/root`、`/root/<task>`），實測 author
 * 恆不等於 recipient。父對子是交付給子代理的提示，子對父是回報——與 Claude Code 旁鏈裡
 * 「side-chain user_msg 就是子代理的提示」同一個讀法，所以兩邊在下游長得一樣。
 * 判不出親子關係時退回 assistant_text：把回報誤標成提示，比反過來安全（提示會被當成回合邊界）。
 */
function agentMessageKind(author: unknown, recipient: unknown): RawEventKind {
  if (typeof author !== "string" || typeof recipient !== "string") return "assistant_text";
  return recipient.startsWith(`${author}/`) ? "user_text" : "assistant_text";
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
  /** R9：改記代碼＋計數，不組句子；文案在 i18n/diagnosticCopy.ts。 */
  private readonly unpairedEventCounts = new Map<string, number>();
  private execToolNameUnresolved = 0;
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

        const text = stripInjectedPreamble(stripExternalAgentWrapperMarkers(flattened));
        if (!text.trim()) return;
        this.pushEvent({
          kind: role === "assistant" ? "assistant_text" : "user_text",
          timestamp,
          text,
          raw: payload,
        });
        return;
      }

      case "reasoning":
        // R11 M4 WC-4.4(2) / P-001：Codex 把每一步推理寫兩次——`event_msg/agent_reasoning`
        // 純文字（見 handleEventMsg），以及這裡的 `response_item/reasoning`，其 `summary` 是
        // 同一段文字的重述（`encrypted_content` 本身無法還原，不可能拿來當唯一內容來源）。
        // 兩者過去各自成一個 thinking span，於是同一步推理在卡片列表裡出現兩次；不對齊也不是
        // 1:1——一則 `reasoning` 常把前面好幾則 `agent_reasoning` 的文字合併成一段 summary，
        // 有時 summary 是空的（此時 encrypted_content 仍在，但無明文可顯示）。
        //
        // 本機 358 份 rollout 實測：12,876 筆 `agent_reasoning`、16,397 筆 `reasoning`
        // （10,508 筆 summary 為空、5,889 筆非空）。5,889 筆非空 summary 中 5,885 筆
        // （99.93%）恰好等於「自上一則 reasoning 起累積的 agent_reasoning 文字以 \n 串接」；
        // 零筆是「summary 有內容但完全沒有對應的 agent_reasoning」孤兒案例。也就是說
        // `agent_reasoning` 才是明文的權威來源、且沒有測到遺漏；`reasoning.summary` 對本語料
        // 而言是完全冗餘的重述。因此這裡不再產生任何 span——含 encrypted_content 而 summary
        // 為空的紀錄本來就不出卡片；summary 非空的紀錄現在也不出卡片，因為同樣的文字已經由
        // `agent_reasoning` 出過了。不是拿 render 端去重（那樣如果日後語料出現孤兒案例會悄悄
        // 丟資料而不自知），是直接讓第二個信封不再產生第二個 span。
        return;

      case "custom_tool_call": {
        const callId = payload?.call_id;
        const input = payload?.input;
        const match = typeof input === "string" ? EXEC_TOOL_NAME_RE.exec(input) : null;
        const toolName = match?.[1];
        if (!toolName) this.execToolNameUnresolved += 1;
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
          // R10-B: left undefined on purpose. Measured on 9,342 real outputs, Codex records no
          // status field for a plain exec — `output` is a string or a content-block array and
          // nothing else. Writing `false` here would assert a success the rollout never claimed.
          // A later patch_apply_end / mcp_tool_call_end may fill it in; exec never can.
          isError: undefined,
          raw: payload,
        };
        this.pushEvent(event);
        if (typeof callId === "string") {
          const pending = this.pendingExecCallsByCallId.get(callId);
          if (pending) pending.toolResult = event;
        }
        return;
      }

      case "agent_message": {
        // R10-M1：R7.5 記為「零可讀內容」而靜默丟棄。2026-08-14 本機 356 份 rollout 實測推翻了
        // 這個前提——544 筆全部帶非空 input_text，中位數 84 字、最長 16,215 字。丟棄不是降噪，
        // 是資料遺失。證據見 docs/rounds/r10-source-awareness/SCAN_R10_LOCAL_ROLLOUT_RESULTS.md F-2。
        const text = flattenTextBlocks(payload?.content);
        if (!text.trim()) {
          // 真的空的那幾筆仍照舊當噪音，不無中生有一張空卡片。
          this.dropKnownNoise();
          return;
        }
        this.pushEvent({
          kind: agentMessageKind(payload?.author, payload?.recipient),
          timestamp,
          text,
          isSidechain: true,
          raw: payload,
        });
        return;
      }

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
        this.unpairedEventCounts.set("patch_apply_end", (this.unpairedEventCounts.get("patch_apply_end") ?? 0) + 1);
        this.pushEvent({ kind: "unknown", timestamp, text: "套用修改（找不到對應的呼叫）", raw: payload });
        return;
      }
      entry.toolUse.toolInput = { ...entry.toolUse.toolInput, changes: payload?.changes };
      if (entry.toolResult) {
        const success = Boolean(payload?.success);
        const detail = success ? String(payload?.stdout ?? "") : `[修改失敗] ${String(payload?.stderr ?? "")}`;
        entry.toolResult.text = [entry.toolResult.text, detail].filter(Boolean).join("\n");
        // R10-B: `success` was already read for the text but never for the outcome, so a failed
        // patch reached the skeleton untagged. Present on all 2,186 measured occurrences.
        entry.toolResult.isError = !success;
      }
      return;
    }

    if (subType === "mcp_tool_call_end") {
      const entry = this.consumeNearestPendingExec((name) => name.startsWith("mcp__"), asStringOrUndefined(payload?.turn_id));
      if (!entry) {
        this.unpairedEventCounts.set("mcp_tool_call_end", (this.unpairedEventCounts.get("mcp_tool_call_end") ?? 0) + 1);
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
        const result = payload?.result as { Ok?: { content?: unknown }; Err?: unknown } | undefined;
        const content = result?.Ok?.content;
        if (content !== undefined) {
          const detail = typeof content === "string" ? content : flattenTextBlocks(content);
          entry.toolResult.text = [entry.toolResult.text, detail].filter(Boolean).join("\n");
        }
        /*
         * R10-B: `result` is a serialized Rust Result, so the outcome is the tag itself. All 712
         * measured occurrences were `Ok`, which means the failure shape is NOT proven by local
         * data — hence the deliberate asymmetry: a present `Err` is treated as an error, a present
         * `Ok` as success, and anything else leaves the outcome unknown rather than assuming success.
         */
        if (result && "Err" in result) {
          entry.toolResult.isError = true;
          const detail = typeof result.Err === "string" ? result.Err : "";
          entry.toolResult.text = [entry.toolResult.text, detail && `[MCP 呼叫失敗] ${detail}`].filter(Boolean).join("\n");
        } else if (result && "Ok" in result) {
          entry.toolResult.isError = false;
        }
      }
      return;
    }

    if (subType === "web_search_end") {
      const entry = this.consumeNearestPendingExec((name) => name === "web__run", asStringOrUndefined(payload?.turn_id));
      if (!entry) {
        this.unpairedEventCounts.set("web_search_end", (this.unpairedEventCounts.get("web_search_end") ?? 0) + 1);
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
    const diagnostics: Diagnostic[] = [];
    // R11 M4 WC-4.1 / P-001: these two used to be "warn", which reads as "this session went
    // wrong". RCA_R10.1 measured 357 local rollouts / 218,517 lines: 93.9% of unpaired *_end
    // events have no recoverable candidate anywhere in the exported stream at all — that is a
    // limit of what Codex's export records, not a per-session fault, and no amount of pairing-
    // heuristic tuning closes it. Both are named capability limits: the card still renders
    // (as "exec" / as a standalone event) with nothing lost. "info" is the existing tier for
    // exactly this — "a known condition handled by policy... counted, not narrated" — so it is
    // reused rather than adding a new one; see CODEX_COORDINATION_SKIPPED and
    // CODEX_AUTO_REVIEW_CONDENSED just below for the same pattern.
    if (this.execToolNameUnresolved > 0) {
      diagnostics.push({ tier: "info", code: "CODEX_EXEC_TOOL_NAME_UNRESOLVED", count: this.execToolNameUnresolved });
    }
    for (const [subType, count] of this.unpairedEventCounts) {
      diagnostics.push({ tier: "info", code: "CODEX_EVENT_UNPAIRED", detail: subType, count });
    }
    for (const [type, count] of this.unknownTypeCounts) {
      diagnostics.push(
        type === "__parse_error__"
          ? { tier: "warn", code: "LINE_PARSE_FAILED", count }
          : { tier: "warn", code: "UNKNOWN_RECORD_TYPE", detail: type, count },
      );
    }
    if (this.droppedNoiseCount > 0) {
      diagnostics.push({ tier: "info", code: "CODEX_COORDINATION_SKIPPED", count: this.droppedNoiseCount });
    }
    if (this.autoReviewNoiseCount > 0) {
      diagnostics.push({ tier: "info", code: "CODEX_AUTO_REVIEW_CONDENSED", count: this.autoReviewNoiseCount });
    }
    if (this.events.length === 0) diagnostics.push({ tier: "warn", code: "NO_EVENTS" });
    return { meta: this.meta, events: this.events, diagnostics };
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
