import { describe, expect, it } from "vitest";
import { MESSAGES } from "./locales";

describe("provider labels (LS-04, RC-D)", () => {
  it("keep the short-label contract so the select never re-overlaps the arrow", () => {
    for (const locale of ["zh-TW", "en"] as const) {
      for (const value of Object.values(MESSAGES[locale].provider)) {
        expect(value.length).toBeLessThanOrEqual(10);
      }
    }
  });
});
