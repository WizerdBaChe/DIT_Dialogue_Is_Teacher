import { describe, expect, it } from "vitest";
import { classifySession, isSubagentPath, isSyntheticPrompt, type ClassificationInput } from "./classifySession";

const base: ClassificationInput = {
  path: "project/abc.jsonl",
  hasAgentId: false,
  allSidechain: false,
  humanTurnCount: 3,
  syntheticPromptCount: 0,
  headScanUsable: true,
  isClaudeCode: true,
};

describe("classifySession — one case per rule, in order", () => {
  it("a file no adapter claims is unknown, never guessed into a kind", () => {
    expect(classifySession({ ...base, isClaudeCode: false })).toEqual({ kind: "unknown", reason: "not-claude-code" });
  });

  it("an unusable scan outranks the source verdict — a truncated first line is not evidence of anything", () => {
    // 第一行大到讀不完時 adapter 也認不出它。回報「不是 Claude Code」會讓檔案從清單上
    // 憑空消失；回報「無法判定」則至少讓使用者看得到它存在。
    expect(classifySession({ ...base, headScanUsable: false, isClaudeCode: false }))
      .toEqual({ kind: "unknown", reason: "insufficient-signal" });
  });

  it("a subagents/ path is a subagent transcript", () => {
    expect(classifySession({ ...base, path: "project/abc/subagents/agent-1.jsonl" }))
      .toEqual({ kind: "subagent", reason: "path-subagents" });
  });

  it("an agentId field means subagent — an agentId field is a subagent transcript", () => {
    expect(classifySession({ ...base, hasAgentId: true })).toEqual({ kind: "subagent", reason: "field-agentid" });
  });

  it("all-sidechain means subagent — an all-sidechain file is a subagent transcript", () => {
    expect(classifySession({ ...base, allSidechain: true })).toEqual({ kind: "subagent", reason: "all-sidechain" });
  });

  it("an unusable head scan means unknown, never machine", () => {
    // 夾帶截圖的第一則訊息可能單行超過掃描視窗，於是檔頭一筆紀錄都讀不到。
    // 那時所有計數都是 0，若直接套「沒有真人訊息」就會把真人對話標成機器任務。
    expect(classifySession({ ...base, headScanUsable: false, humanTurnCount: 0 }))
      .toEqual({ kind: "unknown", reason: "insufficient-signal" });
    // 子代理的硬訊號仍然勝出——那不依賴計數。
    expect(classifySession({ ...base, headScanUsable: false, path: "p/x/subagents/a.jsonl" }).kind).toBe("subagent");
  });

  it("no human turn anywhere is a machine run", () => {
    expect(classifySession({ ...base, humanTurnCount: 0 })).toEqual({ kind: "machine", reason: "no-human-prompt" });
  });

  it("a slash command counts as a human turn even though stripping leaves no text", () => {
    // `/doctor` 淨化後文字整段消失，但那是一個人按下去的。用「有沒有文字」當判準，
    // 會把每一個以斜線指令開場的 session 都標成機器任務。
    expect(classifySession({ ...base, humanTurnCount: 1, syntheticPromptCount: 0 }))
      .toEqual({ kind: "dialogue", reason: "has-human-prompt" });
  });

  it("prompts that are all machine-issued phrases is a machine run", () => {
    expect(classifySession({ ...base, humanTurnCount: 4, syntheticPromptCount: 4 }))
      .toEqual({ kind: "machine", reason: "synthetic-prompts-only" });
  });

  it("the heuristic does not fire when even one prompt is a real one", () => {
    expect(classifySession({ ...base, humanTurnCount: 4, syntheticPromptCount: 3 }))
      .toEqual({ kind: "dialogue", reason: "has-human-prompt" });
  });

  it("a human typed something", () => {
    expect(classifySession(base)).toEqual({ kind: "dialogue", reason: "has-human-prompt" });
  });

  it("subagent rules outrank the machine rules — a subagent with zero human prompts is still a subagent", () => {
    expect(classifySession({ ...base, path: "p/x/subagents/a.jsonl", humanTurnCount: 0 }).kind).toBe("subagent");
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
      humanTurnCount: 8,
      syntheticPromptCount: 0,
      headScanUsable: true,
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
