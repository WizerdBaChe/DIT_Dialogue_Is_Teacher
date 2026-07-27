/**
 * Session 瀏覽器 (DSM-4)。「載入資料夾」的二級行為：選目錄 → 看清單 → 挑一個 → 才載入。
 *
 * 存在的理由：`~/.claude/projects/` 底下全是 HASH 檔名，原生檔案選擇器只能靠猜。
 * 這裡用索引器算出的標題、規模與分類把它變成看得懂的清單。
 *
 * 分類是徽章，不是預設過濾器 (R9 D4)：篩選鈕預設全開，唯一的啟發式規則
 * (synthetic-prompts-only) 誤判時，使用者仍然看得到、點得到那一筆。
 */
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useDiagnosticCopy, useT } from "@/i18n";
import { isDirectoryPickerSupported, type SessionIndexEntry, type SessionKind } from "@/core/index";

const KIND_ORDER: SessionKind[] = ["dialogue", "subagent", "machine", "unknown"];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export function SessionBrowserDialog(): ReactNode {
  const t = useT();
  const copy = useDiagnosticCopy();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const browseState = useSessionStore((s) => s.browseState);
  const directoryName = useSessionStore((s) => s.browseDirectoryName);
  const progress = useSessionStore((s) => s.browseProgress);
  const entries = useSessionStore((s) => s.indexEntries);
  const indexDiagnostics = useSessionStore((s) => s.indexDiagnostics);
  const filter = useSessionStore((s) => s.browseFilter);
  const pickAndIndexDirectory = useSessionStore((s) => s.pickAndIndexDirectory);
  const indexFileList = useSessionStore((s) => s.indexFileList);
  const closeBrowser = useSessionStore((s) => s.closeBrowser);
  const toggleBrowseFilter = useSessionStore((s) => s.toggleBrowseFilter);
  const loadIndexEntry = useSessionStore((s) => s.loadIndexEntry);

  const open = browseState !== "no_directory";
  const supportsPicker = isDirectoryPickerSupported();
  const visible = entries.filter((entry) => filter[entry.kind]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
        dialog.dataset.modalFallback = "true";
      }
    } else if (!open && dialog.open) {
      try {
        dialog.close();
      } catch {
        dialog.removeAttribute("open");
        delete dialog.dataset.modalFallback;
      }
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const choose = (): void => {
    if (supportsPicker) void pickAndIndexDirectory();
    else fileInputRef.current?.click();
  };

  const onFallbackFiles = (files: FileList | null): void => {
    const list = [...(files ?? [])].filter((file) => /\.jsonl$/i.test(file.name));
    if (list.length === 0) return;
    const relative = (list[0] as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
    void indexFileList(list, relative.split("/")[0] || "—");
  };

  return (
    <dialog
      ref={dialogRef}
      id="session-browser-dialog"
      className="session-browser-dialog"
      aria-labelledby="session-browser-dialog-title"
      // escapable：這裡沒有破壞性動作，Escape／backdrop 等同「關閉」。
      onCancel={(event) => {
        event.preventDefault();
        closeBrowser();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) closeBrowser();
      }}
    >
      {open && (
        <div className="session-browser-shell">
          <header className="session-browser-head">
            <div>
              <h2 id="session-browser-dialog-title" ref={titleRef} tabIndex={-1}>{t.browser.title}</h2>
              <p className="session-browser-sub">
                {directoryName ? t.browser.subtitle(directoryName, entries.length) : t.browser.hintPath}
              </p>
            </div>
            <div className="session-browser-head-actions">
              <button type="button" className="btn" onClick={choose}>
                {directoryName ? t.browser.repick : t.browser.pick}
              </button>
              <button type="button" className="btn" onClick={closeBrowser}>{t.browser.close}</button>
            </div>
          </header>

          {!supportsPicker && <p className="option-hint">{t.browser.hintFallback}</p>}

          <fieldset className="session-browser-filters">
            <legend className="visually-hidden">{t.browser.filterLabel}</legend>
            {KIND_ORDER.map((kind) => (
              <label key={kind} className={`session-browser-chip kind-${kind} ${filter[kind] ? "on" : ""}`}>
                <input type="checkbox" checked={filter[kind]} onChange={() => toggleBrowseFilter(kind)} />
                {t.browser.kinds[kind]}
                <span className="session-browser-chip-count">
                  {entries.filter((entry) => entry.kind === kind).length}
                </span>
              </label>
            ))}
          </fieldset>

          {indexDiagnostics.length > 0 && (
            <ul className="session-browser-diagnostics">
              {indexDiagnostics.map((diagnostic, index) => <li key={index}>{copy.line(diagnostic)}</li>)}
            </ul>
          )}

          {browseState === "picking" && <p className="session-browser-status">{t.browser.picking}</p>}
          {browseState === "indexing" && (
            <p className="session-browser-status" role="status" aria-live="polite">
              {t.browser.indexing(progress?.[0] ?? 0, progress?.[1] ?? 0)}
            </p>
          )}
          {browseState === "loading" && <p className="session-browser-status" role="status">{t.browser.loading}</p>}
          {browseState === "index_failed" && (
            <div className="session-browser-status error">
              <strong>{t.browser.indexFailedTitle}</strong>
              <button type="button" className="btn primary" onClick={choose}>{t.browser.retry}</button>
            </div>
          )}

          {browseState === "indexed" && entries.length === 0 && <p className="session-browser-status">{t.browser.empty}</p>}
          {browseState === "indexed" && entries.length > 0 && visible.length === 0 && (
            <p className="session-browser-status">{t.browser.emptyFiltered}</p>
          )}

          {visible.length > 0 && (
            <ul className="session-browser-list">
              {visible.map((entry) => (
                <SessionRow key={entry.path} entry={entry} onOpen={() => void loadIndexEntry(entry.path)} />
              ))}
            </ul>
          )}

          <input
            ref={fileInputRef}
            type="file"
            className="visually-hidden"
            accept=".jsonl"
            multiple
            onChange={(event) => {
              onFallbackFiles(event.target.files);
              event.target.value = "";
            }}
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          />
        </div>
      )}
    </dialog>
  );
}

function SessionRow({ entry, onOpen }: { entry: SessionIndexEntry; onOpen: () => void }): ReactNode {
  const t = useT();
  return (
    <li className="session-browser-row">
      <button type="button" className="session-browser-row-button" onClick={onOpen} title={t.browser.open}>
        <span className={`session-browser-badge kind-${entry.kind}`} title={t.browser.kindReasons[entry.kindReason]}>
          {t.browser.kinds[entry.kind]}
        </span>
        <span className="session-browser-row-main">
          <span className={`session-browser-row-title title-${entry.titleSource}`} title={t.browser.titleSources[entry.titleSource]}>
            {entry.title}
          </span>
          <span className="session-browser-row-meta">
            {entry.projectPath ?? entry.project ?? "—"}
          </span>
        </span>
        <span className="session-browser-row-facts">
          <span>{formatTime(entry.endedAt ?? entry.startedAt)}</span>
          <span>{t.browser.counts(entry.humanPromptCount, entry.assistantCount, entry.countsExact)}</span>
          <span>{formatSize(entry.sizeBytes)}</span>
          {entry.subagentPaths.length > 0 && <span>{t.browser.subagentCount(entry.subagentPaths.length)}</span>}
          {entry.hasCompaction && <span className="session-browser-tag">{t.browser.compaction}</span>}
        </span>
      </button>
    </li>
  );
}
