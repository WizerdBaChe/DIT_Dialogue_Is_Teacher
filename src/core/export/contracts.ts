/**
 * 匯出資料契約 (FR-8 / R6)。
 * 對應文件：docs/PSM_R6_EXPORT_v0.1.md §4.2
 */
import type { Annotation, SessionDocument } from "@/types/spanTree";

/** export 包裝層版本，與資料本體的 SCHEMA_VERSION 獨立演進 (EX-INV-5)。 */
export const EXPORT_VERSION = "1" as const;

export interface SessionExport {
  /** 固定字串，用來辨識「這是 DIT 匯出檔」而不是任意 JSON。 */
  ditExport: "session";
  exportVersion: typeof EXPORT_VERSION;
  /** ISO 8601；由呼叫端注入，核心函式保持純函式可測 (不在函式內叫 Date.now)。 */
  exportedAt: string;
  /** 產生此檔的應用版本，取自 package.json version。 */
  appVersion: string;
  document: SessionDocument;
  /** 講解快取，一併匯出 (D-R6-05)。無講解時為空物件，不省略欄位。 */
  annotations: Record<string, Annotation>;
}
