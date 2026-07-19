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
  const landmarkPath: string[] = [];
  const clusterPath: string[] = [];

  projection.targets.forEach((target, index) => {
    const x = trackLeft + (index / Math.max(1, projection.targets.length - 1)) * trackWidth;
    if (target.type === "landmark") {
      landmarkPath.push(`M ${x - 2.5} 56 a 2.5 2.5 0 1 0 5 0 a 2.5 2.5 0 1 0 -5 0`);
    } else {
      clusterPath.push(`M ${x - 2.5} 52 h 5 v 8 h -5 z`);
    }
  });

  const minimapSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`,
    `<path d="M ${trackLeft} 56 H ${width - trackLeft}" fill="none" stroke="#c3bcab" stroke-width="1.5"/>`,
    `<path d="${landmarkPath.join(" ")}" fill="#4f4a41"/>`,
    `<path d="${clusterPath.join(" ")}" fill="#8a6a2f" fill-opacity=".72"/>`,
    `<rect x="${viewportX}" y="34" width="${Math.max(4, viewportEndX - viewportX)}" height="44" fill="rgba(124,33,40,.08)" stroke="#8a6a2f"/>`,
    `<circle cx="${currentX}" cy="56" r="5" fill="#7c2128" stroke="#eee8dd" stroke-width="2"/>`,
    "</svg>",
  ].join("");

  return (
    <button
      type="button"
      className="reader-minimap"
      aria-label={t.map.minimapLabel}
      aria-haspopup="dialog"
      aria-controls="session-map-dialog"
      data-label={t.map.youAreHere}
      style={{ backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(minimapSvg)}")` }}
      onClick={openMap}
    />
  );
}
