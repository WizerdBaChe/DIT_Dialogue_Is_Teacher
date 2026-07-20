import type { ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";
import {
  SKELETON_NODE_KIND_ORDER,
  SKELETON_NODE_SYMBOL,
  SKELETON_RIB_KIND_ORDER,
  SKELETON_RIB_SYMBOL,
} from "@/core/view/sessionMap";
import { SPAN_DOT, SPAN_LEGEND_ORDER } from "./labels";
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

        <details className="overview-legend">
          <summary>{t.overview.legend.label}</summary>
          <div className="overview-legend-body">
            <section aria-labelledby="overview-legend-span-heading">
              <h4 id="overview-legend-span-heading">{t.overview.legend.spanHeading}</h4>
              <ul className="overview-legend-list">
                {SPAN_LEGEND_ORDER.map((type) => (
                  <li key={type}>
                    <span aria-hidden="true">{SPAN_DOT[type]}</span> {t.spanKind[type]}
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="overview-legend-skeleton-heading">
              <h4 id="overview-legend-skeleton-heading">{t.overview.legend.skeletonHeading}</h4>
              <ul className="overview-legend-list">
                {SKELETON_NODE_KIND_ORDER.map((kind) => (
                  <li key={kind}>
                    <span aria-hidden="true">{SKELETON_NODE_SYMBOL[kind]}</span> {t.skeletonNode[kind]}
                  </li>
                ))}
                {SKELETON_RIB_KIND_ORDER.map((kind) => (
                  <li key={kind}>
                    <span aria-hidden="true">{SKELETON_RIB_SYMBOL[kind]}</span> {t.skeletonRib[kind]}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </details>
      </section>
    </main>
  );
}
