import type { ReactNode } from "react";
import type { SessionMapProjection, SessionMapTarget } from "@/core/view/sessionMap";

interface SessionMapGraphicProps {
  projection: SessionMapProjection;
  currentViewItemId: string | null;
  selectedId: string | null;
  onSelect: (target: SessionMapTarget) => void;
}

export function SessionMapGraphic({
  projection,
  currentViewItemId,
  selectedId,
  onSelect,
}: SessionMapGraphicProps): ReactNode {
  if (projection.targets.length === 0) return null;
  const graphicTargets = projection.level === "detail"
    ? projection.targets.filter((target) => target.type === "cluster" || target.parentStationId === null)
    : projection.targets;
  const width = Math.max(640, graphicTargets.length * 88 + 80);
  const y = 110;

  return (
    <svg className="session-map-graphic" viewBox={`0 0 ${width} 220`} aria-hidden="true">
      <path className="map-spine" d={`M 40 ${y} H ${width - 40}`} />
      {graphicTargets.map((target, index) => {
        const x = 60 + index * 88;
        const current = target.type === "landmark" && (
          target.viewItemId === currentViewItemId
          || (target.parentStationId === null && target.stationIndex === projection.focusStationIndex)
        );
        const selected = target.id === selectedId || (target.type === "landmark" && target.viewItemId === selectedId);
        return (
          <g
            key={target.id}
            className={`map-target map-${target.type} ${current ? "current" : ""} ${selected ? "selected" : ""}`}
            transform={`translate(${x} ${y})`}
            onClick={() => onSelect(target)}
          >
            {target.type === "landmark" ? <circle r="12" /> : <rect x="-18" y="-12" width="36" height="24" />}
            <text y="34" textAnchor="middle">{target.type === "cluster" ? target.count : index + 1}</text>
            {current && <circle className="map-current-ring" r="18" />}
          </g>
        );
      })}
    </svg>
  );
}
