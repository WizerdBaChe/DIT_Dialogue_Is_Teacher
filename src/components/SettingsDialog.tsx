/** 設定對話框 (取代原本內嵌於 header 下方的 settings tray)。結構仿 SessionMapDialog 的既有慣例：
 *  原生 <dialog>、showModal/close 由 store 的 settingsOpen 驅動、Escape 關閉、開啟時 focus 標題、
 *  關閉時 focus 還給觸發按鈕。詳見 docs/rounds/r7-multi-source-and-layout/DESIGN_R7_SETTINGS_DIALOG_v0.1.md。 */
import { useLayoutEffect, useEffect, useRef, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import type { ProviderId } from "@/types/spanTree";
import { useT, useLocale, LOCALE_ORDER, LOCALE_NATIVE_NAME } from "@/i18n";
import { Disclaimer } from "./Disclaimer";
import { OllamaPanel } from "./OllamaPanel";
import { CloudPanel } from "./CloudPanel";
import { SessionLoadActions } from "./SessionLoadActions";
import { ExportControls } from "./ExportControls";

const PROVIDERS: ProviderId[] = ["none", "ollama", "cloud"];

export function SettingsDialog(): ReactNode {
  const t = useT();
  const [locale, setLocale] = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const settingsOpen = useSessionStore((state) => state.settingsOpen);
  const hasDoc = useSessionStore((state) => Boolean(state.doc));
  const providerId = useSessionStore((state) => state.providerId);
  const showAnnotations = useSessionStore((state) => state.showAnnotations);
  const hasAnnotations = useSessionStore((state) => Object.keys(state.annotations).length > 0);
  const viewItemCount = useSessionStore((state) => state.viewItems.length);
  const cachedCount = useSessionStore((state) => Object.keys(state.cachedForCurrentConfig).length);
  const failedCount = useSessionStore((state) => Object.keys(state.annotationErrors).length);
  const annotationRunMode = useSessionStore((state) => state.annotationRunMode);
  const cachedAnnotationCount = useSessionStore((state) => state.cachedAnnotationCount);
  const minimapEnabled = useSessionStore((state) => state.minimapEnabled);
  const mapShortcutEnabled = useSessionStore((state) => state.mapShortcutEnabled);
  const snapshotMode = useSessionStore((state) => state.snapshotMode);

  const setProvider = useSessionStore((state) => state.setProvider);
  const toggleAnnotations = useSessionStore((state) => state.toggleAnnotations);
  const annotateAll = useSessionStore((state) => state.annotateAll);
  const setAnnotationRunMode = useSessionStore((state) => state.setAnnotationRunMode);
  const clearAnnotations = useSessionStore((state) => state.clearAnnotations);
  const resetToSample = useSessionStore((state) => state.resetToSample);
  const closeSettings = useSessionStore((state) => state.closeSettings);
  const setMinimapEnabled = useSessionStore((state) => state.setMinimapEnabled);
  const setMapShortcutEnabled = useSessionStore((state) => state.setMapShortcutEnabled);

  const annotationCount = annotationRunMode === "missing"
    ? Math.max(0, viewItemCount - cachedCount)
    : annotationRunMode === "failed"
      ? failedCount
      : viewItemCount;

  /** 跟 SessionMapDialog 同理：<dialog> 未開啟時 display:none，必須在 layout 階段先開，內容才量得到高度。
   *  focus 還原直接掛在這個 effect 的關閉分支，不依賴 <dialog> 的原生 'close' 事件觸發 onClose——
   *  實測發現該事件在部分瀏覽器環境下不會同步 (甚至不會) 觸發，等它來會讓 focus 還原整個失效。 */
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (settingsOpen && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
        dialog.dataset.modalFallback = "true";
      }
    } else if (!settingsOpen && dialog.open) {
      try {
        dialog.close();
      } catch {
        dialog.removeAttribute("open");
        delete dialog.dataset.modalFallback;
      }
      window.requestAnimationFrame(() => {
        document.getElementById("settings-toggle-btn")?.focus();
      });
    }
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [settingsOpen]);

  return (
    <dialog
      ref={dialogRef}
      id="settings-dialog"
      className="settings-dialog"
      aria-labelledby="settings-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        closeSettings();
      }}
      onClose={() => {
        if (useSessionStore.getState().settingsOpen) closeSettings();
      }}
      onClick={(event) => {
        // 點擊 backdrop 時，原生 <dialog> 的 click 事件 target 就是 dialog 元素本身
        // （backdrop 不是可命中的子節點）；點在 shell 內容上的 target 永遠是某個子元素。
        if (event.target === dialogRef.current) closeSettings();
      }}
    >
      {settingsOpen && (
        <div className="settings-dialog-shell">
          <header className="settings-dialog-header">
            <h2 id="settings-dialog-title" ref={titleRef} tabIndex={-1}>{t.settings.dialogTitle}</h2>
            <button type="button" className="btn settings-dialog-close" onClick={closeSettings} aria-label={t.settings.closeDialog}>
              ✕
            </button>
          </header>

          <div className="settings-dialog-body">
            {!snapshotMode && (
              <fieldset className="settings-panel-group">
                <legend>{t.settings.sessionGroup}</legend>
                <div className="settings-actions">
                  <SessionLoadActions />
                  <button className="btn" onClick={resetToSample} title={t.header.resetTitle}>{t.header.reset}</button>
                </div>
              </fieldset>
            )}

            {!snapshotMode && (
              <fieldset className="settings-panel-group">
                <legend>{t.settings.teachingGroup}</legend>
                <div className="settings-actions rows">
                  <label htmlFor="hdr-provider">{t.header.providerLabel}</label>
                  <select id="hdr-provider" value={providerId} onChange={(event) => setProvider(event.target.value as ProviderId)}>
                    {PROVIDERS.map((provider) => <option key={provider} value={provider}>{t.provider[provider]}</option>)}
                  </select>

                  <span className="row-span">
                    <label className="toggle">
                      <input type="checkbox" checked={showAnnotations} onChange={toggleAnnotations} disabled={providerId === "none"} />
                      {t.header.showAnnotations}
                    </label>
                  </span>

                  <span>{t.header.annotateModeLabel}</span>
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
                  <p className="row-span option-hint">{t.settings.batchModeHint}</p>

                  <span className="row-span cache-row">
                    <span className="cache-status">{t.header.cachedAnnotationCount(cachedAnnotationCount)}</span>
                    {providerId !== "none" && hasAnnotations && (
                      <button className="btn" onClick={clearAnnotations} title={t.header.clearAnnotationsTitle}>{t.header.clearAnnotations}</button>
                    )}
                  </span>
                  <p className="row-span option-hint">{t.settings.cacheClearHint}</p>
                </div>
              </fieldset>
            )}

            {/* 選了本地 AI／雲端 AI 後要調的參數面板，緊接在觸發它們的卡片下方，
                不必捲到最下面才找得到（使用者回報 R7.5 追加發現）。 */}
            {!snapshotMode && (
              <>
                <Disclaimer />
                <OllamaPanel />
                <CloudPanel />
              </>
            )}

            <fieldset className="settings-panel-group">
              <legend>{t.settings.languageGroup}</legend>
              <div className="settings-actions">
                <select id="hdr-locale" aria-label={t.header.languageLabel} value={locale} onChange={(event) => setLocale(event.target.value as typeof locale)}>
                  {LOCALE_ORDER.map((language) => <option key={language} value={language}>{LOCALE_NATIVE_NAME[language]}</option>)}
                </select>
              </div>
            </fieldset>

            <fieldset className="settings-panel-group">
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
              <p className="option-hint">{t.settings.mapShortcutHint}</p>
            </fieldset>

            {!snapshotMode && <ExportControls />}
          </div>
        </div>
      )}
    </dialog>
  );
}
