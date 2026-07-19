import type { ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";
import { SessionLoadActions } from "./SessionLoadActions";

export function OverviewView(): ReactNode {
  const t = useT();
  const doc = useSessionStore((state) => state.doc);
  const viewItems = useSessionStore((state) => state.viewItems);
  const warnings = useSessionStore((state) => state.warnings);
  const error = useSessionStore((state) => state.error);
  const sessionOrigin = useSessionStore((state) => state.sessionOrigin);
  const activeId = useSessionStore((state) => state.activeId);
  const playingId = useSessionStore((state) => state.playingId);
  const startReading = useSessionStore((state) => state.startReading);

  if (!doc) {
    return (
      <main className="main-content overview-view">
        {error && <div className="error-banner" role="alert">{error}</div>}
        <div className="empty-state overview-empty">
          <h2>{t.main.emptyTitle}</h2>
          <SessionLoadActions labels="overview" />
        </div>
      </main>
    );
  }

  const currentId = playingId ?? activeId;
  const isFirstItem = currentId === (viewItems[0]?.id ?? null);
  const cta = sessionOrigin === "sample"
    ? t.overview.startSample
    : isFirstItem
      ? t.overview.startReading
      : t.overview.continueReading;

  return (
    <main className="main-content overview-view">
      {error && <div className="error-banner" role="alert">{error}</div>}
      <section className="overview-card" aria-labelledby="overview-title">
        <span className="overview-badge">
          {sessionOrigin === "sample" ? t.overview.sampleBadge : t.overview.loadedBadge}
        </span>
        <h2 id="overview-title">{t.overview.startTitle}</h2>
        <p className="overview-purpose">{t.overview.purpose}</p>

        <ol className="overview-steps">
          <li>
            <span className="overview-step-number" aria-hidden="true">1</span>
            <div>
              <h3>{t.overview.steps.confirmTitle}</h3>
              <p>{t.overview.sessionSummary(doc.session.title, doc.session.source, viewItems.length, warnings.length)}</p>
            </div>
          </li>
          <li>
            <span className="overview-step-number" aria-hidden="true">2</span>
            <div>
              <h3>{t.overview.steps.readTitle}</h3>
              <p>{t.overview.steps.readBody}</p>
            </div>
          </li>
          <li>
            <span className="overview-step-number" aria-hidden="true">3</span>
            <div>
              <h3>{t.overview.steps.extendTitle}</h3>
              <p>{t.overview.steps.extendBody}</p>
            </div>
          </li>
        </ol>

        <div className="overview-actions">
          <button type="button" className="btn primary overview-primary-action" onClick={startReading}>
            {cta}
          </button>
          <SessionLoadActions labels="overview" />
        </div>
      </section>
    </main>
  );
}
