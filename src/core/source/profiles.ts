/**
 * Source profiles (R10-B).
 *
 * `detectAdapter()` has always identified the harness correctly and `normalize()` records the
 * verdict on `doc.session.source` — but `denoise()` and `distill()` never read it. They matched
 * hardcoded Claude Code tool names (`Edit`/`Write`/…, `Read`/`Grep`/…) against every source, so a
 * Codex session produced zero edit-loop groups and zero investigation ribs no matter what was in
 * it. This table is the missing lookup: resolved once from the source id, read by the rule layer.
 *
 * The Codex names are measured, not assumed — 356 local rollouts, 2026-08-14
 * (docs/rounds/r10-source-awareness/SCAN_R10_LOCAL_ROLLOUT_RESULTS.md):
 *   shell_command 6,037 · apply_patch 1,680 · mcp__* 465 · web__run 342 · update_plan 213 · view_image 19
 *
 * `ambiguousTools` is the honest part. Claude Code splits reading from writing across different
 * tools, so a name classifies it. Codex funnels both through `shell_command`, which is the single
 * most common call in the corpus — `cat`/`rg` and `sed -i` are the same tool. Classifying it
 * either way would be a guess that the skeleton then presents as fact, so it is named as
 * unclassifiable instead. Deciding it from the command string is deliberately NOT done here.
 *
 * Deliberately NOT in this table: injected-preamble tags. The R10 research note proposed splitting
 * `INJECTION_TAGS` into Claude-only (`system-reminder`, `command-*`) and Codex-only
 * (`environment_context`, `INSTRUCTIONS`) sets. Measured against the same corpus, that premise is
 * false — Codex messages contain every one of the eight tags, including 145 `recommended_plugins`
 * and 57 `system-reminder`. Splitting them would stop stripping preambles that are demonstrably
 * there, so the whitelist stays global and `core/text/preamble.ts` is unchanged.
 */
import type { SourceId } from "@/types/spanTree";

/** Whether a source records the outcome (success/failure) of a tool call at all. */
export type ToolOutcomeFidelity =
  /** Every tool result carries an explicit outcome. */
  | "recorded"
  /** Some call kinds carry an outcome and others do not; see `outcomeBlindTools`. */
  | "partial"
  /** The source records no outcome anywhere. */
  | "absent";

export interface SourceProfile {
  id: SourceId;
  /** Tools that mutate a file. Drives the edit-loop grouping in `denoise()`. */
  editTools: ReadonlySet<string>;
  /** Tools that read or search without mutating. Drives investigation ribs in `distill()`. */
  investigationTools: ReadonlySet<string>;
  /** Tools that do both jobs, so the name alone cannot classify them. Never silently bucketed. */
  ambiguousTools: ReadonlySet<string>;
  /** Tool-parameter keys whose VALUE is a file path, in priority order. */
  filePathKeys: readonly string[];
  /**
   * Tool-parameter keys whose value is a map KEYED by file path. Codex's `apply_patch` reports
   * edits as `changes: { "/p/auth.ts": {...} }` — the path is the key, so `filePathKeys` cannot
   * reach it. This is the shape difference that made the edit-loop parity test fail even after
   * `apply_patch` was in the edit-tool set.
   */
  filePathMapKeys: readonly string[];
  outcomeFidelity: ToolOutcomeFidelity;
}

const CLAUDE_CODE: SourceProfile = {
  id: "claude-code",
  editTools: new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]),
  investigationTools: new Set(["Read", "Grep", "Glob", "WebFetch", "WebSearch", "NotebookRead"]),
  ambiguousTools: new Set(["Bash"]),
  filePathKeys: ["file_path", "filePath", "notebook_path"],
  filePathMapKeys: [],
  outcomeFidelity: "recorded",
};

const CODEX: SourceProfile = {
  id: "codex",
  editTools: new Set(["apply_patch"]),
  investigationTools: new Set(["web__run", "view_image", "tool_search_call"]),
  // 6,037 of them, and the corpus cannot tell `cat` from `sed -i` by name.
  ambiguousTools: new Set(["shell_command", "exec_command", "exec"]),
  filePathKeys: ["path", "filePath", "file_path"],
  filePathMapKeys: ["changes"],
  // patch_apply_end.success and mcp_tool_call_end.result.Err carry an outcome; plain exec does not.
  outcomeFidelity: "partial",
};

/**
 * Pasted text has no harness identity, so nothing may be narrowed: it keeps the union of every
 * source's tools and tags. Narrowing here would silently stop stripping a preamble that the old
 * global whitelist did strip.
 */
const PASTE: SourceProfile = {
  id: "paste",
  editTools: new Set([...CLAUDE_CODE.editTools, ...CODEX.editTools]),
  investigationTools: new Set([...CLAUDE_CODE.investigationTools, ...CODEX.investigationTools]),
  ambiguousTools: new Set([...CLAUDE_CODE.ambiguousTools, ...CODEX.ambiguousTools]),
  filePathKeys: ["file_path", "filePath", "path", "notebook_path"],
  filePathMapKeys: ["changes"],
  outcomeFidelity: "partial",
};

const PROFILES: Record<SourceId, SourceProfile> = {
  "claude-code": CLAUDE_CODE,
  codex: CODEX,
  paste: PASTE,
};

export function profileFor(source: SourceId): SourceProfile {
  return PROFILES[source] ?? PASTE;
}
