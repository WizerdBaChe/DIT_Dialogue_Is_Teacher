/**
 * i18n 對外入口：輕量 hook，讀取 store 的 locale 並回傳對應字典。
 * 元件用 `const t = useT();` 後直接取 `t.header.reset` 等，插值鍵為函式呼叫。
 */
import { useSessionStore } from "@/store/sessionStore";
import { MESSAGES, type Locale, type Messages } from "./locales";

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

/** 非 React 情境 (如 store 內組錯誤訊息) 取字典。 */
export function messagesFor(locale: Locale): Messages {
  return MESSAGES[locale];
}

export { MESSAGES, LOCALE_ORDER, LOCALE_NATIVE_NAME } from "./locales";
export type { Locale, Messages } from "./locales";
