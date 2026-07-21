import { describe, expect, it } from "vitest";
import { buildSessionDocument } from "@/core/pipeline";
import { sampleSession } from "@/fixtures";
import { SCHEMA_VERSION } from "@/types/spanTree";
import { buildSessionExport } from "./buildExport";
import { EXPORT_VERSION } from "./contracts";

describe("buildSessionExport", () => {
  const { doc } = buildSessionDocument(sampleSession);
  const options = { exportedAt: "2026-07-21T00:00:00.000Z", appVersion: "0.1.0", annotations: {} };

  it("包裝層欄位齊全", () => {
    const result = buildSessionExport(doc, options);
    expect(result.ditExport).toBe("session");
    expect(result.exportVersion).toBe(EXPORT_VERSION);
    expect(result.exportedAt).toBe(options.exportedAt);
    expect(result.appVersion).toBe(options.appVersion);
    expect(result.annotations).toEqual({});
  });

  it("document 與輸入 deep-equal（未被改寫）", () => {
    const result = buildSessionExport(doc, options);
    expect(result.document).toEqual(doc);
  });

  it("exportVersion 與 SCHEMA_VERSION 為兩個獨立值", () => {
    expect(EXPORT_VERSION).not.toBe(SCHEMA_VERSION);
  });

  it("JSON round-trip 後 spans.length 與 skeleton 不變", () => {
    const result = buildSessionExport(doc, options);
    const roundTripped = JSON.parse(JSON.stringify(result)) as typeof result;
    expect(roundTripped.document.spans.length).toBe(doc.spans.length);
    expect(roundTripped.document.skeleton).toEqual(doc.skeleton);
  });

  it("不省略 annotations 欄位；有講解時原封帶出", () => {
    const annotations = { "span-1": { what: "x", why: "y", generalLesson: "z", confidence: 0.9, provider: "ollama" as const } };
    const result = buildSessionExport(doc, { ...options, annotations });
    expect(result.annotations).toEqual(annotations);
  });
});
