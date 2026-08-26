/**
 * R12 M1 — the discovery half of `SourceProfile`.
 *
 * These tests do not check that fields exist; `tsc` does that better. They pin the DECISIONS,
 * because every one of them is a thing a later, well-meaning edit would quietly undo.
 */
import { describe, expect, it } from "vitest";
import { profileFor } from "./profiles";

describe("SourceProfile · discovery half (R12 M1)", () => {
  it("resolves for every supported source, and the two rows are not the same object", () => {
    const claude = profileFor("claude-code").discovery;
    const codex = profileFor("codex").discovery;
    expect(claude).toBeDefined();
    expect(codex).toBeDefined();
    expect(claude).not.toBe(codex);
  });

  it("roots Codex at ~/.codex, NOT ~/.codex/sessions — the sidecar lives above the transcripts", () => {
    /*
     * This is a browser constraint, not a preference: the File System Access API cannot read the
     * parent of a picked directory. Narrowing this to `sessions/` puts `.codex-global-state.json`
     * out of reach and takes the purpose of every Codex session with it. That is the bug R12 exists
     * to fix, so it gets a test rather than a comment.
     */
    expect(profileFor("codex").discovery.rootHint).toBe("~/.codex");
    expect(profileFor("claude-code").discovery.rootHint).toBe("~/.claude/projects");
  });

  it("recognises a real Codex rollout filename and rejects a Claude Code one", () => {
    const { filePattern, subdir } = profileFor("codex").discovery.transcripts;
    expect(filePattern.test("rollout-2026-08-14T09-12-33-0199a1b2.jsonl")).toBe(true);
    // A Claude Code transcript is `<session-uuid>.jsonl` with no prefix — must not match.
    expect(filePattern.test("0199a1b2-3c4d-5e6f-8899-aabbccddeeff.jsonl")).toBe(false);
    expect(subdir).toBe("sessions");
  });

  it("lets Claude Code transcripts sit anywhere under the picked root", () => {
    const { filePattern, subdir } = profileFor("claude-code").discovery.transcripts;
    expect(subdir).toBe("");
    expect(filePattern.test("D--AIWork-DIT/0199a1b2.jsonl")).toBe(true);
    expect(filePattern.test("notes.md")).toBe(false);
  });

  it("gives Codex no custom/ai rungs, because it has no title field to read", () => {
    /*
     * Measured over 542 `session_meta` records: Codex rollouts carry no title anywhere, so those
     * two rungs are Claude Code records, not a ladder every source happens to share. Putting them
     * back is what made every Codex session display an excerpt of its first message.
     */
    const ladder = profileFor("codex").discovery.titleLadder;
    expect(ladder).not.toContain("custom");
    expect(ladder).not.toContain("ai");
    expect(profileFor("claude-code").discovery.titleLadder).toEqual([
      "custom",
      "ai",
      "derived",
      "filename",
    ]);
  });

  it("ends every ladder at `filename`, so a title is always producible", () => {
    for (const source of ["claude-code", "codex"] as const) {
      const ladder = profileFor(source).discovery.titleLadder;
      expect(ladder.length).toBeGreaterThan(0);
      expect(ladder[ladder.length - 1]).toBe("filename");
    }
  });

  it("declares no ladder rung that nothing can produce yet", () => {
    /*
     * The `paste` SourceId and the `milestone` span type were both declared, never produced, and
     * listed in the UI anyway. This guard exists so a ladder rung cannot become the third.
     *
     * `sidecar` was added to this set in R12 M5 — and only then, because M5 is the card that
     * wrote `rungValue`'s `case "sidecar"` and the reader behind it. Growing this set is
     * legitimate only when the producer ships in the same change; if you are here because the
     * test failed and you are about to add a rung name to make it pass, that is the failure it
     * is designed to catch. Keep in step with `rungValue` in `core/index/sessionIndexer.ts`.
     */
    const producible = new Set(["custom", "ai", "derived", "sidecar", "filename"]);
    for (const source of ["claude-code", "codex"] as const) {
      for (const rung of profileFor(source).discovery.titleLadder) {
        expect(producible.has(rung)).toBe(true);
      }
    }
  });

  it("declares the signals each source actually supplies", () => {
    /*
     * Corrected in R12 M6. This previously asserted Codex supplied NOTHING, matching a profile
     * comment reading "empty, and measured" — while `classifySession` had been reading two Codex
     * signals since R11.2 R1 and classifying 346 of 346 successfully.
     *
     * The mistake was conflating two claims. R11.2 R1 measured the human-turn count as carrying
     * little INFORMATION here (356/358 come out `dialogue`, and 108 of those files hold no
     * human-typed text at all). That is not the same as the signal not EXISTING, and writing
     * them as one thing put a falsehood exactly where the type system cannot reach.
     */
    expect(profileFor("codex").discovery.classify.signals).toEqual(["human-turn-count"]);

    // Still genuinely absent: Claude Code field names and a Claude Code path convention.
    for (const absent of ["agent-id-field", "all-sidechain", "subagent-path"] as const) {
      expect(profileFor("codex").discovery.classify.signals).not.toContain(absent);
    }
    expect(profileFor("claude-code").discovery.classify.signals).toContain("agent-id-field");
  });

  it("describes the Codex sidecar by the join key that was actually measured", () => {
    const [sidecar, ...rest] = profileFor("codex").discovery.sidecars;
    expect(rest).toHaveLength(0);
    expect(sidecar.path).toBe(".codex-global-state.json");
    // 61/61 descriptions resolved through this chain on the local corpus, 2026-08-26.
    expect(sidecar.joinKey).toEqual(["session_meta", "payload", "id"]);
    expect(sidecar.recordsAt).toEqual(["electron-persisted-atom-state", "thread-descriptions-v1"]);
  });

  it("gives Claude Code no sidecar, because its titles are records inside the transcript", () => {
    expect(profileFor("claude-code").discovery.sidecars).toEqual([]);
  });

  it("declares each source's subagent file layout, or null where there is none (R12 M7)", () => {
    /*
     * "Which files belong to this session" is a property of the harness's directory convention.
     * This was a `source === "claude-code" ? … : []` ternary in the indexer, which M1's
     * third-source probe found failing SILENTLY — a new source would simply have got no
     * subagents, with nothing to notice. Now a missing row fails to compile.
     */
    expect(profileFor("claude-code").discovery.subagents).toEqual({ siblingDir: "subagents" });
    // null means "this source has no such layout", not "not implemented": a Codex rollout has
    // no sibling directory, and prefix-guessing would risk a coincidental false pairing.
    expect(profileFor("codex").discovery.subagents).toBeNull();
  });
});
