/** OpenCode server controls for cloud-backed teaching annotations. */
import { useEffect, useState, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";
import type { OpenCodeState } from "@/core/llm";
import { WEB_RUNTIME_START_COMMANDS } from "@/core/runtime";

const STATE_CLASS: Record<OpenCodeState, string> = {
  checking: "checking",
  ready: "ready",
  offline: "offline",
  "provider-missing": "warn",
  "model-missing": "warn",
  "agent-missing": "warn",
};

export function CloudPanel(): ReactNode {
  const t = useT();
  const providerId = useSessionStore((s) => s.providerId);
  const config = useSessionStore((s) => s.cloudConfig);
  const status = useSessionStore((s) => s.openCodeStatus);
  const updateConfig = useSessionStore((s) => s.updateCloudConfig);
  const setModel = useSessionStore((s) => s.setOpenCodeModel);
  const refresh = useSessionStore((s) => s.refreshOpenCodeStatus);
  const privacyPolicyId = useSessionStore((s) => s.privacyPolicyId);
  const setPrivacyPolicy = useSessionStore((s) => s.setPrivacyPolicy);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (providerId === "cloud" && !status) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (providerId !== "cloud") return null;

  const state = status?.state ?? "checking";
  const models = Array.from(new Set([...(status?.models ?? []), config.modelID]));
  const copyCommand = () => {
    void navigator.clipboard?.writeText(WEB_RUNTIME_START_COMMANDS.opencode).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => undefined,
    );
  };

  return (
    <section className="ollama-panel cloud-panel" aria-label={t.cloud.panelLabel}>
      <div className="ol-head">
        <button
          type="button"
          className="ol-toggle"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? t.cloud.collapse : t.cloud.expand}
          title={open ? t.cloud.collapse : t.cloud.expand}
        >
          {open ? "▾" : "▸"}
        </button>
        <span className={`ol-status ${STATE_CLASS[state]}`}>
          <span className="ol-dot" aria-hidden="true">●</span>
          {t.cloud.states[state]}
        </span>
        <span className="ol-msg">{status?.message ?? t.cloud.defaultMsg}</span>
        <button type="button" className="btn ol-recheck" onClick={() => void refresh()}>
          {t.cloud.recheck}
        </button>
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
              onChange={(event) => updateConfig({ baseUrl: event.target.value })}
            />

            <label htmlFor="cl-model">{t.cloud.model}</label>
            <select id="cl-model" value={config.modelID} onChange={(event) => setModel(event.target.value)}>
              {models.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>

            <label htmlFor="cl-timeout">{t.cloud.timeout}</label>
            <select
              id="cl-timeout"
              value={config.timeoutMs}
              onChange={(event) => updateConfig({ timeoutMs: Number(event.target.value) })}
            >
              <option value={60000}>{t.cloud.sec(60)}</option>
              <option value={120000}>{t.cloud.sec(120)}</option>
              <option value={180000}>{t.cloud.sec(180)}</option>
            </select>

            <label htmlFor="cl-privacy">{t.cloud.privacyPolicy}</label>
            <select
              id="cl-privacy"
              value={privacyPolicyId}
              onChange={(event) => setPrivacyPolicy(event.target.value as "balanced" | "strict")}
            >
              <option value="balanced">{t.cloud.privacyBalanced}</option>
              <option value="strict">{t.cloud.privacyStrict}</option>
            </select>
          </div>

          <div className="ol-cmd">
            <code>{WEB_RUNTIME_START_COMMANDS.opencode}</code>
            <button type="button" className="ol-copy" onClick={copyCommand} aria-label={t.cloud.copyAria}>
              {copied ? t.cloud.copied : t.cloud.copy}
            </button>
          </div>
          <p className="ol-hint">{state === "ready" ? t.cloud.readyHint : t.cloud.setupHint}</p>
          <p className="ol-hint">{t.cloud.runtimeOwnership}</p>
        </>
      )}
    </section>
  );
}
