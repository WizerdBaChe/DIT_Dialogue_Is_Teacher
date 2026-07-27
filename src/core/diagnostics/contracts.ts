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
  | "NO_RENDERABLE_CONTENT"
  | "EMPTY_INPUT"
  | "LOAD_FAILED"
  // --- session index (R9 M3) ---
  | "INDEX_TRUNCATED"
  | "INDEX_FILE_UNREADABLE"
  | "INDEX_PERMISSION_LOST"
  | "INDEX_EMPTY";

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
