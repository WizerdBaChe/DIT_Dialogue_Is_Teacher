// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Badges } from "./parts";
import type { Span } from "@/types/spanTree";

afterEach(cleanup);

const spanWith = (attribution?: Span["attribution"]): Span => ({
  id: "s1",
  parentId: null,
  order: 0,
  type: "tool_use",
  startedAt: null,
  durationMs: null,
  summary: "Read /x.ts",
  text: "",
  tool: { name: "Read", params: {} },
  tags: [],
  raw: {},
  ...(attribution ? { attribution } : {}),
});

/**
 * R12 M4 — the badge row is where attribution becomes visible. The built-in sample transcript
 * is synthetic and carries none, so the browser cannot show this without a folder pick; these
 * assertions are the deterministic half.
 */
describe("attribution badges (R12 M4)", () => {
  it("renders one badge per attribution, keeping the source's own name verbatim", () => {
    const { container } = render(<Badges span={spanWith([
      { kind: "skill", name: "workflow-checkpoint" },
      { kind: "subagent", name: "backend-architect" },
    ])} />);

    const badges = [...container.querySelectorAll(".badge.attribution")];
    expect(badges.map((b) => b.getAttribute("data-attribution"))).toEqual(["skill", "subagent"]);
    // The name is an identifier in the other system. Translating or prettifying it would make it
    // impossible to match against what the user sees in Claude Code itself.
    expect(badges[0].textContent).toContain("workflow-checkpoint");
    expect(badges[1].textContent).toContain("backend-architect");
  });

  it("names the MCP server in the tooltip but not in the badge text", () => {
    const { container } = render(<Badges span={spanWith([
      { kind: "mcp-tool", name: "javascript_tool", server: "Claude Browser" },
    ])} />);

    const badge = container.querySelector(".badge.attribution");
    // 54 tool names across 12 servers were measured; inlining the server would push the tool
    // name — the thing being looked for — out of view.
    expect(badge?.textContent).toContain("javascript_tool");
    expect(badge?.textContent).not.toContain("Claude Browser");
    expect(badge?.getAttribute("title")).toContain("Claude Browser");
  });

  it("renders nothing extra when a span carries no attribution", () => {
    const { container } = render(<Badges span={spanWith()} />);
    expect(container.querySelectorAll(".badge.attribution")).toHaveLength(0);
    // The tool badge is untouched — attribution is additive, not a replacement.
    expect(container.querySelector(".badge.tool")?.textContent).toBe("Read");
  });

  it("keeps the tool badge and the attribution badges visually distinct", () => {
    // SA-01: one symbol, one meaning. "Read" (what happened) and "workflow-checkpoint"
    // (who did it) answer different questions and must not look like the same kind of thing.
    const { container } = render(<Badges span={spanWith([{ kind: "skill", name: "workflow-checkpoint" }])} />);
    const tool = container.querySelector(".badge.tool");
    const attribution = container.querySelector(".badge.attribution");
    expect(tool).not.toBeNull();
    expect(attribution).not.toBeNull();
    expect(tool?.className).not.toBe(attribution?.className);
  });
});
