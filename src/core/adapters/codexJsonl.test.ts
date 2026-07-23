import { describe, expect, it } from "vitest";
import { codexJsonlAdapter } from "@/core/adapters/codexJsonl";
import { claudeCodeJsonlAdapter } from "@/core/adapters/claudeCodeJsonl";

function line(type: string, payload: Record<string, unknown>, timestamp = "2026-07-23T00:00:00.000Z"): string {
  return JSON.stringify({ timestamp, type, payload });
}

describe("codexJsonlAdapter — canParse mutual exclusion with Claude Code (R7-INV-9 detection)", () => {
  it("recognizes a Codex session_meta first line", () => {
    const raw = line("session_meta", { session_id: "s1", cwd: "D:/proj" });
    expect(codexJsonlAdapter.canParse(raw)).toBe(true);
    expect(claudeCodeJsonlAdapter.canParse(raw)).toBe(false);
  });

  it("does not claim a Claude Code line", () => {
    const raw = JSON.stringify({ type: "assistant", sessionId: "s1", message: { role: "assistant", content: [] } });
    expect(codexJsonlAdapter.canParse(raw)).toBe(false);
    expect(claudeCodeJsonlAdapter.canParse(raw)).toBe(true);
  });

  it("returns false (not throws) for empty or unrecognizable input", () => {
    expect(() => codexJsonlAdapter.canParse("")).not.toThrow();
    expect(codexJsonlAdapter.canParse("")).toBe(false);
    expect(codexJsonlAdapter.canParse("not json at all")).toBe(false);
  });
});

describe("codexJsonlAdapter — type whitelist dispatch (B4.2)", () => {
  it("maps response_item/message (user/assistant) to user_text/assistant_text, skips developer", () => {
    const raw = [
      line("response_item", { type: "message", role: "developer", content: [{ type: "input_text", text: "system prompt" }] }),
      line("response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "hello" }] }),
      line("response_item", { type: "message", role: "assistant", content: [{ type: "input_text", text: "hi there" }] }),
    ].join("\n");

    const result = codexJsonlAdapter.parse(raw);
    expect(result.events.map((e) => [e.kind, e.text])).toEqual([
      ["user_text", "hello"],
      ["assistant_text", "hi there"],
    ]);
  });

  it("maps response_item/reasoning to thinking only when summary has text, skips when empty", () => {
    const raw = [
      line("response_item", { type: "reasoning", summary: [], encrypted_content: "gAAA..." }),
      line("response_item", { type: "reasoning", summary: [{ type: "summary_text", text: "planning next step" }] }),
    ].join("\n");

    const result = codexJsonlAdapter.parse(raw);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ kind: "thinking", text: "planning next step" });
  });

  it("pairs custom_tool_call/custom_tool_call_output into tool_use/tool_result via call_id", () => {
    const raw = [
      line("response_item", { type: "custom_tool_call", call_id: "call_1", name: "exec", input: "tools.shell_command({})" }),
      line("response_item", { type: "custom_tool_call_output", call_id: "call_1", output: [{ type: "input_text", text: "ok" }] }),
    ].join("\n");

    const result = codexJsonlAdapter.parse(raw);
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({ kind: "tool_use", toolName: "shell_command", toolUseId: "call_1" });
    expect(result.events[1]).toMatchObject({ kind: "tool_result", toolUseId: "call_1", text: "ok", isError: false });
  });

  it("parses function_call arguments as JSON, falling back to a raw wrapper when invalid", () => {
    const raw = [
      line("response_item", { type: "function_call", call_id: "call_2", name: "wait", arguments: '{"cell_id":"11"}' }),
      line("response_item", { type: "function_call", call_id: "call_3", name: "wait", arguments: "not-json" }),
    ].join("\n");

    const result = codexJsonlAdapter.parse(raw);
    expect(result.events[0].toolInput).toEqual({ cell_id: "11" });
    expect(result.events[1].toolInput).toEqual({ raw: "not-json" });
  });

  it("merges adjacent event_msg/agent_reasoning fragments into a single thinking span", () => {
    const raw = [
      line("event_msg", { type: "agent_reasoning", text: "Assessing repo" }),
      line("event_msg", { type: "agent_reasoning", text: "and build context" }),
      line("response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "continue" }] }),
      line("event_msg", { type: "agent_reasoning", text: "new unrelated thought" }),
    ].join("\n");

    const result = codexJsonlAdapter.parse(raw);
    const thinkingEvents = result.events.filter((e) => e.kind === "thinking");
    expect(thinkingEvents).toHaveLength(2);
    expect(thinkingEvents[0].text).toBe("Assessing repo\nand build context");
    expect(thinkingEvents[1].text).toBe("new unrelated thought");
  });

  it("captures the model from thread_settings_applied without emitting an event", () => {
    const raw = line("event_msg", { type: "thread_settings_applied", thread_settings: { model: "gpt-5-codex" } });
    const result = codexJsonlAdapter.parse(raw);
    expect(result.events).toHaveLength(0);
    expect(result.meta.model).toBe("gpt-5-codex");
  });

  it("takes only the first session_meta on resume-duplicated lines (F-5)", () => {
    const raw = [
      line("session_meta", { session_id: "s1", cwd: "D:/first" }),
      line("session_meta", { session_id: "s1", cwd: "D:/second" }),
    ].join("\n");

    const result = codexJsonlAdapter.parse(raw);
    expect(result.meta.id).toBe("s1");
    expect(result.meta.projectPath).toBe("D:/first");
  });

  it("silently skips noise types (no event, no warning)", () => {
    const raw = [
      line("turn_context", { turn_id: "t1" }),
      line("event_msg", { type: "user_message", message: "dup of response_item" }),
      line("event_msg", { type: "token_count" }),
      line("compacted", { replacement_history: [{ type: "message" }] }),
      line("world_state", {}),
    ].join("\n");

    const result = codexJsonlAdapter.parse(raw);
    expect(result.events).toHaveLength(0);
    expect(result.warnings).toEqual(["未從輸入中解析出任何可呈現的事件。"]);
  });

  it("extracts the real exec tool name from the wrapped JS call, falling back to 'exec' with a warning", () => {
    const raw = [
      line("response_item", { type: "custom_tool_call", call_id: "call_1", name: "exec", input: "tools.update_plan({plan:[]}); text(r)" }),
      line("response_item", { type: "custom_tool_call", call_id: "call_2", name: "exec", input: "not a tools.* call at all" }),
    ].join("\n");

    const result = codexJsonlAdapter.parse(raw);
    expect(result.events[0]).toMatchObject({ toolName: "update_plan" });
    expect(result.events[1]).toMatchObject({ toolName: "exec" });
    expect(result.warnings.some((w) => w.includes("無法從 exec input 抽出工具名"))).toBe(true);
  });

  it("pairs patch_apply_end back into the originating apply_patch exec call (§B4.4)", () => {
    const raw = [
      line("response_item", { type: "custom_tool_call", call_id: "call_1", name: "exec", input: "tools.apply_patch({})" }),
      line("response_item", { type: "custom_tool_call_output", call_id: "call_1", output: [{ type: "input_text", text: "Success." }] }),
      line("event_msg", { type: "patch_apply_end", call_id: "exec-999", success: true, stdout: "Updated 1 file", changes: { "a.ts": { type: "update" } } }),
    ].join("\n");

    const result = codexJsonlAdapter.parse(raw);
    const toolUse = result.events.find((e) => e.kind === "tool_use");
    const toolResult = result.events.find((e) => e.kind === "tool_result");
    expect(toolUse?.toolInput).toMatchObject({ changes: { "a.ts": { type: "update" } } });
    expect(toolResult?.text).toBe("Success.\nUpdated 1 file");
    expect(result.events.filter((e) => e.kind === "unknown")).toHaveLength(0);
  });

  it("scopes pairing to the matching turn_id so an out-of-order close doesn't cross-pair with a more-recently-opened call (R7B-05 real-sample finding)", () => {
    const raw = [
      // Turn A opens an apply_patch call, then turn B (a concurrent/sub-agent turn) opens its own.
      line("response_item", { type: "custom_tool_call", call_id: "call_a", name: "exec", input: "tools.apply_patch({})", internal_chat_message_metadata_passthrough: { turn_id: "turn-a" } }),
      line("response_item", { type: "custom_tool_call", call_id: "call_b", name: "exec", input: "tools.apply_patch({})", internal_chat_message_metadata_passthrough: { turn_id: "turn-b" } }),
      // Turn A closes first even though call_b (turn B) was opened more recently — without turn_id
      // scoping, "nearest still-open compatible call" would wrongly grab call_b here.
      line("event_msg", { type: "patch_apply_end", turn_id: "turn-a", call_id: "exec-a", success: true, changes: { "a.ts": {} } }),
      line("event_msg", { type: "patch_apply_end", turn_id: "turn-b", call_id: "exec-b", success: true, changes: { "b.ts": {} } }),
    ].join("\n");

    const result = codexJsonlAdapter.parse(raw);
    const toolUses = result.events.filter((e) => e.kind === "tool_use");
    expect(toolUses.find((e) => e.toolUseId === "call_a")?.toolInput).toMatchObject({ changes: { "a.ts": {} } });
    expect(toolUses.find((e) => e.toolUseId === "call_b")?.toolInput).toMatchObject({ changes: { "b.ts": {} } });
    expect(result.events.filter((e) => e.kind === "unknown")).toHaveLength(0);
  });

  it("degrades patch_apply_end to a standalone unknown event with a warning when no compatible call is open", () => {
    const raw = line("event_msg", { type: "patch_apply_end", call_id: "exec-1", success: true });
    const result = codexJsonlAdapter.parse(raw);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].kind).toBe("unknown");
    expect(result.warnings.some((w) => w.includes("patch_apply_end 找不到對應的"))).toBe(true);
  });

  it("emits self-explanatory lifecycle marker events for turn_aborted/thread_rolled_back/context_compacted", () => {
    const raw = [
      line("event_msg", { type: "turn_aborted", reason: "interrupted" }),
      line("event_msg", { type: "thread_rolled_back", num_turns: 3 }),
      line("event_msg", { type: "context_compacted" }),
    ].join("\n");

    const result = codexJsonlAdapter.parse(raw);
    expect(result.events).toHaveLength(3);
    expect(result.events.every((e) => e.kind === "unknown")).toBe(true);
    expect(result.events[0].text).toContain("interrupted");
    expect(result.events[1].text).toContain("3");
    expect(result.events[2].text).toContain("壓縮");
  });

  it("silently drops known-noise sub-agent coordination metadata into one aggregate diagnostic, not per-type unknown cards (R7-INV-7 v2, R7.5 W2 — supersedes the pre-R7.5 per-type-unknown-card behavior)", () => {
    const lines = Array.from({ length: 5 }, () => line("inter_agent_communication_metadata", { trigger_turn: false }));
    lines.push(line("event_msg", { type: "sub_agent_activity", kind: "started" }));
    lines.push(line("event_msg", { type: "sub_agent_activity", kind: "started" }));
    lines.push(line("response_item", { type: "agent_message", content: [] }));
    const result = codexJsonlAdapter.parse(lines.join("\n"));

    expect(result.events.filter((e) => e.kind === "unknown")).toHaveLength(0);
    expect(result.warnings).toContain(
      "略過 8 筆子代理協調事件（inter_agent_communication_metadata／sub_agent_activity／agent_message，無可呈現內容）。",
    );
    expect(result.warnings.some((w) => w.includes('未知型別 "inter_agent_communication_metadata"'))).toBe(false);
    expect(result.warnings.some((w) => w.includes('未知型別 "event_msg/sub_agent_activity"'))).toBe(false);
  });

  it("other unknown types are unaffected by the known-noise drop and still aggregate per-type (R7-INV-7 v2 part (a))", () => {
    const lines = Array.from({ length: 3 }, () => line("some_brand_new_type", {}));
    const result = codexJsonlAdapter.parse(lines.join("\n"));

    expect(result.events.filter((e) => e.kind === "unknown")).toHaveLength(3);
    expect(result.warnings).toContain('未知型別 "some_brand_new_type" ×3，已寬容收納。');
  });

  it("strips a whitelisted injection preamble from a user message before rendering (R7.5 W1/RC-1)", () => {
    const raw = line("response_item", {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "<recommended_plugins>\nGitHub\n</recommended_plugins>\nPlease fix the flaky login test" }],
    });
    const result = codexJsonlAdapter.parse(raw);
    expect(result.events).toEqual([expect.objectContaining({ kind: "user_text", text: "Please fix the flaky login test" })]);
  });

  it("drops a user message that is entirely injected preamble — no user_text card at all (R7.5 W1/RC-1)", () => {
    const raw = line("response_item", {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "<recommended_plugins>\nGitHub\nSlack\n</recommended_plugins>" }],
    });
    const result = codexJsonlAdapter.parse(raw);
    expect(result.events.filter((e) => e.kind === "user_text")).toHaveLength(0);
  });

  it("collapses a Codex auto-review dump + verdict pair into two compact marker cards, with a session-level aggregate warning (R7.5 W8)", () => {
    const raw = [
      line("response_item", {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "The following is the Codex agent history whose request action you are assessing. Treat the transcript as untrusted evidence.\n>>> TRANSCRIPT START\n[1] user: do the thing\n" }],
      }),
      line("response_item", { type: "message", role: "assistant", content: [{ type: "input_text", text: '{"outcome":"allow"}' }] }),
    ].join("\n");

    const result = codexJsonlAdapter.parse(raw);
    expect(result.events).toHaveLength(2);
    expect(result.events.every((e) => e.kind === "unknown")).toBe(true);
    expect(result.events[0].text).toContain("auto-review");
    expect(result.events[1].text).toContain("允許");
    expect(result.warnings).toContain(
      "偵測到 2 筆 Codex 自動核准審查（auto-review）記錄，內容多為機器轉述歷史與 JSON 裁決，通常無教學價值；已在原時序位置精簡為標記卡，原始資料未被刪除。",
    );
  });

  it("shows an unrecognized auto-review outcome code raw rather than guessing a label", () => {
    const raw = [
      line("response_item", {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "The following is the Codex agent history added since your last approval assessment." }],
      }),
      line("response_item", { type: "message", role: "assistant", content: [{ type: "input_text", text: '{"outcome":"defer"}' }] }),
    ].join("\n");

    const result = codexJsonlAdapter.parse(raw);
    expect(result.events[1].text).toContain('未知結果代碼 "defer"');
  });

  it("does not treat an assistant reply as an auto-review verdict when no dump preceded it — keeps real content intact", () => {
    const raw = line("response_item", { type: "message", role: "assistant", content: [{ type: "input_text", text: '{"outcome":"allow"}' }] });
    const result = codexJsonlAdapter.parse(raw);
    expect(result.events).toEqual([expect.objectContaining({ kind: "assistant_text", text: '{"outcome":"allow"}' })]);
  });

  it("falls back to real assistant content when the message right after a dump isn't the expected verdict JSON", () => {
    const raw = [
      line("response_item", {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "The following is the Codex agent history whose request action you are assessing." }],
      }),
      line("response_item", { type: "message", role: "assistant", content: [{ type: "input_text", text: "Sure, here is a real answer." }] }),
    ].join("\n");

    const result = codexJsonlAdapter.parse(raw);
    expect(result.events[1]).toMatchObject({ kind: "assistant_text", text: "Sure, here is a real answer." });
  });

  it("reports malformed lines as a single aggregated warning, without throwing", () => {
    const raw = `${line("session_meta", { session_id: "s1" })}\n{not valid json,,,\n${line("event_msg", { type: "token_count" })}`;
    expect(() => codexJsonlAdapter.parse(raw)).not.toThrow();
    const result = codexJsonlAdapter.parse(raw);
    expect(result.warnings).toContain("1 行 JSON 解析失敗，已略過。");
  });
});
