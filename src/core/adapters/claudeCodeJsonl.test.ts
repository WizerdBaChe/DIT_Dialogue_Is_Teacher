import { describe, expect, it } from "vitest";
import { claudeCodeJsonlAdapter, SYSTEM_SUBTYPE_POLICY } from "@/core/adapters/claudeCodeJsonl";
import { buildSessionDocument } from "@/core/pipeline";
import { PipelineFatalError, type Diagnostic, type DiagnosticCode } from "@/core/diagnostics/contracts";
import type { ParseResult } from "@/core/adapters/types";

const codes = (diagnostics: Diagnostic[]): DiagnosticCode[] => diagnostics.map((d) => d.code);
const find = (diagnostics: Diagnostic[], code: DiagnosticCode): Diagnostic | undefined =>
  diagnostics.find((d) => d.code === code);

const line = (record: Record<string, unknown>): string => JSON.stringify(record);
const userLine = (text: string, id = "u1"): string =>
  line({ type: "user", uuid: id, parentUuid: null, sessionId: "s1", message: { role: "user", content: text } });

/**
 * 容錯測試 (PSM §3.2 R1)：損壞行 / 未知型別 / 空檔案不得整體拋例外，
 * diagnostics 需正確標出問題所在。
 */
describe("claudeCodeJsonlAdapter — fault tolerance", () => {
  it("skips a corrupted (non-JSON) line and records it, without throwing", () => {
    const raw = [
      userLine("hi"),
      "{not valid json,,,",
      line({ type: "assistant", uuid: "a1", parentUuid: "u1", sessionId: "s1", message: { role: "assistant", content: [{ type: "text", text: "hello" }] } }),
    ].join("\n");

    let result: ParseResult | undefined;
    expect(() => (result = claudeCodeJsonlAdapter.parse(raw))).not.toThrow();
    expect(find(result!.diagnostics, "LINE_PARSE_FAILED")).toMatchObject({ tier: "warn", count: 1 });
    expect(result!.events).toHaveLength(2);
  });

  it("keeps an unknown top-level type as an aggregated warn naming it, without throwing", () => {
    const raw = [userLine("hi"), line({ type: "totally-new-event-type", sessionId: "s1", foo: "bar" })].join("\n");

    const result = claudeCodeJsonlAdapter.parse(raw);
    expect(find(result.diagnostics, "UNKNOWN_RECORD_TYPE")).toMatchObject({
      tier: "warn",
      detail: "totally-new-event-type",
      count: 1,
    });
    expect(result.events).toHaveLength(1);
  });

  it("aggregates repeated unknown types into one diagnostic rather than flooding", () => {
    const raw = Array.from({ length: 12 }, () => line({ type: "mystery", sessionId: "s1" })).join("\n");
    const result = claudeCodeJsonlAdapter.parse(raw);
    expect(result.diagnostics.filter((d) => d.code === "UNKNOWN_RECORD_TYPE")).toHaveLength(1);
    expect(find(result.diagnostics, "UNKNOWN_RECORD_TYPE")?.count).toBe(12);
  });

  it("silently skips known noise types (info only, no event, no throw)", () => {
    const raw = [line({ type: "mode", sessionId: "s1" }), line({ type: "file-history-snapshot", sessionId: "s1" })].join("\n");

    const result = claudeCodeJsonlAdapter.parse(raw);
    expect(result.events).toHaveLength(0);
    expect(codes(result.diagnostics)).not.toContain("UNKNOWN_RECORD_TYPE");
    expect(find(result.diagnostics, "NOISE_SKIPPED")).toMatchObject({ tier: "info", count: 2 });
  });

  it("returns zero events with a diagnostic for a blank/whitespace-only input, without throwing", () => {
    const result = claudeCodeJsonlAdapter.parse("   \n\n  \t\n");
    expect(result.events).toHaveLength(0);
    expect(codes(result.diagnostics)).toContain("NO_EVENTS");
  });

  it("canParse returns false (not throws) for empty string", () => {
    expect(() => claudeCodeJsonlAdapter.canParse("")).not.toThrow();
    expect(claudeCodeJsonlAdapter.canParse("")).toBe(false);
  });
});

/**
 * R9 RC-2：`system` / `custom-title` / `pr-link` / `permission-mode` 是**標準格式**。
 * 全量掃描 140 個真實 transcript 時，這四種佔了 2334 行，全部落在未知型別分支。
 */
describe("claudeCodeJsonlAdapter — standard record types (R9 RC-2)", () => {
  it("emits an in-place marker for every 'marker' system subtype", () => {
    const markerSubtypes = Object.entries(SYSTEM_SUBTYPE_POLICY)
      .filter(([, policy]) => policy === "marker")
      .map(([subtype]) => subtype);
    expect(markerSubtypes.length).toBeGreaterThan(0);

    for (const subtype of markerSubtypes) {
      const raw = [
        userLine("first"),
        line({
          type: "system",
          subtype,
          sessionId: "s1",
          uuid: "sys",
          timestamp: "2026-07-27T00:00:01Z",
          content: "x",
          error: { status: 401, message: "boom" },
          compactMetadata: { trigger: "manual", preTokens: 100 },
          direction: "retry",
        }),
        line({ type: "assistant", uuid: "a1", sessionId: "s1", message: { role: "assistant", content: [{ type: "text", text: "after" }] } }),
      ].join("\n");

      const result = claudeCodeJsonlAdapter.parse(raw);
      expect(result.events.map((e) => e.kind)).toEqual(["user_text", "unknown", "assistant_text"]);
      expect(result.events[1].text).toBeTruthy();
      expect(codes(result.diagnostics)).not.toContain("UNKNOWN_RECORD_TYPE");
      expect(find(result.diagnostics, "MARKERS_EMITTED")).toMatchObject({ tier: "info" });
    }
  });

  it("drops every 'noise' system subtype with no event and no warn", () => {
    const noiseSubtypes = Object.entries(SYSTEM_SUBTYPE_POLICY)
      .filter(([, policy]) => policy === "noise")
      .map(([subtype]) => subtype);

    for (const subtype of noiseSubtypes) {
      const raw = [userLine("hi"), line({ type: "system", subtype, sessionId: "s1" })].join("\n");
      const result = claudeCodeJsonlAdapter.parse(raw);
      expect(result.events).toHaveLength(1);
      expect(result.diagnostics.filter((d) => d.tier === "warn")).toEqual([]);
      expect(find(result.diagnostics, "NOISE_SKIPPED")).toMatchObject({ tier: "info", count: 1 });
    }
  });

  it("shows an unrecognized system subtype as a marker plus an info diagnostic — never silently, never fatal", () => {
    const raw = [userLine("hi"), line({ type: "system", subtype: "brand_new_subtype", sessionId: "s1", content: "hello" })].join("\n");
    const result = claudeCodeJsonlAdapter.parse(raw);

    expect(result.events).toHaveLength(2);
    expect(result.events[1].text).toContain("brand_new_subtype");
    expect(find(result.diagnostics, "UNKNOWN_SYSTEM_SUBTYPE")).toMatchObject({ tier: "info", detail: "brand_new_subtype", count: 1 });
    expect(result.diagnostics.some((d) => d.tier === "warn" || d.tier === "fatal")).toBe(false);
  });

  it("carries compaction metadata into the marker text", () => {
    const raw = [
      userLine("hi"),
      line({ type: "system", subtype: "compact_boundary", sessionId: "s1", compactMetadata: { trigger: "manual", preTokens: 144838 } }),
    ].join("\n");
    const marker = claudeCodeJsonlAdapter.parse(raw).events[1];
    expect(marker.text).toContain("手動");
    expect(marker.text).toContain("144838");
  });

  it("prefers custom-title over ai-title regardless of order, last one wins within each", () => {
    const withCustomLast = [
      line({ type: "ai-title", aiTitle: "AI 取的標題", sessionId: "s1" }),
      line({ type: "custom-title", customTitle: "使用者取的標題", sessionId: "s1" }),
      userLine("hi"),
    ].join("\n");
    expect(claudeCodeJsonlAdapter.parse(withCustomLast).meta.title).toBe("使用者取的標題");

    const withAiLast = [
      line({ type: "custom-title", customTitle: "使用者取的標題", sessionId: "s1" }),
      line({ type: "ai-title", aiTitle: "AI 取的標題", sessionId: "s1" }),
      userLine("hi"),
    ].join("\n");
    expect(claudeCodeJsonlAdapter.parse(withAiLast).meta.title).toBe("使用者取的標題");

    const twoAiTitles = [
      line({ type: "ai-title", aiTitle: "舊標題", sessionId: "s1" }),
      line({ type: "ai-title", aiTitle: "新標題", sessionId: "s1" }),
      userLine("hi"),
    ].join("\n");
    expect(claudeCodeJsonlAdapter.parse(twoAiTitles).meta.title).toBe("新標題");
  });

  it("collects pr-link records into meta.prLinks", () => {
    const raw = [
      userLine("hi"),
      line({ type: "pr-link", sessionId: "s1", prNumber: 1, prUrl: "https://github.com/o/r/pull/1", prRepository: "o/r" }),
    ].join("\n");
    const result = claudeCodeJsonlAdapter.parse(raw);
    expect(result.meta.prLinks).toEqual([{ number: 1, url: "https://github.com/o/r/pull/1", repository: "o/r" }]);
    expect(codes(result.diagnostics)).not.toContain("UNKNOWN_RECORD_TYPE");
  });

  it("REGRESSION: the four types that used to warn produce zero warn/fatal diagnostics", () => {
    // RC-2/RC-3 的直接回歸測試：以前這四種型別各自出一條 warning，
    // 於是一份純對話 session 也會被強制彈窗攔下來。
    const raw = [
      userLine("真的使用者訊息"),
      line({ type: "custom-title", customTitle: "標題", sessionId: "s1" }),
      line({ type: "system", subtype: "stop_hook_summary", sessionId: "s1" }),
      line({ type: "system", subtype: "compact_boundary", sessionId: "s1", compactMetadata: { trigger: "auto", preTokens: 1 } }),
      line({ type: "pr-link", sessionId: "s1", prNumber: 2, prUrl: "https://example.com/pull/2", prRepository: "o/r" }),
      line({ type: "permission-mode", permissionMode: "default", sessionId: "s1" }),
    ].join("\n");

    const result = claudeCodeJsonlAdapter.parse(raw);
    expect(result.diagnostics.filter((d) => d.tier !== "info")).toEqual([]);
  });
});

describe("claudeCodeJsonlAdapter — source-injected preamble strip (R7.5 W6/AN-1)", () => {
  it("drops a purely-injected slash-command user message — no user_text card at all", () => {
    const raw = userLine("<command-name>/compact</command-name>\n<command-message>Compacted</command-message>\n<command-args></command-args>");
    const result = claudeCodeJsonlAdapter.parse(raw);
    expect(result.events.filter((e) => e.kind === "user_text")).toHaveLength(0);
  });

  it("strips a <system-reminder> preamble and keeps only the real text (array content block)", () => {
    const raw = line({
      type: "user",
      uuid: "u1",
      parentUuid: null,
      sessionId: "s1",
      message: { role: "user", content: [{ type: "text", text: "<system-reminder>\nbackground task notice\n</system-reminder>\nactual follow-up question" }] },
    });
    const result = claudeCodeJsonlAdapter.parse(raw);
    expect(result.events).toEqual([expect.objectContaining({ kind: "user_text", text: "actual follow-up question" })]);
  });

  it("does not touch tool_result blocks", () => {
    const raw = line({
      type: "user",
      uuid: "u1",
      parentUuid: null,
      sessionId: "s1",
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "<not-a-real-tag>output text</not-a-real-tag>" }] },
    });
    const result = claudeCodeJsonlAdapter.parse(raw);
    expect(result.events).toEqual([expect.objectContaining({ kind: "tool_result", text: "<not-a-real-tag>output text</not-a-real-tag>" })]);
  });
});

describe("buildSessionDocument — fault tolerance at pipeline level", () => {
  it("throws a typed PipelineFatalError (not a raw exception) for a completely empty file", () => {
    expect(() => buildSessionDocument("")).toThrow(PipelineFatalError);
    try {
      buildSessionDocument("");
      expect.unreachable();
    } catch (error) {
      expect((error as PipelineFatalError).diagnostic).toMatchObject({ tier: "fatal", code: "EMPTY_INPUT" });
    }
  });

  it("tolerates a mix of corrupted lines and unknown types, still producing a document with diagnostics", () => {
    const raw = [
      userLine("刪除待辦後沒更新"),
      "}}}broken{{{",
      line({ type: "mystery-event", sessionId: "s1" }),
      line({ type: "assistant", uuid: "a1", parentUuid: "u1", sessionId: "s1", message: { role: "assistant", model: "m", content: [{ type: "text", text: "好的" }] } }),
    ].join("\n");

    const { doc, diagnostics } = buildSessionDocument(raw);
    expect(doc.spans.length).toBe(2);
    expect(codes(diagnostics)).toContain("LINE_PARSE_FAILED");
    expect(find(diagnostics, "UNKNOWN_RECORD_TYPE")?.detail).toBe("mystery-event");
  });
});
