import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearDirectoryHandle, readDirectoryHandles, saveDirectoryHandle } from "./handleRepository";
import { getAppMetaDb, HANDLE_STORE_NAME } from "@/core/onboarding/repository";
import { SUPPORTED_SOURCES } from "@/core/source/profiles";

/**
 * R12 M2 — folders are remembered PER agent system.
 *
 * This is the card's headline acceptance and the reason the author asked for it: without it,
 * the level-1 choice only *records* which system you picked, it does not help you get there.
 * Claude Code lives in ~/.claude/projects and Codex in ~/.codex, so one shared slot means
 * picking either one sends you to wherever the other one was.
 *
 * Handles are opaque here on purpose — a real `FileSystemDirectoryHandle` is a browser object,
 * and what this layer owes is correct KEYING, not handle semantics. Strings stand in for them.
 */
describe("handleRepository · per-source directory memory (R12 M2)", () => {
  beforeEach(async () => {
    // Clear the store, do NOT deleteDB: `getAppMetaDb` caches its connection at module level,
    // so a delete blocks on that open handle and every test after the first times out.
    const db = await getAppMetaDb();
    await db.clear(HANDLE_STORE_NAME);
  });

  it("keeps each system's folder separate, so neither overwrites the other", async () => {
    expect(await saveDirectoryHandle("claude-code", "handle:/home/me/.claude/projects")).toBeNull();
    expect(await saveDirectoryHandle("codex", "handle:/home/me/.codex")).toBeNull();

    const { handles } = await readDirectoryHandles(SUPPORTED_SOURCES);
    expect(handles["claude-code"]).toBe("handle:/home/me/.claude/projects");
    expect(handles.codex).toBe("handle:/home/me/.codex");
  });

  it("returns to the FIRST folder when a system is revisited after using the other one", async () => {
    // The acceptance walk, in order: Claude A, then Codex B, then back to Claude.
    await saveDirectoryHandle("claude-code", "folder-A");
    await saveDirectoryHandle("codex", "folder-B");

    const { handles } = await readDirectoryHandles(SUPPORTED_SOURCES);
    expect(handles["claude-code"]).toBe("folder-A");
  });

  it("leaves the other system's memory untouched when one is picked for the first time", async () => {
    await saveDirectoryHandle("claude-code", "folder-A");
    const before = await readDirectoryHandles(SUPPORTED_SOURCES);
    expect(before.handles.codex).toBeUndefined();

    await saveDirectoryHandle("codex", "folder-B");
    const after = await readDirectoryHandles(SUPPORTED_SOURCES);
    expect(after.handles["claude-code"]).toBe("folder-A");
  });

  it("clears only the source it was asked to clear", async () => {
    await saveDirectoryHandle("claude-code", "folder-A");
    await saveDirectoryHandle("codex", "folder-B");

    expect(await clearDirectoryHandle("codex")).toBeNull();

    const { handles } = await readDirectoryHandles(SUPPORTED_SOURCES);
    expect(handles["claude-code"]).toBe("folder-A");
    expect(handles.codex).toBeUndefined();
  });

  it("distinguishes `never picked` from `stored and empty`", async () => {
    const { handles, notices } = await readDirectoryHandles(SUPPORTED_SOURCES);
    expect(handles).toEqual({});
    expect(notices).toEqual([]);
  });

  it("discards the pre-R12 single folder and SAYS so rather than silently forgetting it", async () => {
    /*
     * The legacy record does not say which system it belonged to, and after R11 WC-1.2 both
     * harnesses could appear in one folder, so there is nothing to infer from. Guessing sends
     * the user to the other harness's directory; staying silent looks like the app lost their
     * setting. Naming it is the only honest option — this is a named degradation, not a
     * fallback, so it travels as a Diagnostic and not through reportFallback.
     */
    const db = await getAppMetaDb();
    await db.put(HANDLE_STORE_NAME, "handle:legacy", "lastSessionDirectory");

    const { handles, notices } = await readDirectoryHandles(SUPPORTED_SOURCES);
    expect(handles).toEqual({});
    expect(notices).toEqual([{ tier: "warn", code: "INDEX_HANDLE_SOURCE_SPLIT" }]);

    // Reported once, not on every read — the key is gone afterwards.
    expect((await readDirectoryHandles(SUPPORTED_SOURCES)).notices).toEqual([]);
  });

  it("does not mistake a per-source key for the legacy one", async () => {
    await saveDirectoryHandle("claude-code", "folder-A");
    const { notices } = await readDirectoryHandles(SUPPORTED_SOURCES);
    expect(notices).toEqual([]);
  });
});
