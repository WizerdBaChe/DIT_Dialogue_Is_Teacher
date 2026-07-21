/** 設定匣「匯出」fieldset (D-R6-04)：JSON 匯出與 HTML 快照匯出 (EX-04)。 */
import { useState, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";
import { buildSessionExport, type BuildSessionExportOptions } from "@/core/export/buildExport";
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
  const doc = useSessionStore((s) => s.doc);
  const annotations = useSessionStore((s) => s.annotations);
  const [notice, setNotice] = useState<ExportNotice | null>(null);

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

  const exportJson = () => {
    if (!doc) return;
    try {
      const payload = buildSessionExport(doc, exportOptions());
      const filename = `dit-session-${doc.session.id.slice(0, 8)}-${stamp()}.json`;
      reportResult(downloadText(filename, "application/json", JSON.stringify(payload, null, 2)));
    } catch (error) {
      setNotice({ kind: "error", message: t.export.failed((error as Error).message) });
      console.error("Export JSON failed", error);
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

  return (
    <fieldset className="settings-group">
      <legend>{t.export.group}</legend>
      <div className="settings-actions export-actions">
        <button className="btn" onClick={exportJson} disabled={!doc}>{t.export.json}</button>
        <button className="btn" onClick={() => void exportHtml()} disabled={!doc}>{t.export.html}</button>
      </div>
      <p className="export-privacy-note">{t.export.privacyNote}</p>
      {notice && (notice.kind === "success"
        ? <span className="cache-status export-done">{notice.message}</span>
        : <NoticeBanner tone={notice.kind} onDismiss={() => setNotice(null)}>{notice.message}</NoticeBanner>)}
    </fieldset>
  );
}

function stamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}
