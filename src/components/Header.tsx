import { useState, type ReactNode } from "react";
import { selectCurrentPosition, useSessionStore } from "@/store/sessionStore";
import type { ProviderId } from "@/types/spanTree";
import { useT, useLocale, LOCALE_ORDER, LOCALE_NATIVE_NAME } from "@/i18n";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { Disclaimer } from "./Disclaimer";
import { OllamaPanel } from "./OllamaPanel";
import { CloudPanel } from "./CloudPanel";
import { SessionLoadActions } from "./SessionLoadActions";

const PROVIDERS: ProviderId[] = ["none", "ollama", "cloud"];

export function Header(): ReactNode {
  const t = useT();
  const [locale, setLocale] = useLocale();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const hasDoc = useSessionStore((state) => Boolean(state.doc));
  const providerId = useSessionStore((state) => state.providerId);
  const showAnnotations = useSessionStore((state) => state.showAnnotations);
  const isPlaying = useSessionStore((state) => state.isPlaying);
  const hasAnnotations = useSessionStore((state) => Object.keys(state.annotations).length > 0);
  const viewItemCount = useSessionStore((state) => state.viewItems.length);
  const cachedCount = useSessionStore((state) => Object.keys(state.cachedForCurrentConfig).length);
  const failedCount = useSessionStore((state) => Object.keys(state.annotationErrors).length);
  const annotationRunMode = useSessionStore((state) => state.annotationRunMode);
  const restoredAnnotationCount = useSessionStore((state) => state.restoredAnnotationCount);
  const viewItems = useSessionStore((state) => state.viewItems);
  const activeId = useSessionStore((state) => state.activeId);
  const playingId = useSessionStore((state) => state.playingId);
  const structureDrawerOpen = useSessionStore((state) => state.structureDrawerOpen);
  const privacyReviewOpen = useSessionStore((state) => Boolean(state.privacyReview));
  const minimapEnabled = useSessionStore((state) => state.minimapEnabled);
  const mapShortcutEnabled = useSessionStore((state) => state.mapShortcutEnabled);

  const setProvider = useSessionStore((state) => state.setProvider);
  const toggleAnnotations = useSessionStore((state) => state.toggleAnnotations);
  const play = useSessionStore((state) => state.play);
  const next = useSessionStore((state) => state.next);
  const prev = useSessionStore((state) => state.prev);
  const annotateAll = useSessionStore((state) => state.annotateAll);
  const setAnnotationRunMode = useSessionStore((state) => state.setAnnotationRunMode);
  const clearAnnotations = useSessionStore((state) => state.clearAnnotations);
  const resetToSample = useSessionStore((state) => state.resetToSample);
  const openStructureDrawer = useSessionStore((state) => state.openStructureDrawer);
  const setMinimapEnabled = useSessionStore((state) => state.setMinimapEnabled);
  const setMapShortcutEnabled = useSessionStore((state) => state.setMapShortcutEnabled);

  const position = selectCurrentPosition({ viewItems, activeId, playingId });

  const annotationCount = annotationRunMode === "missing"
    ? Math.max(0, viewItemCount - cachedCount)
    : annotationRunMode === "failed"
      ? failedCount
      : viewItemCount;

  return (
    <>
      <header className="header compact-header">
        <div className="brand" title={t.header.brand}>
          <h1>
            <span className="brand-long">{t.header.brand}</span>
            <span className="brand-short">DIT</span>
          </h1>
        </div>

        <button
          id="structure-drawer-trigger"
          type="button"
          className="btn structure-drawer-trigger"
          aria-haspopup="dialog"
          aria-expanded={structureDrawerOpen}
          aria-controls="structure-drawer"
          disabled={!hasDoc || privacyReviewOpen}
          onClick={openStructureDrawer}
        >
          <span>{t.structure.openDrawer}</span>
          <span className="structure-trigger-position">
            {t.structure.position(position.current ?? "—", position.total)}
          </span>
        </button>

        <WorkspaceTabs />

        <div className="control teaching-control" role="group" aria-label={t.settings.teachingGroup}>
          <label htmlFor="hdr-provider" className="teaching-label">{t.header.providerLabel}</label>
          <select id="hdr-provider" value={providerId} onChange={(event) => setProvider(event.target.value as ProviderId)}>
            {PROVIDERS.map((provider) => <option key={provider} value={provider}>{t.provider[provider]}</option>)}
          </select>
          <label className="toggle">
            <input type="checkbox" checked={showAnnotations} onChange={toggleAnnotations} disabled={providerId === "none"} />
            {t.header.showAnnotations}
          </label>
          <div className="batch-control">
            <select
              aria-label={t.header.annotateModeLabel}
              value={annotationRunMode}
              onChange={(event) => setAnnotationRunMode(event.target.value as "missing" | "failed" | "all")}
            >
              <option value="missing">{t.header.annotateModes.missing}</option>
              <option value="failed">{t.header.annotateModes.failed}</option>
              <option value="all">{t.header.annotateModes.all}</option>
            </select>
            <button
              className="btn"
              onClick={() => void annotateAll()}
              disabled={!hasDoc || providerId === "none"}
              title={providerId === "none" ? t.header.annotateDisabled : undefined}
            >
              {t.header.annotateCount(annotationRunMode, annotationCount)}
            </button>
          </div>
          {restoredAnnotationCount > 0 && <span className="cache-status">{t.header.restored(restoredAnnotationCount)}</span>}
          {providerId !== "none" && hasAnnotations && (
            <button className="btn" onClick={clearAnnotations} title={t.header.clearAnnotationsTitle}>{t.header.clearAnnotations}</button>
          )}
        </div>

        <div className="control replay-control" aria-label={t.header.replayControlsLabel}>
          <button className="btn compact-action" onClick={prev} disabled={!hasDoc} title={t.header.prevTitle} aria-label={t.header.prevTitle}>‹</button>
          <button className="btn primary compact-replay" onClick={play} disabled={!hasDoc}>
            {isPlaying ? t.header.pause : t.header.replay}
          </button>
          <button className="btn compact-action" onClick={next} disabled={!hasDoc} title={t.header.nextTitle} aria-label={t.header.nextTitle}>›</button>
        </div>

        <button
          type="button"
          className={`btn settings-toggle-btn ${settingsOpen ? "active" : ""}`}
          aria-expanded={settingsOpen}
          aria-controls="settings-tray"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <span aria-hidden="true">≡</span>
          {settingsOpen ? t.settings.close : t.settings.open}
        </button>
      </header>

      {settingsOpen && (
        <section id="settings-tray" className="settings-tray" aria-label={t.settings.label}>
          <div className="settings-grid">
            <fieldset className="settings-group">
              <legend>{t.settings.sessionGroup}</legend>
              <div className="settings-actions">
                <SessionLoadActions />
                <button className="btn" onClick={resetToSample} title={t.header.resetTitle}>{t.header.reset}</button>
              </div>
            </fieldset>

            <fieldset className="settings-group">
              <legend>{t.settings.languageGroup}</legend>
              <div className="settings-actions">
                <label htmlFor="hdr-locale">{t.header.languageLabel}</label>
                <select id="hdr-locale" value={locale} onChange={(event) => setLocale(event.target.value as typeof locale)}>
                  {LOCALE_ORDER.map((language) => <option key={language} value={language}>{LOCALE_NATIVE_NAME[language]}</option>)}
                </select>
              </div>
            </fieldset>

            <fieldset className="settings-group">
              <legend>{t.settings.navigationGroup}</legend>
              <div className="settings-actions">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={minimapEnabled}
                    onChange={(event) => setMinimapEnabled(event.target.checked)}
                  />
                  {t.settings.showMinimap}
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={mapShortcutEnabled}
                    onChange={(event) => setMapShortcutEnabled(event.target.checked)}
                  />
                  {t.settings.enableMapShortcut}
                </label>
              </div>
            </fieldset>
          </div>

          <Disclaimer />
          <OllamaPanel />
          <CloudPanel />
        </section>
      )}
    </>
  );
}
