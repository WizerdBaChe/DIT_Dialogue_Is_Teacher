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
const isDirectoryPickerSupportedMock = vi.fn();
const directorySourceFromFileListMock = vi.fn();

vi.mock("@/core/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/index")>();
  return {
    ...actual,
    pickDirectory: () => pickDirectoryMock(),
    isDirectoryPickerSupported: () => isDirectoryPickerSupportedMock(),
    directorySourceFromFileList: (files: unknown, name: string) =>
      directorySourceFromFileListMock(files, name) ?? actual.directorySourceFromFileList(files as never, name),
  };
});

const { useSessionStore, BROWSE_STATES } = await import("./sessionStore");
const { DirectoryPickCancelledError } = await import("@/core/index");
const { selectSurfaceWants } = await import("./surfaceSelectors");
const { selectActiveSurface } = await import("@/core/surface/blockingSurface");

/** 一個「拿得到 handle，但列目錄會炸」的來源——正是真實世界那條路徑的形狀。 */
function explodingSource(error: unknown): DirectorySource {
  return { kind: "fsa", name: "projects", list: async () => { throw error; } };
}

beforeEach(() => {
  pickDirectoryMock.mockReset();
  isDirectoryPickerSupportedMock.mockReset();
  directorySourceFromFileListMock.mockReset();
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
  /*
   * 全集讀自 store 導出的 `BROWSE_STATES`，不再手抄。手抄的那份在 2026-09 新增 `fallback`
   * 時就會安靜地漏掉它——一個少列一項的窮舉閘，仍然會印出「全部通過」。
   */
  it.each(BROWSE_STATES)("%s", (browseState) => {
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

/**
 * R11 M3 · the WebKit (non-FSA) fallback needs the same failure exit the FSA path has.
 */
describe("WebKit fallback failure exit (R11 M3)", () => {
  it("indexFileList lands on index_failed instead of leaving the UI pinned on indexing", async () => {
    directorySourceFromFileListMock.mockReturnValue(explodingSource(new Error("could not read fallback file list")));

    await useSessionStore.getState().indexFileList([] as never, "projects");

    expect(useSessionStore.getState().browseState).toBe("index_failed");
    expect(useSessionStore.getState().indexDiagnostics[0]).toMatchObject({
      tier: "fatal",
      code: "INDEX_DIRECTORY_UNREADABLE",
    });
  });

  /**
   * The finding from investigating the stated assumption: `resumeLastDirectory()` used to set
   * `browseState: "closed"` when FSA is unsupported, on the comment's claim that "the UI then
   * opens an <input>". But `selectSurfaceWants()` only opens the session-browser surface when
   * `browseState !== "closed"` — so that <input> (which lives inside `SessionBrowserDialog`)
   * never mounted. There was no entry point at all. This test pins the fix: the dialog must
   * actually open so the fallback "Choose folder" button (and the <input> behind it) is reachable.
   */
  it("resumeLastDirectory opens the browser (not closed) when the directory picker is unsupported", async () => {
    isDirectoryPickerSupportedMock.mockReturnValue(false);

    await useSessionStore.getState().resumeLastDirectory();

    const state = useSessionStore.getState();
    expect(state.browseState).not.toBe("closed");
    expect(selectActiveSurface(selectSurfaceWants(state))).toBe("session-browser");
    // pickDirectory() throws when unsupported (RC-A) — the fallback path must never call it.
    expect(pickDirectoryMock).not.toHaveBeenCalled();
  });

  /**
   * 2026-09 UX 走查 F7。上一條只釘住「對話框有開」，那在 `picking` 底下也成立——而 `picking`
   * 的文案說「等待你選擇資料夾…」，那條路徑上卻沒有任何選擇器被打開，也就沒有東西在等。
   * 狀態必須把「系統在等」與「使用者要動」分開，文案才可能兩種都說實話。
   */
  it("lands on fallback, not picking, when no directory picker exists (F7)", async () => {
    isDirectoryPickerSupportedMock.mockReturnValue(false);

    await useSessionStore.getState().resumeLastDirectory();

    expect(useSessionStore.getState().browseState).toBe("fallback");
    // 已知為真的正對照：走查回報的就是這個值，它一旦回來，這條就掉。
    expect(useSessionStore.getState().browseState).not.toBe("picking");
  });

  it("still reaches picking when a real picker is opened, so the waiting copy stays true (F7 negative control)", async () => {
    isDirectoryPickerSupportedMock.mockReturnValue(true);
    let releasePicker!: () => void;
    pickDirectoryMock.mockReturnValue(new Promise((_resolve, reject) => {
      releasePicker = () => reject(new DirectoryPickCancelledError());
    }));

    const pending = useSessionStore.getState().pickAndIndexDirectory();
    // 選擇器真的開著、真的在等使用者的那一刻。
    expect(useSessionStore.getState().browseState).toBe("picking");
    releasePicker();
    await pending;
  });
});

/**
 * R11.2 C6 · reproduces the author's reported sequence: open the browser, start indexing a
 * folder, close the dialog while indexing is still in flight, then let indexing finish in the
 * background. Before the fix, `runIndex`'s post-`await` `set()` calls had no idea the user had
 * closed the dialog in the meantime, so they overwrote `browseState: "closed"` with
 * `"indexing"`/`"indexed"` once the scan resolved — the dialog reopened itself, and because
 * indexing had genuinely finished by then, it reappeared already on `"indexed"` rather than
 * showing the indexing animation, matching "沒有索引中的狀態（可能是其實已經跑完但動畫還沒）".
 */
describe("closing the dialog keeps it closed, even if indexing finishes afterwards (R11.2 C6)", () => {
  it("does not reopen once a background index run resolves after close", async () => {
    let resolveList!: (files: never[]) => void;
    const listPromise = new Promise<never[]>((resolve) => { resolveList = resolve; });
    directorySourceFromFileListMock.mockReturnValue({
      kind: "webkitdirectory",
      name: "projects",
      list: () => listPromise,
    } satisfies DirectorySource);

    const indexing = useSessionStore.getState().indexFileList([] as never, "projects");

    // Indexing is genuinely in flight: `runIndex` has already set "indexing" and is now
    // awaiting `source.list()`, which we're holding open.
    expect(useSessionStore.getState().browseState).toBe("indexing");

    // The reported action: the user closes the dialog mid-indexing.
    useSessionStore.getState().closeBrowser();
    expect(useSessionStore.getState().browseState).toBe("closed");

    // The background scan (which the user can't cancel) now completes.
    resolveList([]);
    await indexing;

    expect(useSessionStore.getState().browseState).toBe("closed");
  });
});
