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

  /**
   * WC-1.2 (P2-1's UAT sibling, C1): an unreadable head must still be **listed**, not
   * silently dropped — "couldn't read it" and "confidently not one of ours" are different
   * facts and must not collapse to the same "gone from the list" outcome. `source` must be
   * honestly `null` here too: no adapter ever got a complete first line to test.
   */
  it("REGRESSION C1: an unreadable head is listed as undetermined, not dropped, and carries no guessed source", async () => {
    const monstrous = line({ type: "user", uuid: "u1", sessionId: "sm", message: { role: "user", content: "y".repeat(2 * 1024 * 1024) } });
    const { entries } = await buildSessionIndex(sourceOf([["p/monster2.jsonl", `${monstrous}\n${transcript(...Array.from({ length: 40 }, (_, i) => assistantLine(`t${i}`)))}`]]));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "unknown", kindReason: "insufficient-signal", source: null });
  });

  /**
   * WC-1.2 (C1): the pre-R11 skip (`if (headScanUsable && !result.isClaudeCode) continue;`)
   * dropped every recognised Codex file from the folder browser. A Codex rollout must now
   * survive indexing, carry `source: "codex"`, and has no `<id>/subagents/` sibling layout, so
   * `subagentPaths` must be the deliberate empty branch.
   *
   * R11.2 R1 supersedes this test's original `kind: "unknown" / "codex-unclassified"` assertion:
   * that was R11's honest-but-useless state (Codex had no signals of its own yet, so every
   * Codex file landed here regardless of content). This fixture genuinely contains a human
   * message, so with Codex's own signals wired up it must now classify as `dialogue` and derive
   * a real title from that message — not the `rollout-*.jsonl` filename. The "still kept, still
   * carries source, still no guessed subagentPaths" parts of the original test remain intact.
   */
  it("REGRESSION C1 / R11.2 R1: a recognised Codex rollout with a real user message is indexed as dialogue with a derived title", async () => {
    const codexRollout = [
      JSON.stringify({ timestamp: "2026-08-01T00:00:00Z", type: "session_meta", payload: { session_id: "cx-1", cwd: "/tmp/proj" } }),
      JSON.stringify({
        timestamp: "2026-08-01T00:00:01Z",
        type: "response_item",
        payload: { type: "message", role: "user", content: [{ type: "input_text", text: "幫我看一下這段程式碼" }] },
      }),
      JSON.stringify({
        timestamp: "2026-08-01T00:00:02Z",
        type: "response_item",
        payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "好的，我看看" }] },
      }),
    ].join("\n");

    const { entries } = await buildSessionIndex(sourceOf([["proj/rollout-cx1.jsonl", codexRollout]]));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      source: "codex",
      kind: "dialogue",
      kindReason: "has-human-prompt",
      subagentPaths: [],
      title: "幫我看一下這段程式碼",
      titleSource: "derived",
      humanPromptCount: 1,
      assistantCount: 1,
    });
  });

  /**
   * R11.2 R1: the "rare, not extinct" half of the fix. A Codex file whose scanned window holds
   * no `response_item/message` at all (only session bookkeeping and a tool call/result pair)
   * genuinely has no signal to classify from — it must stay `codex-unclassified`, not be guessed
   * into `machine` just because a naive human-turn count would read `0`.
   */
  it("R11.2 R1: a Codex file with no message records anywhere in the window stays codex-unclassified", async () => {
    const toolOnlyRollout = [
      JSON.stringify({ timestamp: "2026-08-01T00:00:00Z", type: "session_meta", payload: { session_id: "cx-2", cwd: "/tmp/proj" } }),
      JSON.stringify({
        timestamp: "2026-08-01T00:00:01Z",
        type: "response_item",
        payload: { type: "custom_tool_call", call_id: "call_1", name: "exec", input: "tools.apply_patch(...)" },
      }),
      JSON.stringify({
        timestamp: "2026-08-01T00:00:02Z",
        type: "response_item",
        payload: { type: "custom_tool_call_output", call_id: "call_1", output: [{ type: "input_text", text: "ok" }] },
      }),
    ].join("\n");

    const { entries } = await buildSessionIndex(sourceOf([["proj/rollout-cx2.jsonl", toolOnlyRollout]]));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      source: "codex",
      kind: "unknown",
      kindReason: "codex-unclassified",
      titleSource: "filename",
    });
  });

  /**
   * R11.2 R1: the assistant spoke, but the file's scanned window shows no human-authored turn —
   * an honest `machine`, distinguishable from the "no signal at all" case above because the
   * conversational structure was actually observed.
   */
  it("R11.2 R1: a Codex file with assistant-only activity in the window is a machine run", async () => {
    const machineOnlyRollout = [
      JSON.stringify({ timestamp: "2026-08-01T00:00:00Z", type: "session_meta", payload: { session_id: "cx-3", cwd: "/tmp/proj" } }),
      JSON.stringify({
        timestamp: "2026-08-01T00:00:01Z",
        type: "response_item",
        payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "自動排程任務開始" }] },
      }),
    ].join("\n");

    const { entries } = await buildSessionIndex(sourceOf([["proj/rollout-cx3.jsonl", machineOnlyRollout]]));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ source: "codex", kind: "machine", kindReason: "no-human-prompt" });
  });

  /**
   * R11.2 R1: the Codex auto-review sub-agent transcribes prior history wearing a `role: "user"`
   * envelope (see `isAutoReviewDump` in `codexJsonl.ts`). That must not count as a human turn or
   * become the derived title — it is a machine-generated retrospective dump, not something a
   * person typed.
   */
  it("R11.2 R1: an auto-review history dump does not count as a human turn or become the title", async () => {
    const autoReviewRollout = [
      JSON.stringify({ timestamp: "2026-08-01T00:00:00Z", type: "session_meta", payload: { session_id: "cx-4", cwd: "/tmp/proj" } }),
      JSON.stringify({
        timestamp: "2026-08-01T00:00:01Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "The following is the Codex agent history for auto-review purposes: ...(轉述省略)" }],
        },
      }),
      JSON.stringify({
        timestamp: "2026-08-01T00:00:02Z",
        type: "response_item",
        payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: '{"outcome":"allow"}' }] },
      }),
    ].join("\n");

    const { entries } = await buildSessionIndex(sourceOf([["proj/rollout-cx4.jsonl", autoReviewRollout]]));

    expect(entries).toHaveLength(1);
    // 沒有真人回合可數（唯一一則 user 訊息是轉述），但 assistant 訊息證明視窗內確實看到過
    // 對話結構，所以是「機器任務」而不是「無法判定」。
    expect(entries[0]).toMatchObject({ source: "codex", kind: "machine", kindReason: "no-human-prompt", titleSource: "filename" });
  });

  /**
   * P2-1: `detectAdapter` only looks at the first complete line. When that line itself is
   * the oversized one (not a later line, unlike the REGRESSION test above — that fixture stays
   * under the whole-file threshold and never exercises the widen path at all), the initial
   * 128 KiB window holds nothing but a truncated fragment of it, so `detectAdapter` fails and
   * the pre-fix code latched that failure permanently. The widened re-read recovers the line
   * for counting purposes either way; this test pins that the adapter verdict is recomputed
   * from the widened text too, or the file is wrongly excluded a moment later at the
   * `headScanUsable && !source` gate.
   */
  it("REGRESSION P2-1: the adapter verdict is recomputed after the head window widens", async () => {
    const huge = line({
      type: "user",
      uuid: "u-first",
      sessionId: "sfirst",
      timestamp: "2026-07-20T00:00:00Z",
      message: {
        role: "user",
        content: [{ type: "image", source: { data: "x".repeat(300 * 1024) } }, { type: "text", text: "第一行就帶了截圖" }],
      },
    });
    const tail = Array.from({ length: 5 }, (_, i) => assistantLine(`tail-${i}`));
    const content = transcript(huge, ...tail);
    // `Buffer` is not typed in this project (browser-only lib target) — use TextEncoder instead.
    const byteLength = (text: string): number => new TextEncoder().encode(text).length;
    expect(byteLength(content)).toBeGreaterThan(INDEX_SCAN_HEAD_BYTES + INDEX_SCAN_TAIL_BYTES);
    expect(byteLength(huge)).toBeGreaterThan(INDEX_SCAN_HEAD_BYTES);

    const { entries } = await buildSessionIndex(sourceOf([["p/first-line-huge.jsonl", content]]));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ source: "claude-code", kind: "dialogue", humanPromptCount: 1 });
    expect(entries[0].title).toContain("第一行就帶了截圖");
  });

  it("sorts newest first", async () => {
    const older = transcript(line({ type: "user", uuid: "u1", sessionId: "s1", timestamp: "2026-01-01T00:00:00Z", message: { role: "user", content: "old" } }));
    const newer = transcript(line({ type: "user", uuid: "u1", sessionId: "s2", timestamp: "2026-07-01T00:00:00Z", message: { role: "user", content: "new" } }));
    const { entries } = await buildSessionIndex(sourceOf([["p/old.jsonl", older], ["p/new.jsonl", newer]]));
    expect(entries.map((entry) => entry.path)).toEqual(["p/new.jsonl", "p/old.jsonl"]);
  });
});

/**
 * R9.1 RC-B：具名降級走診斷通道，不走 console 的 fallback 通道。
 * 作者實測回報 console 反覆出現 `sessionIndexer/pickTitle|no-title-signal`。
 */
describe("title degradation is reported once, as a diagnostic (R9.1 RC-B)", () => {
  const titleless = (id: string) => transcript(
    line({ type: "assistant", uuid: id, sessionId: id, timestamp: "2026-07-20T00:00:00Z", message: { role: "assistant", content: [{ type: "text", text: "只有機器發言" }] } }),
  );

  it("emits one aggregate INDEX_TITLE_FROM_FILENAME carrying the count", async () => {
    const { entries, diagnostics } = await buildSessionIndex(sourceOf([
      ["proj/a.jsonl", titleless("a")],
      ["proj/b.jsonl", titleless("b")],
    ]));

    expect(entries.every((entry) => entry.titleSource === "filename")).toBe(true);
    const titleDiagnostics = diagnostics.filter((d) => d.code === "INDEX_TITLE_FROM_FILENAME");
    expect(titleDiagnostics).toHaveLength(1);
    expect(titleDiagnostics[0]).toMatchObject({ tier: "info", count: 2 });
  });

  it("says nothing when every session has a usable title", async () => {
    const { diagnostics } = await buildSessionIndex(sourceOf([
      ["proj/a.jsonl", transcript(userLine("修一下登入流程"), assistantLine("好"))],
    ]));

    expect(diagnostics.some((d) => d.code === "INDEX_TITLE_FROM_FILENAME")).toBe(false);
  });
});

/**
 * R12 M2 — the level-1 choice decides where to look, and detection becomes VERIFICATION.
 *
 * The behaviour R11 WC-1.2 shipped (author's own C1 report: Codex sessions vanished from the
 * folder browser) is not being undone here. Without `expectSource` nothing changes at all; with
 * it, out-of-scope files are counted and reported rather than silently missing.
 */
describe("buildSessionIndex · expectSource (R12 M2)", () => {
  const codexRollout = [
    JSON.stringify({ timestamp: "2026-08-01T00:00:00Z", type: "session_meta", payload: { session_id: "cx-1", cwd: "/tmp/proj" } }),
    JSON.stringify({
      timestamp: "2026-08-01T00:00:01Z",
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ type: "input_text", text: "看一下這段" }] },
    }),
  ].join("\n");

  const mixed = (): DirectorySource => sourceOf([
    ["proj/claude.jsonl", SIMPLE],
    ["proj/rollout-cx1.jsonl", codexRollout],
  ]);

  it("without a chosen source, lists both harnesses exactly as R11 WC-1.2 does", async () => {
    const { entries, diagnostics } = await buildSessionIndex(mixed());
    expect(entries.map((e) => e.source).sort()).toEqual(["claude-code", "codex"]);
    expect(diagnostics.some((d) => d.code === "INDEX_SOURCE_MISMATCH")).toBe(false);
  });

  it("keeps only the chosen harness and reports the skipped count by name", async () => {
    const { entries, diagnostics } = await buildSessionIndex(mixed(), { expectSource: "claude-code" });

    expect(entries.map((e) => e.source)).toEqual(["claude-code"]);
    const mismatch = diagnostics.filter((d) => d.code === "INDEX_SOURCE_MISMATCH");
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0]).toMatchObject({ tier: "warn", count: 1, detail: "claude-code" });
  });

  it("works the other way round, so the rule is not a Claude Code special case", async () => {
    const { entries, diagnostics } = await buildSessionIndex(mixed(), { expectSource: "codex" });
    expect(entries.map((e) => e.source)).toEqual(["codex"]);
    /*
     * R12 M3 moved WHERE this exclusion happens, not whether it does. Codex declares a filename
     * convention, so the Claude Code file is rejected on its name and never opened — reported as
     * `INDEX_NOT_TRANSCRIPT` rather than `INDEX_SOURCE_MISMATCH`, because a name can only tell
     * us "not one of ours", never "it is the other one's". The exclusion is still counted and
     * still stated; only the claim it makes got narrower, to match what was actually determined.
     */
    expect(diagnostics.filter((d) => d.code === "INDEX_NOT_TRANSCRIPT")[0]).toMatchObject({ tier: "info", count: 1 });
  });

  it("says nothing when every file belongs to the chosen harness", async () => {
    const { entries, diagnostics } = await buildSessionIndex(
      sourceOf([["proj/claude.jsonl", SIMPLE]]),
      { expectSource: "claude-code" },
    );
    expect(entries).toHaveLength(1);
    expect(diagnostics.some((d) => d.code === "INDEX_SOURCE_MISMATCH")).toBe(false);
  });

  it("does NOT drop a file whose source could not be resolved at all", async () => {
    /*
     * "Could not read enough to ask" and "read it, it says the other harness" are different
     * facts, and collapsing the first into the second is exactly the C1 defect wearing a new
     * hat. An unresolved file stays listed, under any chosen source.
     */
    const unreadable = `${"x".repeat(INDEX_SCAN_HEAD_BYTES)}\n`;
    // R12 M3: named `rollout-*` on purpose, so it clears the Codex FILENAME filter and the test
    // still exercises the thing it was written for — a file we could not read enough of to ask.
    const { entries, diagnostics } = await buildSessionIndex(
      sourceOf([["sessions/rollout-huge-first-line.jsonl", unreadable]]),
      { expectSource: "codex" },
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBeNull();
    expect(diagnostics.some((d) => d.code === "INDEX_SOURCE_MISMATCH")).toBe(false);
  });
});

/**
 * R12 M3 — the walk follows `discovery.transcripts`, and both Codex roots are accepted.
 *
 * `~/.codex/sessions` is the habit people already have, so rejecting it would read as "broken".
 * But it is not equivalent to `~/.codex`: the sidecar sits one level above the transcripts and a
 * browser cannot read the parent of a picked directory, so from `sessions/` it is unreachable.
 * That difference is stated rather than silently absorbed.
 */
describe("buildSessionIndex · per-source paths (R12 M3)", () => {
  const rollout = (id: string): string => [
    JSON.stringify({ timestamp: "2026-08-01T00:00:00Z", type: "session_meta", payload: { session_id: id, cwd: "/tmp/p" } }),
    JSON.stringify({
      timestamp: "2026-08-01T00:00:01Z",
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ type: "input_text", text: "看一下這段" }] },
    }),
  ].join("\n");

  const SIDECAR = ".codex-global-state.json";

  it("indexes the same sessions whether the user picks ~/.codex or ~/.codex/sessions", async () => {
    const fromRoot = await buildSessionIndex(sourceOf([
      [SIDECAR, "{}"],
      ["sessions/2026/08/rollout-a.jsonl", rollout("a")],
      ["sessions/2026/08/rollout-b.jsonl", rollout("b")],
    ]), { expectSource: "codex" });

    const fromSessions = await buildSessionIndex(sourceOf([
      ["2026/08/rollout-a.jsonl", rollout("a")],
      ["2026/08/rollout-b.jsonl", rollout("b")],
    ]), { expectSource: "codex" });

    expect(fromRoot.entries.map((e) => e.path)).toEqual([
      "sessions/2026/08/rollout-a.jsonl",
      "sessions/2026/08/rollout-b.jsonl",
    ]);
    expect(fromSessions.entries.map((e) => e.path)).toEqual([
      "2026/08/rollout-a.jsonl",
      "2026/08/rollout-b.jsonl",
    ]);
    // Same sessions, same count, either way in.
    expect(fromRoot.entries).toHaveLength(fromSessions.entries.length);
  });

  it("KNOWN GAP for M5: a Codex entry's id is its filename, not its session id", async () => {
    /*
     * `absorb()` only reads Claude Code's `record.sessionId`. Codex self-reports its id at
     * `session_meta.payload.id` and nothing looks there, so the entry falls back to the
     * filename — "we did not look" being recorded as "it is missing", which is the exact
     * anti-pattern this codebase keeps having to re-learn.
     *
     * It is not fixed here because M3 is path adaptation, not record parsing, and the id has no
     * consumer until M5 joins the sidecar on precisely that key. This test exists so the gap is
     * a recorded fact rather than a surprise when M5 starts: change it there, with the join.
     */
    const { entries } = await buildSessionIndex(sourceOf([
      [SIDECAR, "{}"],
      ["sessions/2026/08/rollout-a.jsonl", rollout("a")],
    ]), { expectSource: "codex" });

    expect(entries[0].id).toBe("rollout-a");
  });

  it("says the sidecar is out of reach when the user picked one level too deep", async () => {
    const { entries, diagnostics } = await buildSessionIndex(sourceOf([
      ["2026/08/rollout-a.jsonl", rollout("a")],
    ]), { expectSource: "codex" });

    expect(entries).toHaveLength(1);
    const notice = diagnostics.filter((d) => d.code === "INDEX_SIDECAR_OUT_OF_REACH");
    expect(notice).toHaveLength(1);
    // The message has to name the folder that WOULD reach it, or it is not actionable.
    expect(notice[0]).toMatchObject({ tier: "warn", detail: "~/.codex" });
  });

  it("stays quiet when the sidecar is reachable", async () => {
    const { diagnostics } = await buildSessionIndex(sourceOf([
      [SIDECAR, "{}"],
      ["sessions/2026/08/rollout-a.jsonl", rollout("a")],
    ]), { expectSource: "codex" });

    expect(diagnostics.some((d) => d.code === "INDEX_SIDECAR_OUT_OF_REACH")).toBe(false);
  });

  it("stays quiet for a source that declares no sidecar", async () => {
    // Claude Code keeps its titles inside the transcript, so there is nothing to be out of reach.
    const { diagnostics } = await buildSessionIndex(
      sourceOf([["proj/a.jsonl", SIMPLE]]),
      { expectSource: "claude-code" },
    );
    expect(diagnostics.some((d) => d.code === "INDEX_SIDECAR_OUT_OF_REACH")).toBe(false);
  });

  it("does not accuse an empty folder of hiding the sidecar", async () => {
    // No transcripts at all is "wrong folder", not "sidecar out of reach" — saying the latter
    // would send the user to re-pick a parent that has nothing in it either.
    const { entries, diagnostics } = await buildSessionIndex(sourceOf([["notes.md", "hi"]]), { expectSource: "codex" });
    expect(entries).toHaveLength(0);
    expect(diagnostics.some((d) => d.code === "INDEX_SIDECAR_OUT_OF_REACH")).toBe(false);
  });

  it("never scans the other harness's shape when the source declares its own", async () => {
    // A Claude Code transcript in a Codex folder is rejected on its NAME — it is never opened.
    const { entries, diagnostics } = await buildSessionIndex(sourceOf([
      [SIDECAR, "{}"],
      ["sessions/2026/08/rollout-a.jsonl", rollout("a")],
      ["sessions/2026/08/0199a1b2-3c4d.jsonl", SIMPLE],
    ]), { expectSource: "codex" });

    expect(entries.map((e) => e.path)).toEqual(["sessions/2026/08/rollout-a.jsonl"]);
    /*
     * Excluded by NAME is reported as `INDEX_NOT_TRANSCRIPT` (info), not as
     * `INDEX_SOURCE_MISMATCH` (warn). Measuring the real corpus is what forced this apart: the
     * three non-rollout `.jsonl` files under `~/.codex` are Codex's own index and history files,
     * so a warn saying "these do not belong to the system you chose" would have been false, and
     * it would have fired on every single Codex root pick.
     */
    expect(diagnostics.filter((d) => d.code === "INDEX_NOT_TRANSCRIPT")[0]).toMatchObject({ tier: "info", count: 1 });
    expect(diagnostics.some((d) => d.code === "INDEX_SOURCE_MISMATCH")).toBe(false);
  });

  it("stays silent about non-.jsonl files, which were never candidates", () => {
    // The baseline filter is not a degradation and gets no diagnostic — that is R9 behaviour.
    return buildSessionIndex(sourceOf([
      [SIDECAR, "{}"],
      ["sessions/2026/08/rollout-a.jsonl", rollout("a")],
      ["README.md", "hello"],
    ]), { expectSource: "codex" }).then(({ diagnostics }) => {
      expect(diagnostics.some((d) => d.code === "INDEX_NOT_TRANSCRIPT")).toBe(false);
    });
  });

  /*
   * Found by third-party review 2026-08-26, not by these tests. `INDEX_EMPTY`'s copy was hard
   * coded to "Claude Code" from R9, when that was the only source. M2 made it reachable from a
   * Codex-selected browse, so a Codex user with an empty folder was told no CLAUDE CODE sessions
   * were found — the round's own purpose, contradicted in the first sentence the user reads.
   */
  it("names the chosen system when a folder turns up empty, instead of always saying Claude Code", async () => {
    const { entries, diagnostics } = await buildSessionIndex(sourceOf([["README.md", "hi"]]), { expectSource: "codex" });
    expect(entries).toHaveLength(0);
    expect(diagnostics.find((d) => d.code === "INDEX_EMPTY")).toMatchObject({ detail: "Codex" });
  });

  it("stays generic when no system was chosen", async () => {
    const { diagnostics } = await buildSessionIndex(sourceOf([["README.md", "hi"]]));
    expect(diagnostics.find((d) => d.code === "INDEX_EMPTY")?.detail).toBeUndefined();
  });

  it("says the system is probably wrong when every .jsonl was rejected by name", async () => {
    /*
     * Also from review: `INDEX_SOURCE_MISMATCH` is structurally UNREACHABLE here. Codex's
     * `rollout-*` pattern rejects every Claude Code filename before content detection runs, so
     * picking Codex and browsing `~/.claude/projects` produced an empty list plus an info note
     * about filenames — accurate, and no help at all. This is the actionable version.
     */
    const { entries, diagnostics } = await buildSessionIndex(sourceOf([
      ["proj/0199a1b2.jsonl", SIMPLE],
      ["proj/0199a1b3.jsonl", SIMPLE],
    ]), { expectSource: "codex" });

    expect(entries).toHaveLength(0);
    expect(diagnostics.find((d) => d.code === "INDEX_EMPTY_WRONG_SOURCE")).toMatchObject({
      tier: "warn",
      count: 2,
      detail: "Codex",
    });
    // The bare "nothing here" note must not also fire — two messages about one fact.
    expect(diagnostics.some((d) => d.code === "INDEX_EMPTY")).toBe(false);
  });

  it("does not cry wrong-system for a genuinely empty folder", async () => {
    // No `.jsonl` at all means "wrong folder", not "wrong system" — sending the user back to
    // the level-1 menu would be the wrong next step.
    const { diagnostics } = await buildSessionIndex(sourceOf([["notes.md", "x"]]), { expectSource: "codex" });
    expect(diagnostics.some((d) => d.code === "INDEX_EMPTY_WRONG_SOURCE")).toBe(false);
    expect(diagnostics.some((d) => d.code === "INDEX_EMPTY")).toBe(true);
  });

  it("keeps the R9 walk exactly when no source is chosen", async () => {
    const { entries } = await buildSessionIndex(sourceOf([
      ["proj/claude.jsonl", SIMPLE],
      ["sessions/2026/08/rollout-a.jsonl", rollout("a")],
    ]));
    expect(entries).toHaveLength(2);
  });
});

/**
 * R12 M5 — the title ladder walks the profile, and Codex's top rung comes from the sidecar.
 *
 * Before this, `pickTitle` was one hard-coded chain whose top two rungs (`custom`, `ai`) are
 * Claude Code record types, so every Codex session fell straight through to `derived` and showed
 * an excerpt of its first message instead of its purpose. That was the author's B1 report.
 */
describe("buildSessionIndex · title ladder and sidecar (R12 M5)", () => {
  const SIDECAR_PATH = ".codex-global-state.json";

  /** A Codex rollout. `id` is the thread's own id; `session_id` is the conversation it came from. */
  const rolloutWithIds = (id: string, sessionId = id): string => [
    JSON.stringify({
      timestamp: "2026-08-01T00:00:00Z",
      type: "session_meta",
      payload: { id, session_id: sessionId, cwd: "/tmp/p" },
    }),
    JSON.stringify({
      timestamp: "2026-08-01T00:00:01Z",
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ type: "input_text", text: "幫我看一下這段程式碼有沒有問題" }] },
    }),
  ].join("\n");

  const sidecarOf = (descriptions: Record<string, string>): [string, string] => [
    SIDECAR_PATH,
    JSON.stringify({ "electron-persisted-atom-state": { "thread-descriptions-v1": descriptions } }),
  ];

  it("prefers the sidecar description over an excerpt of the first message", async () => {
    const { entries } = await buildSessionIndex(sourceOf([
      sidecarOf({ "thread-1": "將 Claude 規則內容移植到 Codex 環境" }),
      ["sessions/2026/08/rollout-a.jsonl", rolloutWithIds("thread-1")],
    ]), { expectSource: "codex" });

    expect(entries[0].title).toBe("將 Claude 規則內容移植到 Codex 環境");
    expect(entries[0].titleSource).toBe("sidecar");
  });

  it("falls through to the next rung when a session has no description, without erroring", async () => {
    const { entries, diagnostics } = await buildSessionIndex(sourceOf([
      sidecarOf({ "some-other-thread": "不相干的描述" }),
      ["sessions/2026/08/rollout-a.jsonl", rolloutWithIds("thread-1")],
    ]), { expectSource: "codex" });

    expect(entries[0].titleSource).toBe("derived");
    expect(entries[0].title).toContain("幫我看一下");
    expect(diagnostics.some((d) => d.tier === "fatal")).toBe(false);
  });

  it("JOINS ON payload.id, NOT payload.session_id — the higher-coverage key is the wrong one", async () => {
    /*
     * The finding that matters most in this card. Measured over 358 rollouts: both id fields are
     * always present and they DISAGREE on 135 of them — the forked threads, where `session_id`
     * points at the parent conversation. Joining on `session_id` scores 190 hits instead of 61,
     * but 129 of those are a fork wearing its PARENT's purpose: a fluent, plausible, wrong title
     * with no visible tell. Zero forked threads have a description of their own.
     *
     * So this test exists to stop a future "let's raise coverage" change. If it fails because
     * someone switched to `session_id`, the number went up and the product got worse.
     *
     * UPDATED 2026-08-27 (author ruling). Coverage DID go up, 17.0% → 53.1% — and the finding
     * above is why it was allowed to: the parent's description is now shown on a rung of its
     * own, `sidecar-parent`, which the list labels 「承自母對話」. The invariant this test
     * defends is unchanged and is the FIRST assertion below: **a fork never wears its parent's
     * purpose as its own.** What was rejected was the silent version, not the information.
     * Merging the two rungs to raise the `sidecar` number is still the failure this catches.
     */
    const { entries } = await buildSessionIndex(sourceOf([
      sidecarOf({ "parent-thread": "母對話的目的" }),
      // A forked thread: its own id is `fork-1`, but it came from `parent-thread`.
      ["sessions/2026/08/rollout-a.jsonl", rolloutWithIds("fork-1", "parent-thread")],
    ]), { expectSource: "codex" });

    // The load-bearing half: NOT `sidecar`, because that rung means "this session's own stated
    // purpose" and this is not that.
    expect(entries[0].titleSource).not.toBe("sidecar");
    expect(entries[0].titleSource).toBe("sidecar-parent");
    expect(entries[0].title).toBe("母對話的目的");
  });

  it("never labels a NON-forked session as inheriting, even when both ids are present", async () => {
    /*
     * The other side of the same rule, and the reason `rungValue` compares the two ids instead of
     * just reading the parent key: when a thread is not a fork both ids are the same string, so a
     * naive lookup would find the very same description and hand it to the user under a badge
     * saying it came from somewhere else. That is a false statement about provenance — the exact
     * class of defect the marked rung exists to prevent.
     */
    const { entries } = await buildSessionIndex(sourceOf([
      sidecarOf({ "thread-1": "這串自己的目的" }),
      ["sessions/2026/08/rollout-a.jsonl", rolloutWithIds("thread-1", "thread-1")],
    ]), { expectSource: "codex" });

    expect(entries[0].titleSource).toBe("sidecar");
    expect(entries[0].title).toBe("這串自己的目的");
  });

  it("gives a Codex entry its real session id instead of the filename (closes DW-18)", async () => {
    const { entries } = await buildSessionIndex(sourceOf([
      ["sessions/2026/08/rollout-a.jsonl", rolloutWithIds("thread-1")],
    ]), { expectSource: "codex" });

    expect(entries[0].id).toBe("thread-1");
  });

  it("indexes normally when the sidecar is malformed, only losing those titles", async () => {
    const { entries, diagnostics } = await buildSessionIndex(sourceOf([
      [SIDECAR_PATH, "{ not json"],
      ["sessions/2026/08/rollout-a.jsonl", rolloutWithIds("thread-1")],
    ]), { expectSource: "codex" });

    expect(entries).toHaveLength(1);
    expect(entries[0].titleSource).toBe("derived");
    expect(diagnostics.find((d) => d.code === "INDEX_SIDECAR_UNREADABLE")).toBeDefined();
    expect(diagnostics.some((d) => d.tier === "fatal")).toBe(false);
  });

  it("never produces an empty title, even for a file named exactly `.jsonl`", async () => {
    /*
     * Found by review 2026-08-27. `filename` is every ladder's terminal rung, and its value is
     * `baseName(path)` with the extension stripped — which is the EMPTY STRING for a file called
     * `.jsonl`. The loop's `if (value && value.trim())` rejected it, fell through to the
     * post-loop return, and that recomputed the same empty string and returned it. The code's own
     * comment claimed showing a filename beats showing nothing; in this one case they were equal.
     */
    const { entries } = await buildSessionIndex(sourceOf([[".jsonl", SIMPLE]]), { expectSource: "claude-code" });
    expect(entries).toHaveLength(1);
    expect(entries[0].title.trim()).not.toBe("");
  });

  it("resolves the session id through the profile's declared join key, not a hardcoded path", async () => {
    /*
     * Review 2026-08-27 found `SidecarSpec.joinKey` was declared and read by nothing. The guard
     * for that is behavioural: a record whose `type` is NOT the declared `recordType` must not
     * yield an id, however id-shaped its contents are. If the extraction goes back to being
     * hardcoded on `session_meta`, this still passes — but paired with the derivation test in
     * profiles.discovery.test.ts, the pair pins that the profile is what is consulted.
     */
    const idOffTheDeclaredPath = [
      // A real session_meta, but the id sits at `session_id` only — the profile declares
      // `payload.id`, and that is the path that must be walked.
      JSON.stringify({
        timestamp: "2026-08-01T00:00:00Z",
        type: "session_meta",
        payload: { session_id: "should-not-be-used", cwd: "/tmp/p" },
      }),
      JSON.stringify({
        timestamp: "2026-08-01T00:00:01Z",
        type: "response_item",
        payload: { type: "message", role: "user", content: [{ type: "input_text", text: "看一下" }] },
      }),
    ].join("\n");

    const { entries } = await buildSessionIndex(
      sourceOf([["sessions/2026/08/rollout-x.jsonl", idOffTheDeclaredPath]]),
      { expectSource: "codex" },
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].id).not.toBe("should-not-be-used");
    // Falls back to the filename, honestly, rather than reaching for a neighbouring field.
    expect(entries[0].id).toBe("rollout-x");
  });

  it("leaves the Claude Code ladder exactly as it was", async () => {
    const { entries } = await buildSessionIndex(
      sourceOf([["proj/a.jsonl", SIMPLE]]),
      { expectSource: "claude-code" },
    );
    expect(entries[0].titleSource).toBe("derived");
    // And Claude Code never grows a sidecar rung — it keeps its titles inside the transcript.
    expect(entries[0].title).toContain("幫我修一個 bug");
  });
});
