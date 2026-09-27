/**
 * The agent instruction files are one shared contract plus one thin per-agent layer (D-025).
 *
 * `AGENTS.md` holds every project rule and is the only file Codex loads natively. `CLAUDE.md`
 * imports it with a bare `@AGENTS.md` line and adds Claude Code-only notes. The arrangement fails
 * silently in three ways, and each has a property below:
 *
 *   1. The import disappears, or is weakened to prose ("read AGENTS.md") or a code span. Claude
 *      then stops seeing the contract, and nothing complains.
 *   2. A single-agent harness reference lands in `AGENTS.md`, which Codex then reads as a rule
 *      about its own environment.
 *   3. A shared rule is copied back into `CLAUDE.md`. A full copy already drifted once within two
 *      weeks; two copies is the defect this layout exists to remove.
 *
 * Every detector is calibrated against a known-bad input first: a check that has only ever seen a
 * passing file looks exactly like a check that is not checking anything.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const agents = readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8");
const claude = readFileSync(new URL("../CLAUDE.md", import.meta.url), "utf8");

/** Claude Code skips fenced blocks and code spans when it expands `@path` imports. */
function importsAgentsMd(source: string): boolean {
  const outsideFences = source.replace(/^```[\s\S]*?^```/gm, "");
  return /^@AGENTS\.md[ \t]*\r?$/m.test(outsideFences);
}

/** References that only make sense inside one agent's harness. */
const SINGLE_AGENT_TOKENS: readonly RegExp[] = [
  /ops-relaxation/,
  /~\/\.claude\b/,
  /~\/\.codex\b/,
  /\$CODEX_HOME/,
  /\.claude\/(?:worktrees|rules|settings)/,
];

function singleAgentHits(source: string): string[] {
  return SINGLE_AGENT_TOKENS.filter((re) => re.test(source)).map(String);
}

/** Markers that only a copy of the shared rules would carry. */
const SHARED_RULE_MARKERS: readonly string[] = [
  "reportFallback",
  "window.confirm",
  "docs/rounds/ROUNDS.md",
  "check:rounds",
  "DW-NN",
];

function sharedRuleHits(source: string): string[] {
  return SHARED_RULE_MARKERS.filter((marker) => source.includes(marker));
}

describe("CLAUDE.md imports the shared contract", () => {
  it("recognises a bare import line and rejects the weak forms", () => {
    expect(importsAgentsMd("# X\n\n@AGENTS.md\n\nmore")).toBe(true);
    expect(importsAgentsMd("# X\r\n\r\n@AGENTS.md\r\n")).toBe(true);
    expect(importsAgentsMd("Read AGENTS.md before starting.")).toBe(false);
    expect(importsAgentsMd("Keep the `@AGENTS.md` import.")).toBe(false);
    expect(importsAgentsMd("```\n@AGENTS.md\n```")).toBe(false);
  });

  it("CLAUDE.md carries the import", () => {
    expect(importsAgentsMd(claude)).toBe(true);
  });
});

describe("AGENTS.md stays tool-neutral", () => {
  it("flags a known single-agent reference", () => {
    expect(singleAgentHits("ops-relaxation: L1")).not.toEqual([]);
    expect(singleAgentHits("see ~/.claude/CLAUDE.md")).not.toEqual([]);
    expect(singleAgentHits("worktrees live in $CODEX_HOME/worktrees")).not.toEqual([]);
  });

  it("AGENTS.md has none", () => {
    expect(singleAgentHits(agents)).toEqual([]);
  });
});

describe("CLAUDE.md does not copy the shared rules", () => {
  it("flags a known copied rule", () => {
    expect(sharedRuleHits("Every fallback calls `reportFallback`.")).not.toEqual([]);
  });

  it("the markers really are in AGENTS.md, so their absence from CLAUDE.md means something", () => {
    for (const marker of SHARED_RULE_MARKERS) expect(agents).toContain(marker);
  });

  it("CLAUDE.md has none", () => {
    expect(sharedRuleHits(claude)).toEqual([]);
  });
});
