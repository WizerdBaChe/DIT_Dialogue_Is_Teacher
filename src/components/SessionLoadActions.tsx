import { type ChangeEvent, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { profileFor, SUPPORTED_SOURCES } from "@/core/source/profiles";
import { useT } from "@/i18n";

interface SessionLoadActionsProps {
  labels?: "header" | "overview";
  className?: string;
}

/**
 * 載入入口 (R9 D3 · R9.1 F1 · R12 M2)。
 *
 * R12 M2 把它變成**兩級**：一級挑 agent 系統，二級才是原本那兩顆。原因不是介面偏好，是兩套
 * 系統的 session 從來就不在同一個地方、標題也不從同一個欄位來——先前所有入口都預設「一個
 * 資料夾、一套規則」，於是 Codex 的 session 永遠拿不到自己的標題來源。一級選單讓使用者說出
 * 意圖，探索才有辦法照那套系統自己的規則走。
 *
 * 兩件刻意的事：
 *  - **一級選單只設定狀態，不開選擇器。** `showDirectoryPicker()` 必須在使用者手勢裡，把挑
 *    系統和開資料夾綁成一個動作，會讓「我先看看有哪些選項」也吃掉那次手勢。
 *  - **二級在一級選完之前不存在**，不是 disabled。一顆按不下去的按鈕仍然在邀請使用者按它。
 */
export function SessionLoadActions({ labels = "header", className = "" }: SessionLoadActionsProps): ReactNode {
  const t = useT();
  const loadFromBlobs = useSessionStore((state) => state.loadFromBlobs);
  const resumeLastDirectory = useSessionStore((state) => state.resumeLastDirectory);
  const snapshotMode = useSessionStore((state) => state.snapshotMode);
  const activeSource = useSessionStore((state) => state.activeSource);
  const chooseSource = useSessionStore((state) => state.chooseSource);
  const clearSource = useSessionStore((state) => state.clearSource);
  const copy = labels === "overview" ? t.overview : t.header;

  // LS-INV-7：快照模式下不應存在載入入口，守門實作在元件自身，呼叫端不需各自判斷。
  if (snapshotMode) return null;

  const onFiles = (event: ChangeEvent<HTMLInputElement>): void => {
    const selected = [...(event.target.files ?? [])].filter((file) => /\.(jsonl|json|txt)$/i.test(file.name));
    event.target.value = "";
    if (selected.length === 0) return;
    void loadFromBlobs(selected.map((file) => ({ path: file.webkitRelativePath || file.name, blob: file })), "user");
  };

  if (!activeSource) {
    return (
      <div className={`session-load-actions source-picker ${className}`.trim()} data-level="1">
        {/*
          說明在上、按鈕在下。標題原本住在 choices 那排 flex 裡，於是它跟兩顆按鈕並排成
          一列，讀起來是交錯的。標題與提示是文字、按鈕是動作，兩者不共用一排。
        */}
        <p data-role="label" id="source-picker-label" className="source-picker-label">{t.sourcePicker.label}</p>
        <p data-role="hint" className="source-picker-hint">{t.sourcePicker.hint}</p>
        <div data-role="choices" className="source-picker-choices" role="group" aria-labelledby="source-picker-label">
          {SUPPORTED_SOURCES.map((source) => (
            <button
              key={source}
              type="button"
              className="btn primary source-choice"
              data-source={source}
              /*
               * Explicit, because name-from-content concatenates the two spans with no
               * separator ("Claude Code通常在 ~/.claude/projects"). The path is genuinely
               * useful to a screen reader — it is how you know which folder to pick — so it
               * stays in the name rather than being hidden from assistive tech.
               */
              aria-label={`${profileFor(source).label} — ${t.sourcePicker.rootHintLabel} ${profileFor(source).discovery.rootHint}`}
              onClick={() => chooseSource(source)}
            >
              <span className="source-choice-name">{profileFor(source).label}</span>
              {/* 路徑提示唯一的定義處是側寫表，不是文案表——兩份會走鐘。 */}
              <span className="source-choice-root">
                {t.sourcePicker.rootHintLabel} <code>{profileFor(source).discovery.rootHint}</code>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`session-load-actions ${className}`.trim()} data-level="2" data-source={activeSource}>
      {/*
        `data-role` marks every child that is NOT a load entry, at both levels — so the rule is
        "no data-role inside .session-load-actions means it IS a load entry". R9 D3 fixed the
        entry count at two and R9.1 F1 fixed their order; a test still counts them, and that
        marker is what lets it count entries rather than children now that there is chrome.
      */}
      <button type="button" data-role="nav" className="btn source-back" title={t.sourcePicker.changeTitle} onClick={() => clearSource()}>
        <span className="source-back-name">{profileFor(activeSource).label}</span>
        <span className="source-back-action">{t.sourcePicker.change}</span>
      </button>
      {/*
        R9.1 F1（作者裁決）：兩顆的**優先序**跟著 R9 的事實走。Session 瀏覽器上線之後，
        「盲選 HASH 檔名」不再是常態路徑，單檔載入的真正用途縮小成「我已經知道是哪個檔」。
        因此資料夾排第一並升為主按鈕，單檔排第二、維持一般樣式。R12 M2 不動這個順序，
        只是把它們整個放到一級選單底下。
      */}
      <button type="button" className="btn primary" title={copy.loadFolderTitle} onClick={() => void resumeLastDirectory()}>
        {copy.loadFolder}
      </button>
      <label className="btn file-btn" title={copy.loadFileTitle}>
        {copy.loadFile}
        <input type="file" accept=".jsonl,.json,.txt" multiple onChange={onFiles} />
      </label>
      <span data-role="hint" className="source-picker-root" data-root-hint={profileFor(activeSource).discovery.rootHint}>
        {t.sourcePicker.rootHintLabel} <code>{profileFor(activeSource).discovery.rootHint}</code>
      </span>
    </div>
  );
}
