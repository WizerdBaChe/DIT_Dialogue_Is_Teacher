/**
 * Normalizer：RawEvent[] → SessionDocument (Span Tree)
 * 只依賴 RawEvent 中介格式與 Span Tree 契約，與任何特定來源解耦。
 * 此階段只建立節點與基本巢狀關係；標籤與分組交由 Denoiser。
 */
import type { ParseResult } from "@/core/adapters/types";
import type { RawEvent } from "@/core/adapters/types";
import { reportFallback } from "@/core/diagnostics";
import { stripInjectedPreamble } from "@/core/text/preamble";
import {
  SCHEMA_VERSION,
  type SessionDocument,
  type SessionMeta,
  type Span,
  type SpanType,
} from "@/types/spanTree";

const KIND_TO_SPAN_TYPE: Record<RawEvent["kind"], SpanType> = {
  user_text: "user_msg",
  assistant_text: "assistant_msg",
  thinking: "thinking",
  tool_use: "tool_use",
  tool_result: "tool_result",
  unknown: "marker",
};

/** 取單行摘要。 */
function firstLine(text: string, max = 90): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? line.slice(0, max) + "…" : line;
}

/**
 * R11.2 R2：`tool_use` 事件沒有可用工具名時的誠實佔位字——這裡是唯一的來源，`span.summary`
 * (卡片標題文字) 與 `span.tool.name` (badge) 都讀這個常數，避免兩處各自掉回不同的英文字
 * （曾經一個掉回 "tool"、另一個掉回 "unknown"）。不透過 i18n locales：這是來源無關的合成
 * 系統標記，跟同檔案 `finalizeMeta` 的 "未命名 session" 是同一種東西，不是可切換語言的 UI
 * chrome（本檔其他 adapter 的合成標記文字，如 codexJsonl.ts 的「找不到對應的呼叫」，都是同一
 * 慣例）。絕不能拿任何猜測出來的名字取代它——那正是這張卡要修的漏洞。
 */
const UNNAMED_TOOL_NAME = "未命名操作";

/** 從工具參數挑出最具代表性的一個，組成可讀摘要。 */
function summarizeTool(name: string, params: Record<string, unknown>): string {
  const key = ["file_path", "filePath", "path", "command", "pattern", "query", "url", "notebook_path"].find(
    (k) => typeof params[k] === "string",
  );
  if (!key) return name;
  let val = String(params[key]);
  // 路徑只留檔名，指令過長則截斷。
  if (key.toLowerCase().includes("path")) val = val.split(/[\\/]/).pop() || val;
  if (val.length > 60) val = val.slice(0, 60) + "…";
  return `${name} ${val}`;
}

function summarize(ev: RawEvent): string {
  switch (ev.kind) {
    case "tool_use":
      return ev.toolName ? summarizeTool(ev.toolName, ev.toolInput ?? {}) : UNNAMED_TOOL_NAME;
    case "tool_result": {
      const lineCount = (ev.text ?? "").split("\n").length;
      return ev.isError ? "工具錯誤" : `結果 (${lineCount} 行)`;
    }
    case "thinking":
      return firstLine(ev.text ?? "", 70);
    default:
      return firstLine(ev.text ?? "");
  }
}

const FALLBACK_TITLE_MAX_LENGTH = 48;

/** 規則式 session 標題 fallback（無 `ai-title`／等價欄位時使用，所有來源共用）。 */
function deriveFallbackTitle(events: RawEvent[]): string | undefined {
  const firstUserText = events.find((event) => event.kind === "user_text" && event.text?.trim());
  if (!firstUserText?.text) return undefined;

  const stripped = stripInjectedPreamble(firstUserText.text);
  const firstLine = stripped
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .find((l) => l.length > 0);
  if (!firstLine) return undefined;

  return firstLine.length > FALLBACK_TITLE_MAX_LENGTH
    ? `${firstLine.slice(0, FALLBACK_TITLE_MAX_LENGTH)}…`
    : firstLine;
}

/** 合理化 session meta，補上 fallback。 */
function finalizeMeta(meta: Partial<SessionMeta>, events: RawEvent[]): SessionMeta {
  if (!meta.id) {
    // 合成 id 每次載入都不同，會讓講解快取的 session 指紋對不上。
    reportFallback("normalizer/finalizeMeta", "missing-session-id");
  }
  if (!meta.source) {
    /*
     * R12 M7：這裡原本是無聲的 `?? "claude-code"`——**一個猜錯來源的預設值**，而且沒有走
     * fallback 通道（上面那個 id 有走）。AGENTS.md 的不變式明寫「每個 `?? somethingElse`
     * 都必須呼叫 `reportFallback`」，這一處漏了。
     *
     * 為什麼特別嚴重：`source` 決定側寫，側寫決定降噪工具名、標題階梯、來歷種類——猜錯一次，
     * 整條渲染路徑都跟著錯，而且畫面上完全看不出來。這正是這一輪要消滅的形狀，只是它躲在
     * 正規化層而不是探索層。
     *
     * 目前兩個 adapter 都會寫死自己的 `source`，所以理論上到不了這裡。但 R11.2 的 F-01／F-02
     * 才剛示範過「今天到不了」不等於「明天到不了」——所以留著預設值保命，同時讓它出聲。
     */
    reportFallback("normalizer/finalizeMeta", "missing-source");
  }
  return {
    id: meta.id ?? `session-${Date.now()}`,
    source: meta.source ?? "claude-code",
    tool: meta.tool ?? "claude-code",
    title: meta.title ?? deriveFallbackTitle(events) ?? "未命名 session",
    projectPath: meta.projectPath ?? null,
    startedAt: meta.startedAt ?? null,
    model: meta.model ?? null,
  };
}

export function normalize(parsed: ParseResult): SessionDocument {
  const spans: Span[] = [];
  // toolUseId → 對應 tool_use 的 span id，供 tool_result 掛載父節點。
  const toolUseSpanByUseId = new Map<string, string>();
  const latestSpanByEventUuid = new Map<string, string>();
  const eventByUuid = new Map(parsed.events.filter((event) => event.uuid).map((event) => [event.uuid as string, event]));
  const sidechainSpanIds = new Map<string, string[]>();

  const sidechainRoot = (event: RawEvent, fallback: string): string => {
    let cursor = event;
    if (!event.uuid) {
      // 沒有 uuid 就自成一個 root，子代理群組會因此被拆碎。
      reportFallback("normalizer/sidechainRoot", "sidechain-event-without-uuid", { fallback });
    }
    let root = event.uuid ?? fallback;
    const visited = new Set<string>();
    while (cursor.parentUuid && !visited.has(cursor.parentUuid)) {
      visited.add(cursor.parentUuid);
      const parent = eventByUuid.get(cursor.parentUuid);
      if (!parent?.isSidechain) break;
      cursor = parent;
      root = parent.uuid ?? root;
    }
    return root;
  };

  parsed.events.forEach((ev, index) => {
    const id = `span-${index}`;
    const type = KIND_TO_SPAN_TYPE[ev.kind];

    let parentId: string | null = null;
    if (ev.kind === "tool_result" && ev.toolUseId) {
      parentId = toolUseSpanByUseId.get(ev.toolUseId) ?? null;
      // 找不到對應的 tool_use，這筆 tool_result 會變成獨立卡片而不是巢狀在工具呼叫底下。
      if (!parentId) reportFallback("normalizer/parentId", "tool-result-without-tool-use", { toolUseId: ev.toolUseId });
    } else if (ev.isSidechain && ev.parentUuid) {
      parentId = latestSpanByEventUuid.get(ev.parentUuid) ?? null;
      if (!parentId) reportFallback("normalizer/parentId", "sidechain-parent-not-seen", { parentUuid: ev.parentUuid });
    }

    const span: Span = {
      id,
      parentId,
      order: index,
      type,
      startedAt: ev.timestamp ?? null,
      durationMs: null,
      summary: summarize(ev),
      text: ev.text ?? "",
      tags: [],
      raw: ev.raw,
    };

    // `unknown` 是 adapter 對系統事件的代述 (回合中斷 / 上下文壓縮 / 配對失敗 / 未知型別)，
    // 型別上落到 assistant_msg 好讓節點視圖照常顯示，但它不是模型真的說的話——標記起來，
    // 讓逐字對話輸出能把它排除，不至於冒充成 AI 發言。
    if (ev.kind === "unknown") span.synthetic = true;

    /*
     * R12 M4：來歷原樣帶過去，不加工。
     *
     * 這裡刻意不做「沒有就補一個預設值」——缺席的意思是「來源沒有標」，而那跟「沒有來歷」
     * 是兩件事。要區分它們的是側寫的 `attribution.kinds`（空陣列 = 這套系統不記錄），
     * 不是在這裡塞一個佔位字串。
     */
    if (ev.attribution?.length) span.attribution = ev.attribution;

    if (ev.kind === "tool_use") {
      // R11.2 R2: a missing tool name is a *named* degradation, not a silent one — the reader
      // already sees it (this same UNNAMED_TOOL_NAME feeds both the card title and the tool
      // badge below), and the adapter that produced it already counts the condition in its own
      // Diagnostic aggregate (e.g. Codex's CODEX_EXEC_TOOL_NAME_UNRESOLVED). reportFallback is
      // reserved for a substitution the user cannot observe, so it does not belong here.
      span.tool = { name: ev.toolName ?? UNNAMED_TOOL_NAME, params: ev.toolInput ?? {} };
      if (ev.toolUseId) toolUseSpanByUseId.set(ev.toolUseId, id);
    }
    if (ev.kind === "tool_result") {
      // R10-B: `undefined` means the source recorded no outcome — keep that distinct from "succeeded".
      span.result = {
        isError: Boolean(ev.isError),
        ...(ev.isError === undefined ? { outcomeUnknown: true } : {}),
        text: ev.text ?? "",
      };
    }

    spans.push(span);
    if (ev.uuid) latestSpanByEventUuid.set(ev.uuid, id);
    if (ev.isSidechain) {
      const root = sidechainRoot(ev, `sidechain-${index}`);
      const ids = sidechainSpanIds.get(root) ?? [];
      ids.push(id);
      sidechainSpanIds.set(root, ids);
    }
  });

  const groups = [...sidechainSpanIds.values()].map((spanIds, index) => ({
    id: `group-subagent-${index}`,
    label: `子代理分支 ${index + 1}`,
    spanIds,
    kind: "subagent" as const,
  }));

  return {
    schemaVersion: SCHEMA_VERSION,
    session: finalizeMeta(parsed.meta, parsed.events),
    spans,
    groups,
  };
}
