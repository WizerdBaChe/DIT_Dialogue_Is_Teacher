import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CLUSTER_MAP_SYMBOL,
  EMPTY_SESSION_MAP_PROJECTION,
  MAX_MOUNTED_DETAIL_RIBS,
  SKELETON_NODE_KIND_ORDER,
  SKELETON_NODE_SYMBOL,
  SKELETON_RIB_KIND_ORDER,
  SKELETON_RIB_SYMBOL,
  SUBAGENT_MAP_SYMBOL,
  buildSessionMapProjection,
  canJumpToMapTarget,
  isSpineTarget,
  resolveCurrentSpineTargetId,
  resolveSessionMapSelection,
  type MapLandmark,
  type MapZoomLevel,
  type SessionMapTarget,
} from "@/core/view/sessionMap";
import { reportFallback } from "@/core/diagnostics";
import { selectCurrentPosition, useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";
import { landmarkKindLabel, mapTargetOrdinal } from "./labels";
import { SessionMapGraphic } from "./SessionMapGraphic";

/**
 * 聚合節點被展開時，要以哪一個來源項目當新的取景中心 —— 取離目前位置最近的那個。
 * 用 Map 查位置：原本是在 reduce 裡對整個 viewItems 做 indexOf，
 * 大 session (數萬項) 加上大聚合會變成數千萬次比較，點一下就卡住。
 */
function focusIdForTarget(
  target: SessionMapTarget | null,
  currentId: string | null,
  viewIndexById: Map<string, number>,
): string | null {
  if (!target) return currentId;
  if (target.type === "landmark") return target.viewItemId;
  const currentIndex = currentId ? viewIndexById.get(currentId) ?? -1 : -1;
  if (currentIndex < 0) return target.sourceViewItemIds[0] ?? null;
  let nearest: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const id of target.sourceViewItemIds) {
    const index = viewIndexById.get(id);
    // 位置不明的來源直接跳過；當成 index -1 會讓它假裝離開頭很近而被選中。
    if (index === undefined) {
      reportFallback("sessionMap/focusIdForTarget", "cluster-source-not-in-view-model", { id, clusterId: target.id });
      continue;
    }
    const distance = Math.abs(index - currentIndex);
    if (distance < nearestDistance) {
      nearest = id;
      nearestDistance = distance;
    }
  }
  return nearest ?? target.sourceViewItemIds[0] ?? currentId;
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
  const jumpToMapItem = useSessionStore((state) => state.jumpToMapItem);
  const startReading = useSessionStore((state) => state.startReading);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const graphicScrollRef = useRef<HTMLDivElement>(null);
  const focusReaderAfterClose = useRef(false);
  const [selectedMapTargetId, setSelectedMapTargetId] = useState<string | null>(null);

  /**
   * 這個 layout effect 必須排在 useVirtualizer 之前。
   * <dialog> 未開啟時是 display:none；內容若在那個狀態下被虛擬清單量到，高度會是 0 而且之後不再補算，
   * 地標清單就會整片空白。先在 layout 階段把 dialog 打開，虛擬清單的 layout effect 才量得到真實高度。
   */
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (mapOpen && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
        dialog.dataset.modalFallback = "true";
      }
    } else if (!mapOpen && dialog.open) {
      try {
        dialog.close();
      } catch {
        dialog.removeAttribute("open");
        delete dialog.dataset.modalFallback;
      }
    }
  }, [mapOpen]);
  const currentViewItemId = playingId ?? activeId;
  const viewIndexById = useMemo(() => new Map(viewItems.map((item, index) => [item.id, index])), [viewItems]);
  const position = selectCurrentPosition({ viewItems, activeId, playingId });
  const projection = useMemo(
    () => doc && mapOpen
      ? buildSessionMapProjection(doc, viewItems, mapZoomLevel, mapFocusId ?? currentViewItemId, currentViewItemId)
      : EMPTY_SESSION_MAP_PROJECTION,
    [currentViewItemId, doc, mapFocusId, mapOpen, mapZoomLevel, viewItems],
  );
  const selectedTarget = resolveSessionMapSelection(projection, selectedMapTargetId ?? mapFocusId);
  const currentSpineTargetId = resolveCurrentSpineTargetId(projection, currentViewItemId);
  // 換取景中心原本只能靠「再按一次層級鈕」這個隱藏操作；這裡把它變成看得見的按鈕。
  const selectedStationIndex = selectedTarget
    ? (selectedTarget.type === "landmark" ? selectedTarget.stationIndex : selectedTarget.firstStationIndex)
    : null;
  const canRecenter = mapZoomLevel !== "global"
    && selectedStationIndex !== null
    && selectedStationIndex !== projection.focusStationIndex;
  // 全局層沒有裁切，不需要說明取景中心；定位失敗時要說「無法定位」而不是報一個假的中心。
  const anchorStation = mapZoomLevel === "global" || !projection.focusResolved
    ? null
    : projection.targets.find((target): target is MapLandmark => (
      target.type === "landmark"
      && target.parentStationId === null
      && target.stationIndex === projection.focusStationIndex
    )) ?? null;
  const anchorUnresolved = mapZoomLevel !== "global" && !projection.focusResolved && projection.targets.length > 0;
  const virtualizer = useVirtualizer({
    count: projection.targets.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 68,
    overscan: 4,
    getItemKey: (index) => projection.targets[index]?.id ?? index,
  });

  useEffect(() => {
    if (!mapOpen) return;
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [mapOpen]);

  useEffect(() => {
    setSelectedMapTargetId(mapOpen ? mapFocusId ?? currentViewItemId : null);
  }, [currentViewItemId, mapFocusId, mapOpen]);

  useEffect(() => {
    if (!mapOpen || projection.targets.length === 0) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const scroller = graphicScrollRef.current;
        if (!scroller) return;
        const target = scroller.querySelector<SVGGElement>(".map-target.selected")
          ?? scroller.querySelector<SVGGElement>(".map-target.current");
        if (!target) {
          scroller.scrollLeft = Math.max(0, (scroller.scrollWidth - scroller.clientWidth) / 2);
          scroller.scrollTop = Math.max(0, (scroller.scrollHeight - scroller.clientHeight) / 2);
          return;
        }
        const scrollerBounds = scroller.getBoundingClientRect();
        const targetBounds = target.getBoundingClientRect();
        scroller.scrollLeft += targetBounds.left + targetBounds.width / 2 - (scrollerBounds.left + scrollerBounds.width / 2);
        scroller.scrollTop += targetBounds.top + targetBounds.height / 2 - (scrollerBounds.top + scrollerBounds.height / 2);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [mapOpen, mapZoomLevel, projection.targets, selectedTarget?.id]);

  const restoreFocus = () => {
    if (useSessionStore.getState().privacyReview) return;
    window.requestAnimationFrame(() => {
      if (focusReaderAfterClose.current) document.getElementById("workspace-panel-reader")?.focus();
      else document.getElementById("map-launcher")?.focus();
      focusReaderAfterClose.current = false;
    });
  };

  const selectTarget = (target: SessionMapTarget) => {
    setSelectedMapTargetId(target.type === "landmark" ? target.viewItemId : target.id);
  };
  const changeZoom = (level: MapZoomLevel, target: SessionMapTarget | null = selectedTarget) => {
    const focusId = focusIdForTarget(target, currentViewItemId, viewIndexById);
    setSelectedMapTargetId(focusId);
    setMapZoom(level, focusId ?? undefined);
  };
  const mountedRows = virtualizer.getVirtualItems().slice(0, MAX_MOUNTED_DETAIL_RIBS);
  const mapLegendItems: Array<readonly [string, string]> = [
    ...SKELETON_NODE_KIND_ORDER.map((kind) => [SKELETON_NODE_SYMBOL[kind], t.skeletonNode[kind]] as const),
    ...SKELETON_RIB_KIND_ORDER.map((kind) => [SKELETON_RIB_SYMBOL[kind], t.skeletonRib[kind]] as const),
    [SUBAGENT_MAP_SYMBOL, t.workspace.tabs.subagents] as const,
    [CLUSTER_MAP_SYMBOL, t.map.clusterKind] as const,
  ];

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
      onClick={(event) => {
        // 點擊 backdrop 時，原生 <dialog> 的 click 事件 target 就是 dialog 元素本身
        // （backdrop 不是可命中的子節點）；點在 shell 內容上的 target 永遠是某個子元素。
        if (event.target === dialogRef.current) closeMap();
      }}
    >
      {mapOpen && <div className="session-map-shell">
        <header className="session-map-header">
          <div>
            <h2 id="session-map-title" ref={titleRef} tabIndex={-1}>{t.map.title}</h2>
            <p>{t.map.currentPosition(position.current ?? "—", position.total)}</p>
            {anchorStation && (
              <p className="map-anchor-note">
                {t.map.anchoredAt(`${mapTargetOrdinal(anchorStation)} · ${landmarkKindLabel(t, anchorStation)}`)}
              </p>
            )}
            {anchorUnresolved && <p className="map-anchor-note unresolved">{t.map.anchorUnresolved}</p>}
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
          <p className="map-legend">
            {`${t.sidebar.legendLabel}: ${mapLegendItems.map(([symbol, label]) => `${symbol} ${label}`).join(" · ")}`}
          </p>
        </header>

        {projection.targets.length === 0 ? (
          <div className="map-empty">
            <p>{t.map.empty}</p>
            <button type="button" className="btn primary" onClick={startReading}>{t.map.returnReader}</button>
          </div>
        ) : (
          <div className="session-map-content">
            <div ref={graphicScrollRef} className="map-graphic-scroll">
              <div className="map-graphic-stage">
                <SessionMapGraphic
                  projection={projection}
                  currentViewItemId={currentViewItemId}
                  selectedId={selectedTarget?.id ?? mapFocusId}
                  onSelect={selectTarget}
                />
              </div>
              {!currentSpineTargetId && <span className="map-position-note">{t.map.currentOutOfView}</span>}
            </div>
            <section className="map-landmarks" aria-label={t.map.landmarkList}>
              <div ref={listRef} className="map-landmark-scroll">
                <div className="virtual-list-space" style={{ height: virtualizer.getTotalSize() }}>
                  {mountedRows.map((virtualItem) => {
                    const target = projection.targets[virtualItem.index];
                    const selected = target.id === selectedTarget?.id;
                    // 只認 id：viewItemId 在骨架有瑕疵時可能重複，比對 id 才保證全清單唯一。
                    const current = target.id === currentSpineTargetId;
                    // 支線與支線群組是站的子項，縮排並標成 sub，避免被誤讀成新的主線節點。
                    const sub = !isSpineTarget(target);
                    const kindText = target.type === "landmark"
                      ? landmarkKindLabel(t, target)
                      : target.groupKind === "ribs"
                        ? t.map.branchCount(target.count)
                        : target.groupKind === "subagents"
                          ? t.map.subagentCount(target.count)
                          : t.map.clusterLabel(target.count, target.firstStationIndex + 1, target.lastStationIndex + 1);
                    return (
                      <button
                        key={target.id}
                        type="button"
                        className={`map-landmark-row ${selected ? "selected" : ""} ${sub ? "sub" : ""} ${current ? "current" : ""}`}
                        style={{ transform: `translateY(${virtualItem.start}px)` }}
                        data-index={virtualItem.index}
                        onClick={() => selectTarget(target)}
                      >
                        <span>
                          {target.type === "cluster" && target.groupKind === "range"
                            ? kindText
                            : `${mapTargetOrdinal(target)} · ${kindText}`}
                          {current && <em className="map-row-here">{t.map.youAreHere}</em>}
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
          <div className="map-footer-actions">
          {canRecenter && (
            <button type="button" className="btn" onClick={() => changeZoom(mapZoomLevel, selectedTarget)}>
              {t.map.recenter}
            </button>
          )}
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
          </div>
        </footer>
      </div>}
    </dialog>
  );
}
