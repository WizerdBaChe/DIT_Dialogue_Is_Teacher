/** 首次使用歡迎彈窗：語言 + 講解 AI 模式，兩者都是既有設定 (locale / providerId) 的引導入口，
 *  選了立即透過既有的 setLocale / setProvider 生效——這裡不重新發明一套「暫存再套用」的狀態。
 *  Escape / backdrop / 略過 / 開始使用，任何一種關閉方式都視為「看過了」，寫入 IndexedDB 旗標
 *  (見 core/onboarding/repository.ts)，下次開啟不會再自動彈出；SettingsDialog 底部留了手動重開的入口。
 *  結構沿用 SettingsDialog 的既有 <dialog> 慣例 (showModal/close + focus 管理)。 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useSessionStore } from "@/store/sessionStore";
import type { ProviderId } from "@/types/spanTree";
import { useT, useLocale, LOCALE_ORDER, LOCALE_NATIVE_NAME } from "@/i18n";
import { Disclaimer } from "./Disclaimer";

/** 常用項目直接列出；其餘收進「更多選項」，降低第一次看到 9 個選項的認知負擔。 */
const COMMON_PROVIDERS: ProviderId[] = ["none", "ollama", "lmstudio", "anthropic-byok"];
const MORE_PROVIDERS: ProviderId[] = ["jan", "cloud", "openrouter", "groq", "custom"];

export function WelcomeDialog(): ReactNode {
  const t = useT();
  const [locale, setLocale] = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const welcomeOpen = useSessionStore((state) => state.welcomeOpen);
  const snapshotMode = useSessionStore((state) => state.snapshotMode);
  const providerId = useSessionStore((state) => state.providerId);
  const setProvider = useSessionStore((state) => state.setProvider);
  const completeOnboarding = useSessionStore((state) => state.completeOnboarding);
  const openSettings = useSessionStore((state) => state.openSettings);

  // 「開始使用」在選了非「不設定」的講解模式時，直接帶去設定頁把連線細節 (金鑰/端點) 填完；
  // 「略過」/Escape/backdrop 就單純關掉，不強迫使用者馬上進設定。
  const handleStart = () => {
    const shouldOpenSettings = providerId !== "none";
    completeOnboarding();
    if (shouldOpenSettings) openSettings();
  };

  const open = welcomeOpen && !snapshotMode;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
        dialog.dataset.modalFallback = "true";
      }
    } else if (!open && dialog.open) {
      try {
        dialog.close();
      } catch {
        dialog.removeAttribute("open");
        delete dialog.dataset.modalFallback;
      }
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setMoreOpen(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  if (snapshotMode) return null;

  const providerChip = (id: ProviderId) => (
    <button
      key={id}
      type="button"
      className="btn welcome-provider-chip"
      aria-pressed={providerId === id}
      onClick={() => setProvider(id)}
    >
      {t.provider[id]}
    </button>
  );

  return (
    <dialog
      ref={dialogRef}
      id="welcome-dialog"
      className="welcome-dialog"
      aria-labelledby="welcome-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        completeOnboarding();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) completeOnboarding();
      }}
    >
      {welcomeOpen && (
        <div className="welcome-dialog-shell">
          <h2 id="welcome-dialog-title" ref={titleRef} tabIndex={-1}>{t.welcome.title}</h2>
          <p className="welcome-intro">{t.welcome.intro}</p>

          <section className="welcome-step">
            <h3>{t.welcome.languageStepLabel}</h3>
            <select
              aria-label={t.header.languageLabel}
              value={locale}
              onChange={(event) => setLocale(event.target.value as typeof locale)}
            >
              {LOCALE_ORDER.map((language) => <option key={language} value={language}>{LOCALE_NATIVE_NAME[language]}</option>)}
            </select>
          </section>

          <section className="welcome-step">
            <h3>{t.welcome.providerStepLabel}</h3>
            <div className="welcome-provider-chips">
              {COMMON_PROVIDERS.map(providerChip)}
            </div>
            <button
              type="button"
              className="btn welcome-more-toggle"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((current) => !current)}
            >
              {moreOpen ? t.welcome.fewerOptions : t.welcome.moreOptions}
            </button>
            {moreOpen && (
              <div className="welcome-provider-chips">
                {MORE_PROVIDERS.map(providerChip)}
              </div>
            )}
            <Disclaimer />
            {providerId !== "none" && <p className="option-hint">{t.welcome.providerFollowUpHint}</p>}
          </section>

          <div className="welcome-dialog-actions">
            <button type="button" className="btn" onClick={completeOnboarding}>
              {t.welcome.skip}
            </button>
            <button type="button" className="btn primary" onClick={handleStart}>
              {t.welcome.start}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
