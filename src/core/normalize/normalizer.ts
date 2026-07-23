/**
 * Normalizer：RawEvent[] → SessionDocument (Span Tree)
 * 只依賴 RawEvent 中介格式與 Span Tree 契約，與任何特定來源解耦。
 * 此階段只建立節點與基本巢狀關係；標籤與分組交由 Denoiser。
 */
import type { ParseResult } from "@/core/adapters/types";
import type { RawEvent } from "@/core/adapters/types";
import { reportFallback } from "@/core/diagnostics";
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
  unknown: "assistant_msg",
};

/** 取單行摘要。 */
function firstLine(text: string, max = 90): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? line.slice(0, max) + "…" : line;
}

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
      return summarizeTool(ev.toolName ?? "tool", ev.toolInput ?? {});
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

const HEADER_LINE_RE = /^#[^\n]*\n?/;
const HEADER_CONTINUATION_RE = /^(?:[ \t]+[^\n]*\n?|[-*][ \t][^\n]*\n?|\d+[.)][ \t][^\n]*\n?|[ \t]*\n)/;
const XML_BLOCK_RE = /^<([A-Za-z_][\w-]*)>[\s\S]*?<\/\1>/;
/** 安全上限，避免病態輸入 (標籤永不閉合等) 造成無限迴圈；真實訊息不會疊這麼多層。 */
const STRIP_ITERATION_LIMIT = 50;

/**
 * 剝除合成的附件／系統前言區塊，直到遇到真正的一般文字行為止：
 * - 以 `#` 開頭的標頭行，及其後續縮排／清單內容（如 Codex 的
 *   「# Files mentioned by the user」附件展開）。
 * - `<tag>...</tag>` 這類 XML 包裹區塊（如 Codex 環境注入的
 *   `<recommended_plugins>`／`<INSTRUCTIONS>` 前言），即使收尾標籤跟下一段
 *   標頭黏在同一行（`</recommended_plugins># AGENTS.md instructions`）也能正確處理，
 *   因為是對整段文字做正則比對，不是逐行狀態機。
 * 找不到對應收尾標籤／不再匹配任何一種區塊時就停止，不猜測、保留原文。
 */
function stripSyntheticPreambleBlocks(text: string): string {
  let result = text.replace(/^\s+/, "");
  for (let i = 0; i < STRIP_ITERATION_LIMIT; i += 1) {
    const xmlMatch = XML_BLOCK_RE.exec(result);
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

const FALLBACK_TITLE_MAX_LENGTH = 48;

/** 規則式 session 標題 fallback（無 `ai-title`／等價欄位時使用，所有來源共用）。 */
function deriveFallbackTitle(events: RawEvent[]): string | undefined {
  const firstUserText = events.find((event) => event.kind === "user_text" && event.text?.trim());
  if (!firstUserText?.text) return undefined;

  const stripped = stripSyntheticPreambleBlocks(firstUserText.text);
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

    if (ev.kind === "tool_use") {
      if (!ev.toolName) reportFallback("normalizer/toolName", "tool-use-without-name", { spanId: id });
      span.tool = { name: ev.toolName ?? "unknown", params: ev.toolInput ?? {} };
      if (ev.toolUseId) toolUseSpanByUseId.set(ev.toolUseId, id);
    }
    if (ev.kind === "tool_result") {
      span.result = { isError: Boolean(ev.isError), text: ev.text ?? "" };
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
