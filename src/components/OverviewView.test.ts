import { describe, expect, it } from "vitest";
import source from "./OverviewView.tsx?raw";

describe("SA-02 overview information order", () => {
  it("keeps badge → title → purpose → three steps → CTA → collapsed symbol guide, in that order", () => {
    const markers = [
      "overview-badge",
      'id="overview-title"',
      "overview-purpose",
      "overview-steps",
      "overview-actions",
      "overview-legend",
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

  it("collapses the symbol guide by default (no `open` attribute on <details>)", () => {
    expect(source).toMatch(/<details className="overview-legend">/);
    expect(source).not.toMatch(/<details className="overview-legend"[^>]*\bopen\b/);
  });
});
