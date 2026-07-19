import { useEffect, useRef, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { Sidebar } from "./Sidebar";

type FocusDestination = "trigger" | "reader" | "workspace";

export function StructureDrawer(): ReactNode {
  const open = useSessionStore((state) => state.structureDrawerOpen);
  const closeStructureDrawer = useSessionStore((state) => state.closeStructureDrawer);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusDestination = useRef<FocusDestination>("trigger");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
        dialog.dataset.modalFallback = "true";
      }
      window.requestAnimationFrame(() => titleRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 720px)");
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      if (!event.matches || !useSessionStore.getState().structureDrawerOpen) return;
      focusDestination.current = "workspace";
      closeStructureDrawer();
    };
    handleChange(media);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [closeStructureDrawer]);

  const restoreFocus = () => {
    if (useSessionStore.getState().privacyReview) return;
    const destination = focusDestination.current;
    focusDestination.current = "trigger";
    window.requestAnimationFrame(() => {
      if (destination === "reader") {
        document.getElementById("workspace-panel-reader")?.focus();
        return;
      }
      const trigger = document.getElementById("structure-drawer-trigger");
      if (destination === "trigger" && trigger?.getClientRects().length) {
        trigger.focus();
        return;
      }
      const primaryView = useSessionStore.getState().primaryView;
      document.getElementById(`workspace-tab-${primaryView}`)?.focus();
    });
  };

  return (
    <dialog
      ref={dialogRef}
      id="structure-drawer"
      className="structure-drawer"
      aria-labelledby="structure-drawer-title"
      onCancel={(event) => {
        event.preventDefault();
        focusDestination.current = "trigger";
        closeStructureDrawer();
      }}
      onClose={() => {
        if (useSessionStore.getState().structureDrawerOpen) closeStructureDrawer();
        restoreFocus();
      }}
    >
      <Sidebar
        variant="drawer"
        titleId="structure-drawer-title"
        titleRef={titleRef}
        onItemSelect={() => {
          focusDestination.current = "reader";
        }}
      />
    </dialog>
  );
}
