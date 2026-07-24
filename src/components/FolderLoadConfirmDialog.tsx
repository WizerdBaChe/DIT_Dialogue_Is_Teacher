/** 資料夾載入數量/大小門檻確認彈窗：防止選到上層目錄 (如整包 .claude/projects/) 被無條件合併。
 *  結構沿用 ParseNoticeDialog 的 <dialog> 慣例，但這裡允許 Escape／backdrop 取消 (等同「取消，重新選擇」)。 */
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";

export function FolderLoadConfirmDialog(): ReactNode {
  const t = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const pending = useSessionStore((state) => state.pendingFolderLoad);
  const confirmPendingFolderLoad = useSessionStore((state) => state.confirmPendingFolderLoad);
  const cancelPendingFolderLoad = useSessionStore((state) => state.cancelPendingFolderLoad);

  const open = pending !== null;

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
    if (!open) return;
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const sizeMiB = pending ? (pending.totalBytes / 1024 / 1024).toFixed(1) : "0";

  return (
    <dialog
      ref={dialogRef}
      id="folder-load-confirm-dialog"
      className="folder-load-confirm-dialog"
      aria-labelledby="folder-load-confirm-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        cancelPendingFolderLoad();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) cancelPendingFolderLoad();
      }}
    >
      {pending && (
        <div className="folder-load-confirm-dialog-shell">
          <h2 id="folder-load-confirm-dialog-title" ref={titleRef} tabIndex={-1}>{t.folderGuard.title}</h2>
          <p>{t.folderGuard.body(pending.fileCount, sizeMiB)}</p>
          <p className="option-hint">{t.folderGuard.hint}</p>

          <div className="folder-load-confirm-dialog-actions">
            <button type="button" className="btn primary" onClick={cancelPendingFolderLoad}>
              {t.folderGuard.cancel}
            </button>
            <button type="button" className="btn" onClick={confirmPendingFolderLoad}>
              {t.folderGuard.proceed}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
