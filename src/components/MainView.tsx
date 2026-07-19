/** 右側內容區：空狀態 / 錯誤 / 卡片清單 + 底部資料流提示。 */
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";
import { SpanCard } from "./SpanCard";
import { GroupCard } from "./GroupCard";
import { ReaderMinimap } from "./ReaderMinimap";

export function MainView(): ReactNode {
  const t = useT();
  const doc = useSessionStore((s) => s.doc);
  const viewItems = useSessionStore((s) => s.viewItems);
  const error = useSessionStore((s) => s.error);
  const warnings = useSessionStore((s) => s.warnings);
  const activeId = useSessionStore((s) => s.activeId);
  const playingId = useSessionStore((s) => s.playingId);
  const minimapEnabled = useSessionStore((s) => s.minimapEnabled);
  const scrollRef = useRef<HTMLDivElement>(null);
  const indexById = useMemo(() => new Map(viewItems.map((item, index) => [item.id, index])), [viewItems]);
  const virtualizer = useVirtualizer({
    count: viewItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 190,
    overscan: 3,
    getItemKey: (index) => viewItems[index]?.id ?? index,
  });
  const selectedId = playingId ?? activeId;
  const virtualItems = virtualizer.getVirtualItems();
  const visibleStart = virtualItems[0]?.index ?? 0;
  const visibleEnd = virtualItems[virtualItems.length - 1]?.index ?? visibleStart;

  useEffect(() => {
    if (!selectedId) return;
    const index = indexById.get(selectedId);
    if (index !== undefined) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [indexById, selectedId, virtualizer]);

  if (!doc) {
    return (
      <main className="main-content">
        {error && <div className="error-banner">{error}</div>}
        <div className="empty-state">
          <h2>{t.main.emptyTitle}</h2>
          <p>
            {t.main.emptyBodyPrefix}
            <code>{t.main.emptyPath}</code>
            {t.main.emptyBodySuffix}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="main-content dense-main">
      {error && <div className="error-banner">{error}</div>}
      {warnings.length > 0 && <div className="error-banner warn">{t.main.warnings(warnings)}</div>}

      <div ref={scrollRef} className={`dense-scroll ${minimapEnabled ? "reader-with-minimap" : ""}`} data-testid="dense-virtual-scroll">
        <div className="virtual-list-space" style={{ height: virtualizer.getTotalSize() }}>
          {virtualItems.map((virtualItem) => {
            const item = viewItems[virtualItem.index];
            return (
              <div
                key={item.id}
                ref={virtualizer.measureElement}
                className="virtual-row"
                data-index={virtualItem.index}
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                {item.type === "group" ? (
                  <GroupCard itemId={item.id} group={item.group} nodes={item.nodes} />
                ) : (
                  <SpanCard itemId={item.id} node={item.node} />
                )}
              </div>
            );
          })}
        </div>

        <div className="info-box">
          <strong>{t.main.infoTitle}</strong>
          <p>{t.main.infoBody}</p>
          <div className="flow">{t.main.flow}</div>
        </div>
      </div>
      <ReaderMinimap visibleStart={visibleStart} visibleEnd={visibleEnd} />
    </main>
  );
}
