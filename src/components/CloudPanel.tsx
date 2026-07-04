/**
 * 雲端講解設定面板 (僅在「講解來源 = 雲端 API」時顯示)。
 *
 * 目前為「UI 骨架」：欄位會寫入 store.cloudConfig，但 cloudProvider 仍是樁、
 * 按「講解全部」會明確報「尚未啟用」。真正的雲端呼叫 (例如 Mistral 免費 API)
 * 待之後接上 —— 設計上欄位/資料流已就緒，屆時只需實作 provider.annotate。
 *
 * 此面板與 OllamaPanel 對齊 (可摺疊、同一套樣式)，維持兩種來源的一致體驗。
 */
import { useState, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";

export function CloudPanel(): ReactNode {
  const t = useT();
  const providerId = useSessionStore((s) => s.providerId);
  const config = useSessionStore((s) => s.cloudConfig);
  const updateConfig = useSessionStore((s) => s.updateCloudConfig);
  const [open, setOpen] = useState(true);

  if (providerId !== "cloud") return null;

  return (
    <section className="ollama-panel cloud-panel" aria-label={t.cloud.panelLabel}>
      <div className="ol-head">
        <button
          type="button"
          className="ol-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? t.cloud.collapse : t.cloud.expand}
          title={open ? t.cloud.collapse : t.cloud.expand}
        >
          {open ? "▾" : "▸"}
        </button>
        <span className="ol-status warn">
          <span className="ol-dot" aria-hidden="true">
            ●
          </span>
          {t.cloud.status}
        </span>
        <span className="ol-msg">{t.cloud.msg}</span>
      </div>

      {open && (
        <>
          <div className="ol-row">
            <label htmlFor="cl-base">{t.cloud.endpoint}</label>
            <input
              id="cl-base"
              className="ol-input"
              type="text"
              placeholder={t.cloud.endpointPlaceholder}
              value={config.baseUrl}
              onChange={(e) => updateConfig({ baseUrl: e.target.value })}
            />
          </div>

          <div className="ol-row">
            <label htmlFor="cl-model">{t.cloud.model}</label>
            <input
              id="cl-model"
              className="ol-input"
              type="text"
              placeholder={t.cloud.modelPlaceholder}
              value={config.model}
              onChange={(e) => updateConfig({ model: e.target.value })}
            />

            <label htmlFor="cl-key">{t.cloud.apiKey}</label>
            <input
              id="cl-key"
              className="ol-input"
              type="password"
              placeholder={t.cloud.apiKeyPlaceholder}
              value={config.apiKey}
              onChange={(e) => updateConfig({ apiKey: e.target.value })}
              autoComplete="off"
            />
          </div>

          <p className="ol-hint">{t.cloud.hint}</p>
        </>
      )}
    </section>
  );
}
