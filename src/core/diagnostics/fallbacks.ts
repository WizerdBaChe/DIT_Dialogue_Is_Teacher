/**
 * Fallback / 降級事件記錄。
 *
 * 專案原則：任何「查不到就改用替代值」的地方都必須留下記錄。
 * 靜默的 fallback 會讓錯誤資訊一路傳播下去 —— Session Map 的站點位置、子代理掛載
 * 與「跳到這一步」曾經全部指向錯誤項目，就是因為一行沒有記錄的 `?? viewItems[0]`。
 *
 * 使用方式：
 *   reportFallback("fishbone/resolveNode", "span-not-in-view-model", { spanId });
 * reason 請用穩定的短代碼 (kebab-case)，方便日後 grep 與比對。
 */

export interface FallbackRecord {
  /** 模組/函式，例如 "fishbone/resolveNode"。 */
  scope: string;
  /** 穩定短代碼，同一種原因請固定用同一個字串。 */
  reason: string;
  /** 本次 session 累計發生次數。 */
  count: number;
  /** 第一次發生時的細節，供追蹤用；後續同類事件不再保留細節以免佔記憶體。 */
  firstDetail?: unknown;
}

/** 同一種 fallback 在 console 只印前 N 次；大型 session 可能觸發上萬次，不能洗版。 */
const CONSOLE_LIMIT = 3;

const records = new Map<string, FallbackRecord>();

function publish(): void {
  if (typeof window === "undefined") return;
  (window as unknown as { __DIT_FALLBACKS?: FallbackRecord[] }).__DIT_FALLBACKS = getFallbackReport();
}

export function reportFallback(scope: string, reason: string, detail?: unknown): void {
  const key = `${scope}|${reason}`;
  const existing = records.get(key);
  if (existing) {
    existing.count += 1;
    if (existing.count === CONSOLE_LIMIT + 1) {
      console.warn(`[DIT fallback] ${key} — 後續同類事件不再逐筆輸出，請看 getFallbackReport()`);
    } else if (existing.count <= CONSOLE_LIMIT) {
      console.warn(`[DIT fallback] ${key}`, detail ?? "");
    }
  } else {
    records.set(key, { scope, reason, count: 1, firstDetail: detail });
    console.warn(`[DIT fallback] ${key}`, detail ?? "");
  }
  publish();
}

/** 目前累積的降級事件，次數由多到少。 */
export function getFallbackReport(): FallbackRecord[] {
  return [...records.values()].sort((left, right) => right.count - left.count);
}

/** 載入新 session 時呼叫，讓報告只反映目前這份資料。 */
export function resetFallbackReport(): void {
  records.clear();
  publish();
}

/**
 * 併入其他執行緒的降級記錄。
 * 資料夾載入的整條 pipeline 跑在 web worker 裡，worker 有自己的模組實例；
 * 沒有這一步的話，最主要的載入路徑反而完全不會留下記錄。
 */
export function mergeFallbackReport(incoming: FallbackRecord[]): void {
  for (const record of incoming) {
    const key = `${record.scope}|${record.reason}`;
    const existing = records.get(key);
    if (existing) existing.count += record.count;
    else records.set(key, { ...record });
    console.warn(`[DIT fallback] ${key} ×${record.count} (worker)`, record.firstDetail ?? "");
  }
  publish();
}
