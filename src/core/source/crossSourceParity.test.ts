/**
 * R10-B acceptance: the same work, expressed in both harnesses, must distill to the same skeleton.
 *
 * This is the test the pre-R10-B code fails. Before the source profile existed, denoise() and
 * distill() matched Claude Code tool names against every source, so the Codex half of each pair
 * below produced zero edit-loop groups and zero investigation ribs.
 *
 * The acceptance is deliberately the REDUCED one the author ratified on 2026-08-14. Full error
 * parity is not achievable: Codex records no outcome for a plain shell command (measured over
 * 9,342 real outputs), so "same error tags" cannot be asserted for exec. What is asserted is
 * (a) parity for the tools both harnesses do record, and (b) that Codex's missing outcome is
 * *named* — `outcomeUnknown` — rather than silently reported as success.
 */
import { describe, expect, it } from "vitest";
import { buildSessionDocument } from "@/core/pipeline";
import type { SessionDocument } from "@/types/spanTree";

function claudeLine(entry: Record<string, unknown>): string {
  return JSON.stringify({ sessionId: "s1", timestamp: "2026-08-14T00:00:00.000Z", ...entry });
}
function codexLine(type: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ timestamp: "2026-08-14T00:00:00.000Z", type, payload });
}

/** The same session: ask, look at a file, edit one file twice, get a failure on the second edit. */
const CLAUDE = [
  claudeLine({ type: "user", uuid: "u1", message: { role: "user", content: "修好 auth.ts 的登入問題" } }),
  claudeLine({
    type: "assistant",
    uuid: "a1",
    message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "/p/auth.ts" } }] },
  }),
  claudeLine({
    type: "user",
    uuid: "r1",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "…", is_error: false }] },
  }),
  claudeLine({
    type: "assistant",
    uuid: "a2",
    message: { role: "assistant", content: [{ type: "tool_use", id: "t2", name: "Edit", input: { file_path: "/p/auth.ts" } }] },
  }),
  claudeLine({
    type: "user",
    uuid: "r2",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "ok", is_error: false }] },
  }),
  claudeLine({
    type: "assistant",
    uuid: "a3",
    message: { role: "assistant", content: [{ type: "tool_use", id: "t3", name: "Edit", input: { file_path: "/p/auth.ts" } }] },
  }),
  claudeLine({
    type: "user",
    uuid: "r3",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t3", content: "patch failed", is_error: true }] },
  }),
].join("\n");

const CODEX = [
  codexLine("session_meta", { session_id: "s1", cwd: "/p" }),
  codexLine("response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "修好 auth.ts 的登入問題" }] }),
  codexLine("response_item", { type: "custom_tool_call", call_id: "c1", name: "exec", input: "tools.web__run({})" }),
  codexLine("response_item", { type: "custom_tool_call_output", call_id: "c1", output: [{ type: "input_text", text: "…" }] }),
  codexLine("response_item", { type: "custom_tool_call", call_id: "c2", name: "exec", input: "tools.apply_patch({})" }),
  codexLine("response_item", { type: "custom_tool_call_output", call_id: "c2", output: [{ type: "input_text", text: "ok" }] }),
  codexLine("event_msg", { type: "patch_apply_end", call_id: "exec-1", success: true, stdout: "", changes: { "/p/auth.ts": { type: "update" } } }),
  codexLine("response_item", { type: "custom_tool_call", call_id: "c3", name: "exec", input: "tools.apply_patch({})" }),
  codexLine("response_item", { type: "custom_tool_call_output", call_id: "c3", output: [{ type: "input_text", text: "" }] }),
  codexLine("event_msg", { type: "patch_apply_end", call_id: "exec-2", success: false, stderr: "patch failed", changes: { "/p/auth.ts": { type: "update" } } }),
].join("\n");

function build(raw: string): SessionDocument {
  const result = buildSessionDocument(raw);
  return result.doc;
}

describe("R10-B — cross-source parity (reduced acceptance ratified 2026-08-14)", () => {
  const claude = build(CLAUDE);
  const codex = build(CODEX);

  it("identifies the source of each transcript", () => {
    expect(claude.session.source).toBe("claude-code");
    expect(codex.session.source).toBe("codex");
  });

  it("groups the repeated edits to one file in BOTH sources", () => {
    const kinds = (doc: SessionDocument) => doc.groups.filter((g) => g.kind === "edit-loop").length;
    expect(kinds(claude)).toBeGreaterThan(0);
    // This is the assertion the pre-R10-B code failed: apply_patch was not in the edit-tool set.
    expect(kinds(codex)).toBe(kinds(claude));
  });

  it("produces an investigation rib in BOTH sources", () => {
    const ribs = (doc: SessionDocument) => doc.skeleton?.ribs.filter((r) => r.kind === "investigation").length ?? 0;
    expect(ribs(claude)).toBeGreaterThan(0);
    expect(ribs(codex)).toBe(ribs(claude));
  });

  it("tags the failed edit as an error in BOTH sources", () => {
    const errors = (doc: SessionDocument) => doc.spans.filter((s) => s.tags.includes("error")).length;
    expect(errors(claude)).toBeGreaterThan(0);
    // patch_apply_end.success is present on every measured occurrence, so this one IS recoverable.
    expect(errors(codex)).toBe(errors(claude));
  });

  it("names the outcome it cannot know instead of reporting success", () => {
    // Claude Code records is_error on every tool result, so nothing is unknown.
    expect(claude.spans.some((s) => s.result?.outcomeUnknown)).toBe(false);
    // The Codex web__run call has no patch_apply_end to fill its outcome in, and exec carries no
    // status field — so it must read as unknown, not as a success the rollout never claimed.
    const unknown = codex.spans.filter((s) => s.result?.outcomeUnknown);
    expect(unknown.length).toBeGreaterThan(0);
    expect(unknown.every((s) => s.result?.isError === false)).toBe(true);
  });
});
