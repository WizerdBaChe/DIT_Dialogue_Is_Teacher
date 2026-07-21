import type { ReactNode } from "react";
import { useT } from "@/i18n";
import { useSessionStore } from "@/store/sessionStore";

const PHASES = ["reading", "parsing", "organizing", "validating", "ready"] as const;

export function SessionLoadStatus(): ReactNode {
  const t = useT();
  const progress = useSessionStore((state) => state.sessionLoadProgress);
  const error = useSessionStore((state) => state.sessionLoadError);
  const cancel = useSessionStore((state) => state.cancelSessionLoad);
  const dismiss = useSessionStore((state) => state.dismissSessionLoadStatus);

  if (!progress) {
    if (!error) return null;
    return (
      <div className="session-load-status error" role="alert">
        <span>{error}</span>
        <button type="button" className="btn" onClick={dismiss}>{t.sessionLoad.dismiss}</button>
      </div>
    );
  }

  const percent = progress.totalBytes > 0
    ? Math.min(100, Math.round((progress.loadedBytes / progress.totalBytes) * 100))
    : progress.phase === "ready" ? 100 : 0;
  const loadedMiB = (progress.loadedBytes / 1024 / 1024).toFixed(1);
  const phaseLabel = t.sessionLoad.phases[progress.phase] ?? progress.phase;
  const ready = progress.phase === "ready";

  return (
    <div className={`session-load-status ${ready ? "ready" : ""}`} role="status" aria-live="polite">
      <div className="session-load-copy">
        <strong>{t.sessionLoad.progress(phaseLabel, percent, loadedMiB, progress.lineCount)}</strong>
        {!ready && <span>{t.sessionLoad.previousPreserved}</span>}
        <div className="session-load-phases" aria-label={phaseLabel}>
          {PHASES.map((phase, index) => {
            const currentIndex = PHASES.indexOf(progress.phase);
            const state = index === currentIndex ? "current" : index < currentIndex ? "complete" : "pending";
            return <span key={phase} className={state}>{t.sessionLoad.phases[phase]}</span>;
          })}
        </div>
      </div>
      <div className="session-load-bar" aria-hidden="true">
        <div style={{ width: `${percent}%` }} />
      </div>
      <button type="button" className="btn" onClick={ready ? dismiss : cancel}>
        {ready ? t.sessionLoad.dismiss : t.sessionLoad.cancel}
      </button>
    </div>
  );
}
