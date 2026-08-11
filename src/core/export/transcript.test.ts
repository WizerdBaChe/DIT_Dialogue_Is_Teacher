import { describe, expect, it } from "vitest";
import { normalize } from "@/core/normalize/normalizer";
import { buildSessionDocument } from "@/core/pipeline";
import { sampleSession, subagentSession } from "@/fixtures";
import type { RawEvent } from "@/core/adapters/types";
import type { SessionDocument } from "@/types/spanTree";
import { buildTranscript } from "./transcript";
import { DEFAULT_TRANSCRIPT_OPTIONS, TRANSCRIPT_EXPORT_VERSION, type TranscriptOptions } from "./contracts";

const BUILD = { exportedAt: "2026-08-11T12:00:00.000Z", appVersion: "0.3.1" };

function docFrom(events: RawEvent[]): SessionDocument {
  return normalize({ meta: { id: "s1", title: "T" }, events, warnings: [] });
}

function transcriptOf(events: RawEvent[], options: Partial<TranscriptOptions> = {}) {
  return buildTranscript(docFrom(events), { ...BUILD, options: { ...DEFAULT_TRANSCRIPT_OPTIONS, ...options } });
}

/** 一輪完整的互動：提問 → 思考 → 回覆 → 工具呼叫 → 工具結果。 */
const ONE_TURN: RawEvent[] = [
  { kind: "user_text", uuid: "u1", text: "Q1", raw: {} },
  { kind: "thinking", uuid: "a1", parentUuid: "u1", text: "T1", raw: {} },
  { kind: "assistant_text", uuid: "a1b", parentUuid: "u1", text: "A1", raw: {} },
  { kind: "tool_use", uuid: "a1c", parentUuid: "u1", toolName: "Read", toolInput: { file_path: "src/App.tsx" }, toolUseId: "t1", raw: {} },
  { kind: "tool_result", uuid: "u2", parentUuid: "a1c", toolUseId: "t1", text: "file contents", raw: {} },
];

describe("buildTranscript — 分輪", () => {
  it("以主線 user_msg 切輪，並保留該輪之後的所有 AI 輸出", () => {
    const transcript = transcriptOf([
      ...ONE_TURN,
      { kind: "user_text", uuid: "u3", text: "Q2", raw: {} },
      { kind: "assistant_text", uuid: "a2", parentUuid: "u3", text: "A2", raw: {} },
    ]);

    expect(transcript.turns).toHaveLength(2);
    expect(transcript.turns[0].index).toBe(1);
    expect(transcript.turns[0].user?.text).toBe("Q1");
    expect(transcript.turns[0].messages.map((m) => m.kind)).toEqual(["thinking", "assistant", "tool_summary"]);
    expect(transcript.turns[1].user?.text).toBe("Q2");
    expect(transcript.turns[1].messages.map((m) => m.text)).toEqual(["A2"]);
  });

  it("第一則提問之前的內容落進 user 為 null 的開場輪，不被丟掉", () => {
    const transcript = transcriptOf([
      { kind: "assistant_text", uuid: "a0", text: "接續上次的工作", raw: {} },
      { kind: "user_text", uuid: "u1", text: "Q1", raw: {} },
    ]);

    expect(transcript.turns).toHaveLength(2);
    expect(transcript.turns[0].user).toBeNull();
    expect(transcript.turns[0].messages.map((m) => m.text)).toEqual(["接續上次的工作"]);
    expect(transcript.turns[1].user?.text).toBe("Q1");
  });

  it("輪次時間取該輪提問的時間", () => {
    const transcript = transcriptOf([
      { kind: "user_text", uuid: "u1", timestamp: "2026-06-25T10:00:00.000Z", text: "Q1", raw: {} },
      { kind: "assistant_text", uuid: "a1", parentUuid: "u1", timestamp: "2026-06-25T10:00:08.000Z", text: "A1", raw: {} },
    ]);
    expect(transcript.turns[0].startedAt).toBe("2026-06-25T10:00:00.000Z");
  });
});

describe("buildTranscript — 排除規則", () => {
  it("工具結果不進逐字稿（由 tool_use 的單行摘要代表）", () => {
    const transcript = transcriptOf(ONE_TURN);
    const summaries = transcript.turns[0].messages.filter((m) => m.kind === "tool_summary");
    expect(summaries.map((m) => m.text)).toEqual(["Read App.tsx"]);
    expect(JSON.stringify(transcript)).not.toContain("file contents");
  });

  it("adapter 代述的系統事件不冒充成 AI 發言", () => {
    const transcript = transcriptOf([
      { kind: "user_text", uuid: "u1", text: "Q1", raw: {} },
      { kind: "unknown", uuid: "x1", text: "此回合被中斷（原因：使用者取消）", raw: {} },
      { kind: "assistant_text", uuid: "a1", text: "A1", raw: {} },
    ]);

    expect(transcript.turns[0].messages.map((m) => m.text)).toEqual(["A1"]);
    expect(transcript.stats.assistantMessages).toBe(1);
  });
});

describe("buildTranscript — 選項", () => {
  it("關掉思考後內容不輸出，但統計仍誠實記錄它存在", () => {
    const transcript = transcriptOf(ONE_TURN, { includeThinking: false });
    expect(transcript.turns[0].messages.map((m) => m.kind)).toEqual(["assistant", "tool_summary"]);
    expect(transcript.stats.thinkingBlocks).toBe(1);
  });

  it("關掉工具摘要後同理", () => {
    const transcript = transcriptOf(ONE_TURN, { includeToolSummary: false });
    expect(transcript.turns[0].messages.map((m) => m.kind)).toEqual(["thinking", "assistant"]);
    expect(transcript.stats.toolCalls).toBe(1);
  });
});

describe("buildTranscript — 子代理旁鏈", () => {
  const WITH_SIDECHAIN: RawEvent[] = [
    { kind: "user_text", uuid: "u1", text: "Q1", raw: {} },
    { kind: "assistant_text", uuid: "a1", parentUuid: "u1", text: "派一個子代理去掃描", raw: {} },
    { kind: "user_text", uuid: "s0", parentUuid: "a1", isSidechain: true, text: "掃描整個專案", raw: {} },
    { kind: "thinking", uuid: "s1", parentUuid: "s0", isSidechain: true, text: "先用 Grep", raw: {} },
    { kind: "assistant_text", uuid: "s2", parentUuid: "s1", isSidechain: true, text: "掃描完成", raw: {} },
    { kind: "assistant_text", uuid: "a2", parentUuid: "s2", text: "清單整理好了", raw: {} },
  ];

  it("預設排除旁鏈，並回報被排除的節點數", () => {
    const transcript = transcriptOf(WITH_SIDECHAIN);
    expect(transcript.turns[0].messages.map((m) => m.text)).toEqual(["派一個子代理去掃描", "清單整理好了"]);
    expect(transcript.stats.excludedSubagentSpans).toBe(3);
  });

  it("開啟後併入所在輪次並標記來源", () => {
    const transcript = transcriptOf(WITH_SIDECHAIN, { includeSubagents: true });
    expect(transcript.turns[0].messages.map((m) => m.kind))
      .toEqual(["assistant", "subagent_prompt", "thinking", "assistant", "assistant"]);
    expect(transcript.turns[0].messages.filter((m) => m.subagent)).toHaveLength(3);
    expect(transcript.stats.excludedSubagentSpans).toBe(0);
  });

  it("旁鏈裡的提問不切主線的輪——開關子代理不會讓輪次編號跳動", () => {
    const off = transcriptOf(WITH_SIDECHAIN);
    const on = transcriptOf(WITH_SIDECHAIN, { includeSubagents: true });
    expect(on.turns).toHaveLength(1);
    expect(on.turns.map((t) => t.index)).toEqual(off.turns.map((t) => t.index));
    expect(on.stats.userMessages).toBe(off.stats.userMessages);
  });
});

describe("buildTranscript — 包裝層與真實 fixture", () => {
  it("包裝層欄位齊全，且與 session 存檔的標記可區分", () => {
    const transcript = transcriptOf(ONE_TURN);
    expect(transcript.ditExport).toBe("transcript");
    expect(transcript.exportVersion).toBe(TRANSCRIPT_EXPORT_VERSION);
    expect(transcript.exportedAt).toBe(BUILD.exportedAt);
    expect(transcript.appVersion).toBe(BUILD.appVersion);
    expect(transcript.options).toEqual(DEFAULT_TRANSCRIPT_OPTIONS);
  });

  it("sampleSession：對得上 span 型別的實際數量", () => {
    const { doc } = buildSessionDocument(sampleSession);
    const transcript = buildTranscript(doc, { ...BUILD, options: DEFAULT_TRANSCRIPT_OPTIONS });

    expect(transcript.session.title).toBe("修好刪除待辦後列表不更新");
    expect(transcript.stats.userMessages).toBe(doc.spans.filter((s) => s.type === "user_msg").length);
    expect(transcript.stats.assistantMessages).toBe(doc.spans.filter((s) => s.type === "assistant_msg").length);
    expect(transcript.stats.thinkingBlocks).toBe(doc.spans.filter((s) => s.type === "thinking").length);
    expect(transcript.stats.toolCalls).toBe(doc.spans.filter((s) => s.type === "tool_use").length);
  });

  it("subagentSession：預設輸出不含旁鏈內容", () => {
    const { doc } = buildSessionDocument(subagentSession);
    const transcript = buildTranscript(doc, { ...BUILD, options: DEFAULT_TRANSCRIPT_OPTIONS });
    const sidechain = new Set(doc.groups.filter((g) => g.kind === "subagent").flatMap((g) => g.spanIds));

    const emitted = transcript.turns.flatMap((turn) => turn.messages.map((m) => m.spanId));
    expect(emitted.filter((spanId) => sidechain.has(spanId))).toEqual([]);
    expect(transcript.stats.excludedSubagentSpans).toBeGreaterThan(0);
  });

  it("逐字稿不夾帶 raw 事件——它不是用來還原視圖的", () => {
    const { doc } = buildSessionDocument(sampleSession);
    const transcript = buildTranscript(doc, { ...BUILD, options: DEFAULT_TRANSCRIPT_OPTIONS });
    expect(JSON.stringify(transcript)).not.toContain('"raw"');
  });
});

describe("buildTranscript — Codex 端到端（原分類缺口）", () => {
  /** Codex 的中斷／壓縮事件走 kind:"unknown"，型別上落到 assistant_msg——逐字稿必須擋掉。 */
  const CODEX_JSONL = [
    JSON.stringify({ type: "session_meta", payload: { session_id: "codex-1", cwd: "/repo" } }),
    JSON.stringify({
      type: "response_item",
      timestamp: "2026-07-01T09:00:00.000Z",
      payload: { type: "message", role: "user", content: [{ type: "input_text", text: "幫我加上重試機制" }] },
    }),
    JSON.stringify({
      type: "response_item",
      timestamp: "2026-07-01T09:00:05.000Z",
      payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "我先看現在的呼叫端。" }] },
    }),
    JSON.stringify({
      type: "event_msg",
      timestamp: "2026-07-01T09:00:09.000Z",
      payload: { type: "turn_aborted", reason: "user_interrupt" },
    }),
    JSON.stringify({
      type: "event_msg",
      timestamp: "2026-07-01T09:00:10.000Z",
      payload: { type: "context_compacted" },
    }),
  ].join("\n");

  it("中斷與壓縮的系統敘述不會冒充成 AI 發言", () => {
    const { doc } = buildSessionDocument(CODEX_JSONL);
    const transcript = buildTranscript(doc, { ...BUILD, options: DEFAULT_TRANSCRIPT_OPTIONS });

    // 節點視圖仍看得到這兩張卡片——它們只是被標記，沒有被刪掉。
    expect(doc.spans.filter((span) => span.synthetic).map((span) => span.text))
      .toEqual(["此回合被中斷（原因：user_interrupt）", "對話歷史在此處被壓縮，之後的上下文已重整"]);

    const emitted = transcript.turns.flatMap((turn) => turn.messages.map((m) => m.text));
    expect(emitted).toEqual(["我先看現在的呼叫端。"]);
    expect(transcript.stats.assistantMessages).toBe(1);
    expect(transcript.turns[0].user?.text).toBe("幫我加上重試機制");
  });
});
