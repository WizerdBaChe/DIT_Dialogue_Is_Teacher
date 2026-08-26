// @vitest-environment jsdom
/**
 * DW-19 — `directorySource.ts` had no tests, and it guards an invariant this repo has already
 * been burned by.
 *
 * **R9.1 RC-A**: only the picker call inside `pickDirectory()` may produce a cancellation. Any
 * failure AFTER a handle is in hand — listing, reading, indexing — is a failure, even when the
 * browser throws `AbortError`, which it does for `getFile()` on a freshly granted handle. The
 * two were once conflated, and the result was the author's report of "the first attempt fails
 * silently, the second works": an indexing failure wearing the user's own cancellation as a
 * disguise, so the browser closed itself with nothing to show.
 *
 * `browseFailure.test.ts` covers the store's side of that same invariant, but it does so by
 * MOCKING `pickDirectory` and `directorySourceFromFileList` — so the module was being imported
 * (a coverage tool would call it loaded) with precisely its own logic stubbed out. This file is
 * the missing half: the real functions, no mocks below the browser API itself.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  directorySourceFromFileList,
  directorySourceFromHandle,
  DirectoryPermissionError,
  DirectoryPickCancelledError,
  isDirectoryPickerSupported,
  pickDirectory,
  restoreDirectorySource,
} from "./directorySource";

/** The handle shape the module consumes. Loosely typed here so a fake may misbehave on purpose. */
type FakeHandle = {
  kind: "directory" | "file";
  name: string;
  values?: () => AsyncIterableIterator<FakeHandle>;
  getFile?: () => Promise<File>;
  queryPermission?: (descriptor: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
};

const fileAt = (name: string, content = "x"): FakeHandle => ({
  kind: "file",
  name,
  getFile: async () => new File([content], name),
});

const dirAt = (name: string, children: FakeHandle[]): FakeHandle => ({
  kind: "directory",
  name,
  values: async function* () {
    yield* children;
  },
});

/** `pickDirectory` reads `window.showDirectoryPicker`; jsdom has none, so absence is the default. */
function stubPicker(impl: () => Promise<FakeHandle>): void {
  vi.stubGlobal("showDirectoryPicker", vi.fn(impl));
}

const asHandle = (handle: FakeHandle): Parameters<typeof directorySourceFromHandle>[0] =>
  handle as unknown as Parameters<typeof directorySourceFromHandle>[0];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isDirectoryPickerSupported", () => {
  it("is false where the API is absent, and true where it is a function", () => {
    // Two-sided: a probe that only ever answered `false` would route every browser to the
    // webkitdirectory fallback and nothing would look broken.
    expect(isDirectoryPickerSupported()).toBe(false);
    stubPicker(async () => dirAt("projects", []));
    expect(isDirectoryPickerSupported()).toBe(true);
  });

  it("is false when the property exists but is not callable", () => {
    vi.stubGlobal("showDirectoryPicker", "yes");
    expect(isDirectoryPickerSupported()).toBe(false);
  });
});

describe("pickDirectory · the ONLY place a cancellation may be born (R9.1 RC-A)", () => {
  it("returns both the source and the raw handle, so the caller can remember the position", async () => {
    const handle = dirAt("projects", [fileAt("a.jsonl")]);
    stubPicker(async () => handle);

    const picked = await pickDirectory();

    expect(picked.source.kind).toBe("fsa");
    expect(picked.source.name).toBe("projects");
    // The handle is what gets persisted per source (R12 M2); a source alone cannot be stored.
    expect(picked.handle).toBe(handle);
  });

  it("turns the picker's own AbortError into a cancellation", async () => {
    stubPicker(async () => { throw new DOMException("The user aborted a request.", "AbortError"); });
    await expect(pickDirectory()).rejects.toBeInstanceOf(DirectoryPickCancelledError);
  });

  it("does NOT turn a post-pick AbortError into a cancellation", async () => {
    /*
     * The defect itself. `getFile()` on a just-granted handle throws `AbortError`, so a shared
     * catch read an indexing failure as "the user changed their mind" — and the caller's correct
     * response to a cancellation is to close quietly, which is how a hard failure became silence.
     */
    const aborted = new DOMException("The operation was aborted.", "AbortError");
    stubPicker(async () => ({ kind: "directory", name: "projects", values: () => { throw aborted; } } as FakeHandle));

    const { source } = await pickDirectory();

    await expect(source.list()).rejects.toBe(aborted);
    await expect(source.list()).rejects.not.toBeInstanceOf(DirectoryPickCancelledError);
  });

  it("passes a non-Abort picker failure through unchanged", async () => {
    // A `NotAllowedError` (blocked by permissions policy, or called outside a user gesture) is
    // not a cancellation either. Widening the catch to "anything the picker throws" would put
    // it back on the silent path.
    const denied = new DOMException("Permission denied.", "NotAllowedError");
    stubPicker(async () => { throw denied; });
    await expect(pickDirectory()).rejects.toBe(denied);
  });

  it("fails with a plain error when the API is missing entirely", async () => {
    await expect(pickDirectory()).rejects.toThrow(/File System Access API/);
    // Never a cancellation: nobody cancelled anything, the browser cannot do this at all.
    await expect(pickDirectory()).rejects.not.toBeInstanceOf(DirectoryPickCancelledError);
  });
});

describe("restoreDirectorySource · permission is re-checked, never assumed", () => {
  it("does not ask again when permission is already granted", async () => {
    const request = vi.fn(async () => "granted" as PermissionState);
    const handle: FakeHandle = {
      ...dirAt("projects", [fileAt("a.jsonl")]),
      queryPermission: async () => "granted",
      requestPermission: request,
    };

    const source = await restoreDirectorySource(asHandle(handle));

    expect(source.name).toBe("projects");
    // Asking again would burn the user gesture and show a prompt for access already held.
    expect(request).not.toHaveBeenCalled();
  });

  it("asks once when permission is merely prompt-able, and succeeds if granted", async () => {
    const request = vi.fn(async () => "granted" as PermissionState);
    const handle: FakeHandle = {
      ...dirAt("projects", []),
      queryPermission: async () => "prompt",
      requestPermission: request,
    };

    await expect(restoreDirectorySource(asHandle(handle))).resolves.toMatchObject({ kind: "fsa" });
    expect(request).toHaveBeenCalledOnce();
  });

  it("reports a NAMED permission error when the request is denied", async () => {
    const handle: FakeHandle = {
      ...dirAt("projects", []),
      queryPermission: async () => "prompt",
      requestPermission: async () => "denied",
    };

    // Named, because the caller's correct response is specific: drop this source's remembered
    // folder and ask for it again. A generic failure would leave a dead handle in storage.
    await expect(restoreDirectorySource(asHandle(handle))).rejects.toBeInstanceOf(DirectoryPermissionError);
  });

  it("treats a handle with no permission API as not granted", async () => {
    // Pins the conservative direction rather than asserting it is ideal: a handle that cannot
    // be asked is one we cannot claim to have access to, and the caller's recovery (re-pick) is
    // available and cheap. Every real FileSystemDirectoryHandle implements both methods.
    await expect(restoreDirectorySource(asHandle(dirAt("projects", [])))).rejects.toBeInstanceOf(DirectoryPermissionError);
  });
});

describe("walking a directory", () => {
  it("joins nested paths with forward slashes, relative to the picked root", async () => {
    const source = directorySourceFromHandle(asHandle(dirAt("projects", [
      fileAt("top.jsonl"),
      dirAt("proj-a", [fileAt("main.jsonl"), dirAt("subagents", [fileAt("agent-1.jsonl")])]),
      dirAt("empty", []),
    ])));

    const files = await source.list();

    expect(files.map((file) => file.path).sort()).toEqual([
      "proj-a/main.jsonl",
      "proj-a/subagents/agent-1.jsonl",
      "top.jsonl",
    ]);
    // The root's own name is NOT part of the path — it is the anchor, not a segment.
    expect(files.every((file) => !file.path.startsWith("projects/"))).toBe(true);
  });

  it("yields nothing for an empty directory instead of failing", async () => {
    await expect(directorySourceFromHandle(asHandle(dirAt("projects", []))).list()).resolves.toEqual([]);
  });

  it("carries size, and reads whole or by range", async () => {
    const source = directorySourceFromHandle(asHandle(dirAt("projects", [fileAt("a.jsonl", "abcdefgh")])));

    const [file] = await source.list();

    expect(file.size).toBe(8);
    // Ranged reads are what makes the index cheap: the head scan never loads a whole transcript.
    await expect((await file.read()).text()).resolves.toBe("abcdefgh");
    await expect((await file.read({ start: 2, end: 5 })).text()).resolves.toBe("cde");
  });
});

describe("directorySourceFromFileList · the webkitdirectory fallback", () => {
  const withRelativePath = (file: File, relative: string): File => {
    Object.defineProperty(file, "webkitRelativePath", { value: relative, configurable: true });
    return file;
  };

  it("strips the picked folder from webkitRelativePath so both backends agree", async () => {
    /*
     * This is the load-bearing property of the whole file: the two backends must produce the
     * SAME path for the same tree, because everything downstream (subagent pairing, the
     * `subagents/` classification rule, per-source filename patterns) reads `path` and has no
     * idea which backend produced it. `webkitRelativePath` includes the chosen directory's own
     * name; the FSA walk does not. Left unstripped, every path would gain a phantom segment.
     */
    const source = directorySourceFromFileList([
      withRelativePath(new File(["x"], "main.jsonl"), "projects/proj-a/main.jsonl"),
      withRelativePath(new File(["y"], "agent-1.jsonl"), "projects/proj-a/subagents/agent-1.jsonl"),
    ], "projects");

    const files = await source.list();

    expect(source.kind).toBe("webkitdirectory");
    expect(files.map((file) => file.path)).toEqual([
      "proj-a/main.jsonl",
      "proj-a/subagents/agent-1.jsonl",
    ]);
  });

  it("produces the same paths the FSA walk produces for the same tree", async () => {
    const viaHandle = await directorySourceFromHandle(asHandle(dirAt("projects", [
      dirAt("proj-a", [fileAt("main.jsonl"), dirAt("subagents", [fileAt("agent-1.jsonl")])]),
    ]))).list();

    const viaFileList = await directorySourceFromFileList([
      withRelativePath(new File(["x"], "main.jsonl"), "projects/proj-a/main.jsonl"),
      withRelativePath(new File(["y"], "agent-1.jsonl"), "projects/proj-a/subagents/agent-1.jsonl"),
    ], "projects").list();

    expect(viaFileList.map((f) => f.path).sort()).toEqual(viaHandle.map((f) => f.path).sort());
  });

  it("falls back to the bare filename when there is no relative path", async () => {
    // The multi-select `<input>` (not webkitdirectory) leaves `webkitRelativePath` empty. The
    // pipeline already knows this: it is why subagent detection moved from path to CONTENT.
    const files = await directorySourceFromFileList([new File(["x"], "agent-1.jsonl")], "selection").list();
    expect(files.map((file) => file.path)).toEqual(["agent-1.jsonl"]);
  });

  it("reads by range like the FSA backend does", async () => {
    const [file] = await directorySourceFromFileList([new File(["abcdefgh"], "a.jsonl")], "selection").list();
    expect(file.size).toBe(8);
    await expect((await file.read({ start: 1, end: 4 })).text()).resolves.toBe("bcd");
  });
});
