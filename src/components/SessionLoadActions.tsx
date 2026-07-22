import { type ChangeEvent, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";

interface SessionLoadActionsProps {
  labels?: "header" | "overview";
  className?: string;
}

export function SessionLoadActions({ labels = "header", className = "" }: SessionLoadActionsProps): ReactNode {
  const t = useT();
  const loadFromBlobs = useSessionStore((state) => state.loadFromBlobs);
  const snapshotMode = useSessionStore((state) => state.snapshotMode);
  const copy = labels === "overview" ? t.overview : t.header;

  // LS-INV-7：快照模式下不應存在載入入口，守門實作在元件自身，呼叫端不需各自判斷。
  if (snapshotMode) return null;

  const onFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = [...(event.target.files ?? [])].filter((file) => /\.(jsonl|json|txt)$/i.test(file.name));
    event.target.value = "";
    if (selected.length === 0) return;
    void loadFromBlobs(selected.map((file) => ({
      path: file.webkitRelativePath || file.name,
      blob: file,
    })), "user");
  };

  return (
    <div className={`session-load-actions ${className}`.trim()}>
      <label className="btn file-btn">
        {copy.loadFile}
        <input type="file" accept=".jsonl,.json,.txt" multiple onChange={onFiles} />
      </label>
      <label className="btn file-btn" title={t.header.loadFolderTitle}>
        {copy.loadFolder}
        <input
          type="file"
          accept=".jsonl,.json,.txt"
          multiple
          onChange={onFiles}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        />
      </label>
    </div>
  );
}
