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
      {/*
        R9 D3：資料夾入口是二級行為——先開瀏覽器，看得懂了再挑。原本的做法是直接把整個
        資料夾合併載入，於是選到上層目錄就要靠一個數量門檻彈窗事後補救；瀏覽器讓「盲選」
        這件事本身不再發生，那個彈窗因此退役。入口數量不變，仍是兩顆。

        R9.1 F1（作者裁決）：兩顆的**優先序**跟著 R9 的事實走。Session 瀏覽器上線之後，
        「盲選 HASH 檔名」不再是常態路徑，單檔載入的真正用途縮小成「我已經知道是哪個檔」。
        因此資料夾排第一並升為主按鈕，單檔排第二、維持一般樣式；文案也從「載入 .jsonl」
        改成講用途而不是講副檔名。
      */}
      <button type="button" className="btn primary" title={copy.loadFolderTitle} onClick={() => void resumeLastDirectory()}>
        {copy.loadFolder}
      </button>
      <label className="btn file-btn" title={copy.loadFileTitle}>
        {copy.loadFile}
        <input type="file" accept=".jsonl,.json,.txt" multiple onChange={onFiles} />
      </label>
    </div>
  );
}
