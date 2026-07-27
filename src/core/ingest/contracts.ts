import type { PipelineResult } from "@/core/pipeline";
import type { Diagnostic, FallbackRecord } from "@/core/diagnostics";

export type SessionLoadPhase = "reading" | "parsing" | "organizing" | "validating" | "ready";

export interface SessionLoadProgress {
  phase: SessionLoadPhase;
  loadedBytes: number;
  totalBytes: number;
  lineCount: number;
  sourcePath: string | null;
}

export interface SessionBlobInput {
  path: string;
  blob: Blob;
}

export interface SessionWorkerLoadRequest {
  type: "load";
  requestId: string;
  files: SessionBlobInput[];
}

export type SessionWorkerMessage =
  | { type: "progress"; requestId: string; progress: SessionLoadProgress }
  | { type: "complete"; requestId: string; result: PipelineResult; fallbacks: FallbackRecord[] }
  /** R9：錯誤跨執行緒也是 typed 的，主執行緒不必用字串猜發生了什麼 (RC-5)。 */
  | { type: "error"; requestId: string; diagnostic: Diagnostic }
  | { type: "cancelled"; requestId: string };
