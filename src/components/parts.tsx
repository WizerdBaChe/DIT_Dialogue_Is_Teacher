/** 可重用的卡片內部區塊：思考層、IO 區塊、講解區塊、標籤。 */
import { useState, type ReactNode } from "react";
import type { Annotation, Span, SpanTag } from "@/types/spanTree";
import { useT } from "@/i18n";

/** 標籤徽章列 (含工具名稱)。 */
export function Badges({ span }: { span: Span }): ReactNode {
  const t = useT();
  return (
    <div className="badges">
      {span.tags.map((tag: SpanTag) => (
        <span key={tag} className={`badge ${tag}`}>
          {t.tag[tag]}
        </span>
      ))}
      {span.tool && <span className="badge tool">{span.tool.name}</span>}
    </div>
  );
}

/** 可摺疊的思考鏈。 */
export function ThinkingBlock({ text }: { text: string }): ReactNode {
  const t = useT();
  const [collapsed, setCollapsed] = useState(true);
  return (
    <div className={`thinking ${collapsed ? "collapsed" : ""}`}>
      <div className="thinking-head" onClick={() => setCollapsed((c) => !c)}>
        {t.card.thinkingHead} <span className="chev">▾</span>
      </div>
      <div className="thinking-body">{text}</div>
    </div>
  );
}

/** 把輸出文字依 ✓/✗ 上色 (資料內容，非 UI chrome，維持原樣式偵測)。 */
function colorize(text: string): ReactNode {
  return text.split("\n").map((line, i) => {
    const cls = /✗|fail|error|Expected/i.test(line) ? "err" : /✓|passed|pass\b/i.test(line) ? "ok" : "";
    return (
      <div key={i} className={cls}>
        {line || " "}
      </div>
    );
  });
}

const IO_SUMMARY_FIRST_LINE_LIMIT = 60;

/** 從 IO 原文計算收合狀態下的行數與首行摘要 (不新增管線欄位，render 時即算)。 */
export function summarizeCollapsedIOText(text: string): { lineCount: number; firstLine: string } {
  if (text === "") return { lineCount: 0, firstLine: "" };
  const lines = text.split("\n");
  const firstLine = lines[0];
  const truncated = firstLine.length > IO_SUMMARY_FIRST_LINE_LIMIT
    ? `${firstLine.slice(0, IO_SUMMARY_FIRST_LINE_LIMIT)}…`
    : firstLine;
  return { lineCount: lines.length, firstLine: truncated };
}

/** 可摺疊的輸入/輸出區塊。標題由呼叫端傳入 (已在地化)。 */
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
  const t = useT();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const { lineCount, firstLine } = summarizeCollapsedIOText(text);
  const headText = collapsed ? `${title} · ${t.card.collapsedSummary(lineCount, firstLine)}` : title;
  return (
    <div className={`io-block ${collapsed ? "collapsed" : ""}`}>
      <div className="io-head" onClick={() => setCollapsed((c) => !c)}>
        {headText}
        <span className="chev">▾</span>
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
  const t = useT();
  return (
    <div className="annotation">
      {annotation && <span className="src">{t.annotation.via(annotation.provider)}</span>}
      {loading && <p className="pending">{t.annotation.generating}</p>}
      {!loading && error && (
        <div className="annotation-error" role="alert">
          <p className="pending">{t.annotation.failed(error)}</p>
          <button className="btn" onClick={onGenerate}>{t.annotation.retry}</button>
        </div>
      )}
      {!loading && !error && !annotation && (
        <button className="btn" onClick={onGenerate}>
          {t.annotation.generate}
        </button>
      )}
      {!loading && annotation && (
        <>
          {annotation.what && (
            <>
              <h4>{t.annotation.what}</h4>
              <p>{annotation.what}</p>
            </>
          )}
          {annotation.why && (
            <>
              <h4>{t.annotation.why}</h4>
              <p>{annotation.why}</p>
            </>
          )}
          {annotation.generalLesson && (
            <>
              <h4 className="lesson">{t.annotation.lesson}</h4>
              <p className="lesson">{annotation.generalLesson}</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
