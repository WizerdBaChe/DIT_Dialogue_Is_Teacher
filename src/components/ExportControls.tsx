/**
 * 設定匣「匯出」fieldset (D-R6-04)：
 * - Session 存檔：JSON 匯出與 HTML 快照匯出 (EX-04)，可還原成完整節點視圖。
 * - 對話紀錄：只給人讀的逐字稿 (Markdown / JSON / HTML 檢視頁 / 複製)，不可還原視圖。
 */
import { useState, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useLocale, useT } from "@/i18n";
import { buildSessionExport, type BuildSessionExportOptions } from "@/core/export/buildExport";
import { buildTranscript } from "@/core/export/transcript";
import { renderTranscriptMarkdown } from "@/core/export/transcriptMarkdown";
import { renderTranscriptHtml } from "@/core/export/transcriptHtml";
import { fileStamp } from "@/core/export/transcriptFormat";
import { DEFAULT_TRANSCRIPT_OPTIONS, type TranscriptOptions } from "@/core/export/contracts";
import { downloadText } from "@/core/export/download";
import { injectSnapshotPayload, SnapshotTemplateError } from "@/core/export/snapshotTemplate";
import { NoticeBanner } from "./NoticeBanner";
import pkg from "../../package.json";

const LARGE_FILE_BYTES = 25 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ExportNotice = { kind: "success"; message: string } | { kind: "warn" | "error"; message: string };

export function ExportControls(): ReactNode {
  const t = useT();
  const [locale] = useLocale();
  const doc = useSessionStore((s) => s.doc);
  const annotations = useSessionStore((s) => s.annotations);
  const [notice, setNotice] = useState<ExportNotice | null>(null);
  // 匯出當下的取捨，不進 store：換個 session 重新想一次比記住上次的選擇更合理。
  const [transcriptOptions, setTranscriptOptions] = useState<TranscriptOptions>(DEFAULT_TRANSCRIPT_OPTIONS);

  const exportOptions = (): BuildSessionExportOptions => ({
    exportedAt: new Date().toISOString(),
    appVersion: pkg.version,
    annotations,
  });

  const reportResult = (size: number) => {
    const isLarge = size > LARGE_FILE_BYTES;
    setNotice(isLarge
      ? { kind: "warn", message: t.export.doneLarge(formatBytes(size)) }
      : { kind: "success", message: t.export.done(formatBytes(size)) });
  };

  const reportFailure = (error: unknown, context: string) => {
    setNotice({ kind: "error", message: t.export.failed((error as Error).message) });
    console.error(context, error);
  };

  const exportJson = () => {
    if (!doc) return;
    try {
      const payload = buildSessionExport(doc, exportOptions());
      const filename = `dit-session-${doc.session.id.slice(0, 8)}-${stamp()}.json`;
      reportResult(downloadText(filename, "application/json", JSON.stringify(payload, null, 2)));
    } catch (error) {
      reportFailure(error, "Export JSON failed");
    }
  };

  const exportHtml = async () => {
    if (!doc) return;
    if (import.meta.env.DEV) {
      setNotice({ kind: "warn", message: t.export.devUnavailable });
      return;
    }
    try {
      const response = await fetch("./snapshot.html");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const template = await response.text();
      const payload = buildSessionExport(doc, exportOptions());
      const html = injectSnapshotPayload(template, payload);
      const filename = `dit-session-${doc.session.id.slice(0, 8)}-${stamp()}.html`;
      reportResult(downloadText(filename, "text/html", html));
    } catch (error) {
      const message = error instanceof SnapshotTemplateError ? t.export.templateMissing : t.export.failed((error as Error).message);
      setNotice({ kind: "error", message });
      console.error("Export HTML snapshot failed", error);
    }
  };

  const toggleTranscriptOption = (key: keyof TranscriptOptions) => (checked: boolean) => {
    setTranscriptOptions((previous) => ({ ...previous, [key]: checked }));
  };

  /** 逐字稿三種輸出共用的組裝；回傳 null 代表沒有載入 session。 */
  const currentTranscript = () => {
    if (!doc) return null;
    return buildTranscript(doc, {
      exportedAt: new Date().toISOString(),
      appVersion: pkg.version,
      options: transcriptOptions,
    });
  };

  const transcriptFilename = (extension: string) =>
    `dit-transcript-${doc?.session.id.slice(0, 8) ?? "session"}-${stamp()}.${extension}`;

  const exportTranscript = (format: "md" | "json" | "html") => {
    const transcript = currentTranscript();
    if (!transcript) return;
    try {
      const { text, mime, extension } = format === "md"
        ? { text: renderTranscriptMarkdown(transcript, t.transcript), mime: "text/markdown", extension: "md" }
        : format === "json"
          ? { text: JSON.stringify(transcript, null, 2), mime: "application/json", extension: "json" }
          : { text: renderTranscriptHtml(transcript, t.transcript, { lang: locale }), mime: "text/html", extension: "html" };
      reportResult(downloadText(transcriptFilename(extension), mime, text));
    } catch (error) {
      reportFailure(error, `Export transcript (${format}) failed`);
    }
  };

  const copyTranscript = async () => {
    const transcript = currentTranscript();
    if (!transcript) return;
    try {
      // 非安全來源 (http://) 或未授權時 clipboard 不存在，屬於預期情況——提示改用檔案匯出。
      await navigator.clipboard.writeText(renderTranscriptMarkdown(transcript, t.transcript));
      setNotice({ kind: "success", message: t.transcript.copied });
    } catch (error) {
      setNotice({ kind: "warn", message: t.transcript.copyFailed });
      console.error("Copy transcript failed", error);
    }
  };

  return (
    <>
      <fieldset className="settings-panel-group">
        <legend>{t.export.group}</legend>
        <div className="settings-actions export-actions">
          <button className="btn" onClick={exportJson} disabled={!doc}>{t.export.json}</button>
          <button className="btn" onClick={() => void exportHtml()} disabled={!doc}>{t.export.html}</button>
        </div>
        <p className="export-privacy-note">{t.export.privacyNote}</p>
      </fieldset>

      <fieldset className="settings-panel-group">
        <legend>{t.transcript.group}</legend>
        <div className="settings-actions">
          <label className="toggle">
            <input
              type="checkbox"
              checked={transcriptOptions.includeThinking}
              onChange={(event) => toggleTranscriptOption("includeThinking")(event.target.checked)}
            />
            {t.transcript.optionThinking}
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={transcriptOptions.includeToolSummary}
              onChange={(event) => toggleTranscriptOption("includeToolSummary")(event.target.checked)}
            />
            {t.transcript.optionToolSummary}
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={transcriptOptions.includeSubagents}
              onChange={(event) => toggleTranscriptOption("includeSubagents")(event.target.checked)}
            />
            {t.transcript.optionSubagents}
          </label>
        </div>
        <p className="option-hint">{t.transcript.optionSubagentsHint}</p>
        <div className="settings-actions export-actions">
          <button className="btn" onClick={() => exportTranscript("md")} disabled={!doc}>{t.transcript.markdown}</button>
          <button className="btn" onClick={() => exportTranscript("html")} disabled={!doc}>{t.transcript.html}</button>
          <button className="btn" onClick={() => exportTranscript("json")} disabled={!doc}>{t.transcript.json}</button>
          <button className="btn" onClick={() => void copyTranscript()} disabled={!doc}>{t.transcript.copy}</button>
        </div>
        {/* 逐字稿比 session 存檔更容易被貼出去分享，隱私提醒同樣要在場。 */}
        <p className="export-privacy-note">{t.transcript.hint} {t.export.privacyNote}</p>
      </fieldset>

      {notice && (notice.kind === "success"
        ? <span className="cache-status export-done">{notice.message}</span>
        : <NoticeBanner tone={notice.kind} onDismiss={() => setNotice(null)}>{notice.message}</NoticeBanner>)}
    </>
  );
}

function stamp(): string {
  return fileStamp(new Date());
}
