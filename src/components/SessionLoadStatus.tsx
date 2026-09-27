import type { ReactNode } from "react";
import { useT } from "@/i18n";
import { useSessionStore } from "@/store/sessionStore";

const PHASES = ["reading", "parsing", "organizing", "validating", "ready"] as const;

export function SessionLoadStatus(): ReactNode {
  const t = useT();
  const progress = useSessionStore((state) => state.sessionLoadProgress);
  const notice = useSessionStore((state) => state.sessionLoadNotice);
  const cancel = useSessionStore((state) => state.cancelSessionLoad);
  const dismiss = useSessionStore((state) => state.dismissSessionLoadStatus);

  // R9：載入失敗不再由這裡呈現。fatal 有唯一的擁有者 (`error`) 與唯一的表面 (阻斷面)，
  // 進度條只負責進度——這是 RC-5「同一件事兩個擁有者、兩處顯示」的解法。
  if (!progress) {
    /*
     * 2026-09 UX 走查 F8：取消之後進度列整個消失，畫面上沒有任何交代——使用者不知道取消成功
     * 了沒，也不知道原本那份文件還在不在。它一直都在（那正是上面「載入期間保留目前文件」講的
     * 事），但那句話跟著進度條一起走了。這一行是同一個表面的收尾狀態：同一個位置、同一顆
     * 關閉鈕，只是不再有進度可報。
     */
    if (!notice) return null;
    return (
      <div className="session-load-status ready" role="status" aria-live="polite">
        <div className="session-load-copy">
          <strong>{t.sessionLoad.cancelled}</strong>
        </div>
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
