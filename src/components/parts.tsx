/** 可重用的卡片內部區塊：思考層、IO 區塊、講解區塊、標籤。 */
import { useState, type ReactNode } from "react";
import type { Annotation, Span, SpanTag } from "@/types/spanTree";
import { TAG_LABEL } from "./labels";

/** 標籤徽章列 (含工具名稱)。 */
export function Badges({ span }: { span: Span }): ReactNode {
  return (
    <div className="badges">
      {span.tags.map((t: SpanTag) => (
        <span key={t} className={`badge ${t}`}>
          {TAG_LABEL[t]}
        </span>
      ))}
      {span.tool && <span className="badge tool">{span.tool.name}</span>}
    </div>
  );
}

/** 可摺疊的思考鏈。 */
export function ThinkingBlock({ text }: { text: string }): ReactNode {
  const [collapsed, setCollapsed] = useState(true);
  return (
    <div className={`thinking ${collapsed ? "collapsed" : ""}`}>
      <div className="thinking-head" onClick={() => setCollapsed((c) => !c)}>
        🧠 思考鏈 <span className="chev">▼</span>
      </div>
      <div className="thinking-body">{text}</div>
    </div>
  );
}

/** 把輸出文字依 ✓/✗ 上色。 */
function colorize(text: string): ReactNode {
  return text.split("\n").map((line, i) => {
    const cls = /✗|fail|error|Expected/i.test(line) ? "err" : /✓|passed|pass\b/i.test(line) ? "ok" : "";
    return (
      <div key={i} className={cls}>
        {line || " "}
      </div>
    );
  });
}

/** 可摺疊的輸入/輸出區塊。 */
export function IOBlock({
  title,
  text,
  defaultCollapsed = true,
  colored = false,
}: {
  title: string;
  text: string;
  defaultCollapsed?: boolean;
  colored?: boolean;
}): ReactNode {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div className={`io-block ${collapsed ? "collapsed" : ""}`}>
      <div className="io-head" onClick={() => setCollapsed((c) => !c)}>
        {title} <span className="chev">▼</span>
      </div>
      <div className="io-body">{colored ? colorize(text) : text}</div>
    </div>
  );
}

/** 教學講解區塊。依狀態顯示講解 / 產生中 / 錯誤 / 觸發按鈕。 */
export function AnnotationBlock({
  annotation,
  loading,
  error,
  onGenerate,
}: {
  annotation?: Annotation;
  loading: boolean;
  error?: string;
  onGenerate: () => void;
}): ReactNode {
  return (
    <div className="annotation">
      {annotation && <span className="src">via {annotation.provider}</span>}
      {loading && <p className="pending">教學講解產生中…</p>}
      {!loading && error && <p className="pending">講解失敗：{error}</p>}
      {!loading && !error && !annotation && (
        <button className="btn" onClick={onGenerate}>
          產生教學講解
        </button>
      )}
      {!loading && annotation && (
        <>
          {annotation.what && (
            <>
              <h4>這步在做什麼</h4>
              <p>{annotation.what}</p>
            </>
          )}
          {annotation.why && (
            <>
              <h4>為什麼這樣做</h4>
              <p>{annotation.why}</p>
            </>
          )}
          {annotation.generalLesson && (
            <>
              <h4 className="lesson">通用做法</h4>
              <p className="lesson">{annotation.generalLesson}</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
