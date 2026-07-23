import { describe, expect, it } from "vitest";
import { summarizeCollapsedIOText, summarizeParams } from "./parts";

describe("SA-04 collapsed IO evidence summary", () => {
  it("returns zero lines and an empty first line for empty text", () => {
    expect(summarizeCollapsedIOText("")).toEqual({ lineCount: 0, firstLine: "" });
  });

  it("returns one line for single-line text", () => {
    expect(summarizeCollapsedIOText("hello world")).toEqual({ lineCount: 1, firstLine: "hello world" });
  });

  it("counts lines and keeps the first line for multi-line text", () => {
    expect(summarizeCollapsedIOText("line1\nline2\nline3")).toEqual({ lineCount: 3, firstLine: "line1" });
  });

  it("truncates an overlong first line to 60 chars with an ellipsis", () => {
    const longLine = "a".repeat(80);
    const result = summarizeCollapsedIOText(`${longLine}\nsecond line`);
    expect(result.lineCount).toBe(2);
    expect(result.firstLine).toBe(`${"a".repeat(60)}…`);
  });

  it("does not truncate a first line at exactly the limit", () => {
    const exact = "b".repeat(60);
    expect(summarizeCollapsedIOText(exact)).toEqual({ lineCount: 1, firstLine: exact });
  });

  it("skips a leading structural-only line to find the first meaningful one (R7A-04)", () => {
    expect(summarizeCollapsedIOText('{\n  "a": 1\n}')).toEqual({ lineCount: 3, firstLine: '"a": 1' });
  });
});

describe("R7A-04 summarizeParams (structured param summary)", () => {
  it("(a) formats three scalar keys as count:3 with a key:value preview", () => {
    expect(summarizeParams({ a: 1, b: true, c: "x" })).toEqual({ count: 3, preview: "a: 1, b: true, c: x" });
  });

  it("(b) truncates a string value over 32 chars with an ellipsis", () => {
    const long = "x".repeat(40);
    const { preview } = summarizeParams({ path: long });
    expect(preview).toBe(`path: ${"x".repeat(32)}…`);
  });

  it("(c) renders array values as [n] and object values as {…}", () => {
    expect(summarizeParams({ items: [1, 2, 3], meta: { nested: true } })).toEqual({
      count: 2,
      preview: "items: [3], meta: {…}",
    });
  });

  it("(d) stops and appends an ellipsis once the preview exceeds 60 chars", () => {
    const params = { alpha: "a".repeat(20), beta: "b".repeat(20), gamma: "c".repeat(20) };
    const { preview } = summarizeParams(params);
    expect(preview.length).toBeLessThanOrEqual(61);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("(e) converts newlines in string values to spaces", () => {
    expect(summarizeParams({ text: "line1\nline2" })).toEqual({ count: 1, preview: "text: line1 line2" });
  });

  it("skips undefined/function values but still counts every top-level key", () => {
    expect(summarizeParams({ a: 1, skip: undefined, fn: () => {} })).toEqual({ count: 3, preview: "a: 1" });
  });

  it("(R7B-04, §B4.3) shows the value alone with no 'raw:' key prefix when the only key is 'raw'", () => {
    expect(summarizeParams({ raw: "tools.shell_command({})" })).toEqual({ count: 1, preview: "tools.shell_command({})" });
  });

  it("(R7B-04) still truncates a long raw value at 32 chars", () => {
    const long = "x".repeat(40);
    expect(summarizeParams({ raw: long })).toEqual({ count: 1, preview: `${"x".repeat(32)}…` });
  });

  it("(R7B-04) does not special-case a multi-key object that happens to include a 'raw' key", () => {
    expect(summarizeParams({ raw: "x", other: 1 })).toEqual({ count: 2, preview: "raw: x, other: 1" });
  });
});
