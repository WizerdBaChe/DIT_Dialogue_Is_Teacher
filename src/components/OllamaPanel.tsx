/**
 * 本地 Ollama 引導面板 (僅在「講解來源 = 本地 Ollama」時顯示)。
 * 探測連線與已安裝模型，依狀態給出可操作的指引：
 *  - offline       → 啟動 Ollama + 設定 OLLAMA_ORIGINS 的可複製指令。
 *  - no-model      → 提示安裝推薦模型 (ollama pull ...)。
 *  - model-missing → 已安裝其他模型，可直接切換，或安裝指定模型。
 *  - ready         → 顯示就緒並可切換模型。
 */
import { useEffect, useState, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";
import { RECOMMENDED_MODELS, type OllamaState } from "@/core/llm";
import { getRuntimeStartCommand } from "@/core/runtime";

/** 狀態記號 (幾何字元，非 emoji) 與 CSS class；文字標籤走 i18n。 */
const STATE_DOT: Record<OllamaState, { dot: string; cls: string }> = {
  checking: { dot: "◌", cls: "checking" },
  ready: { dot: "●", cls: "ready" },
  "model-missing": { dot: "●", cls: "warn" },
  "no-model": { dot: "●", cls: "warn" },
  offline: { dot: "●", cls: "offline" },
};

/** 可複製的指令列。 */
function Cmd({ text }: { text: string }): ReactNode {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => undefined,
    );
  };
  return (
    <div className="ol-cmd">
      <code>{text}</code>
      <button type="button" className="ol-copy" onClick={copy} aria-label={t.ollama.copyAria}>
        {copied ? t.ollama.copied : t.ollama.copy}
      </button>
    </div>
  );
}

export function OllamaPanel(): ReactNode {
  const t = useT();
  const providerId = useSessionStore((s) => s.providerId);
  const status = useSessionStore((s) => s.ollamaStatus);
  const config = useSessionStore((s) => s.ollamaConfig);
  const refresh = useSessionStore((s) => s.refreshOllamaStatus);
  const setModel = useSessionStore((s) => s.setOllamaModel);
  const updateConfig = useSessionStore((s) => s.updateOllamaConfig);

  // 面板只在 ollama 模式掛載；掛載即探測一次。
  useEffect(() => {
    if (providerId === "ollama" && !status) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 摺疊狀態：使用者未手動切換前，就緒時預設收合 (省空間)，未就緒時展開 (需要引導)。
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);

  if (providerId !== "ollama") return null;

  const state: OllamaState = status?.state ?? "checking";
  const meta = STATE_DOT[state];
  const installed = status?.models ?? [];
  // 下拉選項：已安裝 ∪ 推薦 (去重)，外加目前指定的模型。
  const options = Array.from(new Set([...installed, ...RECOMMENDED_MODELS, config.model]));
  const collapsed = manualOpen === null ? state === "ready" : !manualOpen;

  return (
    <section className="ollama-panel" aria-label={t.ollama.panelLabel}>
      <div className="ol-head">
        <button
          type="button"
          className="ol-toggle"
          onClick={() => setManualOpen(collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t.ollama.expand : t.ollama.collapse}
          title={collapsed ? t.ollama.expandShort : t.ollama.collapseShort}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <span className={`ol-status ${meta.cls}`}>
          <span className="ol-dot" aria-hidden="true">
            {meta.dot}
          </span>
          {t.ollama.states[state]}
        </span>
        <span className="ol-msg">{status?.message ?? t.ollama.defaultMsg}</span>
        <button type="button" className="btn ol-recheck" onClick={() => void refresh()}>
          {t.ollama.recheck}
        </button>
      </div>

      {collapsed ? null : (
        <>
          <div className="ol-row">
            <label htmlFor="ol-model">{t.ollama.model}</label>
            <select id="ol-model" value={config.model} onChange={(e) => setModel(e.target.value)}>
              {options.map((m) => (
                <option key={m} value={m}>
                  {m}
                  {installed.includes(m) ? "" : t.ollama.notInstalled}
                </option>
              ))}
            </select>

            <label htmlFor="ol-timeout">{t.ollama.timeout}</label>
            <select
              id="ol-timeout"
              value={config.timeoutMs}
              onChange={(e) => updateConfig({ timeoutMs: Number(e.target.value) })}
            >
              <option value={30000}>{t.ollama.sec(30)}</option>
              <option value={60000}>{t.ollama.sec(60)}</option>
              <option value={120000}>{t.ollama.sec(120)}</option>
            </select>

            <label className="ol-check" title={t.ollama.disableThinkingTitle}>
              <input
                type="checkbox"
                checked={config.disableThinking}
                onChange={(e) => updateConfig({ disableThinking: e.target.checked })}
              />
              {t.ollama.disableThinking}
            </label>
          </div>

          <div className="ol-row">
            <label htmlFor="ol-keepalive" title={t.ollama.keepAliveTitle}>
              {t.ollama.keepAlive}
            </label>
            <select
              id="ol-keepalive"
              value={config.keepAlive}
              onChange={(e) => updateConfig({ keepAlive: e.target.value })}
            >
              <option value="">{t.ollama.keepAliveOff}</option>
              <option value="5m">{t.ollama.min(5)}</option>
              <option value="10m">{t.ollama.min(10)}</option>
              <option value="30m">{t.ollama.min(30)}</option>
            </select>

            <label htmlFor="ol-numpredict" title={t.ollama.numPredict}>
              {t.ollama.numPredict}
            </label>
            <select
              id="ol-numpredict"
              value={config.numPredict}
              onChange={(e) => updateConfig({ numPredict: Number(e.target.value) })}
            >
              <option value={256}>{t.ollama.numPredictOptions.fast}</option>
              <option value={512}>{t.ollama.numPredictOptions.recommended}</option>
              <option value={1024}>{t.ollama.numPredictOptions.long}</option>
              <option value={0}>{t.ollama.numPredictOptions.unlimited}</option>
            </select>
          </div>
          <p className="ol-hint">{t.ollama.hint}</p>

          {state === "offline" && (
            <div className="ol-guide">
              <p>{t.ollama.offlineGuide}</p>
              <Cmd text={getRuntimeStartCommand("ollama")} />
              <p className="ol-hint">
                {t.ollama.offlineHintPrefix}
                <code>setx OLLAMA_ORIGINS "*"</code>
                {t.ollama.offlineHintMid}
                <code>OLLAMA_ORIGINS="*" ollama serve</code>
                {t.ollama.offlineHintEnd}
              </p>
            </div>
          )}

          {state === "no-model" && (
            <div className="ol-guide">
              <p>{t.ollama.noModelGuide}</p>
              {RECOMMENDED_MODELS.map((m) => (
                <Cmd key={m} text={`ollama pull ${m}`} />
              ))}
              <p className="ol-hint">{t.ollama.noModelHint}</p>
            </div>
          )}

          {state === "model-missing" && (
            <div className="ol-guide">
              <p>
                {t.ollama.modelMissingGuide(config.model, t.ollama.modelMissingInstalled(installed))}
              </p>
              <Cmd text={`ollama pull ${config.model}`} />
            </div>
          )}

          {state === "ready" && <p className="ol-ready-note">{t.ollama.readyNote}</p>}
          <p className="ol-hint">{t.ollama.runtimeOwnership}</p>
        </>
      )}
    </section>
  );
}
