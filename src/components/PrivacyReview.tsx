import type { ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";

export function PrivacyReview(): ReactNode {
  const t = useT();
  const review = useSessionStore((state) => state.privacyReview);
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
