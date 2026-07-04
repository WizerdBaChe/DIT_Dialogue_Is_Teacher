/** 降噪群組卡片 (edit-loop 等)：可折疊，內含多個成員節點。 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SpanGroup } from "@/types/spanTree";
import type { SpanNode } from "@/core/view/viewModel";
import { useSessionStore } from "@/store/sessionStore";
import { AnnotationBlock } from "./parts";
import { SpanBody } from "./SpanCard";

export function GroupCard({
  itemId,
  group,
  nodes,
}: {
  itemId: string;
  group: SpanGroup;
  nodes: SpanNode[];
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(true);

  const activeId = useSessionStore((s) => s.activeId);
  const playingId = useSessionStore((s) => s.playingId);
  const showAnnotations = useSessionStore((s) => s.showAnnotations);
  const providerId = useSessionStore((s) => s.providerId);
  const annotation = useSessionStore((s) => s.annotations[itemId]);
  const loading = useSessionStore((s) => Boolean(s.annotatingIds[itemId]));
  const annError = useSessionStore((s) => s.annotationErrors[itemId]);
  const annotateItem = useSessionStore((s) => s.annotateItem);

  const isActive = activeId === itemId;
  const isPlaying = playingId === itemId;

  useEffect(() => {
    if (isActive || isPlaying) {
      setCollapsed(false);
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isActive, isPlaying]);

  return (
    <section
      ref={ref}
      id={itemId}
      className={`layer-card group-card ${collapsed ? "collapsed" : ""} ${
        isPlaying ? "playing" : isActive ? "highlighted" : ""
      }`}
    >
      <div className="group-head" onClick={() => setCollapsed((c) => !c)}>
        <span className="g-icon">📦</span>
        <span className="layer-title" style={{ margin: 0, padding: 0, border: 0 }}>
          <span className="kind">群組</span>
          <span className="title-text">
            {group.label}（折疊 {nodes.length} 步）
          </span>
        </span>
        <span className="group-hint">確定性降噪 · 點擊{collapsed ? "展開" : "收合"} ▼</span>
      </div>
      <div className="group-children">
        {nodes.map((n) => (
          <div key={n.span.id} style={{ marginBottom: 8 }}>
            <SpanBody node={n} />
          </div>
        ))}
        {showAnnotations && providerId !== "none" && (
          <AnnotationBlock
            annotation={annotation}
            loading={loading}
            error={annError}
            onGenerate={() => void annotateItem(itemId)}
          />
        )}
      </div>
    </section>
  );
}
