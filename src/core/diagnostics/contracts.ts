/**
 * Diagnostic — the single typed channel for everything the pipeline wants to tell the user.
 *
 * Replaces the flat `warnings: string[]` that R9 RC-3 found: a corrupted file and a
 * perfectly normal record type shared one forced modal, because a string array carries no
 * severity. A Diagnostic never carries a rendered sentence — `code` selects the copy, and
 * `detail`/`count` are interpolation values. UI copy lives in exactly one table
 * (`src/i18n/diagnosticCopy.ts`); an unmapped code degrades to generic copy plus the code,
 * never to a raw exception message.
 *
 * Tier contract (R9 D5):
 *  - info  — a known condition handled by policy. Never interrupts. Counted, not narrated.
 *  - warn  — a real degradation the session survives. Dismissible banner.
 *  - fatal — nothing renderable. Blocking surface, must name cause and next action.
 */

export type DiagnosticTier = "info" | "warn" | "fatal";

/**
 * Stable short codes. Grouped by the layer that raises them; the prefix is part of the code
 * so a grep for `FILE_` finds every file-level outcome.
 */
export type DiagnosticCode =
  // --- adapter (line level) ---
  | "LINE_PARSE_FAILED"
  | "UNKNOWN_RECORD_TYPE"
  | "UNKNOWN_SYSTEM_SUBTYPE"
  | "NOISE_SKIPPED"
  | "MARKERS_EMITTED"
  | "NO_EVENTS"
  // --- adapter (codex specific) ---
  | "CODEX_EXEC_TOOL_NAME_UNRESOLVED"
  | "CODEX_EVENT_UNPAIRED"
  | "CODEX_COORDINATION_SKIPPED"
  | "CODEX_AUTO_REVIEW_CONDENSED"
  // --- pipeline (document level) ---
  | "LARGE_INPUT"
  | "SELF_CHECK_ISSUE"
  // --- batch (file set level) ---
  | "FILE_UNRECOGNIZED"
  | "FILE_PARSE_FAILED"
  | "NO_MAIN_TRANSCRIPT"
  | "MULTIPLE_SESSIONS"
  /**
   * 2026-09-compact-chain: a continuation file re-emits the boundary, the compact summary, the
   * preserved records and the parent's whole post-boundary segment with their original uuids.
   * Those copies are dropped when the chain is loaded as one document; `count` says how many.
   * Info: it explains why the child contributes fewer records than it holds, nothing to act on.
   */
  | "CHAIN_DUPLICATES_DROPPED"
  | "NO_RENDERABLE_CONTENT"
  | "EMPTY_INPUT"
  | "LOAD_FAILED"
  // --- worker boundary (R11.2 F-01/F-02) ---
  /**
   * The Worker could not be constructed or died before it said anything, AND the
   * synchronous fallback did not save the load. Distinct from LOAD_FAILED, which
   * means the worker was alive and something inside the run went wrong: this one
   * says the machine never started, which points at the environment (CSP, file://,
   * a browser without module workers, a 404 on the worker chunk), not at the data.
   */
  | "WORKER_BOOT_FAILED"
  /**
   * The Worker never started, so the file was parsed on the main thread instead.
   * A NAMED degradation, not a silent fallback: it is in the return value and it
   * renders, so it reports through Diagnostic and never through reportFallback.
   */
  | "WORKER_FALLBACK_SYNC"
  // --- session index (R9 M3) ---
  | "INDEX_TRUNCATED"
  | "INDEX_FILE_UNREADABLE"
  | "INDEX_PERMISSION_LOST"
  | "INDEX_EMPTY"
  // --- session index (R9.1) ---
  | "INDEX_DIRECTORY_UNREADABLE"
  | "INDEX_TITLE_FROM_FILENAME"
  | "INDEX_HANDLE_NOT_PERSISTED"
  // --- session index (R12 M2) ---
  /**
   * The single remembered folder from before folders were remembered per agent system was
   * discarded, because nothing recorded which system it belonged to and guessing wrong sends
   * the user to the other harness's directory. Named rather than silent: "the app forgot my
   * folder" with no explanation is exactly the shape INDEX_HANDLE_NOT_PERSISTED exists to avoid.
   */
  | "INDEX_HANDLE_SOURCE_SPLIT"
  /**
   * The user picked an agent system at level 1 and the files in the folder say otherwise. The
   * chosen source is authoritative for WHERE to look; this reports the disagreement by name
   * instead of silently reinterpreting the pick (INV-R12-3).
   */
  | "INDEX_SOURCE_MISMATCH"
  // --- session index (R12 M3) ---
  /**
   * The source declares a sidecar and the picked directory does not contain it — the usual
   * cause is picking one level too deep (`~/.codex/sessions` rather than `~/.codex`), which is
   * an established habit and therefore accepted rather than rejected. It is not equivalent
   * though: a browser cannot read the parent of a picked directory, so from there the sidecar
   * is simply unreachable. `detail` carries the root that would reach it.
   */
  | "INDEX_SIDECAR_OUT_OF_REACH"
  /**
   * `.jsonl` files whose NAME does not match this source's record convention. Measured on the
   * real corpus: `~/.codex` holds 361 `.jsonl` files of which 358 are rollouts — the other three
   * are Codex's own `session_index.jsonl`, `transcription-history.jsonl` and a plugin fixture.
   *
   * The copy states only what the name determines. A name tells us the file is not one of THIS
   * source's records; it cannot tell us whether it is the other harness's transcript or not a
   * conversation at all, so it must claim neither. Info tier: it explains a count rather than
   * asking for an action — contrast INDEX_SOURCE_MISMATCH, which means "you may have picked the
   * wrong system" and is warn because the user can act on it.
   */
  | "INDEX_NOT_TRANSCRIPT"
  /**
   * Nothing was indexed AND the folder does hold `.jsonl` files that this source's filename
   * convention rejected — which almost always means the wrong agent system was chosen for this
   * folder. It exists because `INDEX_SOURCE_MISMATCH` is structurally unreachable in that case:
   * Codex's `rollout-*` pattern excludes every Claude Code file by name, so none of them ever
   * reaches content detection. Without this the user sees an empty list plus an info note about
   * filenames, and no next step. `detail` is the chosen source's label, `count` the rejected files.
   */
  | "INDEX_EMPTY_WRONG_SOURCE"
  // --- session index (R12 M5) ---
  /** The sidecar file is present but could not be read or is not JSON. Distinct from out-of-reach. */
  | "INDEX_SIDECAR_UNREADABLE"
  /**
   * The sidecar parsed, but the property chain the profile declares is not there — almost always
   * because the upstream tool changed how it stores this. That is a fact for the profile to
   * catch up with, not something the user did wrong, so the copy says so.
   */
  | "INDEX_SIDECAR_SHAPE_CHANGED"
  /** Entries in the sidecar whose value was not a usable string. Counted, never coerced. */
  | "INDEX_SIDECAR_ENTRY_SKIPPED"
  /**
   * The sidecar is larger than the reader will load, or holds more entries than it will map.
   * The reader had no bound at all until review on 2026-08-27 noted that the same round's
   * transcript scan windows every read to 128 KiB/1 MiB precisely so a big directory cannot
   * stall the UI — a discipline the new file had not inherited. `count` is the offending size
   * or entry count, `detail` the path.
   */
  | "INDEX_SIDECAR_TRUNCATED"
  // --- session index (2026-09-compact-chain) ---
  /**
   * A file starts with a `compact_boundary` that points outside itself, and no candidate in the
   * same project holds that boundary with its logical parent before it. The usual cause is a
   * parent transcript that has since been cleaned up. Info, and it says "not found" — never
   * "standalone": the search cannot tell the two apart. `detail` names up to three files.
   */
  | "INDEX_CHAIN_UNRESOLVED"
  /**
   * The parent search stopped because it ran out of candidate files or read budget before it
   * could rule. Warn: the list is usable but a chain may be shown split, and the user can act
   * (pick a smaller folder). `count` is the number of continuation files left unresolved this way.
   */
  | "INDEX_CHAIN_SEARCH_CAPPED"
  /**
   * A loaded file's actual harness differs from the one chosen at level 1. On the LOAD path
   * the content wins — the adapter has already read the file and re-reading a Codex rollout as
   * Claude Code would only grow a wrong tree — so this changes nothing and only says so.
   * `detail` is what the file actually is. Contrast INDEX_SOURCE_MISMATCH, where the choice
   * governs because the question there is where to look, not what a file is.
   */
  | "LOAD_SOURCE_MISMATCH";

export interface Diagnostic {
  tier: DiagnosticTier;
  code: DiagnosticCode;
  /** Interpolation value — a type name, a file name, an error string. Never a full sentence. */
  detail?: string;
  /** How many times this fired; the copy table decides whether to render it. */
  count?: number;
  /** Which transcript file it came from. Set by the batch layer, not by the adapter. */
  path?: string;
}

/** Tier of the loudest diagnostic in a set, or null when the set is empty. */
export function highestTier(diagnostics: readonly Diagnostic[]): DiagnosticTier | null {
  if (diagnostics.some((d) => d.tier === "fatal")) return "fatal";
  if (diagnostics.some((d) => d.tier === "warn")) return "warn";
  return diagnostics.length > 0 ? "info" : null;
}

export function hasFatal(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.tier === "fatal");
}

/** Diagnostics worth surfacing in the dismissible banner (info is counted, not narrated). */
export function noticeable(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return diagnostics.filter((d) => d.tier !== "info");
}

/**
 * `info`-tier diagnostics — a known, policy-handled condition. `noticeable()` deliberately
 * excludes these from the dismissible banner; this is their only surface, consumed by
 * `OverviewView`'s on-demand capability-limit disclosure (R11.2 R3). Never render this next
 * to `noticeable()` in a way that re-merges the two tiers — that is exactly the "stop looking
 * like a fault" distinction R11-M4 drew.
 */
export function informational(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return diagnostics.filter((d) => d.tier === "info");
}

/**
 * A fatal outcome carries a typed code all the way to the UI. Throwing this instead of a
 * bare `Error` is what lets the store keep a single error owner (RC-5) without string
 * sniffing at the boundary.
 */
export class PipelineFatalError extends Error {
  readonly diagnostic: Diagnostic;

  constructor(code: DiagnosticCode, detail?: string) {
    super(`${code}${detail ? `: ${detail}` : ""}`);
    this.name = "PipelineFatalError";
    this.diagnostic = { tier: "fatal", code, detail };
  }
}
