export type SensitiveKind =
  | "secret"
  | "email"
  | "phone"
  | "person"
  | "user_path"
  | "ip_address"
  | "hostname"
  | "project_term"
  | "content_sensitive";

export type PrivacyAction = "block" | "replace" | "redact" | "keep_review";

export interface DetectionContext {
  customTerms?: string[];
}

export interface PrivacyFinding {
  id: string;
  detectorId: string;
  kind: SensitiveKind;
  start: number;
  end: number;
  confidence: number;
  suggestedAction: PrivacyAction;
}

export interface PrivacyDetector {
  readonly id: string;
  readonly version: string;
  detect(input: string, context: DetectionContext): Promise<PrivacyFinding[]>;
}

export interface PrivacyPolicy {
  readonly id: "balanced" | "strict" | string;
  readonly version: string;
  decide(finding: PrivacyFinding): PrivacyAction;
}

export interface PrivacyRequest {
  policyId?: "balanced" | "strict";
  customTerms?: string[];
}

export interface PrivacyInspection {
  id: string;
  sanitizedText: string;
  policy: { id: string; version: string };
  detectorVersions: Record<string, string>;
  summary: Partial<Record<SensitiveKind, number>>;
  reviewRequired: boolean;
  expiresAt: string;
}

export interface PrivacyConsent {
  consentId: string;
}

export interface PrivacyEnvelope {
  sanitizedText: string;
  policy: { id: string; version: string };
  detectorVersions: Record<string, string>;
  summary: Partial<Record<SensitiveKind, number>>;
  consentId: string;
  createdAt: string;
}

export type PrivacyErrorCode =
  | "PRIVACY_SECRET_BLOCKED"
  | "PRIVACY_AMBIGUOUS_OVERLAP"
  | "PRIVACY_DETECTOR_FAILED"
  | "PRIVACY_POST_SCAN_FAILED"
  | "PRIVACY_INSPECTION_EXPIRED"
  | "PRIVACY_POLICY_MISMATCH"
  | "PRIVACY_REVIEW_CANCELLED";

export class PrivacyError extends Error {
  constructor(
    readonly code: PrivacyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PrivacyError";
  }
}

export interface PrivacyGateway {
  inspect(input: string, request?: PrivacyRequest): Promise<PrivacyInspection>;
  authorize(inspectionId: string, consent: PrivacyConsent): Promise<PrivacyEnvelope>;
}
