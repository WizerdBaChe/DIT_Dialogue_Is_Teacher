import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  MAX_MOUNTED_DETAIL_RIBS,
  buildSessionMapProjection,
  canJumpToMapTarget,
  type MapLandmark,
  type MapZoomLevel,
  type SessionMapTarget,
} from "@/core/view/sessionMap";
import { selectCurrentPosition, useSessionStore } from "@/store/sessionStore";
import { useT, type Messages } from "@/i18n";
import { SessionMapGraphic } from "./SessionMapGraphic";

function landmarkKindLabel(t: Messages, landmark: MapLandmark): string {
  if (landmark.kind === "subagent") return t.workspace.tabs.subagents;
  if (landmark.kind === "objective" || landmark.kind === "decision" || landmark.kind === "milestone" || landmark.kind === "outcome") {
    return t.skeletonNode[landmark.kind];
  }
  return t.skeletonRib[landmark.kind];
}

function focusIdForTarget(target: SessionMapTarget | null, currentId: string | null, viewItemIds: string[]): string | null {
  if (!target) return currentId;
  if (target.type === "landmark") return target.viewItemId;
  const currentIndex = currentId ? viewItemIds.indexOf(currentId) : -1;
  if (currentIndex < 0) return target.sourceViewItemIds[0] ?? null;
  return target.sourceViewItemIds.reduce((nearest, id) => {
    const nearestDistance = Math.abs(viewItemIds.indexOf(nearest) - currentIndex);
    const distance = Math.abs(viewItemIds.indexOf(id) - currentIndex);
    return distance < nearestDistance ? id : nearest;
  }, target.sourceViewItemIds[0] ?? currentId);
}

export function SessionMapDialog(): ReactNode {
  const t = useT();
  const doc = useSessionStore((state) => state.doc);
  const viewItems = useSessionStore((state) => state.viewItems);
  const activeId = useSessionStore((state) => state.activeId);
  const playingId = useSessionStore((state) => state.playingId);
  const mapOpen = useSessionStore((state) => state.mapOpen);
  const mapZoomLevel = useSessionStore((state) => state.mapZoomLevel);
  const mapFocusId = useSessionStore((state) => state.mapFocusId);
  const mapError = useSessionStore((state) => state.mapError);
  const annotations = useSessionStore((state) => state.annotations);
  const closeMap = useSessionStore((state) => state.closeMap);
  const setMapZoom = useSessionStore((state) => state.setMapZoom);
  const setMapFocus = useSessionStore((state) => state.setMapFocus);
  const jumpToMapItem = useSessionStore((state) => state.jumpToMapItem);
  const startReading = useSessionStore((state) => state.startReading);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focusReaderAfterClose = useRef(false);
  const currentViewItemId = playingId ?? activeId;
  const viewItemIds = useMemo(() => viewItems.map((item) => item.id), [viewItems]);
  const position = selectCurrentPosition({ viewItems, activeId, playingId });
  const projection = useMemo(
    () => doc && mapOpen
      ? buildSessionMapProjection(doc, viewItems, mapZoomLevel, mapFocusId ?? currentViewItemId)
      : { level: "global" as const, focusStationIndex: 0, targets: [], totalStations: 0, totalRibs: 0 },
    [currentViewItemId, doc, mapFocusId, mapOpen, mapZoomLevel, viewItems],
  );
  const selectedTarget = projection.targets.find((target) => (
    target.id === mapFocusId || (target.type === "landmark" && target.viewItemId === mapFocusId)
  )) ?? projection.targets.find((target) => target.type === "landmark" && target.stationIndex === projection.focusStationIndex) ?? null;
  const virtualizer = useVirtualizer({
    count: projection.targets.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 48,
    overscan: 8,
    getItemKey: (index) => projection.targets[index]?.id ?? index,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (mapOpen && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
        dialog.dataset.modalFallback = "true";
      }
      window.requestAnimationFrame(() => titleRef.current?.focus());
    } else if (!mapOpen && dialog.open) {
      dialog.close();
    }
  }, [mapOpen]);

  const restoreFocus = () => {
    if (useSessionStore.getState().privacyReview) return;
    window.requestAnimationFrame(() => {
      if (focusReaderAfterClose.current) document.getElementById("workspace-panel-reader")?.focus();
      else document.getElementById("map-launcher")?.focus();
      focusReaderAfterClose.current = false;
    });
  };

  const selectTarget = (target: SessionMapTarget) => setMapFocus(target.type === "landmark" ? target.viewItemId : target.id);
  const changeZoom = (level: MapZoomLevel, target: SessionMapTarget | null = selectedTarget) => {
    const focusId = focusIdForTarget(target, currentViewItemId, viewItemIds);
    setMapZoom(level, focusId ?? undefined);
  };
  const mountedRows = virtualizer.getVirtualItems().slice(0, MAX_MOUNTED_DETAIL_RIBS);

  return (
    <dialog
      ref={dialogRef}
      id="session-map-dialog"
      className="session-map-dialog"
      aria-labelledby="session-map-title"
      onCancel={(event) => {
        event.preventDefault();
        closeMap();
      }}
      onClose={() => {
        if (useSessionStore.getState().mapOpen) closeMap();
        restoreFocus();
      }}
    >
      {mapOpen && <div className="session-map-shell">
        <header className="session-map-header">
          <div>
            <h2 id="session-map-title" ref={titleRef} tabIndex={-1}>{t.map.title}</h2>
            <p>{t.map.currentPosition(position.current ?? "—", position.total)}</p>
          </div>
          <div className="map-levels" role="group" aria-label={t.map.title}>
            {(["global", "section", "detail"] as MapZoomLevel[]).map((level) => (
              <button
                key={level}
                type="button"
                className="btn"
                aria-pressed={mapZoomLevel === level}
                onClick={() => changeZoom(level)}
              >
                {t.map.levels[level]}
              </button>
            ))}
          </div>
          <button type="button" className="btn map-close" onClick={closeMap} aria-label={t.map.close}>{t.map.close}</button>
        </header>

        {projection.targets.length === 0 ? (
          <div className="map-empty">
            <p>{t.map.empty}</p>
            <button type="button" className="btn primary" onClick={startReading}>{t.map.returnReader}</button>
          </div>
        ) : (
          <div className="session-map-content">
            <div className="map-graphic-scroll">
              <SessionMapGraphic
                projection={projection}
                currentViewItemId={currentViewItemId}
                selectedId={selectedTarget?.id ?? mapFocusId}
                onSelect={selectTarget}
              />
              <span className="map-you-are-here">{t.map.youAreHere}</span>
            </div>
            <section className="map-landmarks" aria-label={t.map.landmarkList}>
              <div ref={listRef} className="map-landmark-scroll">
                <div className="virtual-list-space" style={{ height: virtualizer.getTotalSize() }}>
                  {mountedRows.map((virtualItem) => {
                    const target = projection.targets[virtualItem.index];
                    const selected = target.id === selectedTarget?.id;
                    return (
                      <button
                        key={target.id}
                        type="button"
                        className={`map-landmark-row ${selected ? "selected" : ""}`}
                        style={{ transform: `translateY(${virtualItem.start}px)` }}
                        data-index={virtualItem.index}
                        onClick={() => selectTarget(target)}
                      >
                        <span>
                          {target.type === "landmark"
                            ? landmarkKindLabel(t, target)
                            : t.map.clusterLabel(target.count, target.firstStationIndex + 1, target.lastStationIndex + 1)}
                        </span>
                        <strong>{target.label}</strong>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        )}

        <footer className="session-map-footer">
          <div className="map-selection-summary">
            <span className="eyebrow">{t.map.selected}</span>
            {selectedTarget ? (
              <>
                <strong>{selectedTarget.label}</strong>
                {selectedTarget.type === "landmark" && annotations[selectedTarget.viewItemId]?.generalLesson && (
                  <p>{annotations[selectedTarget.viewItemId].generalLesson}</p>
                )}
              </>
            ) : <p>{t.map.noSelection}</p>}
            {mapError && <p className="map-error" role="alert">{mapError}</p>}
          </div>
          {selectedTarget?.type === "cluster" ? (
            <button
              type="button"
              className="btn primary"
              onClick={() => changeZoom(mapZoomLevel === "global" ? "section" : "detail", selectedTarget)}
            >
              {t.map.openCluster}
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              disabled={!canJumpToMapTarget(selectedTarget, viewItems)}
              onClick={() => {
                if (selectedTarget?.type !== "landmark") return;
                focusReaderAfterClose.current = true;
                jumpToMapItem(selectedTarget.viewItemId);
              }}
            >
              {t.map.jump}
            </button>
          )}
        </footer>
      </div>}
    </dialog>
  );
}
