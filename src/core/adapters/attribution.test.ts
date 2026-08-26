/**
 * R12 M4 — step attribution, adapter through to rendered span.
 *
 * Every assertion here is anchored to a measured fact from the full-corpus scan recorded in
 * `docs/rounds/r12-source-first-navigation/RESEARCH_R12_CLAUDE_METADATA_2026-08-26.md`
 * (525 files, 208,527 records). Where a shape is pinned, the number that justifies it is cited,
 * so a later reader can tell a design decision from an arbitrary one.
 */
import { describe, expect, it } from "vitest";
import { claudeCodeJsonlAdapter } from "@/core/adapters/claudeCodeJsonl";
import { buildSessionDocument } from "@/core/pipeline";
import { profileFor } from "@/core/source/profiles";
import type { Attribution, Span } from "@/types/spanTree";

const line = (record: Record<string, unknown>): string => JSON.stringify(record);

const userLine = (text = "做一件事"): string =>
  line({ type: "user", uuid: "u1", parentUuid: null, sessionId: "s1", timestamp: "2026-08-26T00:00:00Z", message: { role: "user", content: text } });

/** One assistant record, with whatever attribution fields the case needs on it. */
const assistantLine = (attribution: Record<string, unknown>, content?: unknown[]): string =>
  line({
    type: "assistant",
    uuid: "a1",
    parentUuid: "u1",
    sessionId: "s1",
    timestamp: "2026-08-26T00:00:01Z",
    ...attribution,
    message: {
      role: "assistant",
      content: content ?? [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "/x.ts" } }],
    },
  });

const spansOf = (...lines: string[]): Span[] => buildSessionDocument(lines.join("\n")).doc.spans;
const attributionOf = (spans: Span[]): readonly Attribution[] | undefined =>
  spans.find((s) => s.attribution)?.attribution;

describe("Claude Code attribution (R12 M4)", () => {
  it("reads a skill from the record it is on", () => {
    const spans = spansOf(userLine(), assistantLine({ attributionSkill: "workflow-checkpoint" }));
    expect(attributionOf(spans)).toEqual([{ kind: "skill", name: "workflow-checkpoint" }]);
  });

  it("reads a subagent, giving the existing sidechain group its NAME", () => {
    /*
     * Measured: attributionAgent implies isSidechain, 11,579 of 11,579, zero on the main
     * thread. DIT already knew "this is a subagent" from isSidechain/agentId — what it could
     * not say was WHICH. That is the whole value of this field, so it is read even though the
     * sidechain flag is already present.
     */
    const spans = spansOf(userLine(), assistantLine({ attributionAgent: "backend-architect", isSidechain: true, agentId: "ag-1" }));
    expect(attributionOf(spans)).toEqual([{ kind: "subagent", name: "backend-architect" }]);
  });

  it("reads an MCP tool together with its server", () => {
    const spans = spansOf(userLine(), assistantLine({ attributionMcpServer: "Claude Browser", attributionMcpTool: "javascript_tool" }));
    expect(attributionOf(spans)).toEqual([{ kind: "mcp-tool", name: "javascript_tool", server: "Claude Browser" }]);
  });

  it("refuses half an MCP pair rather than inventing the other half", () => {
    /*
     * Measured: both=8,629, serverOnly=0, toolOnly=0 — they are never apart in the corpus. A
     * half pair therefore means a shape the measurement never saw, and the honest response to
     * that is to say nothing, not to name a tool after its server or vice versa.
     */
    expect(attributionOf(spansOf(userLine(), assistantLine({ attributionMcpServer: "Claude Browser" })))).toBeUndefined();
    expect(attributionOf(spansOf(userLine(), assistantLine({ attributionMcpTool: "javascript_tool" })))).toBeUndefined();
  });

  it("carries several attributions at once, because real records do", () => {
    // Measured co-occurrence: skill+agent 646 records, all four 1 record. A single-valued
    // field would have forced a choice on real data.
    const spans = spansOf(userLine(), assistantLine({
      attributionSkill: "code-review-deep-checklist",
      attributionAgent: "code-reviewer",
      attributionMcpServer: "ccd_session",
      attributionMcpTool: "mark_chapter",
    }));
    expect(attributionOf(spans)).toEqual([
      { kind: "skill", name: "code-review-deep-checklist" },
      { kind: "subagent", name: "code-reviewer" },
      { kind: "mcp-tool", name: "mark_chapter", server: "ccd_session" },
    ]);
  });

  it("is ABSENT, not empty and not guessed, when the record carries no attribution", () => {
    // The card's acceptance turns on this: absence must be absence. An empty array or a
    // placeholder string would both read downstream as "we know there is none".
    const spans = spansOf(userLine(), assistantLine({}));
    expect(spans.every((s) => s.attribution === undefined)).toBe(true);
  });

  it("ignores blank and non-string values instead of rendering an empty badge", () => {
    const spans = spansOf(userLine(), assistantLine({ attributionSkill: "   ", attributionAgent: 42 }));
    expect(attributionOf(spans)).toBeUndefined();
  });

  it("attaches to thinking and text spans too, not only tool calls", () => {
    /*
     * Measured block kinds on attributed records: tool_use 15,076, thinking 7,750, text 3,421.
     * Attaching only to tool calls would silently drop 42% of the attributed steps.
     */
    const spans = spansOf(userLine(), assistantLine({ attributionSkill: "project-retrospective" }, [
      { type: "thinking", thinking: "先看一下紀錄" },
      { type: "text", text: "我來整理這一輪" },
      { type: "tool_use", id: "t1", name: "Read", input: {} },
    ]));
    const attributed = spans.filter((s) => s.attribution);
    expect(attributed).toHaveLength(3);
    expect(new Set(attributed.map((s) => s.type)).size).toBeGreaterThan(1);
  });

  it("survives the adapter's own streaming path, not just the one-shot parse", () => {
    const acc = claudeCodeJsonlAdapter.createAccumulator?.();
    if (!acc) return; // the adapter may not expose one; the one-shot path is covered above
    acc.pushLine(userLine());
    acc.pushLine(assistantLine({ attributionSkill: "asset-vault" }));
    const { events } = acc.finish();
    expect(events.find((e) => e.attribution)?.attribution).toEqual([{ kind: "skill", name: "asset-vault" }]);
  });
});

describe("attribution is declared by the profile, not detected by the view (R12 M4)", () => {
  it("says Claude Code records all three kinds", () => {
    expect(profileFor("claude-code").attribution.kinds).toEqual(["skill", "subagent", "mcp-tool"]);
  });

  it("says Codex records none — which is a measured answer, not a gap", () => {
    /*
     * Empty here is the same kind of statement as `classify.signals: []`: the source does not
     * label steps this way. The viewer needs this to tell "this step was not labelled" apart
     * from "this system never labels steps"; rendering both as blank would say the same thing
     * about two different facts.
     */
    expect(profileFor("codex").attribution.kinds).toEqual([]);
  });

  it("never lets a source's attribution kinds fall outside the Attribution union", () => {
    const allowed = new Set<Attribution["kind"]>(["skill", "subagent", "mcp-tool"]);
    for (const source of ["claude-code", "codex"] as const) {
      for (const kind of profileFor(source).attribution.kinds) {
        expect(allowed.has(kind)).toBe(true);
      }
    }
  });
});
