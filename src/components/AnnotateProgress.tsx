/**
 * 講解進度條 (僅在「講解全部」執行中或剛完成時顯示)。
 * 緩解等待焦慮：顯示 已完成/總數、進度比例、目前正在講解的節點，並可中途停止。
 * 註：逐節點循序呼叫，這裡呈現的是「節點層級」進度；單一節點內部的 token 速率
 *     需改用 Ollama streaming API 才能取得，已記於 BACKLOG。
 */
import { type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import type { ViewItem } from "@/core/view/viewModel";

function itemSummary(item: ViewItem | undefined): string {
  if (!item) return "";
  return item.type === "span" ? item.node.span.summary : item.nodes[0].span.summary;
}

export function AnnotateProgress(): ReactNode {
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
          {finished ? "✓ 講解完成" : running ? "講解中…" : "已停止"}
        </span>
        <span className="ap-count">
          {done} / {total}（{pct}%）
        </span>
        {running ? (
          <button type="button" className="btn ap-stop" onClick={cancel} title="目前節點跑完即停">
            停止
          </button>
        ) : (
          <button
            type="button"
            className="btn ap-close"
            onClick={() => useSessionStore.setState({ annotateProgress: null })}
            aria-label="關閉進度"
          >
            關閉
          </button>
        )}
      </div>

      <div className="ap-bar" aria-hidden="true">
        <div className={`ap-fill ${finished ? "done" : ""}`} style={{ width: `${pct}%` }} />
      </div>

      {running && current && (
        <p className="ap-current" title={itemSummary(current)}>
          目前：{itemSummary(current)}
        </p>
      )}
    </div>
  );
}
