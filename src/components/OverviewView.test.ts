import { describe, expect, it } from "vitest";
import source from "./OverviewView.tsx?raw";

/*
 * R12 M2 (author ruling 2026-08-26): the symbol guide is GONE from the Overview, and the load
 * entries take the slot it held. SA-02's order is otherwise unchanged, so this test keeps
 * guarding it rather than being deleted along with the legend.
 *
 * Why the guide went rather than being fixed: the author reports it as the output of a failed
 * implementation, raised before and never repaired. A wrong explanation is worse than none —
 * it gets believed. The definitions themselves are not orphaned: `core/view/categoryDefinitions`
 * is still the single source and `SessionMapDialog` still renders it, so R9.1 RC-G's concern
 * ("the user cannot tell whether to trust this marker") still has a surface.
 */
describe("SA-02 overview information order", () => {
  it("keeps badge → title → purpose → three steps → CTA → load entries, in that order", () => {
    const markers = [
      "overview-badge",
      'id="overview-title"',
      "overview-purpose",
      "overview-steps",
      "overview-actions",
      "overview-load",
    ];
    const indices = markers.map((marker) => {
      const index = source.indexOf(marker);
      expect(index, `expected marker "${marker}" to exist in OverviewView.tsx`).toBeGreaterThan(-1);
      return index;
    });
    for (let i = 1; i < indices.length; i += 1) {
      expect(indices[i], `expected "${markers[i]}" to appear after "${markers[i - 1]}"`).toBeGreaterThan(indices[i - 1]);
    }
  });

  it("no longer carries the symbol guide, in any form", () => {
    // Not just the <details>: the whole thing, including the copy keys, so a later edit cannot
    // half-restore it and leave a guide the author already rejected.
    expect(source).not.toMatch(/overview-legend/);
    expect(source).not.toMatch(/t\.overview\.legend/);
  });

  it("gives the load entries their own row instead of the CTA's flex line", () => {
    // The reason the guide's slot was worth taking: a level-1 source picker is a paragraph plus
    // two buttons, and inside .overview-actions its heading sat beside the buttons.
    expect(source).toMatch(/<div className="overview-load">/);
    expect(source.indexOf("overview-load")).toBeGreaterThan(source.indexOf("overview-primary-action"));
  });
});
