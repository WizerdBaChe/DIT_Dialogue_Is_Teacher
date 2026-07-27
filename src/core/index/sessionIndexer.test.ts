import { describe, expect, it } from "vitest";
import { buildSessionIndex, INDEX_SCAN_HEAD_BYTES, INDEX_SCAN_TAIL_BYTES } from "./sessionIndexer";
import type { DirectoryFile, DirectorySource } from "./contracts";

const line = (record: Record<string, unknown>): string => JSON.stringify(record);

const userLine = (text: string, extra: Record<string, unknown> = {}): string =>
  line({ type: "user", uuid: "u1", sessionId: "s1", timestamp: "2026-07-20T00:00:00Z", message: { role: "user", content: text }, ...extra });

const assistantLine = (text: string): string =>
  line({ type: "assistant", uuid: "a1", sessionId: "s1", timestamp: "2026-07-20T00:01:00Z", message: { role: "assistant", content: [{ type: "text", text }] } });

/** 一份最小但可被 detectAdapter 認出的 Claude Code transcript。 */
function transcript(...lines: string[]): string {
  return lines.join("\n");
}

function fileOf(path: string, content: string): DirectoryFile {
  const blob = new Blob([content]);
  return {
    path,
    size: blob.size,
    read: async (range) => (range ? blob.slice(range.start, range.end) : blob),
  };
}

function sourceOf(files: Array<[string, string]>): DirectorySource {
  const entries = files.map(([path, content]) => fileOf(path, content));
  return { kind: "webkitdirectory", name: "projects", list: async () => entries };
}

const SIMPLE = transcript(userLine("幫我修一個 bug"), assistantLine("好的"));

describe("buildSessionIndex", () => {
  it("indexes a plain transcript with a title derived from the first human message", async () => {
    const { entries } = await buildSessionIndex(sourceOf([["proj/abc.jsonl", SIMPLE]]));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "s1",
      path: "proj/abc.jsonl",
      project: "proj",
      title: "幫我修一個 bug",
      titleSource: "derived",
      kind: "dialogue",
      humanPromptCount: 1,
      assistantCount: 1,
      countsExact: true,
    });
  });

  it("prefers custom-title, then ai-title, then the first human message, then the filename", async () => {
    const withCustom = transcript(userLine("hi"), line({ type: "ai-title", aiTitle: "AI", sessionId: "s1" }), line({ type: "custom-title", customTitle: "我的標題", sessionId: "s1" }));
    const withAi = transcript(userLine("hi"), line({ type: "ai-title", aiTitle: "AI 標題", sessionId: "s1" }));
    // 只有 assistant、沒有任何真人訊息也沒有標題 → 只能顯示檔名。
    const nameless = transcript(assistantLine("solo"));

    const { entries } = await buildSessionIndex(sourceOf([
      ["p/custom.jsonl", withCustom],
      ["p/ai.jsonl", withAi],
      ["p/nameless.jsonl", nameless],
    ]));
    const byPath = Object.fromEntries(entries.map((entry) => [entry.path, entry]));

    expect(byPath["p/custom.jsonl"]).toMatchObject({ title: "我的標題", titleSource: "custom" });
    expect(byPath["p/ai.jsonl"]).toMatchObject({ title: "AI 標題", titleSource: "ai" });
    expect(byPath["p/nameless.jsonl"]).toMatchObject({ title: "nameless", titleSource: "filename" });
  });

  /**
   * RC-1b 的索引側解法：主檔 `<id>.jsonl` 與 `<id>/subagents/` 是**兄弟**。
   * 索引器負責把它們配成一組，使用者因此不需要理解這個佈局。
   */
  it("pairs <id>.jsonl with its sibling <id>/subagents/*.jsonl", async () => {
    const { entries } = await buildSessionIndex(sourceOf([
      ["proj/abc.jsonl", SIMPLE],
      ["proj/abc/subagents/agent-1.jsonl", transcript(userLine("task", { isSidechain: true, agentId: "ag1" }))],
      ["proj/abc/subagents/agent-2.jsonl", transcript(userLine("task", { isSidechain: true, agentId: "ag2" }))],
      // 另一個 session 的子代理不得被算進來。
      ["proj/other.jsonl", transcript(userLine("別的 session"), assistantLine("ok"))],
      ["proj/other/subagents/agent-9.jsonl", transcript(userLine("x", { isSidechain: true, agentId: "ag9" }))],
    ]));

    const abc = entries.find((entry) => entry.path === "proj/abc.jsonl");
    expect(abc?.subagentPaths.sort()).toEqual(["proj/abc/subagents/agent-1.jsonl", "proj/abc/subagents/agent-2.jsonl"]);
    expect(entries.find((entry) => entry.path === "proj/other.jsonl")?.subagentPaths).toEqual(["proj/other/subagents/agent-9.jsonl"]);
  });

  it("does not list subagent transcripts as sessions of their own", async () => {
    const { entries } = await buildSessionIndex(sourceOf([
      ["proj/abc.jsonl", SIMPLE],
      ["proj/abc/subagents/agent-1.jsonl", transcript(userLine("task", { isSidechain: true }))],
    ]));
    expect(entries.map((entry) => entry.path)).toEqual(["proj/abc.jsonl"]);
  });

  it("never feeds a .meta.json sidecar into the index (RC-1a, from the other side)", async () => {
    const { entries } = await buildSessionIndex(sourceOf([
      ["proj/abc.jsonl", SIMPLE],
      ["proj/abc/subagents/agent-1.jsonl", transcript(userLine("task", { isSidechain: true }))],
      ["proj/abc/subagents/agent-1.meta.json", '{"agentType":"general-purpose"}'],
    ]));
    expect(entries[0].subagentPaths).toEqual(["proj/abc/subagents/agent-1.jsonl"]);
  });

  it("excludes files no adapter claims — never guessed into a source", async () => {
    const { entries, diagnostics } = await buildSessionIndex(sourceOf([["proj/notes.jsonl", '{"hello":"world"}']]));
    expect(entries).toEqual([]);
    expect(diagnostics).toContainEqual({ tier: "info", code: "INDEX_EMPTY" });
  });

  it("marks the counts as inexact when the file is too big to scan whole", async () => {
    const filler = Array.from({ length: 2000 }, (_, i) => assistantLine(`${"x".repeat(200)}#${i}`));
    const big = transcript(userLine("開頭"), ...filler, line({ type: "custom-title", customTitle: "尾端標題", sessionId: "s1" }));
    expect(big.length).toBeGreaterThan(INDEX_SCAN_HEAD_BYTES + INDEX_SCAN_TAIL_BYTES);

    const { entries } = await buildSessionIndex(sourceOf([["p/big.jsonl", big]]));
    expect(entries[0].countsExact).toBe(false);
    // 標題是後來追加的，落在檔尾——這正是頭尾都要掃的理由 (實測：中位數距檔尾 7.5 KB)。
    expect(entries[0]).toMatchObject({ title: "尾端標題", titleSource: "custom" });
  });

  it("reports truncation instead of silently dropping files", async () => {
    const files: Array<[string, string]> = Array.from({ length: 5 }, (_, i) => [`p/s${i}.jsonl`, SIMPLE]);
    const { entries, diagnostics } = await buildSessionIndex(sourceOf(files), { maxFiles: 2 });

    expect(entries).toHaveLength(2);
    expect(diagnostics).toContainEqual({ tier: "info", code: "INDEX_TRUNCATED", detail: "2", count: 3 });
  });

  it("reports an unreadable file and keeps indexing the rest", async () => {
    const broken: DirectoryFile = {
      path: "p/broken.jsonl",
      size: 10,
      read: async () => { throw new Error("permission denied"); },
    };
    const source: DirectorySource = {
      kind: "fsa",
      name: "projects",
      list: async () => [broken, fileOf("p/ok.jsonl", SIMPLE)],
    };

    const { entries, diagnostics } = await buildSessionIndex(source);
    expect(entries.map((entry) => entry.path)).toEqual(["p/ok.jsonl"]);
    expect(diagnostics).toContainEqual(expect.objectContaining({ tier: "warn", code: "INDEX_FILE_UNREADABLE", count: 1 }));
  });

  it("flags compaction and reads the project path from the record's own cwd", async () => {
    const withCompaction = transcript(
      userLine("hi", { cwd: "D:\\AIWork\\DIT" }),
      line({ type: "system", subtype: "compact_boundary", sessionId: "s1", compactMetadata: { trigger: "manual" } }),
    );
    const { entries } = await buildSessionIndex(sourceOf([["p/c.jsonl", withCompaction]]));
    expect(entries[0]).toMatchObject({ hasCompaction: true, projectPath: "D:\\AIWork\\DIT" });
  });

  it("ignores injected preamble and tool results when counting human prompts", async () => {
    const noisy = transcript(
      userLine("真的問題"),
      line({ type: "user", uuid: "u2", sessionId: "s1", isMeta: true, message: { role: "user", content: "skill body injected by the tool" } }),
      line({ type: "user", uuid: "u3", sessionId: "s1", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "output" }] } }),
      assistantLine("答"),
    );
    const { entries } = await buildSessionIndex(sourceOf([["p/n.jsonl", noisy]]));
    expect(entries[0].humanPromptCount).toBe(1);
    expect(entries[0].kind).toBe("dialogue");
  });

  /**
   * 誤傷回歸 1：`/doctor` 這類斜線指令淨化後文字整段消失。若用「有沒有文字」當人機判準，
   * 每一個以斜線指令開場的 session 都會被標成機器任務——真實資料裡就有一個 51 則回覆的
   * 工作階段被這樣誤判。
   */
  it("REGRESSION: a slash-command opener still counts as a human turn", async () => {
    const slashOnly = transcript(
      line({ type: "user", uuid: "u1", sessionId: "sd", message: { role: "user", content: "<command-message>doctor</command-message>\n<command-name>/doctor</command-name>" } }),
      assistantLine("開始健檢"),
    );
    const { entries } = await buildSessionIndex(sourceOf([["p/slash.jsonl", slashOnly]]));
    expect(entries[0]).toMatchObject({ kind: "dialogue", kindReason: "has-human-prompt", humanPromptCount: 1 });
    // 標題另當別論：淨化後沒有文字可用，只能顯示檔名，而且要看得出是降級。
    expect(entries[0].titleSource).toBe("filename");
  });

  /**
   * 誤傷回歸 2：夾帶截圖的使用者訊息會把 base64 影像塞進同一行 JSON（實測 132 KB）。
   * 那一行若剛好跨過檔頭視窗邊界就會被丟掉，計數歸零，然後被判成機器任務。
   */
  it("REGRESSION: an oversized line straddling the head window is recovered, not dropped", async () => {
    const filler = Array.from({ length: 20 }, (_, i) => assistantLine(`pad-${i}`));
    const huge = line({
      type: "user",
      uuid: "u-huge",
      sessionId: "sh",
      timestamp: "2026-07-20T00:00:00Z",
      message: { role: "user", content: [{ type: "image", source: { data: "x".repeat(200 * 1024) } }, { type: "text", text: "這是我本人打的字，附了一張截圖" }] },
    });
    const tail = Array.from({ length: 20 }, (_, i) => assistantLine(`tail-${i}`));
    const content = transcript(...filler, huge, ...tail);

    const { entries } = await buildSessionIndex(sourceOf([["p/shot.jsonl", content]]));

    expect(entries[0]).toMatchObject({ kind: "dialogue", kindReason: "has-human-prompt", humanPromptCount: 1 });
    expect(entries[0].title).toContain("這是我本人打的字");
  });

  it("gives up rather than guessing when the head scan reads nothing at all", async () => {
    // 第一行就大過放大後的視窗：什麼都讀不到，於是不判斷，而不是判成機器任務。
    const monstrous = line({ type: "user", uuid: "u1", sessionId: "sm", message: { role: "user", content: "y".repeat(2 * 1024 * 1024) } });
    const { entries } = await buildSessionIndex(sourceOf([["p/monster.jsonl", `${monstrous}\n${transcript(...Array.from({ length: 40 }, (_, i) => assistantLine(`t${i}`)))}`]]));

    expect(entries[0]).toMatchObject({ kind: "unknown", kindReason: "insufficient-signal" });
  });

  it("sorts newest first", async () => {
    const older = transcript(line({ type: "user", uuid: "u1", sessionId: "s1", timestamp: "2026-01-01T00:00:00Z", message: { role: "user", content: "old" } }));
    const newer = transcript(line({ type: "user", uuid: "u1", sessionId: "s2", timestamp: "2026-07-01T00:00:00Z", message: { role: "user", content: "new" } }));
    const { entries } = await buildSessionIndex(sourceOf([["p/old.jsonl", older], ["p/new.jsonl", newer]]));
    expect(entries.map((entry) => entry.path)).toEqual(["p/new.jsonl", "p/old.jsonl"]);
  });
});
