import { useEffect, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";
import { shouldHandleMapShortcut } from "@/core/view/mapShortcut";

export function MapLauncher(): ReactNode {
  const t = useT();
  const doc = useSessionStore((state) => state.doc);
  const hasDoc = Boolean(doc);
  const mapOpen = useSessionStore((state) => state.mapOpen);
  const primaryView = useSessionStore((state) => state.primaryView);
  const minimapEnabled = useSessionStore((state) => state.minimapEnabled);
  const mapShortcutEnabled = useSessionStore((state) => state.mapShortcutEnabled);
  const privacyReviewOpen = useSessionStore((state) => Boolean(state.privacyReview));
  const structureDrawerOpen = useSessionStore((state) => state.structureDrawerOpen);
  const openMap = useSessionStore((state) => state.openMap);
  const closeMap = useSessionStore((state) => state.closeMap);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const otherBlockingModalOpen = Boolean(document.querySelector(
        'dialog[open]:not(#session-map-dialog)',
      ));
      if (!shouldHandleMapShortcut(event, {
        mapShortcutEnabled,
        hasDocument: hasDoc,
        privacyReviewOpen,
        structureDrawerOpen,
        otherBlockingModalOpen,
      })) return;
      event.preventDefault();
      if (mapOpen) closeMap();
      else openMap();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeMap, hasDoc, mapOpen, mapShortcutEnabled, openMap, privacyReviewOpen, structureDrawerOpen]);

  if (!hasDoc || mapOpen) return null;
  const readerMinimapAvailable = primaryView === "reader" && minimapEnabled && Boolean(doc?.skeleton?.nodes.length);

  return (
    <button
      id="map-launcher"
      type="button"
      className={`btn map-launcher ${readerMinimapAvailable ? "map-launcher-narrow-only" : ""}`}
      aria-haspopup="dialog"
      aria-controls="session-map-dialog"
      onClick={openMap}
    >
      {t.map.open}
    </button>
  );
}
