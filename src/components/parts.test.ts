import { describe, expect, it } from "vitest";
import { summarizeCollapsedIOText } from "./parts";

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
});
