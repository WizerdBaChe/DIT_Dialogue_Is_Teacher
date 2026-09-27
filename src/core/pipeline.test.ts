import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSessionDocument,
  buildSessionDocumentFromFiles,
  buildSessionDocumentFromParsedFiles,
  type ParsedFileOutcome,
} from "@/core/pipeline";
import { PipelineFatalError, type DiagnosticCode } from "@/core/diagnostics/contracts";
import { claudeCodeJsonlAdapter } from "@/core/adapters/claudeCodeJsonl";
import { chainChildSession, chainParentSession, r4MainSession, r4SubagentSession, sampleSession, subagentSession } from "@/fixtures";

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

  /*
   * R12 · DW-02 — the sync path gets the same per-file isolation the worker has had since R9.
   *
   * This is the regression case for the failure that made the fix worth doing: R11.2's F-01/F-02
   * fallback opened a route from a real user load to this function, so a throw here stopped being
   * unreachable. The repo invariant it restores is stated in AGENTS.md — "one unreadable file in
   * a batch must not fail the batch".
   */
  describe("per-file parse isolation (DW-02)", () => {
    const throwOnMarked = (): void => {
      const real = claudeCodeJsonlAdapter.parse.bind(claudeCodeJsonlAdapter);
      vi.spyOn(claudeCodeJsonlAdapter, "parse").mockImplementation((content: string) => {
        if (content.includes("EXPLODE")) throw new Error("adapter blew up");
        return real(content);
      });
    };
    afterEach(() => vi.restoreAllMocks());

    it("keeps the good files when one throws, instead of failing the whole batch", () => {
      throwOnMarked();
      const { doc, diagnostics } = buildSessionDocumentFromFiles([
        { path: "main.jsonl", content: r4MainSession },
        { path: "subagents/boom.jsonl", content: `${r4SubagentSession}\nEXPLODE` },
      ]);

      expect(doc.spans.length).toBeGreaterThan(0);
      const failed = diagnostics.find((d) => d.code === "FILE_PARSE_FAILED");
      expect(failed).toMatchObject({ tier: "warn", count: 1 });
      expect(failed?.detail).toContain("boom.jsonl");
      expect(diagnostics.some((d) => d.tier === "fatal")).toBe(false);
    });

    it("REGRESSION: before DW-02 this threw and took the batch with it", () => {
      throwOnMarked();
      expect(() => buildSessionDocumentFromFiles([
        { path: "main.jsonl", content: r4MainSession },
        { path: "subagents/boom.jsonl", content: `${r4SubagentSession}\nEXPLODE` },
      ])).not.toThrow();
    });

    it("still fails the batch when EVERY file throws — isolation is not suppression", () => {
      /*
       * 隔離的意思是「一個壞檔不牽連其他檔」，不是「壞了也當作沒事」。全滅仍必須是 fatal，
       * 而且是 `FILE_PARSE_FAILED` 而非 `NO_MAIN_TRANSCRIPT`——批次層報的是真正發生的事
       * （檔案解不開），不是它造成的後果（因此沒有主檔）。後者會把使用者指向錯的方向。
       */
      throwOnMarked();
      expectFatal(
        () => buildSessionDocumentFromFiles([{ path: "main.jsonl", content: `${r4MainSession}\nEXPLODE` }]),
        "FILE_PARSE_FAILED",
      );
    });

    it("does not change anything when no file throws", () => {
      const { diagnostics } = buildSessionDocumentFromFiles([
        { path: "main.jsonl", content: r4MainSession },
        { path: "subagents/agent-1.jsonl", content: r4SubagentSession },
      ]);
      expect(diagnostics).toEqual([]);
    });
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

  /**
   * 2026-09-compact-chain (T-008). The child fixture re-emits the parent's boundary, the compact
   * summary, the preserved records and the parent's post-boundary turn with their original uuids
   * (as a real Desktop resume does), then adds two records of its own.
   */
  it("chain — a continuation merges into its parent as ONE document, copies dropped, marker once", () => {
    const { doc, diagnostics } = buildSessionDocumentFromFiles([
      { path: "p/parent.jsonl", content: chainParentSession, role: "main" },
      { path: "p/child.jsonl", content: chainChildSession, role: "continuation" },
    ]);
    expect(doc.session.id).toBe("p-session");
    const summaries = doc.spans.map((span) => span.summary);
    const at = (needle: string): number => summaries.findIndex((summary) => summary.includes(needle));
    const count = (needle: string): number => summaries.filter((summary) => summary.includes(needle)).length;

    expect(count("壓縮")).toBe(1);                       // the parent's own boundary marker, once
    expect(count("第三步也完成了")).toBe(1);               // the copied post-boundary turn, once
    expect(count("子檔的新回答")).toBe(1);                 // the child's own turn, present
    expect(at("子檔的新回答")).toBeGreaterThan(at("第三步也完成了"));
    expect(at("第三步也完成了")).toBeGreaterThan(at("壓縮"));
    // boundary + summary + preserved assistant + copied user + copied assistant = 5 events
    expect(diagnostics.find((d) => d.code === "CHAIN_DUPLICATES_DROPPED")).toMatchObject({ tier: "info", count: 5 });
    expect(diagnostics.find((d) => d.code === "MULTIPLE_SESSIONS")).toBeUndefined();
  });

  it("chain — a continuation without its main is the named no_main state", () => {
    expectFatal(() => buildSessionDocumentFromFiles([
      { path: "p/child.jsonl", content: chainChildSession, role: "continuation" },
    ]), "NO_MAIN_TRANSCRIPT");
  });

  it("chain — without roles the two files are still two sessions (no guessing from content)", () => {
    expectFatal(() => buildSessionDocumentFromFiles([
      { path: "p/parent.jsonl", content: chainParentSession },
      { path: "p/child.jsonl", content: chainChildSession },
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

/**
 * R9.1 RC-C：子代理身分不能靠路徑字串。「選擇一則對話」的多選走一般 <input multiple>，
 * webkitRelativePath 是空字串，路徑會退化成裸檔名——`subagents/` 前綴整個消失。
 */
describe("subagent identity comes from content, not from the path (R9.1 RC-C)", () => {
  const subagentLine = (uuid: string) => JSON.stringify({
    type: "user", uuid, sessionId: "s1", isSidechain: true, agentId: "agent-a",
    timestamp: "2026-07-20T00:00:00Z", message: { role: "user", content: "go" },
  });
  const mainLine = JSON.stringify({
    type: "user", uuid: "u1", sessionId: "s1",
    timestamp: "2026-07-20T00:00:00Z", message: { role: "user", content: "please review this" },
  });

  it("throws NO_MAIN_TRANSCRIPT when every selected file is subagent-shaped, even with bare basenames", () => {
    expect(() => buildSessionDocumentFromFiles([
      { path: "agent-1.jsonl", content: subagentLine("s1") },
      { path: "agent-2.jsonl", content: subagentLine("s2") },
    ])).toThrowError(expect.objectContaining({ diagnostic: expect.objectContaining({ code: "NO_MAIN_TRANSCRIPT" }) }));
  });

  it("still picks the real main transcript when a bare-basename subagent is selected alongside it", () => {
    const result = buildSessionDocumentFromFiles([
      { path: "agent-1.jsonl", content: subagentLine("s1") },
      { path: "session.jsonl", content: mainLine },
    ]);
    expect(result.doc.spans.length).toBeGreaterThan(0);
  });
});
