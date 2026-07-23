/** 強制解析提示彈窗：session 帶有解析降級提示時彈出，白話說明「這不是 bug」，
 *  需按確認才能關閉——不接受 Escape／backdrop 點擊繞過，設計上就是要讓使用者先看過一次。
 *  結構沿用 SettingsDialog 的既有 <dialog> 慣例（showModal + focus 管理 + 非原生環境的 fallback）。 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";

export function ParseNoticeDialog(): ReactNode {
  const t = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const warnings = useSessionStore((state) => state.warnings);
  const acknowledged = useSessionStore((state) => state.parseNoticeAcknowledged);
  const acknowledgeParseNotice = useSessionStore((state) => state.acknowledgeParseNotice);

  const open = warnings.length > 0 && !acknowledged;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
        dialog.dataset.modalFallback = "true";
      }
    } else if (!open && dialog.open) {
      try {
        dialog.close();
      } catch {
        dialog.removeAttribute("open");
        delete dialog.dataset.modalFallback;
      }
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setDetailsOpen(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      id="parse-notice-dialog"
      className="parse-notice-dialog"
      aria-labelledby="parse-notice-dialog-title"
      // 刻意不接：Escape／backdrop 點擊都不能關掉，只有按下面的確認按鈕才算看過。
      onCancel={(event) => event.preventDefault()}
    >
      {open && (
        <div className="parse-notice-dialog-shell">
          <h2 id="parse-notice-dialog-title" ref={titleRef} tabIndex={-1}>{t.parseNotice.title}</h2>
          <p className="parse-notice-body">{t.parseNotice.body}</p>
          <p className="parse-notice-count">{t.parseNotice.count(warnings.length)}</p>

          <button
            type="button"
            className="btn parse-notice-details-toggle"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((current) => !current)}
          >
            {detailsOpen ? t.parseNotice.detailsHide : t.parseNotice.detailsToggle}
          </button>
          {detailsOpen && (
            <ul className="parse-notice-details">
              {warnings.map((warning, index) => <li key={index}>{warning}</li>)}
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
