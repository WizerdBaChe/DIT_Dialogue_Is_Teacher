import type { ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";
import { PROVIDER_PRESETS } from "@/core/llm";

/** cloud === opencode local-proxy (kept as-is, see ADR-032); its metadata isn't in PROVIDER_PRESETS
 * under that id, so its cost tier is hardcoded here to match the local-proxy preset entry. */
function isMetered(providerId: string): boolean {
  if (providerId === "cloud") return true;
  const preset = PROVIDER_PRESETS[providerId as keyof typeof PROVIDER_PRESETS];
  return preset ? preset.cost !== "free" : false;
}

export function PrivacyReview(): ReactNode {
  const t = useT();
  const review = useSessionStore((state) => state.privacyReview);
  const providerId = useSessionStore((state) => state.providerId);
  const approve = useSessionStore((state) => state.approvePrivacyReview);
  const cancel = useSessionStore((state) => state.cancelPrivacyReview);
  if (!review) return null;

  const findings = Object.entries(review.inspection.summary).filter(([, count]) => Boolean(count));
  return (
    <section className="privacy-review" role="dialog" aria-modal="true" aria-labelledby="privacy-review-title">
      <div className="privacy-review-card">
        <p className="eyebrow">{t.privacy.eyebrow}</p>
        <h2 id="privacy-review-title">{t.privacy.title}</h2>
        <p>{t.privacy.body}</p>
        {isMetered(providerId) && <p className="privacy-note privacy-cost-notice">{t.privacy.costNotice}</p>}
        <dl className="privacy-summary">
          <div><dt>{t.privacy.policy}</dt><dd>{review.inspection.policy.id}</dd></div>
          <div><dt>{t.privacy.expires}</dt><dd>{new Date(review.inspection.expiresAt).toLocaleTimeString()}</dd></div>
          {findings.map(([kind, count]) => (
            <div key={kind}><dt>{kind}</dt><dd>{count}</dd></div>
          ))}
        </dl>
        <label className="privacy-preview-label" htmlFor="privacy-preview">{t.privacy.preview}</label>
        <textarea id="privacy-preview" className="privacy-preview" value={review.inspection.sanitizedText} readOnly rows={12} />
        <p className="privacy-note">{t.privacy.note}</p>
        <div className="privacy-actions">
          <button type="button" className="btn" onClick={cancel}>{t.privacy.cancel}</button>
          <button type="button" className="btn primary" onClick={approve}>{t.privacy.send}</button>
        </div>
      </div>
    </section>
  );
}
