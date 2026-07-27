/**
 * 阻斷面元件的唯一開關實作 (DSM-3)。
 *
 * 每個彈窗以前都自己抄一份 showModal/close 的 useLayoutEffect。抄六份的代價不只是重複：
 * 只要有一份寫錯（Prism 就踩過——`<dialog open>` 讓 `if (!dialog.open) showModal()` 永遠
 * 為偽，於是 showModal 從未被呼叫、backdrop 從未被畫出、背景從未失效），那個表面就退化成
 * 一個普通的絕對定位元素，而所有 store 層測試依然全綠。
 *
 * 因此這裡集中三件事：
 *  1. 一律用 `showModal()`，永遠不寫靜態 `open` 屬性（那會讓元素離開 top layer）。
 *  2. 同一時間只有仲裁者選中的那一個會開；其餘自動排隊。
 *  3. Escape／backdrop 是否能關，由呼叫端傳進來的 policy 決定，不由元件自己決定。
 */
import { useLayoutEffect, type MouseEvent, type RefObject, type SyntheticEvent } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { selectActiveSurface, SURFACE_POLICY, type SurfaceId } from "@/core/surface/blockingSurface";
import { selectSurfaceWants } from "@/store/surfaceSelectors";

export interface BlockingSurfaceHandles {
  /** 這個表面現在是否真的該顯示。元件用它決定要不要渲染內容。 */
  isActive: boolean;
  /** 想開但被更高優先的表面壓著。 */
  isQueued: boolean;
  /** 直接掛到 <dialog> 上：處理 Escape 與 backdrop，行為由 policy 決定。 */
  dialogProps: {
    onCancel: (event: SyntheticEvent) => void;
    onClick: (event: MouseEvent<HTMLDialogElement>) => void;
  };
}

export function useBlockingSurface(
  id: SurfaceId,
  dialogRef: RefObject<HTMLDialogElement | null>,
  onDismiss: () => void,
): BlockingSurfaceHandles {
  const wants = useSessionStore(selectSurfaceWants);
  const active = selectActiveSurface(wants);
  const isActive = active === id;
  const policy = SURFACE_POLICY[id];

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isActive && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        // jsdom 沒有實作 showModal。這個後備只在測試環境生效，且**絕不**在真實瀏覽器裡
        // 預先寫上 open 屬性——預寫 open 會讓上面的 `!dialog.open` 永遠為偽，真正的
        // showModal 從此不再被呼叫，表面就悄悄退化成非模態。
        dialog.setAttribute("open", "");
        dialog.dataset.modalFallback = "true";
      }
    } else if (!isActive && dialog.open) {
      try {
        dialog.close();
      } catch {
        dialog.removeAttribute("open");
        delete dialog.dataset.modalFallback;
      }
    }
  }, [dialogRef, isActive]);

  return {
    isActive,
    isQueued: wants[id] && !isActive,
    dialogProps: {
      onCancel: (event) => {
        // 一律 preventDefault：原生關閉會直接改 DOM，繞過 store，讓「誰開著」再度變成兩個答案。
        event.preventDefault();
        if (policy === "escapable") onDismiss();
      },
      onClick: (event) => {
        if (policy !== "escapable") return;
        if (event.target === dialogRef.current) onDismiss();
      },
    },
  };
}
