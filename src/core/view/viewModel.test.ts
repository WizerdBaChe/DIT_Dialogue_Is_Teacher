import { describe, expect, it } from "vitest";
import { buildSessionDocumentFromFiles } from "@/core/pipeline";
import { r4MainSession, r4SubagentSession } from "@/fixtures";
import { buildViewModel } from "./viewModel";

describe("subagent branch view model", () => {
  it("renders a cross-file sidechain as one group with nested tool results", () => {
    const { doc } = buildSessionDocumentFromFiles([
      { path: "main.jsonl", content: r4MainSession },
      { path: "subagents/agent-1.jsonl", content: r4SubagentSession },
    ]);
    const items = buildViewModel(doc);
    const branch = items.find((item) => item.type === "group" && item.group.kind === "subagent");

    expect(branch?.type).toBe("group");
    if (!branch || branch.type !== "group") throw new Error("Expected a subagent group.");
    expect(branch.nodes).toHaveLength(3);
    expect(branch.nodes.find((node) => node.span.tool?.name === "Grep")?.children).toHaveLength(1);
  });
});
