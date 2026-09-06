/**
 * Chain resolution for compacted continuation files (round 2026-09-compact-chain, T-008).
 *
 * WHAT A CHAIN IS — measured 2026-09-06 on six real parent→child pairs (PSM §1). When Claude
 * Desktop resumes a compacted session it writes a NEW transcript whose head is the parent's own
 * `compact_boundary` record (same uuid), then the compact summary, the preserved tail records
 * and the parent's whole post-boundary segment, all with their original uuids; only after that
 * come the child's own turns. The parent keeps its boundary mid-file. Therefore:
 *
 *   chain key = the head boundary's `uuid` — shared by parent, child and every sibling;
 *   parent    = the file in which the boundary's `logicalParentUuid` target sits BEFORE the
 *               boundary. In a child or sibling that record sits AFTER it (a preserved copy).
 *
 * `logicalParentUuid` alone cannot name the parent: the record it points at exists in both files.
 *
 * WHY FULL READS — the parent's boundary sits mid-file (L385/530, L3461/3789 measured), outside
 * the 128 KB head/tail windows the indexer reads. Reads happen only for files that have a chain
 * head (10 of 424 on the measured machine), only over time-filtered candidates, and stop at the
 * first boundary occurrence because the verdict is known by then either way.
 *
 * WHAT IT NEVER CLAIMS — "no parent found" is reported as unresolved (info), never as
 * "standalone by nature": the parent may have been cleaned up, or the read budget may have run
 * out (warn). A gate rules only on what it can determine; both outcomes are named diagnostics,
 * not `reportFallback` calls, because they are visible in the return value.
 */
import type { Diagnostic } from "@/core/diagnostics/contracts";
import type { ChainHead, DirectoryFile, SessionIndexEntry } from "./contracts";

/** Candidate files read per continuation file before the search is declared capped. */
export const CHAIN_MAX_CANDIDATES = 8;
/** Bytes read across the whole browse before the search is declared capped. */
export const CHAIN_READ_BUDGET_BYTES = 256 * 1024 * 1024;
/** Ranged-read size. Overridable in tests so a straddling needle can be exercised on a tiny blob. */
export const CHAIN_CHUNK_BYTES = 4 * 1024 * 1024;

/**
 * How Claude Code writes the key: compact JSON with `uuid` as its own key. `"parentUuid":"…"` and
 * `"logicalParentUuid":"…"` cannot match because the quote directly before `uuid` is required.
 */
const needleFor = (uuid: string): string => `"uuid":"${uuid}"`;

export interface LocateOptions {
  budgetBytes: number;
  chunkBytes?: number;
}

export type LocateVerdict =
  | { verdict: "parent" | "not-parent"; bytesRead: number }
  | { verdict: "budget"; bytesRead: number };

/**
 * Reads `file` in ranged chunks until it can rule whether it is the parent for `head`.
 * Parent ⇔ the `logicalParentUuid` record occurs before the boundary record. The loop stops at
 * the first boundary occurrence (verdict known either way) or at EOF (no boundary → not parent).
 * Needles are ASCII, so a chunk cut inside a multi-byte character cannot corrupt them; a needle
 * cut by the chunk edge is caught by carrying the last `needle.length - 1` characters forward.
 */
export async function locateChainParent(file: DirectoryFile, head: ChainHead, options: LocateOptions): Promise<LocateVerdict> {
  const chunkBytes = options.chunkBytes ?? CHAIN_CHUNK_BYTES;
  const target = needleFor(head.logicalParentUuid);
  const boundary = needleFor(head.boundaryUuid);
  const overlap = Math.max(target.length, boundary.length) - 1;
  let carry = "";
  let targetChunk = -1;
  let targetOffset = -1;
  let bytesRead = 0;
  for (let chunk = 0, start = 0; start < file.size; chunk += 1, start += chunkBytes) {
    const end = Math.min(file.size, start + chunkBytes);
    if (bytesRead + (end - start) > options.budgetBytes) return { verdict: "budget", bytesRead };
    const text = carry + (await (await file.read({ start, end })).text());
    bytesRead += end - start;
    if (targetChunk < 0) {
      const at = text.indexOf(target);
      if (at >= 0) {
        targetChunk = chunk;
        targetOffset = at;
      }
    }
    const boundaryAt = text.indexOf(boundary);
    if (boundaryAt >= 0) {
      // Offsets inside one buffer compare directly (the carry is a prefix of the same buffer).
      const targetFirst = targetChunk >= 0 && (targetChunk < chunk || targetOffset < boundaryAt);
      return { verdict: targetFirst ? "parent" : "not-parent", bytesRead };
    }
    carry = text.slice(-overlap);
  }
  return { verdict: "not-parent", bytesRead };
}

export interface ResolveChainsOptions {
  maxCandidates?: number;
  budgetBytes?: number;
  chunkBytes?: number;
}

/** ISO-8601 with a fixed layout, as Claude Code writes it — the indexer compares them as strings too. */
function coversTimestamp(entry: SessionIndexEntry, timestamp: string | null): boolean {
  if (!timestamp) return true; // nothing to filter on; the structural test still decides.
  if (entry.startedAt && entry.startedAt > timestamp) return false;
  if (entry.endedAt && entry.endedAt < timestamp) return false;
  return true;
}

/** Most recent start first; a null start is tried last because it carries no evidence either way. */
function byStartDescending(left: SessionIndexEntry, right: SessionIndexEntry): number {
  if (left.startedAt === right.startedAt) return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
  if (!left.startedAt) return 1;
  if (!right.startedAt) return -1;
  return left.startedAt > right.startedAt ? -1 : 1;
}

/**
 * Fills `entry.chain.parentPath` in place for every entry with a chain head, and returns the
 * diagnostics the search produced. Mutation is deliberate: the entries are freshly built by
 * `buildSessionIndex` and nobody else holds them yet.
 */
export async function resolveChains(
  entries: SessionIndexEntry[],
  files: readonly DirectoryFile[],
  options: ResolveChainsOptions = {},
): Promise<Diagnostic[]> {
  const maxCandidates = options.maxCandidates ?? CHAIN_MAX_CANDIDATES;
  let budget = options.budgetBytes ?? CHAIN_READ_BUDGET_BYTES;
  const byPath = new Map(files.map((file) => [file.path, file]));
  const unresolved: string[] = [];
  let capped = 0;

  for (const entry of entries) {
    const head = entry.chain.head;
    if (!head) continue;
    const candidates = entries
      .filter((candidate) =>
        candidate !== entry
        && candidate.project === entry.project
        && candidate.kind !== "subagent"
        // A sibling resumed from the same compaction carries the same boundary at ITS head.
        && candidate.chain.head?.boundaryUuid !== head.boundaryUuid
        && coversTimestamp(candidate, head.boundaryTimestamp))
      .sort(byStartDescending);

    let found: string | null = null;
    let hitCap = candidates.length > maxCandidates;
    for (const candidate of candidates.slice(0, maxCandidates)) {
      const file = byPath.get(candidate.path);
      if (!file) continue;
      let result: LocateVerdict;
      try {
        result = await locateChainParent(file, head, { budgetBytes: budget, chunkBytes: options.chunkBytes });
      } catch {
        // An unreadable candidate cannot be shown to be the parent. The scan phase already
        // reported unreadable files by name; repeating it here would double-count.
        continue;
      }
      budget -= result.bytesRead;
      if (result.verdict === "budget") {
        hitCap = true;
        break;
      }
      if (result.verdict === "parent") {
        found = candidate.path;
        break;
      }
    }

    entry.chain.parentPath = found;
    if (found) continue;
    if (hitCap) capped += 1;
    else unresolved.push(entry.path);
  }

  const diagnostics: Diagnostic[] = [];
  if (unresolved.length > 0) {
    diagnostics.push({
      tier: "info",
      code: "INDEX_CHAIN_UNRESOLVED",
      count: unresolved.length,
      detail: unresolved.slice(0, 3).map(baseName).join("、"),
    });
  }
  if (capped > 0) diagnostics.push({ tier: "warn", code: "INDEX_CHAIN_SEARCH_CAPPED", count: capped });
  return diagnostics;
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Earliest start first, then earliest end, then path — deterministic for siblings that copied the same preserved records. */
function byStartAscending(left: SessionIndexEntry, right: SessionIndexEntry): number {
  const l = `${left.startedAt ?? "~"}|${left.endedAt ?? "~"}|${left.path}`;
  const r = `${right.startedAt ?? "~"}|${right.endedAt ?? "~"}|${right.path}`;
  return l < r ? -1 : l > r ? 1 : 0;
}

/**
 * The paths that make up the chain rooted at `rootPath`, in load order: the root, then each
 * child (earliest first) followed by its own descendants. A cycle cannot arise from real data
 * (a parent must hold the child's boundary before the child's head), but the visited set makes
 * the walk terminate regardless of what the entries say.
 */
export function chainMembers(entries: readonly SessionIndexEntry[], rootPath: string): string[] {
  const childrenOf = new Map<string, SessionIndexEntry[]>();
  for (const entry of entries) {
    if (!entry.chain.parentPath) continue;
    const siblings = childrenOf.get(entry.chain.parentPath);
    if (siblings) siblings.push(entry);
    else childrenOf.set(entry.chain.parentPath, [entry]);
  }
  const order: string[] = [];
  const visited = new Set<string>();
  const walk = (path: string): void => {
    if (visited.has(path)) return;
    visited.add(path);
    order.push(path);
    const children = childrenOf.get(path);
    if (!children) return;
    for (const child of [...children].sort(byStartAscending)) walk(child.path);
  };
  walk(rootPath);
  return order;
}

export interface FoldedEntry {
  entry: SessionIndexEntry;
  /** The other chain members in load order (the root itself excluded); empty for a plain session. */
  members: string[];
}

/**
 * One row per logical session. A resolved child folds under its parent when the parent is in
 * the same list; a child whose parent is absent (filtered out, or never resolved) keeps its own
 * row so nothing silently disappears from the picker.
 */
export function foldChains(entries: readonly SessionIndexEntry[]): FoldedEntry[] {
  const present = new Set(entries.map((entry) => entry.path));
  const rows: FoldedEntry[] = [];
  for (const entry of entries) {
    if (entry.chain.parentPath && present.has(entry.chain.parentPath)) continue;
    rows.push({ entry, members: chainMembers(entries, entry.path).slice(1) });
  }
  return rows;
}
