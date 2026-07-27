import { describe, expect, it } from "vitest";
import { classifySession, isSubagentPath, isSyntheticPrompt, type ClassificationInput } from "./classifySession";

const base: ClassificationInput = {
  path: "project/abc.jsonl",
  hasAgentId: false,
  allSidechain: false,
  humanPromptCount: 3,
  syntheticPromptCount: 0,
  isClaudeCode: true,
};

describe("classifySession — one case per rule, in order", () => {
  it("rule 0: a file no adapter claims is unknown, never guessed into a kind", () => {
    expect(classifySession({ ...base, isClaudeCode: false })).toEqual({ kind: "unknown", reason: "not-claude-code" });
  });

  it("rule 1a: a subagents/ path is a subagent transcript", () => {
    expect(classifySession({ ...base, path: "project/abc/subagents/agent-1.jsonl" }))
      .toEqual({ kind: "subagent", reason: "path-subagents" });
  });

  it("rule 1b: an agentId field is a subagent transcript", () => {
    expect(classifySession({ ...base, hasAgentId: true })).toEqual({ kind: "subagent", reason: "field-agentid" });
  });

  it("rule 1c: an all-sidechain file is a subagent transcript", () => {
    expect(classifySession({ ...base, allSidechain: true })).toEqual({ kind: "subagent", reason: "all-sidechain" });
  });

  it("rule 2: no human message anywhere is a machine run", () => {
    expect(classifySession({ ...base, humanPromptCount: 0 })).toEqual({ kind: "machine", reason: "no-human-prompt" });
  });

  it("rule 3: prompts that are all machine-issued phrases is a machine run", () => {
    expect(classifySession({ ...base, humanPromptCount: 4, syntheticPromptCount: 4 }))
      .toEqual({ kind: "machine", reason: "synthetic-prompts-only" });
  });

  it("rule 3 does not fire when even one prompt is a real one", () => {
    expect(classifySession({ ...base, humanPromptCount: 4, syntheticPromptCount: 3 }))
      .toEqual({ kind: "dialogue", reason: "has-human-prompt" });
  });

  it("rule 4: a human typed something", () => {
    expect(classifySession(base)).toEqual({ kind: "dialogue", reason: "has-human-prompt" });
  });

  it("subagent rules outrank the machine rules — a subagent with zero human prompts is still a subagent", () => {
    expect(classifySession({ ...base, path: "p/x/subagents/a.jsonl", humanPromptCount: 0 }).kind).toBe("subagent");
  });

  /**
   * 負向對照：作者實測 `68466cc1` 的真實形狀——200 行、27 則 user、2 行 stop_hook_summary、
   * 0 個 sidechain。它是純對話，卻因為那 2 行觸發解析警告而被誤讀成「機器任務」(RC-3)。
   * 這條測試釘住：即使有系統事件與大量工具往返，只要人講過話，它就是對話。
   */
  it("NEGATIVE CONTROL: the session shaped like 68466cc1 classifies as dialogue", () => {
    expect(classifySession({
      path: "C--Users-gunda--claude/68466cc1-ddb4-4fd9-a19e-02ea53857b54.jsonl",
      hasAgentId: false,
      allSidechain: false,
      humanPromptCount: 8,
      syntheticPromptCount: 0,
      isClaudeCode: true,
    })).toEqual({ kind: "dialogue", reason: "has-human-prompt" });
  });
});

describe("supporting predicates", () => {
  it("isSubagentPath matches only a subagents/ path segment", () => {
    expect(isSubagentPath("a/b/subagents/c.jsonl")).toBe(true);
    expect(isSubagentPath("subagents/c.jsonl")).toBe(true);
    expect(isSubagentPath("my-subagents-notes/c.jsonl")).toBe(false);
    expect(isSubagentPath("a/b/c.jsonl")).toBe(false);
  });

  it("isSyntheticPrompt matches the known machine-issued phrases and nothing else", () => {
    expect(isSyntheticPrompt("Continue from where you left off.")).toBe(true);
    expect(isSyntheticPrompt("  Continue from where you left off.  ")).toBe(true);
    expect(isSyntheticPrompt("<<autonomous-loop-dynamic>>")).toBe(true);
    // 偏誤方向固定：真人在機器句後面加了字，就是真人。前綴比對會把他吃掉。
    expect(isSyntheticPrompt("Continue from where you left off, but skip the tests")).toBe(false);
    expect(isSyntheticPrompt("Continue from where you left off. 另外順便看一下 CI")).toBe(false);
    expect(isSyntheticPrompt("請繼續")).toBe(false);
    expect(isSyntheticPrompt("why did you continue?")).toBe(false);
  });
});
