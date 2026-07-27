/**
 * Two distinct concerns live here and must not be merged:
 *
 * - `fallbacks` — developer-facing record of every "couldn't find it, used something else"
 *   decision. Console + `window.__DIT_FALLBACKS`. Never shown to the user.
 * - `contracts` — the user-facing `Diagnostic` channel (tier + code), rendered through the
 *   i18n copy table.
 *
 * A fallback is a bug smell we want to grep for; a Diagnostic is something the user is
 * entitled to know about. Some events are both, and are reported to both.
 */
export {
  reportFallback,
  getFallbackReport,
  resetFallbackReport,
  mergeFallbackReport,
  type FallbackRecord,
} from "./fallbacks";

export {
  highestTier,
  hasFatal,
  noticeable,
  PipelineFatalError,
  type Diagnostic,
  type DiagnosticCode,
  type DiagnosticTier,
} from "./contracts";
