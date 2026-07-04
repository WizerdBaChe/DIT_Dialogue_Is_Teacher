/** 單一節點卡片 (含其巢狀工具結果)。 */
import { useEffect, useRef, type ReactNode } from "react";
import type { SpanNode } from "@/core/view/viewModel";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";
import { AnnotationBlock, Badges, IOBlock, ThinkingBlock } from "./parts";

/**
 * 大字標題 (span.summary) 是「精簡大意」；layer-desc 是「完整敘述」。
 * 只有當完整內容比大意多 (被截斷，或有多行排版) 才顯示，避免兩處顯示同一句話。
 */
function fullBodyAddsInfo(span: SpanNode["span"]): boolean {
  const full = (span.text ?? "").trim();
  if (!full) return false;
  const collapsed = full.replace(/\s+/g, " ");
  return collapsed !== span.summary || full.includes("\n");
}

/** 渲染節點主體 (desc / 思考 / 參數 / 結果)，供 SpanCard 與 GroupCard 共用。 */
export function SpanBody({ node }: { node: SpanNode }): ReactNode {
  const t = useT();
  const { span, children } = node;
  return (
    <>
      {span.type === "thinking" ? (
        <ThinkingBlock text={span.text} />
      ) : (
        span.type !== "tool_use" && fullBodyAddsInfo(span) && <div className="layer-desc">{span.text}</div>
      )}

      {span.type === "tool_use" && span.tool && Object.keys(span.tool.params).length > 0 && (
        <IOBlock title={t.card.paramsTitle} text={JSON.stringify(span.tool.params, null, 2)} />
      )}

      {children.map((c) => (
        <IOBlock
          key={c.id}
          title={c.result?.isError ? t.card.resultErrorTitle : t.card.resultTitle}
          text={c.result?.text ?? c.text}
          colored
          defaultCollapsed={!c.result?.isError}
        />
      ))}
    </>
  );
}

export function SpanCard({ itemId, node }: { itemId: string; node: SpanNode }): ReactNode {
  const t = useT();
  const { span } = node;
  const ref = useRef<HTMLDivElement>(null);

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
  const hasError = span.tags.includes("error");

  useEffect(() => {
    if (isActive || isPlaying) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isActive, isPlaying]);

  return (
    <section
      ref={ref}
      className={`layer-card ${hasError ? "error" : ""} ${isPlaying ? "playing" : isActive ? "highlighted" : ""}`}
      id={itemId}
    >
      <Badges span={span} />
      <div className="layer-title">
        <span className="kind">{t.spanKind[span.type]}</span>
        <span className="title-text">{span.summary}</span>
      </div>
      <SpanBody node={node} />
      {showAnnotations && providerId !== "none" && (
        <AnnotationBlock
          annotation={annotation}
          loading={loading}
          error={annError}
          onGenerate={() => void annotateItem(itemId)}
        />
      )}
    </section>
  );
}
