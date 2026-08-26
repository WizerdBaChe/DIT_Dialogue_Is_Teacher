/**
 * INV-R12-1 — source knowledge lives in the profile, everywhere, not just in the view.
 *
 * `components/sourceAgnostic.test.ts` guards the view. This guards the rest of `src/`, and it is
 * the card that finally makes the invariant checkable rather than declared for a fourth time.
 *
 * **The property, stated honestly.** The original wording was "no `if (source === …)` outside
 * `profiles.ts`", which names a syntax rather than a property — the same mistake the view gate's
 * first regex made. Two things are legitimately allowed to know a source id:
 *
 *   1. A module that IS per-source. `claudeCodeJsonl.ts` can only ever be Claude Code; routing
 *      its own field names through a lookup table buys nothing.
 *   2. An exhaustively guarded dispatch — one where adding a `SourceId` fails to compile. That
 *      satisfies the invariant's actual purpose, which is that a new source can never silently
 *      do the wrong thing.
 *
 * Everything else must reach source knowledge as data. So this is an allow-list with a stated
 * reason per entry, not a pattern: a new file naming a source fails until someone adds it here
 * AND writes down why. Forcing that sentence is the point — it is what did not happen when
 * `normalizer.ts` acquired a silent `?? "claude-code"` default nobody noticed until M7.
 */
import { describe, expect, it } from "vitest";

const sources = import.meta.glob("/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const SOURCE_LITERAL = /["'`](claude-code|codex)["'`]/;

/** Comments may discuss a source freely — explaining history is not branching on it. */
const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ALLOWED: Record<string, string> = {
  "/src/types/spanTree.ts": "declares the SourceId union itself",
  "/src/core/source/profiles.ts": "IS the registry — the one place source knowledge belongs",
  "/src/core/adapters/claudeCodeJsonl.ts": "a per-source module; it can only ever be Claude Code",
  "/src/core/adapters/codexJsonl.ts": "a per-source module; it can only ever be Codex",
  "/src/core/index/classifySession.ts":
    "per-source rule dispatch, exhaustively guarded — the `never` assertion at the end makes a " +
    "third SourceId fail to compile, which is the invariant's purpose. Claude Code runs four " +
    "rules and Codex two of a different shape; they are not one rule set over different signals.",
  "/src/core/normalize/normalizer.ts":
    "keeps `?? \"claude-code\"` as a last-resort default for a meta with no source. Both adapters " +
    "always set it, so this is unreachable today; it is audible via reportFallback rather than " +
    "silent, which is what R12 M7 fixed.",
};

const files = Object.entries(sources).filter(([p]) => !/\.test\.tsx?$/.test(p));

describe("INV-R12-1 · source knowledge lives in the profile", () => {
  it("finds source files to check (a silent zero would pass vacuously)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("detects a literal, and ignores one that only appears in a comment (controls)", () => {
    expect(SOURCE_LITERAL.test(stripComments(`const x = "codex";`))).toBe(true);
    expect(SOURCE_LITERAL.test(stripComments(`// historically this defaulted to "claude-code"\nconst x = 1;`))).toBe(false);
    expect(SOURCE_LITERAL.test(stripComments(`/* was source === "codex" once */\nconst y = 2;`))).toBe(false);
  });

  it("names a source only in files allowed to, each with a stated reason", () => {
    const offenders = files
      .filter(([, code]) => SOURCE_LITERAL.test(stripComments(code)))
      .map(([path]) => path)
      .filter((path) => !(path in ALLOWED));

    expect(
      offenders,
      "These files name an agent system outside the profile. Either read it from " +
        "`profileFor(source)`, or — if the file is genuinely per-source or its dispatch is " +
        "exhaustively guarded — add it to ALLOWED with the reason. Writing that reason down is " +
        "the check; a list you can extend without justifying is not a gate.",
    ).toEqual([]);
  });

  it("keeps the allow-list honest: every entry still names a source", () => {
    // An entry that no longer needs to be here should be removed, or the list decays into
    // permanent permission for files that have since been cleaned up.
    const stale = Object.keys(ALLOWED).filter((path) => {
      const code = sources[path];
      return code === undefined || !SOURCE_LITERAL.test(stripComments(code));
    });
    expect(stale, "these allow-list entries are no longer needed").toEqual([]);
  });
});
