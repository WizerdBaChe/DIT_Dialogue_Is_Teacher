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
import type { SourceId, TitleSource } from "@/types/spanTree";

/**
 * ─── The discovery half (R12 M1) ────────────────────────────────────────────────────────────
 *
 * The render half above was R10-B's answer to "denoise/distill match Claude tool names against
 * every source". It worked, and then the identical defect regrew one layer up: DISCOVERY — where
 * a source's sessions live, how its titles are derived, which classification signals mean anything
 * for it — was still written as if every harness were Claude Code. `pickTitle`'s top two rungs
 * (`custom`, `ai`) are Claude-only records, so every Codex session fell through to `derived` and
 * showed an excerpt of its first message instead of a purpose.
 *
 * That is the SECOND occurrence, and the reason is not that anyone forgot. Nothing in the repo
 * made "source differences go through the profile" checkable — it lived in the memory of the round
 * that introduced it, and rounds do not remember. So the discovery half is held the same way the
 * render half is: as an exhaustive `Record<SourceId, …>`. Add a third `SourceId` and `tsc` fails
 * until its discovery row exists. **That compile failure is the mechanism.** A registry that cannot
 * fail that way has not made the rule structural, it has only written it down again.
 *
 * INV-R12-1: an `if (source === …)` outside this file is a defect, not a style choice.
 *
 * M1 DECLARES that invariant; it does not yet hold. Measured with the third-source probe on
 * 2026-08-26 — adding a `SourceId` fails `tsc` in exactly two places, both in this file, and the
 * rest of `src/` compiles clean. That is NOT the invariant holding. It means the three real source
 * branches outside this file fail SILENTLY for a new source, which is the worse half of the two:
 *
 *   - `core/index/classifySession.ts:126` / `:143` — per-source classification rules. A third
 *     source falls past both `if`s. → M6, which moves the signal list here (`classify.signals`).
 *   - `core/index/sessionIndexer.ts:363` — `subagentPaths` is computed only for `claude-code`,
 *     so a new source silently gets none. This is discovery, not indexing: "which files belong
 *     to this session" is a property of the harness's layout. → M7.
 *
 * Until those land, the honest statement is: the profile is where source knowledge SHOULD live,
 * two of three sites are already there, and the compiler covers this file only.
 */

/** A classification signal a source can actually supply. Named, so "absent" is visible. */
export type ClassificationSignal =
  /** A record carries an agent id field (Claude Code `agentId`). */
  | "agent-id-field"
  /** Every record is flagged as a side chain (Claude Code `isSidechain`). */
  | "all-sidechain"
  /** Human turns can be counted meaningfully. */
  | "human-turn-count"
  /** The file sits under a `subagents/` directory. */
  | "subagent-path";

/** Session metadata that lives OUTSIDE the transcript and has to be joined back by id. */
export interface SidecarSpec {
  /** Path relative to the picked root. */
  path: string;
  /** Property chain from the file's root down to the map of records, keyed by session id. */
  recordsAt: readonly string[];
  /** Property chain inside a transcript record that yields the key into `recordsAt`. */
  joinKey: readonly string[];
}

export interface SourceDiscovery {
  /**
   * The directory the user is asked to pick, written the way they would type it. This is data,
   * not copy — it is the same string in every locale.
   */
  rootHint: string;
  transcripts: {
    /**
     * The path prefix transcripts sit under, relative to the picked root; `""` when they can be
     * anywhere beneath it. How tolerant discovery is of a user who picked one level too deep is
     * M3's decision, not this table's — this records where they canonically live.
     */
    subdir: string;
    filePattern: RegExp;
  };
  /** Empty means the source keeps everything inside the transcript. */
  sidecars: readonly SidecarSpec[];
  /** Rungs in order, best first. Every rung below the first is a named degradation. */
  titleLadder: readonly TitleSource[];
  classify: {
    /**
     * Signals this source can actually supply. An empty list is a real answer, not a gap —
     * it is what `codex-unclassified` exists to say out loud.
     */
    signals: readonly ClassificationSignal[];
  };
}

const CLAUDE_CODE_DISCOVERY: SourceDiscovery = {
  rootHint: "~/.claude/projects",
  // `<project-dir>/<session-id>.jsonl`, and subagents in `<session-id>/subagents/`.
  transcripts: { subdir: "", filePattern: /\.jsonl$/i },
  // Titles are records inside the transcript, so there is nothing to join.
  sidecars: [],
  titleLadder: ["custom", "ai", "derived", "filename"],
  classify: { signals: ["agent-id-field", "all-sidechain", "human-turn-count", "subagent-path"] },
};

const CODEX_DISCOVERY: SourceDiscovery = {
  /*
   * `~/.codex`, NOT `~/.codex/sessions`, and this is a browser constraint rather than a
   * preference: the File System Access API cannot read the parent of a picked directory, and the
   * sidecar sits one level above the transcripts. Picking `sessions/` makes the purpose data
   * unreachable — which is exactly what the app did until R12.
   */
  rootHint: "~/.codex",
  transcripts: { subdir: "sessions", filePattern: /^rollout-.*\.jsonl$/i },
  sidecars: [
    {
      path: ".codex-global-state.json",
      /*
       * Measured 2026-08-26 on the local corpus: 61 descriptions, 61/61 resolving to a file on
       * disk = 17% of 358 sessions. The author accepted that coverage — a session with no stated
       * purpose is that session's own gap, not DIT's.
       *
       * NOT yet verified: whether `electron-persisted-atom-state` holds an object or a
       * JSON-encoded string needing a second parse. M5 must check before trusting this chain;
       * the join key is what was measured, the encoding is not.
       */
      recordsAt: ["electron-persisted-atom-state", "thread-descriptions-v1"],
      joinKey: ["session_meta", "payload", "id"],
    },
  ],
  /*
   * No `custom`/`ai` rungs: measured over 542 `session_meta` records, Codex rollouts carry no
   * title field at all, and `thread_goal_updated.goal.objective` appears 10 times corpus-wide.
   * No `sidecar` rung either — the sidecar above is declared so M5 has a contract to implement,
   * but nothing reads it yet, and a rung no path can produce is the `paste`/`milestone` mistake.
   * M5 adds the rung and the code that fills it in one card.
   */
  titleLadder: ["derived", "filename"],
  /*
   * Empty, and measured. `agentId`/`isSidechain` are Claude Code field names that cannot appear
   * here. `human-turn-count` is listed nowhere because R11.2 R1 measured it as near-informationless
   * for this source: 356/358 rollouts classify as `dialogue`, yet 108 of those files contain no
   * human-typed text anywhere. A counter that says "dialogue" for a file with no human in it is
   * not a signal. This is what `codex-unclassified` reports instead of guessing.
   */
  classify: { signals: [] },
};

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
  /** Where this source's sessions live and how they are named. See `SourceDiscovery`. */
  discovery: SourceDiscovery;
}

/**
 * The discovery half as its own exhaustive record. `PROFILES` below would already reject a new
 * `SourceId`, but this table makes the failure land ON the discovery row with its own message,
 * so the compiler names the thing that is missing instead of pointing at the whole profile.
 */
const DISCOVERY: Record<SourceId, SourceDiscovery> = {
  "claude-code": CLAUDE_CODE_DISCOVERY,
  codex: CODEX_DISCOVERY,
};

const CLAUDE_CODE: SourceProfile = {
  id: "claude-code",
  editTools: new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]),
  investigationTools: new Set(["Read", "Grep", "Glob", "WebFetch", "WebSearch", "NotebookRead"]),
  ambiguousTools: new Set(["Bash"]),
  filePathKeys: ["file_path", "filePath", "notebook_path"],
  filePathMapKeys: [],
  outcomeFidelity: "recorded",
  discovery: DISCOVERY["claude-code"],
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
  discovery: DISCOVERY.codex,
};

// R11 M4 WC-4.4(3) / D-008: the "paste" profile is removed along with the SourceId member it
// existed only to serve — no adapter or UI path ever produced a "paste" SourceId (see
// src/types/spanTree.ts). `PROFILES` is now total over the narrowed `SourceId` union, so
// `profileFor` needs no runtime fallback: every caller passes a value the type system already
// guarantees is a key.

const PROFILES: Record<SourceId, SourceProfile> = {
  "claude-code": CLAUDE_CODE,
  codex: CODEX,
};

export function profileFor(source: SourceId): SourceProfile {
  return PROFILES[source];
}

/**
 * Every supported source, **in the order the UI offers them** (R12 M2).
 *
 * Derived from `PROFILES` rather than written out again: a second hardcoded list is a second
 * thing to forget, and the whole point of the registry is that adding a source is one edit.
 * The cast is safe by construction — `PROFILES` is `Record<SourceId, …>`, so it is total.
 *
 * The order carries the author's 2026-08-26 ruling: Claude Code is adapted to the maximum and
 * Codex is incidental, so Claude Code is offered first. That is a product decision, not a
 * coincidence of object literal order, which is why a test pins it.
 */
export const SUPPORTED_SOURCES = Object.keys(PROFILES) as readonly SourceId[];
