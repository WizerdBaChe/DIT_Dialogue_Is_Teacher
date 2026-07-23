/**
 * Metadata-driven panel for the R8 presets (anthropic-byok / lmstudio / jan / openrouter / groq /
 * custom). Field visibility follows the preset's ProviderPreset metadata (INV-R8-6): the API key
 * field only appears when `needsKey`, the privacy policy select only when `sendsDataOut`.
 * Ollama and the OpenCode local-proxy keep their existing dedicated panels (OllamaPanel /
 * CloudPanel) — see ADR-032 in the R8 PSM doc.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useT } from "@/i18n";
import { PROVIDER_PRESETS, type EndpointState, type GenericChatPresetId } from "@/core/llm";

const NEW_PRESET_IDS = ["anthropic-byok", "lmstudio", "jan", "openrouter", "groq", "custom"] as const;
type NewPresetId = (typeof NEW_PRESET_IDS)[number];

function isNewPreset(id: string): id is NewPresetId {
  return (NEW_PRESET_IDS as readonly string[]).includes(id);
}

const STATE_CLASS: Record<EndpointState, string> = {
  checking: "checking",
  ready: "ready",
  offline: "offline",
  "cors-blocked": "warn",
  "auth-missing": "warn",
  "model-missing": "warn",
  "no-model": "warn",
  "proxy-missing": "offline",
};

export function EndpointPanel(): ReactNode {
  const t = useT();
  const providerId = useSessionStore((s) => s.providerId);
  const privacyPolicyId = useSessionStore((s) => s.privacyPolicyId);
  const setPrivacyPolicy = useSessionStore((s) => s.setPrivacyPolicy);

  const anthropicConfig = useSessionStore((s) => s.anthropicConfig);
  const anthropicStatus = useSessionStore((s) => s.anthropicStatus);
  const updateAnthropicConfig = useSessionStore((s) => s.updateAnthropicConfig);
  const refreshAnthropicStatus = useSessionStore((s) => s.refreshAnthropicStatus);

  const presetConfigs = useSessionStore((s) => s.presetConfigs);
  const presetStatus = useSessionStore((s) => s.presetStatus);
  const updatePresetConfig = useSessionStore((s) => s.updatePresetConfig);
  const refreshPresetStatus = useSessionStore((s) => s.refreshPresetStatus);

  const [open, setOpen] = useState(true);

  const active = isNewPreset(providerId) ? providerId : null;

  useEffect(() => {
    if (!active) return;
    if (active === "anthropic-byok" ? !anthropicStatus : !presetStatus[active as GenericChatPresetId]) {
      if (active === "anthropic-byok") void refreshAnthropicStatus();
      else void refreshPresetStatus(active as GenericChatPresetId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;

  const preset = active === "anthropic-byok" ? PROVIDER_PRESETS["anthropic-byok"] : PROVIDER_PRESETS[active as GenericChatPresetId];
  const config = active === "anthropic-byok" ? anthropicConfig : presetConfigs[active as GenericChatPresetId];
  const status = active === "anthropic-byok" ? anthropicStatus : presetStatus[active as GenericChatPresetId];
  const update = (patch: { baseUrl?: string; model?: string; apiKey?: string; timeoutMs?: number }) => {
    if (active === "anthropic-byok") updateAnthropicConfig(patch);
    else updatePresetConfig(active as GenericChatPresetId, patch);
  };
  const refresh = () => (active === "anthropic-byok" ? refreshAnthropicStatus() : refreshPresetStatus(active as GenericChatPresetId));

  const state: EndpointState = status?.state ?? "checking";
  const models = status?.models ?? [];

  return (
    <section className="ollama-panel endpoint-panel" aria-label={t.endpoint.panelLabel}>
      <div className="ol-head">
        <button
          type="button"
          className="ol-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? t.endpoint.collapse : t.endpoint.expand}
          title={open ? t.endpoint.collapse : t.endpoint.expand}
        >
          {open ? "▾" : "▸"}
        </button>
        <span className={`ol-status ${STATE_CLASS[state]}`}>
          <span className="ol-dot" aria-hidden="true">●</span>
          {t.endpoint.states[state]}
        </span>
        <span className="ol-msg">{status?.message ?? t.endpoint.defaultMsg}</span>
        <button type="button" className="btn ol-recheck" onClick={() => void refresh()}>
          {t.endpoint.recheck}
        </button>
      </div>

      {open && (
        <>
          <div className="ol-row">
            <label htmlFor="ep-base">{t.endpoint.endpoint}</label>
            <input
              id="ep-base"
              className="ol-input"
              type="text"
              value={config.baseUrl}
              onChange={(e) => update({ baseUrl: e.target.value })}
            />

            {preset.needsKey && (
              <>
                <label htmlFor="ep-key">{t.endpoint.apiKey}</label>
                <input
                  id="ep-key"
                  className="ol-input"
                  type="password"
                  autoComplete="off"
                  placeholder={t.endpoint.apiKeyPlaceholder}
                  value={"apiKey" in config ? config.apiKey : ""}
                  onChange={(e) => update({ apiKey: e.target.value })}
                />
              </>
            )}

            <label htmlFor="ep-model">{t.endpoint.model}</label>
            {models.length > 0 ? (
              <select id="ep-model" value={config.model} onChange={(e) => update({ model: e.target.value })}>
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input
                id="ep-model"
                className="ol-input"
                type="text"
                placeholder={t.endpoint.modelPlaceholder}
                value={config.model}
                onChange={(e) => update({ model: e.target.value })}
              />
            )}

            <label htmlFor="ep-timeout">{t.endpoint.timeout}</label>
            <select id="ep-timeout" value={config.timeoutMs} onChange={(e) => update({ timeoutMs: Number(e.target.value) })}>
              <option value={60000}>{t.endpoint.sec(60)}</option>
              <option value={120000}>{t.endpoint.sec(120)}</option>
              <option value={180000}>{t.endpoint.sec(180)}</option>
            </select>

            {preset.sendsDataOut && (
              <>
                <label htmlFor="ep-privacy">{t.endpoint.privacyPolicy}</label>
                <select
                  id="ep-privacy"
                  value={privacyPolicyId}
                  onChange={(e) => setPrivacyPolicy(e.target.value as "balanced" | "strict")}
                >
                  <option value="balanced">{t.endpoint.privacyBalanced}</option>
                  <option value="strict">{t.endpoint.privacyStrict}</option>
                </select>
              </>
            )}
          </div>

          <p className="ol-hint">{preset.sendsDataOut ? t.endpoint.costHint : t.endpoint.freeHint}</p>

          {state === "cors-blocked" && <p className="ol-guide">{t.endpoint.corsBlockedGuide}</p>}
          {state === "auth-missing" && <p className="ol-guide">{t.endpoint.authMissingGuide}</p>}
          {state === "proxy-missing" && <p className="ol-guide">{t.endpoint.proxyMissingGuide}</p>}
          {state === "no-model" && <p className="ol-guide">{t.endpoint.noModelGuide}</p>}
          {state === "model-missing" && <p className="ol-guide">{t.endpoint.modelMissingGuide}</p>}
        </>
      )}
    </section>
  );
}
