import { describe, expect, it } from "vitest";
import { GROUP_KINDS } from "@/types/spanTree";
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

describe("card.groupKindTag covers every GroupKind, in both locales (R11.2 M6, B15)", () => {
  // GROUP_KINDS is the canonical source the GroupKind union is derived from
  // (src/types/spanTree.ts) — not a hand-listed array a future editor would
  // separately have to remember to update. This test fails if a GroupKind is
  // ever added/removed from GROUP_KINDS without card.groupKindTag following,
  // in either locale.
  it("has a non-empty label for every GroupKind, and no extra keys, in each locale", () => {
    for (const locale of ["zh-TW", "en"] as const) {
      const table = MESSAGES[locale].card.groupKindTag;

      for (const kind of GROUP_KINDS) {
        expect(table[kind], `${locale}.card.groupKindTag.${kind}`).toBeTruthy();
      }

      expect(Object.keys(table).sort()).toEqual([...GROUP_KINDS].sort());
    }
  });
});
