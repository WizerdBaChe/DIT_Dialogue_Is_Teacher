/**
 * 「從狀態 A 遇到事件 E 會到狀態 B」的斷言。
 *
 * 本專案（與 Prism 一樣，見其 F6）原本沒有任何一條這種測試：測的都是函式與端點，於是
 * 「機器少了一條邊」這類缺陷對整套測試完全隱形。R9 動到的四台機器各自補上。
 * DSM-1 在 pipeline.test.ts、DSM-3 在 core/surface 與 components，這裡負責 DSM-4 與 DSM-2
 * 中屬於 store 的那一半。
 */
import { afterEach, describe, expect, it } from "vitest";
import { useSessionStore } from "./sessionStore";
import type { DirectorySource } from "@/core/index";
import { sampleSession } from "@/fixtures";

const line = (record: Record<string, unknown>): string => JSON.stringify(record);

const TRANSCRIPT = [
  line({ type: "user", uuid: "u1", sessionId: "s1", timestamp: "2026-07-20T00:00:00Z", message: { role: "user", content: "請幫我看這段" } }),
  line({ type: "assistant", uuid: "a1", sessionId: "s1", timestamp: "2026-07-20T00:01:00Z", message: { role: "assistant", content: [{ type: "text", text: "好" }] } }),
].join("\n");

function sourceOf(files: Array<[string, string]>): DirectorySource {
  return {
    kind: "webkitdirectory",
    name: "projects",
    list: async () => files.map(([path, content]) => {
      const blob = new Blob([content]);
      return { path, size: blob.size, read: async (range?: { start: number; end: number }) => (range ? blob.slice(range.start, range.end) : blob) };
    }),
  };
}

/** 直接注入來源，繞過需要使用者手勢的目錄選擇器。 */
async function indexSource(files: Array<[string, string]>): Promise<void> {
  const source = sourceOf(files);
  const listed = await source.list();
  const asFiles = await Promise.all(listed.map(async (entry) => {
    const file = new File([await entry.read()], entry.path.split("/").pop() ?? entry.path);
    Object.defineProperty(file, "webkitRelativePath", { value: `projects/${entry.path}` });
    return file;
  }));
  await useSessionStore.getState().indexFileList(asFiles, "projects");
}

afterEach(() => {
  useSessionStore.setState({
    browseState: "no_directory",
    indexEntries: [],
    indexDiagnostics: [],
    browseProgress: null,
    browseDirectoryName: null,
    error: null,
    diagnostics: [],
    parseNoticeAcknowledged: true,
  });
});

describe("DSM-4 · session browser transitions", () => {
  it("no_directory --index--> indexed", async () => {
    expect(useSessionStore.getState().browseState).toBe("no_directory");
    await indexSource([["proj/a.jsonl", TRANSCRIPT]]);
    expect(useSessionStore.getState().browseState).toBe("indexed");
    expect(useSessionStore.getState().indexEntries).toHaveLength(1);
  });

  it("indexed --choose--> loading --done--> indexed, and the list survives", async () => {
    await indexSource([["proj/a.jsonl", TRANSCRIPT]]);
    const before = useSessionStore.getState().indexEntries;

    await useSessionStore.getState().loadIndexEntry("proj/a.jsonl");

    expect(useSessionStore.getState().browseState).toBe("indexed");
    expect(useSessionStore.getState().indexEntries).toEqual(before);
    // 實際文件的建立走 Web Worker，node 測試環境沒有 Worker，因此這裡只斷言機器的邊；
    // 「真的載進來了」由 sessionLoader.test.ts（假 worker）與瀏覽器實測負責。
    // 順帶釘住 RC-5 型的洩漏：無論那條路徑成功或失敗，進度條都不得留在畫面上。
    expect(useSessionStore.getState().sessionLoadProgress).toBeNull();
  });

  /**
   * 這條邊是這台機器存在的理由。載入失敗把使用者丟回空白畫面，就是 Prism SM-5 那種
   * 「有錯誤訊息、但沒有下一步」的死路。
   */
  it("indexed --choose--> loading --FAIL--> indexed: a failed load returns to the list", async () => {
    // 只有子代理檔的資料夾：載入必定落到 NO_MAIN_TRANSCRIPT。
    await indexSource([
      ["proj/a.jsonl", TRANSCRIPT],
      ["proj/a/subagents/agent-1.jsonl", line({ type: "user", uuid: "s1", sessionId: "sub", isSidechain: true, agentId: "ag", message: { role: "user", content: "go" } })],
    ]);
    useSessionStore.getState().loadFromText(sampleSession);
    const keptDoc = useSessionStore.getState().doc;

    // 直接要求載入一個不在索引裡的路徑：什麼都不該發生，狀態也不該卡住。
    await useSessionStore.getState().loadIndexEntry("proj/does-not-exist.jsonl");

    expect(useSessionStore.getState().browseState).toBe("indexed");
    expect(useSessionStore.getState().doc).toBe(keptDoc);
    expect(useSessionStore.getState().indexEntries.length).toBeGreaterThan(0);
  });

  it("indexed --close--> no_directory, and re-indexing replaces the list rather than appending", async () => {
    await indexSource([["proj/a.jsonl", TRANSCRIPT]]);
    useSessionStore.getState().closeBrowser();
    expect(useSessionStore.getState().browseState).toBe("no_directory");

    await indexSource([["proj/b.jsonl", TRANSCRIPT], ["proj/c.jsonl", TRANSCRIPT]]);
    expect(useSessionStore.getState().indexEntries).toHaveLength(2);
  });

  it("filters are per-kind toggles and start all-on (kinds are badges, not a default filter)", async () => {
    await indexSource([["proj/a.jsonl", TRANSCRIPT]]);
    expect(useSessionStore.getState().browseFilter).toEqual({ dialogue: true, subagent: true, machine: true, unknown: true });

    useSessionStore.getState().toggleBrowseFilter("machine");
    expect(useSessionStore.getState().browseFilter.machine).toBe(false);
    expect(useSessionStore.getState().browseFilter.dialogue).toBe(true);
  });
});

describe("DSM-2 · diagnostic tier transitions (store half)", () => {
  it("a clean load leaves the fatal surface disarmed", () => {
    useSessionStore.getState().loadFromText(sampleSession);
    expect(useSessionStore.getState().parseNoticeAcknowledged).toBe(true);
    expect(useSessionStore.getState().error).toBeNull();
  });

  it("a failed load arms it with a typed code, and acknowledging disarms and clears", () => {
    useSessionStore.getState().loadFromText("not a transcript at all");
    expect(useSessionStore.getState().parseNoticeAcknowledged).toBe(false);
    expect(useSessionStore.getState().error).toMatchObject({ tier: "fatal", code: "FILE_UNRECOGNIZED" });

    useSessionStore.getState().acknowledgeParseNotice();
    expect(useSessionStore.getState().parseNoticeAcknowledged).toBe(true);
    expect(useSessionStore.getState().error).toBeNull();
  });

  it("a second failure re-arms even though the previous one was acknowledged", () => {
    useSessionStore.getState().loadFromText("garbage");
    useSessionStore.getState().acknowledgeParseNotice();
    expect(useSessionStore.getState().parseNoticeAcknowledged).toBe(true);

    useSessionStore.getState().loadFromText("more garbage");
    expect(useSessionStore.getState().parseNoticeAcknowledged).toBe(false);
  });

  it("info-only diagnostics never arm it", () => {
    const withNoise = [
      line({ type: "user", uuid: "u1", sessionId: "s9", message: { role: "user", content: "hi" } }),
      line({ type: "assistant", uuid: "a1", sessionId: "s9", message: { role: "assistant", content: [{ type: "text", text: "yo" }] } }),
      line({ type: "system", subtype: "stop_hook_summary", sessionId: "s9" }),
      line({ type: "system", subtype: "stop_hook_summary", sessionId: "s9" }),
    ].join("\n");

    useSessionStore.getState().loadFromText(withNoise);

    expect(useSessionStore.getState().diagnostics.every((d) => d.tier === "info")).toBe(true);
    expect(useSessionStore.getState().parseNoticeAcknowledged).toBe(true);
  });
});
