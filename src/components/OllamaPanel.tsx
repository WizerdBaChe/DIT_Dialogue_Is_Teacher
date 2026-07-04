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
import { RECOMMENDED_MODELS, type OllamaState } from "@/core/llm";

const STATE_META: Record<OllamaState, { dot: string; label: string; cls: string }> = {
  checking: { dot: "◌", label: "探測中…", cls: "checking" },
  ready: { dot: "●", label: "已就緒", cls: "ready" },
  "model-missing": { dot: "●", label: "已連線・指定模型未安裝", cls: "warn" },
  "no-model": { dot: "●", label: "已連線・尚無模型", cls: "warn" },
  offline: { dot: "●", label: "無法連線", cls: "offline" },
};

/** 可複製的指令列。 */
function Cmd({ text }: { text: string }): ReactNode {
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
      <button type="button" className="ol-copy" onClick={copy} aria-label="複製指令">
        {copied ? "已複製" : "複製"}
      </button>
    </div>
  );
}

export function OllamaPanel(): ReactNode {
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
  const meta = STATE_META[state];
  const installed = status?.models ?? [];
  // 下拉選項：已安裝 ∪ 推薦 (去重)，外加目前指定的模型。
  const options = Array.from(new Set([...installed, ...RECOMMENDED_MODELS, config.model]));
  const collapsed = manualOpen === null ? state === "ready" : !manualOpen;

  return (
    <section className="ollama-panel" aria-label="本地 Ollama 設定">
      <div className="ol-head">
        <button
          type="button"
          className="ol-toggle"
          onClick={() => setManualOpen(collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "展開 Ollama 設定" : "收合 Ollama 設定"}
          title={collapsed ? "展開設定" : "收合設定"}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <span className={`ol-status ${meta.cls}`}>
          <span className="ol-dot" aria-hidden="true">
            {meta.dot}
          </span>
          {meta.label}
        </span>
        <span className="ol-msg">{status?.message ?? "準備探測本地 Ollama…"}</span>
        <button type="button" className="btn ol-recheck" onClick={() => void refresh()}>
          重新檢查
        </button>
      </div>

      {collapsed ? null : (
      <>
      <div className="ol-row">
        <label htmlFor="ol-model">講解模型</label>
        <select id="ol-model" value={config.model} onChange={(e) => setModel(e.target.value)}>
          {options.map((m) => (
            <option key={m} value={m}>
              {m}
              {installed.includes(m) ? "" : "（未安裝）"}
            </option>
          ))}
        </select>

        <label htmlFor="ol-timeout">逾時</label>
        <select
          id="ol-timeout"
          value={config.timeoutMs}
          onChange={(e) => updateConfig({ timeoutMs: Number(e.target.value) })}
        >
          <option value={30000}>30 秒</option>
          <option value={60000}>60 秒</option>
          <option value={120000}>120 秒</option>
        </select>

        <label className="ol-check" title="僅對支援思考的模型 (qwen3 / deepseek-r1 / gpt-oss) 有效；gemma 等不支援者請勿勾選。">
          <input
            type="checkbox"
            checked={config.disableThinking}
            onChange={(e) => updateConfig({ disableThinking: e.target.checked })}
          />
          停用思考
        </label>
      </div>

      <div className="ol-row">
        <label htmlFor="ol-keepalive" title="讓模型留在 VRAM、連續講解免於重複冷載入；對大模型最有感。">
          保活
        </label>
        <select
          id="ol-keepalive"
          value={config.keepAlive}
          onChange={(e) => updateConfig({ keepAlive: e.target.value })}
        >
          <option value="">關閉（用 Ollama 預設）</option>
          <option value="5m">5 分鐘</option>
          <option value="10m">10 分鐘</option>
          <option value="30m">30 分鐘</option>
        </select>

        <label htmlFor="ol-numpredict" title="限制每段講解的輸出長度，越短越快。">
          輸出上限
        </label>
        <select
          id="ol-numpredict"
          value={config.numPredict}
          onChange={(e) => updateConfig({ numPredict: Number(e.target.value) })}
        >
          <option value={256}>256 token（最快）</option>
          <option value={512}>512 token（建議）</option>
          <option value={1024}>1024 token</option>
          <option value={0}>不限</option>
        </select>
      </div>
      <p className="ol-hint">
        模型較大 (≥4B) 首次回應需把模型載入 VRAM，可能較久 → 若逾時，先把「逾時」調到 120 秒再試。
        連續講解變慢多半是模型被卸載重載：把「保活」設長一點即可緩解。
        「停用思考」只適用 qwen3 / deepseek-r1 等會思考的模型。
      </p>

      {state === "offline" && (
        <div className="ol-guide">
          <p>請啟動 Ollama 並允許瀏覽器跨域存取，然後按「重新檢查」：</p>
          <Cmd text={`$env:OLLAMA_ORIGINS="*"; ollama serve`} />
          <p className="ol-hint">
            ↑ Windows PowerShell。或永久設定：<code>setx OLLAMA_ORIGINS "*"</code> 後重啟 Ollama。
            macOS/Linux：<code>OLLAMA_ORIGINS="*" ollama serve</code>。
          </p>
        </div>
      )}

      {state === "no-model" && (
        <div className="ol-guide">
          <p>尚未安裝任何模型。建議先 pull 一個輕量模型（擇一）：</p>
          {RECOMMENDED_MODELS.map((m) => (
            <Cmd key={m} text={`ollama pull ${m}`} />
          ))}
          <p className="ol-hint">安裝完成後按「重新檢查」。7B 約需數 GB 空間；3B 較省資源。</p>
        </div>
      )}

      {state === "model-missing" && (
        <div className="ol-guide">
          <p>
            指定模型「{config.model}」尚未安裝。可直接在上方下拉切換到已安裝的模型
            {installed.length > 0 ? `（${installed.join("、")}）` : ""}，或安裝它：
          </p>
          <Cmd text={`ollama pull ${config.model}`} />
        </div>
      )}

      {state === "ready" && (
        <p className="ol-ready-note">講解將由本機模型產生，程式碼與紀錄不外傳。可按上方「講解全部」開始。</p>
      )}
      </>
      )}
    </section>
  );
}
