/** 降噪群組卡片 (edit-loop 等)：可折疊，內含多個成員節點。 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { SpanGroup } from "@/types/spanTree";
import type { SpanNode } from "@/core/view/viewModel";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";
import { GROUP_DOT } from "./labels";
import { AnnotationBlock } from "./parts";
import { SpanBody } from "./SpanCard";
import { SubagentMiniGraph } from "./SubagentBranch";
import { SPAN_DOT } from "./labels";

export function GroupCard({
  itemId,
  group,
  nodes,
}: {
  itemId: string;
  group: SpanGroup;
  nodes: SpanNode[];
}): ReactNode {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(true);
  const childrenId = useId();

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
      {/*
        2026-09 UX 走查 F2：群組頭與 thinking／io 頭是**同一類控制**，走查列舉的六個裡沒有它，
        只因為示範 session 的可視範圍剛好沒有群組卡——不是因為它沒有這個缺陷。而 C2（找第一次
        失敗與後續修正）走的正是 retry／edit-loop 群組，所以漏掉它等於 F2 沒修完。
      */}
      <button
        type="button"
        className="group-head"
        aria-expanded={!collapsed}
        aria-controls={childrenId}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="g-icon" aria-hidden="true">{GROUP_DOT}</span>
        <span className="layer-title" style={{ margin: 0, padding: 0, border: 0 }}>
          <span className="kind">{t.card.groupKindTag[group.kind] ?? t.card.kindTag}</span>
          <span className="title-text">
            {group.label}
            {t.card.groupFolded(nodes.length, collapsed)}
          </span>
        </span>
        <span className="group-hint">{t.card.groupHint(collapsed)}</span>
      </button>
      <div className="group-children" id={childrenId}>
        {group.kind === "subagent" && <SubagentMiniGraph nodes={nodes} />}
        {nodes.map((n) => (
          <div key={n.span.id} className={group.kind === "subagent" ? "subagent-step" : undefined} style={{ marginBottom: 8 }}>
            {group.kind === "subagent" && (
              <div className="subagent-step-head">
                <span aria-hidden="true">{SPAN_DOT[n.span.type]}</span>
                <span>{t.spanKind[n.span.type]}</span>
                <strong>{n.span.summary}</strong>
              </div>
            )}
            <SpanBody node={n} />
          </div>
        ))}
        {showAnnotations && (providerId !== "none" || annotation) && (
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
