/**
 * DSM-4 · 資料夾流程的失敗出口 (R9.1 RC-A)。
 *
 * 這組測試釘住一條不變式：**只有使用者的意思可以讓 Session 瀏覽器消失**。
 * 原本的缺陷是「挑選」與「索引」兩個階段共用一個 catch，而取消的判準（AbortError）
 * 對第二階段完全不成立——剛授權的 handle 上 `getFile()` 就會丟 AbortError。索引失敗
 * 因此偽裝成「使用者按了取消」，落到 closed 讓整個瀏覽器無聲消失。
 */
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectorySource } from "@/core/index";

const pickDirectoryMock = vi.fn();

vi.mock("@/core/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/index")>();
  return { ...actual, pickDirectory: () => pickDirectoryMock() };
});

const { useSessionStore } = await import("./sessionStore");
const { DirectoryPickCancelledError } = await import("@/core/index");
const { selectSurfaceWants } = await import("./surfaceSelectors");
const { selectActiveSurface } = await import("@/core/surface/blockingSurface");

/** 一個「拿得到 handle，但列目錄會炸」的來源——正是真實世界那條路徑的形狀。 */
function explodingSource(error: unknown): DirectorySource {
  return { kind: "fsa", name: "projects", list: async () => { throw error; } };
}

beforeEach(() => {
  pickDirectoryMock.mockReset();
});

afterEach(() => {
  useSessionStore.setState({ browseState: "closed", indexEntries: [], indexDiagnostics: [] });
});

describe("browse failures never end in an invisible state", () => {
  it("an indexing failure lands on index_failed, not closed", async () => {
    pickDirectoryMock.mockResolvedValue({ source: explodingSource(new Error("disk went away")), handle: {} });

    await useSessionStore.getState().pickAndIndexDirectory();

    expect(useSessionStore.getState().browseState).toBe("index_failed");
    expect(useSessionStore.getState().indexDiagnostics[0]).toMatchObject({
      tier: "fatal",
      code: "INDEX_DIRECTORY_UNREADABLE",
    });
  });

  /**
   * 這一條是本輪缺陷的直接對照：同樣是 AbortError，發生在索引階段就**不是**取消。
   * 沒有這條測試，把兩個階段合回同一個 catch 也不會有人發現。
   */
  it("an AbortError raised during indexing is a failure, not a cancellation", async () => {
    const aborted = new DOMException("The operation was aborted.", "AbortError");
    pickDirectoryMock.mockResolvedValue({ source: explodingSource(aborted), handle: {} });

    await useSessionStore.getState().pickAndIndexDirectory();

    expect(useSessionStore.getState().browseState).toBe("index_failed");
  });

  it("cancelling the picker itself, with nothing indexed yet, closes the browser", async () => {
    pickDirectoryMock.mockRejectedValue(new DirectoryPickCancelledError());

    await useSessionStore.getState().pickAndIndexDirectory();

    expect(useSessionStore.getState().browseState).toBe("closed");
  });

  it("cancelling the picker keeps an existing list instead of discarding it", async () => {
    pickDirectoryMock.mockRejectedValue(new DirectoryPickCancelledError());
    useSessionStore.setState({ indexEntries: [{ path: "a.jsonl" }] as never });

    await useSessionStore.getState().pickAndIndexDirectory();

    expect(useSessionStore.getState().browseState).toBe("indexed");
  });
});

describe("closed is the only browseState that hides the browser", () => {
  const STATES = ["closed", "picking", "indexing", "indexed", "index_failed", "loading"] as const;

  it.each(STATES)("%s", (browseState) => {
    useSessionStore.setState({
      browseState,
      error: null,
      diagnostics: [],
      parseNoticeAcknowledged: true,
      privacyReview: null,
      welcomeOpen: false,
      settingsOpen: false,
      mapOpen: false,
      structureDrawerOpen: false,
    });
    const active = selectActiveSurface(selectSurfaceWants(useSessionStore.getState()));
    expect(active).toBe(browseState === "closed" ? null : "session-browser");
  });
});
