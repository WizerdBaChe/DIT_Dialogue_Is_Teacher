import { useState, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useDiagnosticCopy, useT } from "@/i18n";
import { informational, noticeable } from "@/core/diagnostics/contracts";
import { SessionLoadActions } from "./SessionLoadActions";
import { NoticeBanner } from "./NoticeBanner";

export function OverviewView(): ReactNode {
  const t = useT();
  const doc = useSessionStore((state) => state.doc);
  const viewItems = useSessionStore((state) => state.viewItems);
  const diagnostics = useSessionStore((state) => state.diagnostics);
  const error = useSessionStore((state) => state.error);
  const sessionOrigin = useSessionStore((state) => state.sessionOrigin);
  const activeId = useSessionStore((state) => state.activeId);
  const playingId = useSessionStore((state) => state.playingId);
  const snapshotMode = useSessionStore((state) => state.snapshotMode);
  const startReading = useSessionStore((state) => state.startReading);
  const dismissError = useSessionStore((state) => state.dismissError);
  const copy = useDiagnosticCopy();
  const [infoOpen, setInfoOpen] = useState(false);

  if (!doc) {
    return (
      <main className="main-content overview-view">
        {error && <NoticeBanner tone="error" onDismiss={dismissError}>{copy.line(error)}</NoticeBanner>}
        <div className="empty-state overview-empty">
          <h2>{t.main.emptyTitle}</h2>
          <p>
            {t.main.emptyBodyPrefix}
            <code>{t.main.emptyPathClaude}</code>
            {t.main.emptyPathJoiner}
            <code>{t.main.emptyPathCodex}</code>
            {t.main.emptyPathSuffix2}
            {t.main.emptyBodySuffix}
          </p>
          <SessionLoadActions labels="overview" />
        </div>
      </main>
    );
  }

  const infoDiagnostics = informational(diagnostics);
  const currentId = playingId ?? activeId;
  const isFirstItem = currentId === (viewItems[0]?.id ?? null);
  // LS-10：快照模式沒有載入入口，CTA 不引用「載入」語意，避免死文案 (SA-INV-3)。
  const cta = snapshotMode
    ? t.overview.startBrowsing
    : sessionOrigin === "sample"
      ? t.overview.startSample
      : isFirstItem
        ? t.overview.startReading
        : t.overview.continueReading;

  return (
    <main className="main-content overview-view">
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
              <p>{t.overview.sessionSummary(doc.session.title, doc.session.source, viewItems.length, noticeable(diagnostics).length)}</p>
              {infoDiagnostics.length > 0 && (
                <div className="overview-info-summary">
                  <button
                    type="button"
                    className="btn overview-info-summary-toggle"
                    aria-expanded={infoOpen}
                    aria-controls="overview-info-summary-list"
                    onClick={() => setInfoOpen((current) => !current)}
                  >
                    {infoOpen ? t.overview.infoSummary.toggleHide : t.overview.infoSummary.toggleShow(infoDiagnostics.length)}
                  </button>
                  {infoOpen && (
                    <ul id="overview-info-summary-list" className="overview-info-summary-list">
                      {infoDiagnostics.map((diagnostic, index) => (
                        <li key={index}>{copy.line(diagnostic)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
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
          {/* R9.1 RC-E：尺寸由 .overview-actions 這一排統一給，元素本身不再帶尺寸 class。 */}
          <button type="button" className="btn primary overview-primary-action" onClick={startReading}>
            {cta}
          </button>
        </div>

        {/*
          R12 M2 修正（作者裁決 2026-08-26）：載入入口不再跟 CTA 擠同一排。
          一級選單是「一段說明 + 兩顆按鈕」的區塊，塞進一排 flex 之後標題會跟按鈕並排，
          看起來是交錯的。給它自己一整列，說明在上、按鈕在下。
        */}
        <div className="overview-load">
          <SessionLoadActions labels="overview" />
        </div>
      </section>
    </main>
  );
}
