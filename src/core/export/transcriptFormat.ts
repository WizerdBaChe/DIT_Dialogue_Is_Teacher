/**
 * 逐字稿兩種渲染器 (Markdown / HTML) 共用的排版小工具。全部是純函式。
 *
 * 時間一律**原樣取自 transcript 的 ISO 字串**，不做時區換算：換算需要讀執行環境的時區，
 * 會讓同一份 session 在不同機器上匯出得到不同結果，也讓渲染器不再可測。逐字稿是存證用的，
 * 「跟原始檔對得上」比「顯示成當地時間」重要。
 */

/** `2026-06-25T10:00:00.000Z` → `2026-06-25 10:00`；非 ISO 或 null 回傳 null。 */
export function formatDateTime(iso: string | null): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso ?? "");
  return match ? `${match[1]} ${match[2]}` : null;
}

/** `2026-06-25T10:00:00.000Z` → `10:00`；非 ISO 或 null 回傳 null。 */
export function formatTime(iso: string | null): string | null {
  const match = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(iso ?? "");
  return match ? match[1] : null;
}

/** 收斂連續空行：AI 輸出常帶多餘空行，逐字稿裡沒必要保留。 */
export function collapseBlankLines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** 產生匯出檔名的時間戳片段 (呼叫端注入 Date，維持純函式)。 */
export function fileStamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}
