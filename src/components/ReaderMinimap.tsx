import { useMemo, type ReactNode } from "react";
import { buildGlobalSessionMapProjection } from "@/core/view/sessionMap";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";

interface ReaderMinimapProps {
  visibleStart: number;
  visibleEnd: number;
}

export function ReaderMinimap({ visibleStart, visibleEnd }: ReaderMinimapProps): ReactNode {
  const t = useT();
  const doc = useSessionStore((state) => state.doc);
  const viewItems = useSessionStore((state) => state.viewItems);
  const activeId = useSessionStore((state) => state.activeId);
  const playingId = useSessionStore((state) => state.playingId);
  const minimapEnabled = useSessionStore((state) => state.minimapEnabled);
  const openMap = useSessionStore((state) => state.openMap);
  const selectedId = playingId ?? activeId;
  const projection = useMemo(
    () => doc ? buildGlobalSessionMapProjection(doc, viewItems, selectedId) : null,
    [doc, selectedId, viewItems],
  );

  if (!minimapEnabled || !projection || projection.targets.length === 0) return null;
  const width = 176;
  const height = 112;
  const trackLeft = 12;
  const trackWidth = width - trackLeft * 2;
  const denominator = Math.max(1, viewItems.length - 1);
  const currentIndex = Math.max(0, viewItems.findIndex((item) => item.id === selectedId));
  const currentX = trackLeft + (currentIndex / denominator) * trackWidth;
  const viewportX = trackLeft + (Math.max(0, visibleStart) / denominator) * trackWidth;
  const viewportEndX = trackLeft + (Math.max(visibleStart, visibleEnd) / denominator) * trackWidth;

  return (
    <button
      type="button"
      className="reader-minimap"
      aria-label={t.map.minimapLabel}
      aria-haspopup="dialog"
      aria-controls="session-map-dialog"
      onClick={openMap}
    >
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <path className="minimap-spine" d={`M ${trackLeft} 56 H ${width - trackLeft}`} />
        {projection.targets.map((target, index) => {
          const x = trackLeft + (index / Math.max(1, projection.targets.length - 1)) * trackWidth;
          return target.type === "landmark"
            ? <circle key={target.id} className="minimap-landmark" cx={x} cy="56" r="2.5" />
            : <rect key={target.id} className="minimap-cluster" x={x - 2.5} y="52" width="5" height="8" />;
        })}
        <rect
          className="minimap-viewport"
          x={viewportX}
          y="34"
          width={Math.max(4, viewportEndX - viewportX)}
          height="44"
        >
          <title>{t.map.viewport}</title>
        </rect>
        <circle className="minimap-current" cx={currentX} cy="56" r="5" />
      </svg>
      <span>{t.map.youAreHere}</span>
    </button>
  );
}
