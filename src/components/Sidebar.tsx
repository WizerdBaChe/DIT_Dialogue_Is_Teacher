/** 左側 Span Tree 目錄。點擊項目高亮對應卡片。 */
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";
import { SPAN_DOT, GROUP_DOT } from "./labels";

export function Sidebar(): ReactNode {
  const t = useT();
  const doc = useSessionStore((s) => s.doc);
  const viewItems = useSessionStore((s) => s.viewItems);
  const activeId = useSessionStore((s) => s.activeId);
  const playingId = useSessionStore((s) => s.playingId);
  const setActive = useSessionStore((s) => s.setActive);
  const scrollRef = useRef<HTMLDivElement>(null);
  const indexById = useMemo(() => new Map(viewItems.map((item, index) => [item.id, index])), [viewItems]);
  const virtualizer = useVirtualizer({
    count: viewItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 31,
    overscan: 8,
    getItemKey: (index) => viewItems[index]?.id ?? index,
  });
  const selectedId = playingId ?? activeId;

  useEffect(() => {
    if (!selectedId) return;
    const index = indexById.get(selectedId);
    if (index !== undefined) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [indexById, selectedId, virtualizer]);

  if (!doc) {
    return (
      <aside className="sidebar">
        <h2>{t.sidebar.heading}</h2>
        <p className="session-meta">{t.sidebar.empty}</p>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-static">
        <h2>{t.sidebar.headingWithTree}</h2>
        <div className="session-meta">
          title: {doc.session.title}
          <br />
          source: {doc.session.source}
          <br />
          {doc.session.model && (
            <>
              model: {doc.session.model}
              <br />
            </>
          )}
          spans: {doc.spans.length} ｜ groups: {doc.groups.length}
          {doc.skeleton && (
            <>
              <br />
              {t.sidebar.skeleton(doc.skeleton.nodes.length, doc.skeleton.ribs.length)}
            </>
          )}
        </div>

        <div className="tree-legend" aria-label={t.sidebar.legendLabel}>
          <span className="tree-legend-title">{t.sidebar.legendLabel}</span>
          {(Object.keys(SPAN_DOT) as Array<keyof typeof SPAN_DOT>).map((type) => (
            <span className="tree-legend-item" key={type}>
              <span className="dot" aria-hidden="true">{SPAN_DOT[type]}</span>
              {t.spanKind[type]}
            </span>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="tree-scroll" data-testid="sidebar-virtual-scroll">
        <div className="virtual-list-space" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = viewItems[virtualItem.index];
            const span = item.type === "span" ? item.node.span : item.nodes[0].span;
            const label = item.type === "group" ? item.group.label : span.summary;
            const dot = item.type === "group" ? GROUP_DOT : SPAN_DOT[span.type];
            const cls = playingId === item.id ? "playing" : activeId === item.id ? "active" : "";
            return (
              <button
                key={item.id}
                type="button"
                className={`tree-item ${cls}`}
                onClick={() => setActive(item.id)}
                title={label}
                data-index={virtualItem.index}
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <span className="dot">{dot}</span>
                <span className="label">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
