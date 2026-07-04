/** 頂部標頭：品牌、檔案載入、講解開關、重播控制、Provider 選擇。 */
import { type ChangeEvent, type ReactNode } from "react";
import { useSessionStore, type ViewMode } from "@/store/sessionStore";
import type { ProviderId } from "@/types/spanTree";
import { PROVIDER_LABEL } from "./labels";

const PROVIDERS: ProviderId[] = ["none", "ollama", "cloud"];
const MODES: { id: ViewMode; label: string }[] = [
  { id: "cognitive", label: "認知" },
  { id: "dense", label: "高密度" },
];

export function Header(): ReactNode {
  const hasDoc = useSessionStore((s) => Boolean(s.doc));
  const providerId = useSessionStore((s) => s.providerId);
  const showAnnotations = useSessionStore((s) => s.showAnnotations);
  const isPlaying = useSessionStore((s) => s.isPlaying);
  const viewMode = useSessionStore((s) => s.viewMode);
  const hasAnnotations = useSessionStore((s) => Object.keys(s.annotations).length > 0);

  const loadFromText = useSessionStore((s) => s.loadFromText);
  const setViewMode = useSessionStore((s) => s.setViewMode);
  const setProvider = useSessionStore((s) => s.setProvider);
  const toggleAnnotations = useSessionStore((s) => s.toggleAnnotations);
  const play = useSessionStore((s) => s.play);
  const next = useSessionStore((s) => s.next);
  const prev = useSessionStore((s) => s.prev);
  const annotateAll = useSessionStore((s) => s.annotateAll);
  const clearAnnotations = useSessionStore((s) => s.clearAnnotations);
  const resetToSample = useSessionStore((s) => s.resetToSample);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadFromText(String(reader.result ?? ""));
    reader.onerror = () => useSessionStore.setState({ error: `讀取檔案失敗：${file.name}`, doc: null, viewItems: [] });
    reader.readAsText(file);
    e.target.value = ""; // 允許重複選同一檔。
  };

  return (
    <header className="header">
      <div className="brand">
        <h1>🎓 DIT — Dialogue Is Teacher</h1>
        <p>把 agent 執行軌跡轉成「可學習」的節點</p>
      </div>
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="檢視模式">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`seg-btn ${viewMode === m.id ? "active" : ""}`}
              onClick={() => setViewMode(m.id)}
              aria-pressed={viewMode === m.id}
            >
              {m.label}
            </button>
          ))}
        </div>

        <label className="btn file-btn">
          載入 .jsonl
          <input type="file" accept=".jsonl,.json,.txt" onChange={onFile} />
        </label>

        <button className="btn" onClick={resetToSample} title="回到內建範例與預設設定">
          ↺ 重置
        </button>

        <label className="toggle">
          <input type="checkbox" checked={showAnnotations} onChange={toggleAnnotations} disabled={providerId === "none"} />
          顯示教學講解
        </label>

        {providerId !== "none" && (
          <button className="btn" onClick={() => void annotateAll()} disabled={!hasDoc}>
            講解全部
          </button>
        )}

        {providerId !== "none" && hasAnnotations && (
          <button className="btn" onClick={clearAnnotations} title="清除目前所有教學講解">
            清除講解
          </button>
        )}

        <div className="control">
          <button className="btn" onClick={prev} disabled={!hasDoc} title="上一步">
            ⏮
          </button>
          <button className="btn primary" onClick={play} disabled={!hasDoc}>
            {isPlaying ? "⏸ 暫停" : "▶ 重播"}
          </button>
          <button className="btn" onClick={next} disabled={!hasDoc} title="下一步">
            ⏭
          </button>
        </div>

        <div className="control">
          <label>講解來源</label>
          <select value={providerId} onChange={(e) => setProvider(e.target.value as ProviderId)}>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}
