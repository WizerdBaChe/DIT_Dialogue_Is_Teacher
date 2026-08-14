import { describe, expect, it } from "vitest";
import { collapseBlankLines, fileStamp, formatDateTime, formatTime } from "./transcriptFormat";

describe("formatDateTime / formatTime", () => {
  it("原樣取自 ISO 字串，不做時區換算", () => {
    expect(formatDateTime("2026-06-25T10:00:00.000Z")).toBe("2026-06-25 10:00");
    expect(formatTime("2026-06-25T10:00:00.000Z")).toBe("10:00");
  });

  it("帶時區位移的 ISO 也照原文顯示，不改寫時刻", () => {
    expect(formatDateTime("2026-06-25T18:30:00+08:00")).toBe("2026-06-25 18:30");
  });

  it("null 或非 ISO 一律回 null，不猜測", () => {
    expect(formatDateTime(null)).toBeNull();
    expect(formatDateTime("昨天")).toBeNull();
    expect(formatTime("")).toBeNull();
  });
});

describe("collapseBlankLines", () => {
  it("三行以上的空行收成一個空行，並去除頭尾空白", () => {
    expect(collapseBlankLines("\n\nA\n\n\n\nB\n\n")).toBe("A\n\nB");
  });

  it("保留單一空行與行內縮排", () => {
    expect(collapseBlankLines("A\n\n  indented")).toBe("A\n\n  indented");
  });

  it("正規化 CRLF", () => {
    expect(collapseBlankLines("A\r\nB")).toBe("A\nB");
  });
});

describe("fileStamp", () => {
  it("以呼叫端注入的時間產生檔名片段（本地時間、補零）", () => {
    expect(fileStamp(new Date(2026, 7, 11, 9, 5))).toBe("20260811-0905");
  });
});
