import { describe, expect, it } from "vitest";
import { buildSessionIndex } from "./sessionIndexer";
import { chainMembers, foldChains, locateChainParent, resolveChains } from "./chains";
import type { DirectoryFile, DirectorySource, SessionIndexEntry } from "./contracts";
import { chainChildSession, chainInFileSession, chainParentSession, chainSiblingSession } from "@/fixtures";

function fileOf(path: string, content: string): DirectoryFile {
  const blob = new Blob([content]);
  return {
    path,
    size: blob.size,
    read: async (range) => (range ? blob.slice(range.start, range.end) : blob),
  };
}

function sourceOf(files: DirectoryFile[]): DirectorySource {
  return { kind: "webkitdirectory", name: "projects", list: async () => ({ files, unreadable: [] }) };
}

function entryAt(entries: SessionIndexEntry[], path: string): SessionIndexEntry {
  const entry = entries.find((candidate) => candidate.path === path);
  if (!entry) throw new Error(`no entry for ${path}`);
  return entry;
}

const PARENT = fileOf("p/parent.jsonl", chainParentSession);
const CHILD = fileOf("p/child.jsonl", chainChildSession);
const SIBLING = fileOf("p/sibling.jsonl", chainSiblingSession);
const INFILE = fileOf("p/infile.jsonl", chainInFileSession);

/**
 * The fixture pair mirrors a real Desktop resume (`7d074bf8` → `7fed77ca`, 2026-09-03): the child
 * starts with the parent's own boundary record and re-emits the preserved records, so the target
 * of `logicalParentUuid` exists in BOTH files — only its position tells them apart.
 */
describe("resolveChains (2026-09-compact-chain)", () => {
  it("resolves a continuation to the parent that holds its boundary mid-file", async () => {
    const { entries, diagnostics } = await buildSessionIndex(sourceOf([PARENT, CHILD]));
    expect(entryAt(entries, "p/parent.jsonl").chain).toEqual({ head: null, parentPath: null });
    expect(entryAt(entries, "p/child.jsonl").chain).toEqual({
      head: { boundaryUuid: "B1", logicalParentUuid: "p-hook", boundaryTimestamp: "2026-09-01T10:05:00.000Z" },
      parentPath: "p/parent.jsonl",
    });
    expect(diagnostics.filter((d) => d.code.startsWith("INDEX_CHAIN"))).toEqual([]);
  });

  it("siblings resumed from the same compaction both resolve to the parent, never to each other", async () => {
    const withParent = await buildSessionIndex(sourceOf([SIBLING, CHILD, PARENT]));
    expect(entryAt(withParent.entries, "p/child.jsonl").chain.parentPath).toBe("p/parent.jsonl");
    expect(entryAt(withParent.entries, "p/sibling.jsonl").chain.parentPath).toBe("p/parent.jsonl");

    // Without the parent on disk the siblings hold each other's boundary at their heads. That is
    // not parenthood, and the honest answer is "not found", counted, not "standalone".
    const orphans = await buildSessionIndex(sourceOf([SIBLING, CHILD]));
    expect(entryAt(orphans.entries, "p/child.jsonl").chain.parentPath).toBeNull();
    expect(entryAt(orphans.entries, "p/sibling.jsonl").chain.parentPath).toBeNull();
    expect(orphans.diagnostics).toContainEqual(expect.objectContaining({ tier: "info", code: "INDEX_CHAIN_UNRESOLVED", count: 2 }));
    expect(orphans.diagnostics.find((d) => d.code === "INDEX_CHAIN_SEARCH_CAPPED")).toBeUndefined();
  });

  it("a file that carries the boundary only AFTER the target is not the parent (a grandchild's copy)", async () => {
    // Head boundary B2 (so it is not filtered out as a sibling of B1), then a copied B1 whose
    // target p-hook follows it — the shape a later resume of the child would produce.
    const copy = [
      JSON.stringify({ type: "custom-title", customTitle: "copy", sessionId: "q-session" }),
      JSON.stringify({ parentUuid: null, logicalParentUuid: "q-hook", type: "system", subtype: "compact_boundary", uuid: "B2", timestamp: "2026-09-01T10:04:00.000Z", sessionId: "q-session", compactMetadata: { trigger: "manual" } }),
      JSON.stringify({ parentUuid: "B2", type: "user", isCompactSummary: true, uuid: "q-sum", timestamp: "2026-09-01T10:04:00.000Z", sessionId: "q-session", message: { role: "user", content: "summary" } }),
      JSON.stringify({ parentUuid: null, logicalParentUuid: "p-hook", type: "system", subtype: "compact_boundary", uuid: "B1", timestamp: "2026-09-01T10:05:00.000Z", sessionId: "q-session", compactMetadata: { trigger: "manual" } }),
      JSON.stringify({ parentUuid: "B1", type: "system", subtype: "stop_hook_summary", uuid: "p-hook", timestamp: "2026-09-01T10:05:01.000Z", sessionId: "q-session" }),
      JSON.stringify({ parentUuid: "p-hook", type: "user", uuid: "q-u1", timestamp: "2026-09-01T10:07:00.000Z", sessionId: "q-session", message: { role: "user", content: "後來的問題" } }),
    ].join("\n");
    const { entries, diagnostics } = await buildSessionIndex(sourceOf([CHILD, fileOf("p/copy.jsonl", copy)]));
    expect(entryAt(entries, "p/child.jsonl").chain.parentPath).toBeNull();
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "INDEX_CHAIN_UNRESOLVED", count: 2 }));
  });

  it("an in-file compaction near the head is not a chain head", async () => {
    const { entries, diagnostics } = await buildSessionIndex(sourceOf([INFILE]));
    expect(entryAt(entries, "p/infile.jsonl")).toMatchObject({ hasCompaction: true, chain: { head: null, parentPath: null } });
    expect(diagnostics.filter((d) => d.code.startsWith("INDEX_CHAIN"))).toEqual([]);
  });

  it("running out of budget or candidates is reported as capped, not as unresolved", async () => {
    const { entries } = await buildSessionIndex(sourceOf([PARENT, CHILD]));
    const child = entryAt(entries, "p/child.jsonl");

    child.chain.parentPath = null;
    const byBudget = await resolveChains(entries, [PARENT, CHILD], { budgetBytes: 8 });
    expect(child.chain.parentPath).toBeNull();
    expect(byBudget).toEqual([{ tier: "warn", code: "INDEX_CHAIN_SEARCH_CAPPED", count: 1 }]);

    child.chain.parentPath = null;
    const byCandidates = await resolveChains(entries, [PARENT, CHILD], { maxCandidates: 0 });
    expect(child.chain.parentPath).toBeNull();
    expect(byCandidates).toEqual([{ tier: "warn", code: "INDEX_CHAIN_SEARCH_CAPPED", count: 1 }]);

    // And with a budget that suffices, the same entries resolve again — the cap is about the run, not the file.
    child.chain.parentPath = null;
    expect(await resolveChains(entries, [PARENT, CHILD], { chunkBytes: 64 })).toEqual([]);
    expect(child.chain.parentPath).toBe("p/parent.jsonl");
  });

  it("an unreadable candidate counts as 'not the parent' and does not abort the search", async () => {
    const { entries } = await buildSessionIndex(sourceOf([PARENT, CHILD]));
    const child = entryAt(entries, "p/child.jsonl");
    child.chain.parentPath = null;
    const broken: DirectoryFile = { path: "p/parent.jsonl", size: PARENT.size, read: async () => { throw new Error("gone"); } };
    expect(await resolveChains(entries, [broken, CHILD])).toEqual([
      { tier: "info", code: "INDEX_CHAIN_UNRESOLVED", count: 1, detail: "child.jsonl" },
    ]);
    expect(child.chain.parentPath).toBeNull();
  });
});

describe("locateChainParent", () => {
  const head = { boundaryUuid: "B1", logicalParentUuid: "p-hook", boundaryTimestamp: null };

  it("finds needles that straddle a chunk edge (positive control for the carry)", async () => {
    // A 16-byte chunk is shorter than either needle, so every occurrence straddles at least one edge.
    const parentLike = `${"x".repeat(21)}{"uuid":"p-hook"}\n{"uuid":"B1","logicalParentUuid":"p-hook"}\n`;
    expect(await locateChainParent(fileOf("a", parentLike), head, { budgetBytes: 1 << 20, chunkBytes: 16 })).toMatchObject({ verdict: "parent" });

    const childLike = `${"x".repeat(21)}{"uuid":"B1","logicalParentUuid":"p-hook"}\n{"uuid":"p-hook"}\n`;
    expect(await locateChainParent(fileOf("b", childLike), head, { budgetBytes: 1 << 20, chunkBytes: 16 })).toMatchObject({ verdict: "not-parent" });
  });

  it("does not mistake parentUuid or logicalParentUuid for the record's own uuid", async () => {
    const decoy = `{"parentUuid":"p-hook","logicalParentUuid":"p-hook"}\n{"uuid":"B1"}\n`;
    expect(await locateChainParent(fileOf("c", decoy), head, { budgetBytes: 1 << 20 })).toMatchObject({ verdict: "not-parent" });
  });

  it("a file without the boundary is never the parent, and the whole file is charged to the budget", async () => {
    const none = `{"uuid":"p-hook"}\n{"uuid":"other"}\n`;
    expect(await locateChainParent(fileOf("d", none), head, { budgetBytes: 1 << 20 })).toEqual({ verdict: "not-parent", bytesRead: none.length });
    expect(await locateChainParent(fileOf("e", none), head, { budgetBytes: 4 })).toEqual({ verdict: "budget", bytesRead: 0 });
  });
});

describe("chainMembers / foldChains", () => {
  function stub(path: string, parentPath: string | null, startedAt: string | null = null): SessionIndexEntry {
    return {
      id: path,
      path,
      project: "p",
      projectPath: null,
      title: path,
      titleSource: "filename",
      source: "claude-code",
      startedAt,
      endedAt: startedAt,
      sizeBytes: 1,
      humanPromptCount: 1,
      assistantCount: 1,
      countsExact: true,
      hasCompaction: false,
      subagentPaths: [],
      chain: { head: null, parentPath },
      kind: "dialogue",
      kindReason: "has-human-prompt",
    };
  }

  it("walks root → children in start order, then each child's descendants", async () => {
    const { entries } = await buildSessionIndex(sourceOf([SIBLING, CHILD, PARENT]));
    // child and sibling copied the same preserved records, so they share startedAt; endedAt breaks the tie.
    expect(chainMembers(entries, "p/parent.jsonl")).toEqual(["p/parent.jsonl", "p/child.jsonl", "p/sibling.jsonl"]);
    expect(chainMembers(entries, "p/child.jsonl")).toEqual(["p/child.jsonl"]);

    const deep = [stub("a", null, "1"), stub("b", "a", "2"), stub("c", "b", "3"), stub("d", "a", "4")];
    expect(chainMembers(deep, "a")).toEqual(["a", "b", "c", "d"]);
  });

  it("terminates on a cycle the data should never contain", () => {
    const loop = [stub("a", "b"), stub("b", "a")];
    expect(chainMembers(loop, "a")).toEqual(["a", "b"]);
  });

  it("folds resolved children under a present parent and keeps them when the parent is absent", async () => {
    const { entries } = await buildSessionIndex(sourceOf([SIBLING, CHILD, PARENT]));
    const rows = foldChains(entries);
    expect(rows.map((row) => row.entry.path)).toEqual(["p/parent.jsonl"]);
    expect(rows[0].members).toEqual(["p/child.jsonl", "p/sibling.jsonl"]);

    // The parent filtered out (e.g. by kind): nothing disappears from the picker.
    const filtered = foldChains(entries.filter((entry) => entry.path !== "p/parent.jsonl"));
    expect(filtered.map((row) => row.entry.path).sort()).toEqual(["p/child.jsonl", "p/sibling.jsonl"]);
    expect(filtered.every((row) => row.members.length === 0)).toBe(true);
  });
});
