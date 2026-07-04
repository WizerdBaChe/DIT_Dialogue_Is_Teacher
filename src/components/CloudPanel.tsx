/**
 * 雲端講解設定面板 (僅在「講解來源 = 雲端 API」時顯示)。
 *
 * ⚠ 目前為「UI 骨架」：欄位會寫入 store.cloudConfig，但 cloudProvider 仍是樁、
 *    按「講解全部」會明確報「尚未啟用」。真正的雲端呼叫 (例如 Mistral 免費 API)
 *    待之後接上 —— 設計上欄位/資料流已就緒，屆時只需實作 provider.annotate。
 *
 * 此面板與 OllamaPanel 對齊 (可摺疊、同一套樣式)，維持兩種來源的一致體驗。
 */
import { useState, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";

export function CloudPanel(): ReactNode {
  const providerId = useSessionStore((s) => s.providerId);
  const config = useSessionStore((s) => s.cloudConfig);
  const updateConfig = useSessionStore((s) => s.updateCloudConfig);
  const [open, setOpen] = useState(true);

  if (providerId !== "cloud") return null;

  return (
    <section className="ollama-panel cloud-panel" aria-label="雲端 API 設定">
      <div className="ol-head">
        <button
          type="button"
          className="ol-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "收合雲端設定" : "展開雲端設定"}
          title={open ? "收合設定" : "展開設定"}
        >
          {open ? "▾" : "▸"}
        </button>
        <span className="ol-status warn">
          <span className="ol-dot" aria-hidden="true">
            ●
          </span>
          尚未啟用（UI 預留）
        </span>
        <span className="ol-msg">
          雲端講解介面已就緒，但實際呼叫尚未接上；填入設定後按「講解全部」會提示尚未啟用。
        </span>
      </div>

      {open && (
        <>
          <div className="ol-row">
            <label htmlFor="cl-base">API 端點</label>
            <input
              id="cl-base"
              className="ol-input"
              type="text"
              placeholder="https://api.mistral.ai/v1（範例，尚未接上）"
              value={config.baseUrl}
              onChange={(e) => updateConfig({ baseUrl: e.target.value })}
            />
          </div>

          <div className="ol-row">
            <label htmlFor="cl-model">模型</label>
            <input
              id="cl-model"
              className="ol-input"
              type="text"
              placeholder="例：mistral-small-latest"
              value={config.model}
              onChange={(e) => updateConfig({ model: e.target.value })}
            />

            <label htmlFor="cl-key">API Key</label>
            <input
              id="cl-key"
              className="ol-input"
              type="password"
              placeholder="僅存在本機記憶體，不會寫入磁碟"
              value={config.apiKey}
              onChange={(e) => updateConfig({ apiKey: e.target.value })}
              autoComplete="off"
            />
          </div>

          <p className="ol-hint">
            ☁ 雲端講解會把 session 片段送至外部服務，請確認內容不含機密。此區為預留骨架，
            待接上供應商 API（如 Mistral 免費方案）後即可使用；金鑰只留在本機記憶體、重新整理即清除。
          </p>
        </>
      )}
    </section>
  );
}
