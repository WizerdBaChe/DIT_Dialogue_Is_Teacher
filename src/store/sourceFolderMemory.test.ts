/**
 * DW-21 — R12 M2's per-source folder memory, end to end across the store.
 *
 * Both ends were already tested and neither end is where this can break. `handleRepository.test.ts`
 * proves the repository keys by source; `SessionLoadActions.test.tsx` proves the two-level entry
 * renders. What sat between them — `sessionStore`'s module-level `cachedDirectoryHandles`, its
 * pre-fetch at module load, and the switch on `activeSource` — had no test at all, so the wiring
 * could be cut and BOTH existing suites would stay green while the feature did nothing.
 *
 * The walk below is the card's own stated acceptance, in the author's words: pick a folder for
 * one system, pick a different one for the other, come back to the first — and land where you
 * were, not where the other system was.
 *
 * The repository is mocked here on purpose, and the split is the point: this file owns the STORE's
 * orchestration (which source's slot is read, which is written, which is dropped), while
 * `handleRepository.test.ts` owns the keying. Everything below that boundary is real —
 * `restoreDirectorySource` and its permission re-check, `directorySourceFromHandle`, the walk,
 * and `buildSessionIndex`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceId } from "@/types/spanTree";

const pickDirectoryMock = vi.fn();
const isDirectoryPickerSupportedMock = vi.fn(() => true);
const readDirectoryHandlesMock = vi.fn();
const saveDirectoryHandleMock = vi.fn(async (_source: SourceId, _handle: unknown) => null);
const clearDirectoryHandleMock = vi.fn(async (_source: SourceId) => null);

vi.mock("@/core/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/index")>();
  return {
    ...actual,
    pickDirectory: () => pickDirectoryMock(),
    isDirectoryPickerSupported: () => isDirectoryPickerSupportedMock(),
    readDirectoryHandles: (sources: readonly SourceId[]) => readDirectoryHandlesMock(sources),
    saveDirectoryHandle: (source: SourceId, handle: unknown) => saveDirectoryHandleMock(source, handle),
    clearDirectoryHandle: (source: SourceId) => clearDirectoryHandleMock(source),
  };
});

const { directorySourceFromHandle } = await import("@/core/index");

type FakeHandle = {
  kind: "directory";
  name: string;
  values: () => AsyncIterableIterator<never>;
  queryPermission: () => Promise<PermissionState>;
  requestPermission: () => Promise<PermissionState>;
};

/** An empty but fully valid directory: the index reports INDEX_EMPTY and still reaches "indexed". */
function folder(name: string, permission: PermissionState = "granted"): FakeHandle {
  return {
    kind: "directory",
    name,
    values: async function* () { /* no files — the folder's identity is what is under test */ },
    queryPermission: async () => permission,
    requestPermission: async () => permission,
  };
}

const asPicked = (handle: FakeHandle): { source: unknown; handle: FakeHandle } => ({
  source: directorySourceFromHandle(handle as never),
  handle,
});

type Store = Awaited<typeof import("./sessionStore")>["useSessionStore"];

/**
 * A store whose module-load handle read has already settled, so no test races it by accident.
 * `vi.resetModules()` is what makes `cachedDirectoryHandles` — module state with no reset hook —
 * genuinely fresh per test rather than carried over in whatever order the file happens to run.
 */
async function freshStore(stored: Partial<Record<SourceId, unknown>> = {}, notices: unknown[] = []): Promise<Store> {
  vi.resetModules();
  const settled = Promise.resolve({ handles: stored, notices });
  readDirectoryHandlesMock.mockReturnValue(settled);
  const { useSessionStore } = await import("./sessionStore");
  await settled;
  return useSessionStore;
}

beforeEach(() => {
  pickDirectoryMock.mockReset();
  isDirectoryPickerSupportedMock.mockReset().mockReturnValue(true);
  readDirectoryHandlesMock.mockReset();
  saveDirectoryHandleMock.mockClear();
  clearDirectoryHandleMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("R12 M2 · a folder is remembered per agent system (DW-21)", () => {
  it("returns to the FIRST system's folder after the second system has been used", async () => {
    const store = await freshStore();
    const claude = folder("claude-projects");
    const codex = folder("codex-sessions");

    // 1 — pick Claude Code's folder.
    store.getState().chooseSource("claude-code");
    pickDirectoryMock.mockResolvedValue(asPicked(claude));
    await store.getState().pickAndIndexDirectory();
    expect(store.getState().browseDirectoryName).toBe("claude-projects");
    expect(saveDirectoryHandleMock).toHaveBeenCalledWith("claude-code", claude);

    // 2 — go back to level 1 and pick Codex's, which is a different folder.
    store.getState().clearSource();
    store.getState().chooseSource("codex");
    pickDirectoryMock.mockResolvedValue(asPicked(codex));
    await store.getState().pickAndIndexDirectory();
    expect(store.getState().browseDirectoryName).toBe("codex-sessions");

    // 3 — back to Claude Code. THE assertion: its own folder, not the one just used.
    store.getState().clearSource();
    store.getState().chooseSource("claude-code");
    pickDirectoryMock.mockRejectedValue(new Error("the picker must not open — the folder is remembered"));
    await store.getState().resumeLastDirectory();

    expect(store.getState().browseDirectoryName).toBe("claude-projects");
    expect(store.getState().browseState).toBe("indexed");

    // 4 — and Codex still remembers its own, so step 3 did not simply win the race.
    store.getState().clearSource();
    store.getState().chooseSource("codex");
    await store.getState().resumeLastDirectory();
    expect(store.getState().browseDirectoryName).toBe("codex-sessions");
  });

  it("opens the picker for a system never picked, instead of borrowing the other one's folder", async () => {
    const store = await freshStore();
    store.getState().chooseSource("claude-code");
    pickDirectoryMock.mockResolvedValue(asPicked(folder("claude-projects")));
    await store.getState().pickAndIndexDirectory();

    // Codex has no remembered position. Reaching for Claude Code's would be the wrong-target
    // display this card exists to prevent — the honest degradation is to ask.
    store.getState().chooseSource("codex");
    pickDirectoryMock.mockResolvedValue(asPicked(folder("codex-chosen-now")));
    await store.getState().resumeLastDirectory();

    expect(pickDirectoryMock).toHaveBeenCalledTimes(2);
    expect(store.getState().browseDirectoryName).toBe("codex-chosen-now");
  });

  it("restores what was on disk at start-up, without anyone picking anything", async () => {
    // The pre-fetch exists so the click path's first `await` is the picker itself and never
    // IndexedDB — a gesture spent on a database round-trip is a gesture the browser rejects.
    const store = await freshStore({ codex: folder("codex-from-last-session") });

    store.getState().chooseSource("codex");
    await store.getState().resumeLastDirectory();

    expect(store.getState().browseDirectoryName).toBe("codex-from-last-session");
    expect(pickDirectoryMock).not.toHaveBeenCalled();
  });

  it("keeps the remembered folders when the user goes back to level 1", async () => {
    // `clearSource()` drops the ENTRIES (they belong to the system that was scanned) but must
    // not drop the POSITIONS. Clearing both would make the level-1 choice a way to forget.
    const store = await freshStore({ "claude-code": folder("claude-projects") });
    store.getState().chooseSource("claude-code");
    await store.getState().resumeLastDirectory();

    store.getState().clearSource();
    expect(store.getState().indexEntries).toEqual([]);

    store.getState().chooseSource("claude-code");
    await store.getState().resumeLastDirectory();
    expect(store.getState().browseDirectoryName).toBe("claude-projects");
    expect(pickDirectoryMock).not.toHaveBeenCalled();
  });
});

describe("R12 M2 · losing permission drops one system's memory, not both", () => {
  it("forgets only the source whose permission was revoked", async () => {
    const store = await freshStore({
      "claude-code": folder("claude-projects", "denied"),
      codex: folder("codex-sessions"),
    });

    store.getState().chooseSource("claude-code");
    await store.getState().resumeLastDirectory();

    expect(store.getState().browseState).toBe("index_failed");
    expect(store.getState().indexDiagnostics).toContainEqual(
      expect.objectContaining({ tier: "fatal", code: "INDEX_PERMISSION_LOST" }),
    );
    expect(clearDirectoryHandleMock).toHaveBeenCalledWith("claude-code");
    expect(clearDirectoryHandleMock).not.toHaveBeenCalledWith("codex");

    // The other system is untouched and still resumes to its own folder.
    store.getState().chooseSource("codex");
    await store.getState().resumeLastDirectory();
    expect(store.getState().browseDirectoryName).toBe("codex-sessions");
    expect(pickDirectoryMock).not.toHaveBeenCalled();
  });

  it("asks again the next time, having forgotten the revoked folder", async () => {
    const store = await freshStore({ "claude-code": folder("claude-projects", "denied") });
    store.getState().chooseSource("claude-code");
    await store.getState().resumeLastDirectory();

    pickDirectoryMock.mockResolvedValue(asPicked(folder("claude-picked-again")));
    await store.getState().resumeLastDirectory();

    // In-memory too, not only in IndexedDB: a dropped-on-disk-but-kept-in-memory handle would
    // keep failing for the rest of the session with no way out but a reload.
    expect(pickDirectoryMock).toHaveBeenCalledOnce();
    expect(store.getState().browseDirectoryName).toBe("claude-picked-again");
  });
});

describe("R12 M2 · the start-up read must not overwrite a choice made while it was in flight", () => {
  it("keeps a folder picked before the stored handles arrive", async () => {
    /*
     * Found by writing this file. The pre-fetch resolved with `cachedDirectoryHandles = handles`
     * — a whole-object REPLACE. A user who picked a folder before that promise settled had their
     * fresh pick overwritten by the older stored value, so "resume" for the rest of the session
     * reopened the previous folder or fell back to the picker. Self-healing on the next reload
     * (the pick did reach IndexedDB), which is exactly why nobody would report it as a bug.
     *
     * The window is small but it is the FIRST interaction of a cold start, and the first open of
     * IndexedDB carries the schema upgrade. This test forces the ordering rather than hoping for
     * it: the read is held open until after the pick.
     */
    vi.resetModules();
    let release!: (value: { handles: Partial<Record<SourceId, unknown>>; notices: unknown[] }) => void;
    readDirectoryHandlesMock.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const { useSessionStore: store } = await import("./sessionStore");

    // The user is faster than IndexedDB.
    store.getState().chooseSource("claude-code");
    pickDirectoryMock.mockResolvedValue(asPicked(folder("just-picked")));
    await store.getState().pickAndIndexDirectory();

    // Only now does the start-up read come back, carrying last session's stale position.
    release({ handles: { "claude-code": folder("stale-from-last-session") }, notices: [] });
    await Promise.resolve();

    pickDirectoryMock.mockRejectedValue(new Error("the picker must not open"));
    await store.getState().resumeLastDirectory();

    expect(store.getState().browseDirectoryName).toBe("just-picked");
  });

  it("still adopts a stored folder for a source picked in neither order", async () => {
    // The other side of the same fix: the stored value must still win where nothing overrides it,
    // or "do not clobber the pick" would have quietly become "ignore storage".
    vi.resetModules();
    let release!: (value: { handles: Partial<Record<SourceId, unknown>>; notices: unknown[] }) => void;
    readDirectoryHandlesMock.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const { useSessionStore: store } = await import("./sessionStore");

    store.getState().chooseSource("claude-code");
    pickDirectoryMock.mockResolvedValue(asPicked(folder("just-picked")));
    await store.getState().pickAndIndexDirectory();

    release({ handles: { codex: folder("codex-from-storage") }, notices: [] });
    await Promise.resolve();

    store.getState().chooseSource("codex");
    await store.getState().resumeLastDirectory();

    expect(store.getState().browseDirectoryName).toBe("codex-from-storage");
  });

  it("surfaces a start-up notice once, on the next index, and not again", async () => {
    // R12 M2 routes the legacy-key notice through `pendingHandleNotices` because module load has
    // no UI to show it on. That hand-off is store wiring and had no test: a notice that never
    // surfaces looks identical to no notice at all.
    const store = await freshStore(
      { "claude-code": folder("claude-projects") },
      [{ tier: "warn", code: "INDEX_HANDLE_SOURCE_SPLIT" }],
    );

    store.getState().chooseSource("claude-code");
    await store.getState().resumeLastDirectory();
    expect(store.getState().indexDiagnostics).toContainEqual(
      expect.objectContaining({ code: "INDEX_HANDLE_SOURCE_SPLIT" }),
    );

    await store.getState().resumeLastDirectory();
    expect(store.getState().indexDiagnostics).not.toContainEqual(
      expect.objectContaining({ code: "INDEX_HANDLE_SOURCE_SPLIT" }),
    );
  });
});
