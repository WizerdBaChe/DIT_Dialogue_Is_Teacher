import type { ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { NoticeBanner } from "./NoticeBanner";

export function Header(): ReactNode {
  const t = useT();

  const hasDoc = useSessionStore((state) => Boolean(state.doc));
  const isPlaying = useSessionStore((state) => state.isPlaying);
  const restoreNotice = useSessionStore((state) => state.restoreNotice);
  const structureDrawerOpen = useSessionStore((state) => state.structureDrawerOpen);
  const privacyReviewOpen = useSessionStore((state) => Boolean(state.privacyReview));
  const settingsOpen = useSessionStore((state) => state.settingsOpen);
  const snapshotMode = useSessionStore((state) => state.snapshotMode);

  const play = useSessionStore((state) => state.play);
  const next = useSessionStore((state) => state.next);
  const prev = useSessionStore((state) => state.prev);
  const openStructureDrawer = useSessionStore((state) => state.openStructureDrawer);
  const dismissRestoreNotice = useSessionStore((state) => state.dismissRestoreNotice);
  const openSettings = useSessionStore((state) => state.openSettings);
  const closeSettings = useSessionStore((state) => state.closeSettings);

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
        </button>

        <WorkspaceTabs />

        <div className="header-spacer" aria-hidden="true" />

        <div className="control replay-control" aria-label={t.header.replayControlsLabel}>
          <button className="btn compact-action" onClick={prev} disabled={!hasDoc} title={t.header.prevTitle} aria-label={t.header.prevTitle}>‹</button>
          <button className="btn primary compact-replay" onClick={play} disabled={!hasDoc}>
            {isPlaying ? t.header.pause : t.header.replay}
          </button>
          <button className="btn compact-action" onClick={next} disabled={!hasDoc} title={t.header.nextTitle} aria-label={t.header.nextTitle}>›</button>
        </div>

        <button
          id="settings-toggle-btn"
          type="button"
          className={`btn settings-toggle-btn ${settingsOpen ? "active" : ""}`}
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          aria-controls="settings-dialog"
          onClick={() => (settingsOpen ? closeSettings() : openSettings())}
        >
          <span aria-hidden="true">≡</span>
          {settingsOpen ? t.settings.close : t.settings.open}
        </button>
      </header>

      {!snapshotMode && restoreNotice && (
        <NoticeBanner tone="warn" onDismiss={dismissRestoreNotice}>{t.header.restored(restoreNotice.count)}</NoticeBanner>
      )}
    </>
  );
}
