import { describe, expect, it } from "vitest";
import { claudeCodeJsonlAdapter } from "@/core/adapters/claudeCodeJsonl";
import { buildSessionDocument, PipelineError } from "@/core/pipeline";
import type { ParseResult } from "@/core/adapters/types";

/**
 * 容錯測試 (PSM §3.2 R1)：損壞行 / 未知型別 / 空檔案不得整體拋例外，
 * warnings 需正確標出問題所在。
 */
describe("claudeCodeJsonlAdapter — fault tolerance", () => {
  it("skips a corrupted (non-JSON) line and warns with its line number, without throwing", () => {
    const raw = [
      JSON.stringify({ type: "user", uuid: "u1", parentUuid: null, sessionId: "s1", message: { role: "user", content: "hi" } }),
      "{not valid json,,,",
      JSON.stringify({ type: "assistant", uuid: "a1", parentUuid: "u1", sessionId: "s1", message: { role: "assistant", content: [{ type: "text", text: "hello" }] } }),
    ].join("\n");

    let result: ParseResult | undefined;
    expect(() => (result = claudeCodeJsonlAdapter.parse(raw))).not.toThrow();
    expect(result!.warnings.some((w) => w.includes("第 2 行") && w.includes("JSON 解析失敗"))).toBe(true);
    expect(result!.events).toHaveLength(2);
  });

  it("skips an unknown event type and records a warning naming it, without throwing", () => {
    const raw = [
      JSON.stringify({ type: "user", uuid: "u1", parentUuid: null, sessionId: "s1", message: { role: "user", content: "hi" } }),
      JSON.stringify({ type: "totally-new-event-type", sessionId: "s1", foo: "bar" }),
    ].join("\n");

    const result = claudeCodeJsonlAdapter.parse(raw);
    expect(result.warnings.some((w) => w.includes("未知型別") && w.includes("totally-new-event-type"))).toBe(true);
    expect(result.events).toHaveLength(1);
  });

  it("silently skips known noise types (no warning, no event, no throw)", () => {
    const raw = [
      JSON.stringify({ type: "mode", sessionId: "s1" }),
      JSON.stringify({ type: "file-history-snapshot", sessionId: "s1" }),
    ].join("\n");

    const result = claudeCodeJsonlAdapter.parse(raw);
    expect(result.events).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("未知型別"))).toBe(false);
  });

  it("returns zero events with a warning for a blank/whitespace-only input, without throwing", () => {
    const result = claudeCodeJsonlAdapter.parse("   \n\n  \t\n");
    expect(result.events).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("未從輸入中解析出任何可呈現的事件"))).toBe(true);
  });

  it("canParse returns false (not throws) for empty string", () => {
    expect(() => claudeCodeJsonlAdapter.canParse("")).not.toThrow();
    expect(claudeCodeJsonlAdapter.canParse("")).toBe(false);
  });
});

describe("buildSessionDocument — fault tolerance at pipeline level", () => {
  it("throws a clean PipelineError (not a raw exception) for a completely empty file", () => {
    expect(() => buildSessionDocument("")).toThrow(PipelineError);
  });

  it("tolerates a mix of corrupted lines and unknown types, still producing a document with warnings", () => {
    const raw = [
      JSON.stringify({ type: "user", uuid: "u1", parentUuid: null, sessionId: "s1", message: { role: "user", content: "刪除待辦後沒更新" } }),
      "}}}broken{{{",
      JSON.stringify({ type: "mystery-event", sessionId: "s1" }),
      JSON.stringify({ type: "assistant", uuid: "a1", parentUuid: "u1", sessionId: "s1", message: { role: "assistant", model: "m", content: [{ type: "text", text: "好的" }] } }),
    ].join("\n");

    const { doc, warnings } = buildSessionDocument(raw);
    expect(doc.spans.length).toBe(2);
    expect(warnings.some((w) => w.includes("JSON 解析失敗"))).toBe(true);
    expect(warnings.some((w) => w.includes("未知型別") && w.includes("mystery-event"))).toBe(true);
  });
});
