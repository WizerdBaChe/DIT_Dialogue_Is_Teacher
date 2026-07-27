/**
 * Fatal 阻斷面：載入完全失敗、或解析出的內容不足以呈現時，強制使用者看過一次才能繼續。
 * 需按確認才能關閉——不接受 Escape／backdrop 點擊繞過。
 *
 * R9 (RC-3)：在此之前，**任何一條** parse warning 都會開這個彈窗，於是一份含 2 行
 * `stop_hook_summary` 的正常對話也被攔下來。現在只有 `tier === "fatal"` 才開；info/warn
 * 走 MainView 的非阻斷橫幅。文案一律來自 `i18n/diagnosticCopy.ts`，永遠不顯示原始例外訊息。
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useBlockingSurface } from "./useBlockingSurface";
import { useDiagnosticCopy, useT } from "@/i18n";
import { noticeable } from "@/core/diagnostics/contracts";

export function ParseNoticeDialog(): ReactNode {
  const t = useT();
  const copy = useDiagnosticCopy();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const diagnostics = useSessionStore((state) => state.diagnostics);
  const error = useSessionStore((state) => state.error);
  const acknowledgeParseNotice = useSessionStore((state) => state.acknowledgeParseNotice);
  // policy 是 action-only，onDismiss 不會被 Escape/backdrop 觸發；傳它只是為了介面完整。
  const surface = useBlockingSurface("fatal-notice", dialogRef, acknowledgeParseNotice);

  // 兩個來源同一件事：批次層丟出的 fatal 走 `error`，文件層自帶的 fatal 走 diagnostics。
  const fatal = error ?? diagnostics.find((d) => d.tier === "fatal") ?? null;
  const others = noticeable(diagnostics).filter((d) => d !== fatal);
  const fatalCopy = fatal ? copy.fatal(fatal) : null;

  useLayoutEffect(() => {
    if (!surface.isActive) {
      setDetailsOpen(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [surface.isActive]);

  return (
    <dialog
      ref={dialogRef}
      id="parse-notice-dialog"
      className="parse-notice-dialog"
      aria-labelledby="parse-notice-dialog-title"
      // policy = action-only：Escape／backdrop 點擊都不能關掉，只有確認按鈕才算看過。
      {...surface.dialogProps}
    >
      {surface.isActive && fatalCopy && (
        <div className="parse-notice-dialog-shell">
          <h2 id="parse-notice-dialog-title" ref={titleRef} tabIndex={-1}>{fatalCopy.title}</h2>
          <p className="parse-notice-body">{fatalCopy.body}</p>
          {others.length > 0 && <p className="parse-notice-count">{t.parseNotice.count(others.length)}</p>}

          {others.length > 0 && (
            <button
              type="button"
              className="btn parse-notice-details-toggle"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((current) => !current)}
            >
              {detailsOpen ? t.parseNotice.detailsHide : t.parseNotice.detailsToggle}
            </button>
          )}
          {detailsOpen && (
            <ul className="parse-notice-details">
              {others.map((diagnostic, index) => <li key={index}>{copy.line(diagnostic)}</li>)}
            </ul>
          )}

          <div className="parse-notice-actions">
            <button type="button" className="btn primary" onClick={acknowledgeParseNotice}>
              {t.parseNotice.confirm}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
