/**
 * i18n 對外入口：輕量 hook，讀取 store 的 locale 並回傳對應字典。
 * 元件用 `const t = useT();` 後直接取 `t.header.reset` 等，插值鍵為函式呼叫。
 */
import { useSessionStore } from "@/store/sessionStore";
import type { Diagnostic } from "@/core/diagnostics/contracts";
import { MESSAGES, type Locale, type Messages } from "./locales";
import { diagnosticFatalCopy, diagnosticLine } from "./diagnosticCopy";

/** 取得目前語言的字典。locale 變動時 (Zustand 訂閱) 元件自動重繪。 */
export function useT(): Messages {
  const locale = useSessionStore((s) => s.locale);
  return MESSAGES[locale];
}

/** 取得 [locale, setLocale]，供語言切換 UI 使用。 */
export function useLocale(): [Locale, (l: Locale) => void] {
  const locale = useSessionStore((s) => s.locale);
  const setLocale = useSessionStore((s) => s.setLocale);
  return [locale, setLocale];
}

/**
 * 取「把 Diagnostic 轉成句子」的兩個函式。元件永遠不自己組診斷文案 (SM-12 rule 2)。
 * 回傳的是穩定引用的模組層函式，故不需要 useMemo。
 */
export function useDiagnosticCopy(): {
  line: (diagnostic: Diagnostic) => string;
  fatal: (diagnostic: Diagnostic) => { title: string; body: string };
} {
  const locale = useSessionStore((s) => s.locale);
  return {
    line: (diagnostic) => diagnosticLine(locale, diagnostic),
    fatal: (diagnostic) => diagnosticFatalCopy(locale, diagnostic),
  };
}

/** 非 React 情境 (如 store 內組錯誤訊息) 取字典。 */
export function messagesFor(locale: Locale): Messages {
  return MESSAGES[locale];
}

export { MESSAGES, LOCALE_ORDER, LOCALE_NATIVE_NAME } from "./locales";
export type { Locale, Messages } from "./locales";
