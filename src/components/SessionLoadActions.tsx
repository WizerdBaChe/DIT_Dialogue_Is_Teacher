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
  const resumeLastDirectory = useSessionStore((state) => state.resumeLastDirectory);
  const snapshotMode = useSessionStore((state) => state.snapshotMode);
  const copy = labels === "overview" ? t.overview : t.header;

  // LS-INV-7：快照模式下不應存在載入入口，守門實作在元件自身，呼叫端不需各自判斷。
  if (snapshotMode) return null;

  const onFiles = (event: ChangeEvent<HTMLInputElement>): void => {
    const selected = [...(event.target.files ?? [])].filter((file) => /\.(jsonl|json|txt)$/i.test(file.name));
    event.target.value = "";
    if (selected.length === 0) return;
    void loadFromBlobs(selected.map((file) => ({ path: file.webkitRelativePath || file.name, blob: file })), "user");
  };

  return (
    <div className={`session-load-actions ${className}`.trim()}>
      <label className="btn file-btn" title={t.header.loadFileTitle}>
        {copy.loadFile}
        <input type="file" accept=".jsonl,.json,.txt" multiple onChange={onFiles} />
      </label>
      {/*
        R9 D3：資料夾入口變成二級行為——先開瀏覽器，看得懂了再挑。原本的做法是直接把整個
        資料夾合併載入，於是選到上層目錄就要靠一個數量門檻彈窗事後補救；瀏覽器讓「盲選」
        這件事本身不再發生，那個彈窗因此退役。入口數量不變，仍是兩顆。
      */}
      <button type="button" className="btn" title={t.browser.hintPath} onClick={() => void resumeLastDirectory()}>
        {copy.loadFolder}
      </button>
    </div>
  );
}
