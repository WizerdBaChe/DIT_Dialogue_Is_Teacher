/**
 * 認知學習模式：魚骨橫向蒸餾視圖。
 * 主線 (spine) 橫向延伸；支線 (rib) 掛在節點下；有講解時於節點上方顯示「可帶走的觀念」。
 * 點任一主線節點或支線 → 切回閱讀工作區並定位同一 ViewItem。
 * 種類差異靠文字標籤 + 邊框配色辨識 (ADR-016：不用 emoji)。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSessionStore } from "@/store/sessionStore";
import { useT, type Messages } from "@/i18n";
import { buildFishbone, type FishboneStation } from "@/core/view/fishbone";
import { SKELETON_NODE_CLS, SKELETON_RIB_CLS } from "./labels";

function Station({
  station,
  activeId,
  playingId,
  lesson,
  ribsSelected,
  onOpen,
  onShowRibs,
  t,
}: {
  station: FishboneStation;
  activeId: string | null;
  playingId: string | null;
  lesson?: string;
  ribsSelected: boolean;
  onOpen: (id: string) => void;
  onShowRibs: () => void;
  t: Messages;
}): ReactNode {
  const kindLabel = t.skeletonNode[station.kind];
  const isActive = activeId === station.viewItemId;
  const isPlaying = playingId === station.viewItemId;

  return (
    <div className={`fb-station ${ribsSelected ? "ribs-selected" : ""}`} role="listitem">
      <div className="fb-concept">
        {lesson && (
          <div className="fb-lesson" title={lesson}>
            {t.fishbone.lessonPrefix}
            {lesson}
          </div>
        )}
      </div>

      <button
        type="button"
        className={`fb-node ${SKELETON_NODE_CLS[station.kind]} ${isPlaying ? "playing" : isActive ? "active" : ""}`}
        onClick={() => onOpen(station.viewItemId)}
        aria-pressed={isActive}
        aria-label={t.fishbone.nodeAria(kindLabel, station.label)}
      >
        <span className="fb-pill">
          <span className="fb-kind">{kindLabel}</span>
        </span>
        <span className="fb-label">{station.label}</span>
      </button>

      {station.ribs.length > 0 && (
        <button
          type="button"
          className="fb-rib-trigger"
          aria-pressed={ribsSelected}
          aria-label={t.fishbone.showRibs(station.label, station.ribs.length)}
          onClick={onShowRibs}
        >
          {t.fishbone.ribCount(station.ribs.length)}
        </button>
      )}
    </div>
  );
}

export function FishboneView(): ReactNode {
  const t = useT();
  const doc = useSessionStore((s) => s.doc);
  const viewItems = useSessionStore((s) => s.viewItems);
  const activeId = useSessionStore((s) => s.activeId);
  const playingId = useSessionStore((s) => s.playingId);
  const setActive = useSessionStore((s) => s.setActive);
  const annotations = useSessionStore((s) => s.annotations);
  const ribScrollRef = useRef<HTMLDivElement>(null);

  const stations = useMemo(() => (doc ? buildFishbone(doc, viewItems) : []), [doc, viewItems]);
  const initialStationIndex = useMemo(() => {
    const index = stations.findIndex((station) => station.viewItemId === activeId || station.ribs.some((rib) => rib.viewItemId === activeId));
    return index >= 0 ? index : Math.max(0, stations.findIndex((station) => station.ribs.length > 0));
  }, [activeId, stations]);
  const [selectedStationIndex, setSelectedStationIndex] = useState(initialStationIndex);
  const selectedStation = stations[selectedStationIndex] ?? stations[0];
  const ribVirtualizer = useVirtualizer({
    count: selectedStation?.ribs.length ?? 0,
    getScrollElement: () => ribScrollRef.current,
    estimateSize: () => 38,
    overscan: 8,
    getItemKey: (index) => `${selectedStation?.ribs[index]?.viewItemId ?? "rib"}-${index}`,
  });

  useEffect(() => {
    if (selectedStationIndex >= stations.length) setSelectedStationIndex(0);
  }, [selectedStationIndex, stations.length]);

  useEffect(() => {
    ribScrollRef.current?.scrollTo({ top: 0 });
  }, [selectedStationIndex]);

  if (!doc) return null;

  if (!doc.skeleton || stations.length === 0) {
    return (
      <main className="main-content">
        <div className="empty-state">
          <h2>{t.fishbone.noSpineTitle}</h2>
          <p>{t.fishbone.noSpineBody}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="main-content cognitive">
      <div className="cog-intro">
        <h2 className="cog-title">{t.fishbone.spineTitle(doc.spans.length, stations.length)}</h2>
        <div className="cog-legend">
          <span className="lg lg-objective">{t.skeletonNode.objective}</span>
          <span className="lg lg-decision">{t.skeletonNode.decision}</span>
          <span className="lg lg-outcome">{t.skeletonNode.outcome}</span>
          <span className="sep">{t.fishbone.legendRibsSep}</span>
          <span className="lg lg-investigation">{t.skeletonRib.investigation}</span>
          <span className="lg lg-error">{t.skeletonRib.error}</span>
          <span className="lg lg-retry">{t.skeletonRib.retry}</span>
          <span className="lg lg-edit">{t.skeletonRib["edit-loop"]}</span>
        </div>
      </div>

      <div className="fishbone" role="region" aria-label={t.fishbone.regionLabel}>
        <div className="fb-track" role="list">
          <div className="fb-spine" aria-hidden="true" />
          {stations.map((st) => (
            <Station
              key={st.viewItemId}
              station={st}
              activeId={activeId}
              playingId={playingId}
              lesson={annotations[st.viewItemId]?.generalLesson}
              ribsSelected={selectedStationIndex === stations.indexOf(st)}
              onOpen={setActive}
              onShowRibs={() => setSelectedStationIndex(stations.indexOf(st))}
              t={t}
            />
          ))}
        </div>
      </div>

      {selectedStation && (
        <section className="fb-rib-panel" aria-label={t.fishbone.ribsFor(selectedStation.label)}>
          <div className="fb-rib-panel-head">
            <div>
              <span className="eyebrow">{t.fishbone.selectedStation}</span>
              <h3>{selectedStation.label}</h3>
            </div>
            <span>{t.fishbone.ribCount(selectedStation.ribs.length)}</span>
          </div>
          {selectedStation.ribs.length > 0 ? (
            <div ref={ribScrollRef} className="fb-rib-scroll" data-testid="fishbone-rib-virtual-scroll">
              <div className="virtual-list-space" style={{ height: ribVirtualizer.getTotalSize() }}>
                {ribVirtualizer.getVirtualItems().map((virtualItem) => {
                  const rib = selectedStation.ribs[virtualItem.index];
                  return (
                    <button
                      key={`${rib.viewItemId}-${virtualItem.index}`}
                      type="button"
                      className={`fb-rib-row ${SKELETON_RIB_CLS[rib.kind]} ${activeId === rib.viewItemId ? "active" : ""}`}
                      data-index={virtualItem.index}
                      style={{ transform: `translateY(${virtualItem.start}px)` }}
                      onClick={() => setActive(rib.viewItemId)}
                    >
                      <span className="fb-rib-kind">{t.skeletonRib[rib.kind]}</span>
                      <span className="fb-rib-label">{rib.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="empty-state compact-empty"><p>{t.fishbone.noRibs}</p></div>
          )}
        </section>
      )}
    </main>
  );
}
