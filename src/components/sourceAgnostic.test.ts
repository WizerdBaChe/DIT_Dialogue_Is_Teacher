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

/**
 * The rule is not "no `===` against a source id" — it is **no source id, at all**.
 *
 * The first version of this checker enumerated comparison shapes and matched only `===`/`!==`.
 * Review caught that `switch (source) { case "codex": … }` slipped through, and the obvious
 * repair — add `case`, add `.includes` — failed its own positive control on the very next shape
 * (`["codex"].includes(source)` puts the literal on the other side). That is the tell: a gate
 * built by listing the syntaxes its author thought of will always be one syntax behind.
 *
 * So the property moved up a level, to something with no syntax to enumerate: a view file that
 * needs to WRITE the string `"codex"` is already source-aware, however it goes on to use it.
 * Source knowledge reaches the view as data — `profileFor(x).label`, `span.attribution`,
 * `profile.attribution.kinds` — and never as a literal. Verified to hold across every file under
 * `src/components/` at the time of writing, so it is a real constraint rather than an aspiration.
 */
const SOURCE_LITERAL = /["'`](claude-code|codex)["'`]/;

const files = Object.entries(sources).filter(([path]) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"));

describe("INV-R12-2 · the view does not know which agent system it is rendering", () => {
  it("finds component sources to check (a silent zero would pass vacuously)", () => {
    // A glob that quietly matched nothing would make every assertion below trivially true.
    // Positive control for the checker itself.
    expect(files.length).toBeGreaterThan(20);
  });

  it("catches a source branch in every syntax, because it does not depend on syntax", () => {
    // The four shapes that motivated this — two the old pattern caught, two it did not.
    expect(SOURCE_LITERAL.test(`if (doc.session.source === "claude-code") return null;`)).toBe(true);
    expect(SOURCE_LITERAL.test(`x !== 'codex'`)).toBe(true);
    expect(SOURCE_LITERAL.test(`switch (source) { case "codex": return <A/>; }`)).toBe(true);
    expect(SOURCE_LITERAL.test(`if (["codex"].includes(source)) return null;`)).toBe(true);
    // And a shape nobody has written yet, which is the point of not enumerating them.
    expect(SOURCE_LITERAL.test(`const style = { "codex": dim, "claude-code": bright }[source];`)).toBe(true);

    // Does not fire on the sanctioned route: source knowledge arrives as data.
    expect(SOURCE_LITERAL.test(`profileFor(entry.source).label`)).toBe(false);
    expect(SOURCE_LITERAL.test(`span.attribution?.map(...)`)).toBe(false);
  });

  it("has no source id written anywhere under src/components/", () => {
    const offenders = files
      .filter(([, code]) => SOURCE_LITERAL.test(code))
      .map(([path]) => path);

    expect(
      offenders,
      "A view that writes a source id is source-aware however it uses it. Source-specific " +
        "behaviour belongs in src/core/source/profiles.ts and reaches the view as data — " +
        "`profileFor(x).label`, `span.attribution`, `profile.attribution.kinds`. See INV-R12-2.",
    ).toEqual([]);
  });
});
