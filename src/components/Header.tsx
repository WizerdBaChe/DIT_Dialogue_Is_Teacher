/** 頂部標頭：品牌、檔案載入、講解開關、重播控制、Provider 選擇、語言切換。 */
import { type ChangeEvent, type ReactNode } from "react";
import { useSessionStore, type ViewMode } from "@/store/sessionStore";
import type { ProviderId } from "@/types/spanTree";
import { useT, useLocale, LOCALE_ORDER, LOCALE_NATIVE_NAME } from "@/i18n";

const PROVIDERS: ProviderId[] = ["none", "ollama", "cloud"];
const MODES: ViewMode[] = ["cognitive", "dense"];

export function Header(): ReactNode {
  const t = useT();
  const [locale, setLocale] = useLocale();

  const hasDoc = useSessionStore((s) => Boolean(s.doc));
  const providerId = useSessionStore((s) => s.providerId);
  const showAnnotations = useSessionStore((s) => s.showAnnotations);
  const isPlaying = useSessionStore((s) => s.isPlaying);
  const viewMode = useSessionStore((s) => s.viewMode);
  const hasAnnotations = useSessionStore((s) => Object.keys(s.annotations).length > 0);
  const viewItemCount = useSessionStore((s) => s.viewItems.length);
  const cachedCount = useSessionStore((s) => Object.keys(s.cachedForCurrentConfig).length);
  const failedCount = useSessionStore((s) => Object.keys(s.annotationErrors).length);
  const annotationRunMode = useSessionStore((s) => s.annotationRunMode);
  const restoredAnnotationCount = useSessionStore((s) => s.restoredAnnotationCount);

  const loadFromFiles = useSessionStore((s) => s.loadFromFiles);
  const setViewMode = useSessionStore((s) => s.setViewMode);
  const setProvider = useSessionStore((s) => s.setProvider);
  const toggleAnnotations = useSessionStore((s) => s.toggleAnnotations);
  const play = useSessionStore((s) => s.play);
  const next = useSessionStore((s) => s.next);
  const prev = useSessionStore((s) => s.prev);
  const annotateAll = useSessionStore((s) => s.annotateAll);
  const setAnnotationRunMode = useSessionStore((s) => s.setAnnotationRunMode);
  const clearAnnotations = useSessionStore((s) => s.clearAnnotations);
  const resetToSample = useSessionStore((s) => s.resetToSample);

  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = [...(e.target.files ?? [])].filter((file) => /\.(jsonl|json|txt)$/i.test(file.name));
    e.target.value = "";
    if (selected.length === 0) return;
    void Promise.all(selected.map(async (file) => ({
      path: file.webkitRelativePath || file.name,
      content: await file.text(),
    }))).then(loadFromFiles).catch(() => {
      useSessionStore.setState({ error: t.header.readFileFailed(selected[0].name), doc: null, viewItems: [] });
    });
  };

  return (
    <header className="header">
      <div className="brand">
        <h1>{t.header.brand}</h1>
        <p>{t.header.tagline}</p>
      </div>
      <div className="toolbar">
        <div className="segmented" role="group" aria-label={t.header.modeGroupLabel}>
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={`seg-btn ${viewMode === m ? "active" : ""}`}
              onClick={() => setViewMode(m)}
              aria-pressed={viewMode === m}
            >
              {t.header.modes[m]}
            </button>
          ))}
        </div>

        <label className="btn file-btn">
          {t.header.loadFile}
          <input type="file" accept=".jsonl,.json,.txt" multiple onChange={onFiles} />
        </label>

        <label className="btn file-btn" title={t.header.loadFolderTitle}>
          {t.header.loadFolder}
          <input
            type="file"
            accept=".jsonl,.json,.txt"
            multiple
            onChange={onFiles}
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          />
        </label>

        <button className="btn" onClick={resetToSample} title={t.header.resetTitle}>
          {t.header.reset}
        </button>

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
            {t.header.annotateCount(
              annotationRunMode,
              annotationRunMode === "missing" ? Math.max(0, viewItemCount - cachedCount) : annotationRunMode === "failed" ? failedCount : viewItemCount,
            )}
          </button>
        </div>

        {restoredAnnotationCount > 0 && <span className="cache-status">{t.header.restored(restoredAnnotationCount)}</span>}

        {providerId !== "none" && hasAnnotations && (
          <button className="btn" onClick={clearAnnotations} title={t.header.clearAnnotationsTitle}>
            {t.header.clearAnnotations}
          </button>
        )}

        <div className="control">
          <button className="btn" onClick={prev} disabled={!hasDoc} title={t.header.prevTitle} aria-label={t.header.prevTitle}>
            ‹
          </button>
          <button className="btn primary" onClick={play} disabled={!hasDoc}>
            {isPlaying ? t.header.pause : t.header.replay}
          </button>
          <button className="btn" onClick={next} disabled={!hasDoc} title={t.header.nextTitle} aria-label={t.header.nextTitle}>
            ›
          </button>
        </div>

        <div className="control">
          <label htmlFor="hdr-provider">{t.header.providerLabel}</label>
          <select id="hdr-provider" value={providerId} onChange={(e) => setProvider(e.target.value as ProviderId)}>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {t.provider[p]}
              </option>
            ))}
          </select>
        </div>

        <div className="control">
          <label htmlFor="hdr-locale">{t.header.languageLabel}</label>
          <select id="hdr-locale" value={locale} onChange={(e) => setLocale(e.target.value as typeof locale)}>
            {LOCALE_ORDER.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NATIVE_NAME[l]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}
