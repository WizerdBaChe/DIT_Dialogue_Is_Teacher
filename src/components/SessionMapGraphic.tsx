import type { ReactNode } from "react";
import {
  buildSessionMapGraphicLayout,
  isSpineTarget,
  resolveCurrentSpineTargetId,
  type MapLandmark,
  type SessionMapProjection,
  type SessionMapTarget,
} from "@/core/view/sessionMap";
import { useT } from "@/i18n";
import { landmarkKindLabel, mapTargetOrdinal } from "./labels";

interface SessionMapGraphicProps {
  projection: SessionMapProjection;
  currentViewItemId: string | null;
  selectedId: string | null;
  onSelect: (target: SessionMapTarget) => void;
}

function targetShape(target: SessionMapTarget): ReactNode {
  if (target.type === "cluster") return <rect className="map-shape" x="-48" y="-24" width="96" height="48" rx="3" />;
  if (target.kind === "decision") return <path className="map-shape" d="M 0 -30 L 48 0 L 0 30 L -48 0 Z" />;
  if (target.kind === "milestone") return <path className="map-shape" d="M -38 -26 H 38 L 52 0 L 38 26 H -38 L -52 0 Z" />;
  if (target.kind === "outcome") return <rect className="map-shape" x="-52" y="-26" width="104" height="52" rx="26" />;
  if (target.kind === "subagent") return <path className="map-shape" d="M -48 -24 H 32 L 48 -8 V 24 H -32 L -48 8 Z" />;
  return <rect className="map-shape" x="-52" y="-26" width="104" height="52" rx="3" />;
}

export function SessionMapGraphic({
  projection,
  currentViewItemId,
  selectedId,
  onSelect,
}: SessionMapGraphicProps): ReactNode {
  const t = useT();
  if (projection.targets.length === 0) return null;
  // 三個層級一致：圖形只畫主線 (站 + 子代理)，支線與支線群組只出現在地標清單。
  const graphicTargets = projection.targets.filter(isSpineTarget);
  const currentTargetId = resolveCurrentSpineTargetId(projection, currentViewItemId);
  const layout = buildSessionMapGraphicLayout(graphicTargets.length);
  const ribKinds = ["investigation", "error", "retry", "edit-loop"] as const;
  const stationTargets = graphicTargets.map((target, index) => ({ target, x: layout.xPositions[index] }))
    .filter((entry): entry is { target: MapLandmark; x: number } => entry.target.type === "landmark" && entry.target.parentStationId === null);
  const branchTrunks = stationTargets
    .filter(({ target }) => target.ribCount > 0)
    .map(({ x }) => `M ${x} ${layout.nodeY - 28} V ${layout.nodeY - 88}`)
    .join(" ");
  const branchCues = ribKinds.map((kind, kindIndex) => {
    const y = layout.nodeY - 42 - kindIndex * 14;
    const entries = stationTargets.filter(({ target }) => (target.ribKindCounts[kind] ?? 0) > 0);
    const path = entries.map(({ x }) => {
      if (kind === "investigation") return `M ${x - 12} ${y} H ${x + 12}`;
      if (kind === "error") return `M ${x} ${y - 7} L ${x + 7} ${y + 6} H ${x - 7} Z`;
      if (kind === "retry") return `M ${x - 7} ${y} A 7 7 0 1 0 ${x + 7} ${y} A 7 7 0 1 0 ${x - 7} ${y}`;
      return `M ${x} ${y - 7} L ${x + 7} ${y} L ${x} ${y + 7} L ${x - 7} ${y} Z`;
    }).join(" ");
    return path ? <path key={kind} className={`map-rib-cue map-rib-${kind}`} d={path} /> : null;
  });

  return (
    <svg
      className="session-map-graphic"
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      aria-hidden="true"
    >
      {layout.spineStart !== layout.spineEnd && (
        <path className="map-spine" d={`M ${layout.spineStart} ${layout.nodeY} H ${layout.spineEnd}`} />
      )}
      {branchTrunks && <path className="map-rib-trunks" d={branchTrunks} />}
      {branchCues}
      {graphicTargets.map((target, index) => {
        const x = layout.xPositions[index];
        // 閱讀位置：全圖唯一，只跟隨 playingId/activeId。
        const current = target.id === currentTargetId;
        // 取景中心：投影裁切的基準站。全局層沒有裁切，畫它只會多一種讓人誤讀的框。
        const focus = projection.level !== "global"
          && projection.focusResolved
          && !current
          && target.type === "landmark"
          && target.parentStationId === null
          && target.stationIndex === projection.focusStationIndex;
        const selected = target.id === selectedId || (target.type === "landmark" && target.viewItemId === selectedId);
        return (
          <g
            key={target.id}
            data-target-id={target.id}
            className={`map-target map-${target.type} ${target.type === "landmark" ? `map-kind-${target.kind}` : ""} ${current ? "current" : ""} ${focus ? "focus" : ""} ${selected ? "selected" : ""}`}
            transform={`translate(${x} ${layout.nodeY})`}
            onClick={() => onSelect(target)}
          >
            {targetShape(target)}
            <text y="52" textAnchor="middle">
              {target.type === "cluster"
                ? `${mapTargetOrdinal(target)} · ${target.count}`
                : [
                  `${mapTargetOrdinal(target)} · ${landmarkKindLabel(t, target)}`,
                  ...(target.ribCount > 0 ? [t.map.branchCount(target.ribCount)] : []),
                  ...(target.subagentCount > 0 ? [t.map.subagentCount(target.subagentCount)] : []),
                ].join(" · ")}
            </text>
            {focus && <rect className="map-focus-ring" x="-60" y="-34" width="120" height="68" rx="6" />}
            {current && <rect className="map-current-ring" x="-60" y="-34" width="120" height="68" rx="6" />}
            {/* 標籤放節點下方：上方 nodeY-42 起是支線記號區，擺上去會互相蓋住。 */}
            {current && <text className="map-you-are-here-tag" y="72" textAnchor="middle">{t.map.youAreHere}</text>}
          </g>
        );
      })}
    </svg>
  );
}
