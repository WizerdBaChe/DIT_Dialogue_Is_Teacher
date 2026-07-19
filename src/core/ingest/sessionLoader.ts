import type { PipelineResult } from "@/core/pipeline";
import type { SessionBlobInput, SessionLoadProgress, SessionWorkerLoadRequest, SessionWorkerMessage } from "./contracts";

interface SessionWorkerLike {
  onmessage: ((event: MessageEvent<SessionWorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: SessionWorkerLoadRequest): void;
  terminate(): void;
}

export type SessionWorkerFactory = () => SessionWorkerLike;

export interface SessionLoadTask {
  promise: Promise<PipelineResult>;
  cancel(): void;
}

export class SessionLoadCancelledError extends Error {
  constructor() {
    super("Session loading was cancelled.");
    this.name = "SessionLoadCancelledError";
  }
}

const defaultWorkerFactory: SessionWorkerFactory = () => new Worker(
  new URL("./session.worker.ts", import.meta.url),
  { type: "module" },
);

export function startSessionLoad(
  files: SessionBlobInput[],
  onProgress: (progress: SessionLoadProgress) => void,
  workerFactory: SessionWorkerFactory = defaultWorkerFactory,
): SessionLoadTask {
  const worker = workerFactory();
  const requestId = crypto.randomUUID();
  let settled = false;
  let rejectPromise: (reason: unknown) => void = () => undefined;

  const promise = new Promise<PipelineResult>((resolve, reject) => {
    rejectPromise = reject;
    worker.onmessage = (event) => {
      if (settled || event.data.requestId !== requestId) return;
      if (event.data.type === "progress") {
        onProgress(event.data.progress);
        return;
      }
      settled = true;
      worker.terminate();
      if (event.data.type === "complete") resolve(event.data.result);
      else reject(new Error(event.data.message));
    };
    worker.onerror = (event) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      reject(new Error(event.message || "Session worker failed."));
    };
  });

  worker.postMessage({ type: "load", requestId, files });

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      worker.terminate();
      rejectPromise(new SessionLoadCancelledError());
    },
  };
}
