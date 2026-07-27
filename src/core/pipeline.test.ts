import { describe, expect, it } from "vitest";
import {
  buildSessionDocument,
  buildSessionDocumentFromFiles,
  buildSessionDocumentFromParsedFiles,
  type ParsedFileOutcome,
} from "@/core/pipeline";
import { PipelineFatalError, type DiagnosticCode } from "@/core/diagnostics/contracts";
import { claudeCodeJsonlAdapter } from "@/core/adapters/claudeCodeJsonl";
import { r4MainSession, r4SubagentSession, sampleSession, subagentSession } from "@/fixtures";

/** 斷言拋出的是具名的 fatal，而不只是「有丟東西」。 */
function expectFatal(run: () => unknown, code: DiagnosticCode): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(PipelineFatalError);
    expect((error as PipelineFatalError).diagnostic).toMatchObject({ tier: "fatal", code });
    return;
  }
  expect.unreachable(`expected a fatal ${code}`);
}

const parsedFile = (path: string, content: string): ParsedFileOutcome => ({
  status: "parsed",
  path,
  parsed: claudeCodeJsonlAdapter.parse(content),
  inputBytes: content.length,
});

/**
 * SIT：pipeline 端到端快照。adapter → normalize → denoise → distill 的完整輸出，
 * 快照凍結，任何後續里程碑改動導致輸出漂移都會在此浮現 (見 PSM §3.2 R1)。
 */
describe("buildSessionDocument (pipeline snapshot)", () => {
  it("matches the snapshot for sampleSession fixture", () => {
    const { doc, diagnostics } = buildSessionDocument(sampleSession);
    expect(doc).toMatchSnapshot();
    expect(diagnostics).toMatchSnapshot();
  });

  it("matches the snapshot for subagentSession fixture", () => {
    const { doc, diagnostics } = buildSessionDocument(subagentSession);
    expect(doc).toMatchSnapshot();
    expect(diagnostics).toMatchSnapshot();
  });

  it("produces no diagnostics for the well-formed sample fixture", () => {
    const { diagnostics } = buildSessionDocument(sampleSession);
    expect(diagnostics).toEqual([]);
  });

  it("captures isSidechain events from the subagent fixture without throwing", () => {
    const { doc } = buildSessionDocument(subagentSession);
    const subagentGroup = doc.groups.find((group) => group.kind === "subagent");
    expect(subagentGroup?.spanIds.length).toBeGreaterThan(0);
    expect(doc.spans.find((span) => span.id === subagentGroup?.spanIds[0])?.parentId).not.toBeNull();
  });

  it("merges main and subagents/*.jsonl while preserving the cross-file parent branch", () => {
    const { doc, diagnostics } = buildSessionDocumentFromFiles([
      { path: "main.jsonl", content: r4MainSession },
      { path: "subagents/agent-1.jsonl", content: r4SubagentSession },
    ]);
    const group = doc.groups.find((candidate) => candidate.kind === "subagent");
    const firstBranchSpan = doc.spans.find((span) => span.id === group?.spanIds[0]);
    const parent = doc.spans.find((span) => span.id === firstBranchSpan?.parentId);

    expect(diagnostics).toEqual([]);
    expect(group?.spanIds).toHaveLength(4);
    expect(parent?.tool?.name).toBe("Task");
    expect(doc.spans.map((span) => span.startedAt)).toEqual([...doc.spans.map((span) => span.startedAt)].sort());
  });

  it("does not flag subagents/*.jsonl files with a different sessionId than main", () => {
    // subagents/ 底下的檔案本來就各自有自己的 sessionId，不該被誤判成「多個 session」。
    expect(() => buildSessionDocumentFromFiles([
      { path: "main.jsonl", content: r4MainSession },
      { path: "subagents/agent-1.jsonl", content: r4SubagentSession },
    ])).not.toThrow();
  });
});

/**
 * DSM-1 `collecting` 的結果狀態，每個一條 transition test。
 * (Prism F6：「沒有任何機器被測試斷言」是這兩個專案共有的缺陷。)
 */
describe("DSM-1 batch outcome machine (R9)", () => {
  it("ok — one parsed main file", () => {
    const { doc } = buildSessionDocumentFromParsedFiles([parsedFile("main.jsonl", r4MainSession)]);
    expect(doc.spans.length).toBeGreaterThan(0);
  });

  it("ok_partial — REGRESSION (RC-1a): a .meta.json sidecar no longer kills the batch", () => {
    // 真實的 <session-id>/subagents/ 目錄裡就是有這個旗檔。R9 之前它讓整批載入失敗，
    // 也就是「選一個真實 session 資料夾必定讀不到」的直接成因。
    const outcomes: ParsedFileOutcome[] = [
      parsedFile("main.jsonl", r4MainSession),
      parsedFile("subagents/agent-1.jsonl", r4SubagentSession),
      { status: "unrecognized", path: "subagents/agent-1.meta.json", inputBytes: 120 },
    ];

    const { doc, diagnostics } = buildSessionDocumentFromParsedFiles(outcomes);

    expect(doc.spans.length).toBeGreaterThan(0);
    const skipped = diagnostics.find((d) => d.code === "FILE_UNRECOGNIZED");
    expect(skipped).toMatchObject({ tier: "warn", count: 1 });
    expect(skipped?.detail).toContain("agent-1.meta.json");
    expect(diagnostics.some((d) => d.tier === "fatal")).toBe(false);
  });

  it("ok_partial — a file that threw while reading is reported, the rest still load", () => {
    const { doc, diagnostics } = buildSessionDocumentFromParsedFiles([
      parsedFile("main.jsonl", r4MainSession),
      { status: "parse_failed", path: "subagents/broken.jsonl", inputBytes: 10, detail: "read error" },
    ]);
    expect(doc.spans.length).toBeGreaterThan(0);
    expect(diagnostics.find((d) => d.code === "FILE_PARSE_FAILED")).toMatchObject({ tier: "warn", count: 1 });
  });

  it("no_main — REGRESSION (RC-1b): a subagent-only folder is a named state, not a silent promotion", () => {
    // 真實佈局是 <id>.jsonl 與 <id>/subagents/ 並排，主檔不在資料夾裡。選了資料夾就只會拿到
    // 子代理檔；R9 之前 `?? files[0]` 會把子代理檔當成主檔，長出一棵錯的樹。
    expectFatal(
      () => buildSessionDocumentFromParsedFiles([parsedFile("subagents/agent-1.jsonl", r4SubagentSession)]),
      "NO_MAIN_TRANSCRIPT",
    );
  });

  it("multi_session — two unrelated main transcripts", () => {
    expectFatal(() => buildSessionDocumentFromFiles([
      { path: "project-a/session-1.jsonl", content: sampleSession },
      { path: "project-b/session-2.jsonl", content: subagentSession },
    ]), "MULTIPLE_SESSIONS");
  });

  it("empty — nothing at all was supplied", () => {
    expectFatal(() => buildSessionDocumentFromParsedFiles([]), "EMPTY_INPUT");
  });

  it("all files unrecognized IS fatal — the tier depends on whether anything survived", () => {
    expectFatal(() => buildSessionDocumentFromParsedFiles([
      { status: "unrecognized", path: "a.meta.json", inputBytes: 5 },
      { status: "unrecognized", path: "b.meta.json", inputBytes: 5 },
    ]), "FILE_UNRECOGNIZED");
  });

  it("attributes each file's diagnostics to its own path", () => {
    const noisy = [
      JSON.stringify({ type: "user", uuid: "u9", parentUuid: null, sessionId: "sub-1", message: { role: "user", content: "hi" } }),
      "{{{broken",
    ].join("\n");
    const { diagnostics } = buildSessionDocumentFromParsedFiles([
      parsedFile("main.jsonl", r4MainSession),
      parsedFile("subagents/agent-1.jsonl", noisy),
    ]);
    expect(diagnostics.find((d) => d.code === "LINE_PARSE_FAILED")?.path).toBe("subagents/agent-1.jsonl");
  });
});

describe("buildSessionDocument — single-input fatal outcomes", () => {
  it("empty input", () => {
    expectFatal(() => buildSessionDocument(""), "EMPTY_INPUT");
    expectFatal(() => buildSessionDocument("   \n  \n"), "EMPTY_INPUT");
  });

  it("no adapter can parse the input", () => {
    expectFatal(() => buildSessionDocument("this is not jsonl at all"), "FILE_UNRECOGNIZED");
  });

  it("parsing yields zero renderable spans", () => {
    const noiseOnly = [
      JSON.stringify({ type: "mode", sessionId: "s1" }),
      JSON.stringify({ type: "file-history-snapshot", sessionId: "s1" }),
    ].join("\n");
    expectFatal(() => buildSessionDocument(noiseOnly), "NO_RENDERABLE_CONTENT");
  });
});
