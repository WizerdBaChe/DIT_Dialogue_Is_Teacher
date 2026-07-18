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
import type { OpenCodeTransport } from "@/core/llm/cloud";

export type PrivacyReviewer = (inspection: PrivacyInspection) => Promise<PrivacyConsent | null>;

export interface PrivacyProtectedAnnotationOptions {
  gateway: PrivacyGateway;
  transport: OpenCodeTransport;
  reviewer: PrivacyReviewer;
  privacyRequest?: PrivacyRequest;
}

export async function annotateOpenCodeWithPrivacy(
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
