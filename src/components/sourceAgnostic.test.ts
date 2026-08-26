/**
 * INV-R12-2 — the view layer must not branch on which agent system produced a session.
 *
 * This is the invariant the whole round exists to establish, so it gets a checker rather than a
 * comment. R10-B fixed exactly this defect in `denoise()`/`distill()` by introducing
 * `SourceProfile`; nothing made "source differences go through the profile" checkable, so it
 * regrew one layer up in discovery and cost R11 an acceptance round. A rule that lives only in
 * the memory of the round that wrote it does not survive the next round.
 *
 * Scope is `src/components/**` on purpose. Adapters ARE per-source modules — `claudeCodeJsonl.ts`
 * can only ever be Claude Code — and the profile is where source knowledge is supposed to live.
 * The view is the layer that must stay ignorant.
 */
import { describe, expect, it } from "vitest";

const sources = import.meta.glob("./**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** `source === "codex"`, `source !== 'claude-code'`, `=== SourceId.Codex`-ish shapes. */
const SOURCE_BRANCH = /[!=]==\s*["'`](claude-code|codex)["'`]|["'`](claude-code|codex)["'`]\s*[!=]==/;

const files = Object.entries(sources).filter(([path]) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"));

describe("INV-R12-2 · the view does not know which agent system it is rendering", () => {
  it("finds component sources to check (a silent zero would pass vacuously)", () => {
    // A glob that quietly matched nothing would make every assertion below trivially true.
    // Positive control for the checker itself.
    expect(files.length).toBeGreaterThan(20);
  });

  it("detects a source branch when one is present (positive control)", () => {
    expect(SOURCE_BRANCH.test(`if (doc.session.source === "claude-code") return null;`)).toBe(true);
    expect(SOURCE_BRANCH.test(`x !== 'codex'`)).toBe(true);
    // And does not fire on the things that legitimately mention a source id.
    expect(SOURCE_BRANCH.test(`t.browser.sourceLabels[entry.source]`)).toBe(false);
    expect(SOURCE_BRANCH.test(`profileFor(source).discovery.rootHint`)).toBe(false);
  });

  it("has no source branch anywhere under src/components/", () => {
    const offenders = files
      .filter(([, code]) => SOURCE_BRANCH.test(code))
      .map(([path]) => path);

    expect(
      offenders,
      "Source-specific behaviour belongs in src/core/source/profiles.ts, and reaches the view as " +
        "data (e.g. `span.attribution`, `profile.attribution.kinds`). See INV-R12-2.",
    ).toEqual([]);
  });
});
