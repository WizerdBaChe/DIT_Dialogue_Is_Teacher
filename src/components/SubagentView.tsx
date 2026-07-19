import { useMemo, useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";
import type { ViewItem } from "@/core/view/viewModel";

export function SubagentView(): ReactNode {
  const t = useT();
  const doc = useSessionStore((state) => state.doc);
  const viewItems = useSessionStore((state) => state.viewItems);
  const activeId = useSessionStore((state) => state.activeId);
  const setActive = useSessionStore((state) => state.setActive);
  const scrollRef = useRef<HTMLDivElement>(null);
  const subagentItems = useMemo(
    () => viewItems.filter((item): item is Extract<ViewItem, { type: "group" }> => item.type === "group" && item.group.kind === "subagent"),
    [viewItems],
  );
  const virtualizer = useVirtualizer({
    count: subagentItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 72,
    overscan: 8,
    getItemKey: (index) => subagentItems[index]?.id ?? index,
  });

  if (!doc) return null;

  return (
    <main className="main-content subagent-workspace">
      <div className="workspace-intro">
        <h2>{t.subagent.sectionLabel}</h2>
        <p>{t.subagent.workspaceHint}</p>
      </div>
      {subagentItems.length === 0 ? (
        <div className="empty-state compact-empty"><p>{t.subagent.empty}</p></div>
      ) : (
        <div ref={scrollRef} className="subagent-scroll" data-testid="subagent-virtual-scroll">
          <div className="virtual-list-space" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const item = subagentItems[virtualItem.index];
              const firstSummary = item.nodes[0]?.span.summary ?? item.group.label;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`subagent-list-item ${activeId === item.id ? "active" : ""}`}
                  data-index={virtualItem.index}
                  style={{ transform: `translateY(${virtualItem.start}px)` }}
                  onClick={() => setActive(item.id)}
                  aria-label={t.subagent.openBranch(item.group.label, item.nodes.length)}
                >
                  <span className="subagent-list-index">{String(virtualItem.index + 1).padStart(2, "0")}</span>
                  <span className="subagent-list-copy">
                    <strong>{item.group.label}</strong>
                    <span>{firstSummary}</span>
                  </span>
                  <span className="subagent-list-count">{t.subagent.nodeCount(item.nodes.length)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
