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
const PARAMS_PREVIEW_LIMIT = 60;
const PARAMS_STRING_VALUE_LIMIT = 32;

/** 純結構符號或空白組成的行，對自由文字摘要零資訊量 (R7-INV-3)。 */
const MEANINGLESS_LINE = /^[\s{}[\]().,;:'"`=*_#|>-]*$/;

/** 從 IO 原文計算收合狀態下的行數與首行摘要 (不新增管線欄位，render 時即算)。
 *  跳過空行與純結構符號行，取第一行有實質字元者 (R7-INV-3)。 */
export function summarizeCollapsedIOText(text: string): { lineCount: number; firstLine: string } {
  if (text === "") return { lineCount: 0, firstLine: "" };
  const lines = text.split("\n");
  const meaningful = (lines.find((line) => !MEANINGLESS_LINE.test(line)) ?? "").trim();
  const firstLine = meaningful.length > IO_SUMMARY_FIRST_LINE_LIMIT
    ? `${meaningful.slice(0, IO_SUMMARY_FIRST_LINE_LIMIT)}…`
    : meaningful;
  return { lineCount: lines.length, firstLine };
}

function formatParamValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = value.replace(/\n/g, " ");
    return normalized.length > PARAMS_STRING_VALUE_LIMIT
      ? `${normalized.slice(0, PARAMS_STRING_VALUE_LIMIT)}…`
      : normalized;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === "object") return "{…}";
  return undefined; // function 等不可序列化型別：略過該鍵
}

/** 結構化參數的收合摘要：由物件本身導出，不看序列化文字 (R7-INV-3，A4.3)。 */
export function summarizeParams(params: Record<string, unknown>): { count: number; preview: string } {
  const keys = Object.keys(params);
  // Codex adapter 把 exec 的 JS 原文包成 { raw: input }（無法結構化解析時的降級形式，見
  // codexJsonl.ts）；只有這一個鍵時顯示值本身，不顯示鍵名——不然每張 Codex 操作卡都變成
  // 「1 項 · raw: …」，鍵名佔掉摘要預算卻零資訊 (§B4.3)。
  if (keys.length === 1 && keys[0] === "raw") {
    const formatted = formatParamValue(params.raw);
    return { count: 1, preview: formatted ?? "" };
  }
  let preview = "";
  for (const key of keys) {
    const formatted = formatParamValue(params[key]);
    if (formatted === undefined) continue;
    const piece = `${key}: ${formatted}`;
    if (preview === "") {
      preview = piece.length > PARAMS_PREVIEW_LIMIT ? `${piece.slice(0, PARAMS_PREVIEW_LIMIT)}…` : piece;
      if (piece.length > PARAMS_PREVIEW_LIMIT) break;
      continue;
    }
    const candidate = `${preview}, ${piece}`;
    if (candidate.length > PARAMS_PREVIEW_LIMIT) {
      preview = `${preview}…`;
      break;
    }
    preview = candidate;
  }
  return { count: keys.length, preview };
}

/** 可摺疊的輸入/輸出區塊。標題由呼叫端傳入 (已在地化)。 */
export function IOBlock({
  title,
  text,
  defaultCollapsed = true,
  colored = false,
  structured,
}: {
  title: string;
  text: string;
  defaultCollapsed?: boolean;
  colored?: boolean;
  /** 有值時收合摘要走參數導向摘要，而非序列化文字的首行規則 (R7A-04)。 */
  structured?: Record<string, unknown>;
}): ReactNode {
  const t = useT();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  let collapsedSummary: string;
  if (structured) {
    const { count, preview } = summarizeParams(structured);
    collapsedSummary = t.card.collapsedParamsSummary(count, preview);
  } else {
    const { lineCount, firstLine } = summarizeCollapsedIOText(text);
    collapsedSummary = t.card.collapsedSummary(lineCount, firstLine);
  }
  const headText = collapsed ? `${title} · ${collapsedSummary}` : title;
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
