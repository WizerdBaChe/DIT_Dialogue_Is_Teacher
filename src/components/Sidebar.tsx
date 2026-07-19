/** 左側 Span Tree 目錄。點擊項目高亮對應卡片。 */
import { useEffect, useMemo, useRef, type ReactNode, type Ref } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { selectCurrentPosition, useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";
import { SPAN_DOT, GROUP_DOT } from "./labels";

interface SidebarProps {
  variant?: "desktop" | "drawer";
  titleId?: string;
  titleRef?: Ref<HTMLHeadingElement>;
  onItemSelect?: (id: string) => void;
}

export function Sidebar({ variant = "desktop", titleId, titleRef, onItemSelect }: SidebarProps): ReactNode {
  const t = useT();
  const doc = useSessionStore((s) => s.doc);
  const viewItems = useSessionStore((s) => s.viewItems);
  const activeId = useSessionStore((s) => s.activeId);
  const playingId = useSessionStore((s) => s.playingId);
  const setActive = useSessionStore((s) => s.setActive);
  const toggleStructureCollapsed = useSessionStore((s) => s.toggleStructureCollapsed);
  const closeStructureDrawer = useSessionStore((s) => s.closeStructureDrawer);
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
  const position = selectCurrentPosition({ viewItems, activeId, playingId });

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
    <aside className={`sidebar workspace-structure sidebar-${variant}`}>
      <div className="sidebar-static">
        <div className="structure-heading">
          <div className="structure-title-block">
            <span className="eyebrow">{t.structure.label}</span>
            <h2 id={titleId} ref={titleRef} tabIndex={variant === "drawer" ? -1 : undefined} title={doc.session.title}>
              {doc.session.title}
            </h2>
          </div>
          <button
            type="button"
            className="structure-collapse"
            onClick={variant === "drawer" ? closeStructureDrawer : toggleStructureCollapsed}
            aria-label={variant === "drawer" ? t.structure.closeDrawer : t.structure.collapse}
            title={variant === "drawer" ? t.structure.closeDrawer : t.structure.collapse}
          >
            <span aria-hidden="true">{variant === "drawer" ? "×" : "«"}</span>
          </button>
        </div>
        <p className="structure-position">{t.structure.position(position.current ?? "—", position.total)}</p>
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
                onClick={() => {
                  onItemSelect?.(item.id);
                  setActive(item.id);
                }}
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
