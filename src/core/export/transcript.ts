/**
 * 對話紀錄投影：SessionDocument → TranscriptExport (純函式)。
 *
 * 這一層只做「挑選與分輪」，不做任何排版——排版由 transcriptMarkdown / transcriptHtml 負責。
 * 與 buildExport.ts 相同的紀律：不呼叫 Date.now()、不讀 store、不碰 DOM。
 *
 * 排除規則 (三種都不是主線對話的逐字內容)：
 * 1. `tool_result` — 工具輸出不是對話。需要「這中間做了什麼」時，由 tool_use 的單行摘要代表。
 * 2. `synthetic` — adapter 對系統事件的代述 (回合中斷／上下文壓縮／未知型別…)。型別上是
 *    assistant_msg，但模型並沒有說過這些話，留著會冒充成 AI 發言。
 * 3. 旁鏈 (子代理) — 預設排除；開啟後併入所在輪次，不另外切輪。
 *
 * 分輪規則：輪次邊界只由「主線的 user_msg」決定。旁鏈裡的 user_msg 是派給子代理的提問，
 * 不能拿來切主線的輪——否則開關 includeSubagents 會讓輪次編號跟著跳動。
 */
import type { SessionDocument, Span } from "@/types/spanTree";
import {
  TRANSCRIPT_EXPORT_VERSION,
  type TranscriptExport,
  type TranscriptMessage,
  type TranscriptOptions,
  type TranscriptStats,
  type TranscriptTurn,
} from "./contracts";

export interface BuildTranscriptOptions {
  /** ISO 8601 匯出時間；由呼叫端注入。 */
  exportedAt: string;
  /** 應用版本，取自 package.json version；由呼叫端注入。 */
  appVersion: string;
  options: TranscriptOptions;
}

/** 旁鏈 span id 集合：normalizer 已把子代理節點收進 kind === "subagent" 的群組。 */
function subagentSpanIds(doc: SessionDocument): Set<string> {
  const ids = new Set<string>();
  for (const group of doc.groups) {
    if (group.kind !== "subagent") continue;
    for (const spanId of group.spanIds) ids.add(spanId);
  }
  return ids;
}

/** 是否為逐字稿完全不看的節點 (與任何選項無關)。 */
function isOutOfScope(span: Span): boolean {
  return span.type === "tool_result" || span.type === "group" || span.synthetic === true;
}

export function buildTranscript(doc: SessionDocument, build: BuildTranscriptOptions): TranscriptExport {
  const { options } = build;
  const sidechain = subagentSpanIds(doc);

  const turns: TranscriptTurn[] = [];
  const stats: TranscriptStats = {
    turns: 0,
    userMessages: 0,
    assistantMessages: 0,
    thinkingBlocks: 0,
    toolCalls: 0,
    excludedSubagentSpans: 0,
  };

  /** 目前累積中的輪次；第一則主線提問之前的內容會先落進一個 user 為 null 的開場輪。 */
  let current: TranscriptTurn | null = null;

  const openTurn = (user: TranscriptTurn["user"], startedAt: string | null): void => {
    current = { index: turns.length + 1, startedAt, user, messages: [] };
    turns.push(current);
  };

  const pushMessage = (message: TranscriptMessage): void => {
    if (!current) openTurn(null, message.startedAt);
    current!.messages.push(message);
    if (current!.startedAt === null) current!.startedAt = message.startedAt;
  };

  for (const span of [...doc.spans].sort((a, b) => a.order - b.order)) {
    if (isOutOfScope(span)) continue;

    const isSubagent = sidechain.has(span.id);
    if (isSubagent && !options.includeSubagents) {
      stats.excludedSubagentSpans += 1;
      continue;
    }

    switch (span.type) {
      case "user_msg": {
        if (isSubagent) {
          // 派給子代理的提問：算一則訊息，不切主線的輪。
          pushMessage({ spanId: span.id, kind: "subagent_prompt", startedAt: span.startedAt, text: span.text, subagent: true });
          break;
        }
        stats.userMessages += 1;
        openTurn({ spanId: span.id, text: span.text }, span.startedAt);
        break;
      }

      case "thinking": {
        stats.thinkingBlocks += 1;
        if (!options.includeThinking) break;
        pushMessage({ spanId: span.id, kind: "thinking", startedAt: span.startedAt, text: span.text, subagent: isSubagent });
        break;
      }

      case "assistant_msg":
      case "subagent": {
        stats.assistantMessages += 1;
        pushMessage({ spanId: span.id, kind: "assistant", startedAt: span.startedAt, text: span.text, subagent: isSubagent });
        break;
      }

      case "tool_use": {
        stats.toolCalls += 1;
        if (!options.includeToolSummary) break;
        // 摘要是 normalizer 產好的單行說明 (如 `Read TodoList.jsx`)，不含參數與結果全文。
        pushMessage({ spanId: span.id, kind: "tool_summary", startedAt: span.startedAt, text: span.summary, subagent: isSubagent });
        break;
      }
    }
  }

  stats.turns = turns.length;

  return {
    ditExport: "transcript",
    exportVersion: TRANSCRIPT_EXPORT_VERSION,
    exportedAt: build.exportedAt,
    appVersion: build.appVersion,
    session: doc.session,
    options,
    stats,
    turns,
  };
}
