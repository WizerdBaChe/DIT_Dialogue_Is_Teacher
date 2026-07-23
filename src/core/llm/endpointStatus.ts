/**
 * Shared EndpointStatus state machine (R8 — extends the original checking/ready/offline
 * split with CORS/auth/proxy states so the UI can give preset-specific remediation
 * instead of a generic "offline" (INV-R8-5)).
 */

export type EndpointState =
  | "checking"
  | "ready"
  | "offline"
  | "cors-blocked"
  | "auth-missing"
  | "model-missing"
  | "no-model"
  | "proxy-missing";

export interface EndpointStatus {
  state: EndpointState;
  baseUrl: string;
  model: string;
  models: string[];
  message: string;
}

/**
 * A `fetch` rejection with no HTTP response reaching the browser means either the request
 * never left (CORS preflight/opaque block) or the target truly isn't listening. We can't tell
 * those apart from the error alone, so we use the preset's `kind` as the prior:
 *  - "local": a dev server that isn't running is far more likely than a CORS misconfiguration
 *    (same assumption the original Ollama/LM Studio checks already made) → "offline".
 *  - "cloud" + "direct": the service is definitely reachable in general (it's a public API), so
 *    an unreachable direct-browser call is presumed CORS-blocked (INV-R8-5).
 *  - "proxy", or a "cloud" preset that declares `needs-proxy`: presumed to have no local proxy
 *    running.
 */
export function classifyUnreachable(
  browserReach: "direct" | "needs-proxy",
  kind: "local" | "cloud" | "proxy",
): EndpointState {
  if (kind === "local") return "offline";
  if (kind === "proxy") return "proxy-missing";
  return browserReach === "direct" ? "cors-blocked" : "proxy-missing";
}
