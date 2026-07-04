/**
 * 講解進度條 (僅在「講解全部」執行中或剛完成時顯示)。
 * 緩解等待焦慮：顯示 已完成/總數、進度比例、目前正在講解的節點，並可中途停止。
 * 註：逐節點循序呼叫，這裡呈現的是「節點層級」進度；單一節點內部的 token 速率
 *     需改用 Ollama streaming API 才能取得，已記於 BACKLOG。
 */
import { type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";
import type { ViewItem } from "@/core/view/viewModel";

function itemSummary(item: ViewItem | undefined): string {
  if (!item) return "";
  return item.type === "span" ? item.node.span.summary : item.nodes[0].span.summary;
}

export function AnnotateProgress(): ReactNode {
  const t = useT();
  const progress = useSessionStore((s) => s.annotateProgress);
  const viewItems = useSessionStore((s) => s.viewItems);
  const cancel = useSessionStore((s) => s.cancelAnnotateAll);

  if (!progress) return null;

  const { total, done, currentId } = progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const running = done < total && currentId !== null;
  const finished = done >= total;
  const current = viewItems.find((v) => v.id === currentId);

  return (
    <div className="annotate-progress" role="status" aria-live="polite">
      <div className="ap-row">
        <span className={`ap-label ${finished ? "done" : ""}`}>
          {finished ? t.progress.done : running ? t.progress.running : t.progress.stopped}
        </span>
        <span className="ap-count">{t.progress.count(done, total, pct)}</span>
        {running ? (
          <button type="button" className="btn ap-stop" onClick={cancel} title={t.progress.stopTitle}>
            {t.progress.stop}
          </button>
        ) : (
          <button
            type="button"
            className="btn ap-close"
            onClick={() => useSessionStore.setState({ annotateProgress: null })}
            aria-label={t.progress.closeAria}
          >
            {t.progress.close}
          </button>
        )}
      </div>

      <div className="ap-bar" aria-hidden="true">
        <div className={`ap-fill ${finished ? "done" : ""}`} style={{ width: `${pct}%` }} />
      </div>

      {running && current && (
        <p className="ap-current" title={itemSummary(current)}>
          {t.progress.current(itemSummary(current))}
        </p>
      )}
    </div>
  );
}
