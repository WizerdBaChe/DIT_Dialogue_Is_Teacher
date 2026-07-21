import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFallbackReport, mergeFallbackReport, reportFallback, resetFallbackReport } from "./diagnostics";

describe("fallback diagnostics", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetFallbackReport();
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    warn.mockClear();
  });

  it("accumulates counts per scope and reason and keeps the first detail", () => {
    reportFallback("a/one", "missing", { id: "first" });
    reportFallback("a/one", "missing", { id: "second" });
    reportFallback("b/two", "other");

    const report = getFallbackReport();
    expect(report).toHaveLength(2);
    expect(report[0]).toMatchObject({ scope: "a/one", reason: "missing", count: 2, firstDetail: { id: "first" } });
    expect(report[1]).toMatchObject({ scope: "b/two", reason: "other", count: 1 });
  });

  it("caps console output so a large session cannot flood the log", () => {
    for (let index = 0; index < 50; index += 1) reportFallback("noisy", "same-reason");

    // 前 3 次逐筆 + 第 4 次的「不再輸出」提示，之後全靜音。
    expect(warn).toHaveBeenCalledTimes(4);
    expect(getFallbackReport()[0].count).toBe(50);
  });

  it("merges worker-side records instead of dropping them", () => {
    reportFallback("shared", "reason", { from: "main" });
    mergeFallbackReport([
      { scope: "shared", reason: "reason", count: 4, firstDetail: { from: "worker" } },
      { scope: "worker-only", reason: "reason", count: 2 },
    ]);

    const report = getFallbackReport();
    expect(report.find((record) => record.scope === "shared")?.count).toBe(5);
    expect(report.find((record) => record.scope === "worker-only")?.count).toBe(2);
  });

  it("clears everything on reset so a report only describes the current session", () => {
    reportFallback("a", "b");
    resetFallbackReport();
    expect(getFallbackReport()).toEqual([]);
  });
});
