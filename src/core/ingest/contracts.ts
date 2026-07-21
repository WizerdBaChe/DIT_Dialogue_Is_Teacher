import type { PipelineResult } from "@/core/pipeline";
import type { FallbackRecord } from "@/core/diagnostics";

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
  | { type: "error"; requestId: string; message: string };
