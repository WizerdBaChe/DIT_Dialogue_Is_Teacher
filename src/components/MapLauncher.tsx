import type { ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";

export function MapLauncher(): ReactNode {
  const t = useT();
  const hasDoc = useSessionStore((state) => Boolean(state.doc));
  const mapOpen = useSessionStore((state) => state.mapOpen);
  const openMap = useSessionStore((state) => state.openMap);

  if (!hasDoc || mapOpen) return null;

  return (
    <button
      id="map-launcher"
      type="button"
      className="btn map-launcher"
      aria-haspopup="dialog"
      aria-controls="session-map-dialog"
      onClick={openMap}
    >
      {t.map.open}
    </button>
  );
}
