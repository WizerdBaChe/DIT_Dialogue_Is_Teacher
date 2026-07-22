/**
 * 匯出核心：純函式組裝 SessionExport 包裝層 (D-R6-02)。
 * 不呼叫 Date.now()、不讀 store、不碰 DOM (EX-01 acceptance)。
 */
import type { Annotation, SessionDocument } from "@/types/spanTree";
import { EXPORT_VERSION, type SessionExport } from "./contracts";

export interface BuildSessionExportOptions {
  /** ISO 8601 匯出時間；由呼叫端注入。 */
  exportedAt: string;
  /** 應用版本，取自 package.json version；由呼叫端注入。 */
  appVersion: string;
  annotations: Record<string, Annotation>;
}

export function buildSessionExport(doc: SessionDocument, options: BuildSessionExportOptions): SessionExport {
  return {
    ditExport: "session",
    exportVersion: EXPORT_VERSION,
    exportedAt: options.exportedAt,
    appVersion: options.appVersion,
    document: doc,
    annotations: options.annotations,
  };
}
