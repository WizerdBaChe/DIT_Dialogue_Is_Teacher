import {
  PrivacyError,
  type PrivacyConsent,
  type PrivacyDetector,
  type PrivacyEnvelope,
  type PrivacyFinding,
  type PrivacyGateway,
  type PrivacyInspection,
  type PrivacyPolicy,
  type PrivacyRequest,
} from "./contracts";
import { applyFindings, resolveOverlaps } from "./apply";
import { DEFAULT_PRIVACY_DETECTORS, secretDetector } from "./detectors";
import { PRIVACY_POLICIES } from "./policies";

const INSPECTION_TTL_MS = 5 * 60 * 1000;

interface StoredInspection {
  publicValue: PrivacyInspection;
  inputDigest: string;
}

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function digestText(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class LocalPrivacyGateway implements PrivacyGateway {
  private readonly inspections = new Map<string, StoredInspection>();

  constructor(
    private readonly detectors: PrivacyDetector[] = DEFAULT_PRIVACY_DETECTORS,
    private readonly policies: Record<string, PrivacyPolicy> = PRIVACY_POLICIES,
  ) {}

  async inspect(input: string, request: PrivacyRequest = {}): Promise<PrivacyInspection> {
    const policy = this.policies[request.policyId ?? "balanced"];
    if (!policy) throw new PrivacyError("PRIVACY_POLICY_MISMATCH", "The selected privacy policy is unavailable.");

    let detected: PrivacyFinding[];
    try {
      const batches = await Promise.all(this.detectors.map((detector) => detector.detect(input, { customTerms: request.customTerms })));
      detected = batches.flat();
    } catch {
      throw new PrivacyError("PRIVACY_DETECTOR_FAILED", "Local privacy inspection failed; no data was sent.");
    }

    const applied = resolveOverlaps(detected.map((finding) => ({ ...finding, action: policy.decide(finding) })));
    if (applied.some((finding) => finding.action === "block")) {
      throw new PrivacyError("PRIVACY_SECRET_BLOCKED", "A possible secret or blocked sensitive value was found; no data was sent.");
    }

    const transformed = applyFindings(input, applied);
    const postFindings = await secretDetector.detect(transformed.text, {});
    if (postFindings.length > 0) {
      throw new PrivacyError("PRIVACY_POST_SCAN_FAILED", "The sanitized text still appears to contain a secret; no data was sent.");
    }

    const now = Date.now();
    const inspection: PrivacyInspection = {
      id: randomId("inspection"),
      sanitizedText: transformed.text,
      policy: { id: policy.id, version: policy.version },
      detectorVersions: Object.fromEntries(this.detectors.map((detector) => [detector.id, detector.version])),
      summary: transformed.summary,
      reviewRequired: applied.some((finding) => finding.action === "keep_review"),
      expiresAt: new Date(now + INSPECTION_TTL_MS).toISOString(),
    };
    this.inspections.set(inspection.id, { publicValue: inspection, inputDigest: await digestText(input) });
    return inspection;
  }

  async authorize(inspectionId: string, consent: PrivacyConsent): Promise<PrivacyEnvelope> {
    const stored = this.inspections.get(inspectionId);
    this.inspections.delete(inspectionId);
    if (!stored || Date.parse(stored.publicValue.expiresAt) <= Date.now()) {
      throw new PrivacyError("PRIVACY_INSPECTION_EXPIRED", "The privacy preview expired; inspect the content again.");
    }
    if (!consent.consentId.trim()) {
      throw new PrivacyError("PRIVACY_REVIEW_CANCELLED", "Privacy review was cancelled; no data was sent.");
    }
    void stored.inputDigest;
    return {
      sanitizedText: stored.publicValue.sanitizedText,
      policy: stored.publicValue.policy,
      detectorVersions: stored.publicValue.detectorVersions,
      summary: stored.publicValue.summary,
      consentId: consent.consentId,
      createdAt: new Date().toISOString(),
    };
  }
}

export const defaultPrivacyGateway = new LocalPrivacyGateway();
