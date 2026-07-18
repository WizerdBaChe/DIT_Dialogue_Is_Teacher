/** 左側 Span Tree 目錄。點擊項目高亮對應卡片。 */
import type { ReactNode } from "react";
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

      {viewItems.map((item) => {
        const span = item.type === "span" ? item.node.span : item.nodes[0].span;
        const label = item.type === "group" ? item.group.label : span.summary;
        const dot = item.type === "group" ? GROUP_DOT : SPAN_DOT[span.type];
        const cls = playingId === item.id ? "playing" : activeId === item.id ? "active" : "";
        return (
          <div key={item.id} className={`tree-item ${cls}`} onClick={() => setActive(item.id)} title={label}>
            <span className="dot">{dot}</span>
            <span className="label">{label}</span>
          </div>
        );
      })}
    </aside>
  );
}
