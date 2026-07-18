import type { PrivacyFinding, PrivacyPolicy } from "./contracts";

function invariantAction(finding: PrivacyFinding): "block" | null {
  return finding.kind === "secret" ? "block" : null;
}

export const balancedPrivacyPolicy: PrivacyPolicy = {
  id: "balanced",
  version: "1.0.0",
  decide(finding) {
    return invariantAction(finding) ?? finding.suggestedAction;
  },
};

export const strictPrivacyPolicy: PrivacyPolicy = {
  id: "strict",
  version: "1.0.0",
  decide(finding) {
    const invariant = invariantAction(finding);
    if (invariant) return invariant;
    if (finding.kind === "content_sensitive") return "block";
    return finding.suggestedAction === "keep_review" ? "redact" : finding.suggestedAction;
  },
};

export const PRIVACY_POLICIES: Record<"balanced" | "strict", PrivacyPolicy> = {
  balanced: balancedPrivacyPolicy,
  strict: strictPrivacyPolicy,
};
