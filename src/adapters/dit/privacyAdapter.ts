import type { Annotation, Span } from "@/types/spanTree";
import type { AnnotateContext } from "@/core/llm/types";
import { buildUserPrompt } from "@/core/llm/prompt";
import {
  PrivacyError,
  type PrivacyConsent,
  type PrivacyEnvelope,
  type PrivacyGateway,
  type PrivacyInspection,
  type PrivacyRequest,
} from "@/core/privacy";

export type PrivacyReviewer = (inspection: PrivacyInspection) => Promise<PrivacyConsent | null>;

/** Any transport that accepts an already-sanitized envelope instead of a raw span (INV-R8-1: every
 * `sendsDataOut` preset routes through here, not just OpenCode). */
export interface PrivacyProtectedTransport {
  annotate(envelope: PrivacyEnvelope, locale?: "zh-TW" | "en"): Promise<Annotation>;
}

export interface PrivacyProtectedAnnotationOptions {
  gateway: PrivacyGateway;
  transport: PrivacyProtectedTransport;
  reviewer: PrivacyReviewer;
  privacyRequest?: PrivacyRequest;
}

export async function annotateWithPrivacy(
  span: Span,
  context: AnnotateContext,
  options: PrivacyProtectedAnnotationOptions,
): Promise<Annotation> {
  const customTerms = [...(options.privacyRequest?.customTerms ?? [])];
  const title = context.sessionTitle.trim();
  if (title.length >= 2) customTerms.push(title);
  const inspection = await options.gateway.inspect(buildUserPrompt(span, context), {
    ...options.privacyRequest,
    customTerms,
  });
  const consent = await options.reviewer(inspection);
  if (!consent) {
    await options.gateway.authorize(inspection.id, { consentId: "" }).catch(() => undefined);
    throw new PrivacyError("PRIVACY_REVIEW_CANCELLED", "Privacy review was cancelled; no data was sent.");
  }
  const envelope: PrivacyEnvelope = await options.gateway.authorize(inspection.id, consent);
  return options.transport.annotate(envelope, context.locale);
}
