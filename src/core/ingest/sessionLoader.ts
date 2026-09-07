import type { PipelineResult } from "@/core/pipeline";
import { buildSessionDocumentFromFiles } from "@/core/pipeline";
import { mergeFallbackReport } from "@/core/diagnostics";
import { PipelineFatalError } from "@/core/diagnostics/contracts";
import type { SessionBlobInput, SessionLoadProgress, SessionWorkerLoadRequest, SessionWorkerMessage } from "./contracts";

interface SessionWorkerLike {
  onmessage: ((event: MessageEvent<SessionWorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: SessionWorkerLoadRequest): void;
  terminate(): void;
}

export type SessionWorkerFactory = () => SessionWorkerLike;

/** The main-thread parse used when the Worker never starts. Injectable so the fallback is testable. */
export type SessionLoadFallback = (files: SessionBlobInput[]) => Promise<PipelineResult>;

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

const defaultFallback: SessionLoadFallback = async (files) => buildSessionDocumentFromFiles(
  await Promise.all(files.map(async (file) => ({ path: file.path, content: await file.blob.text() }))),
);

/**
 * R11.2 F-02: the boundary used to throw away everything it knew.
 *
 * `worker.onerror` carries `filename` / `lineno` / `error`, and a Worker that dies at
 * boot reports an EMPTY `message` — so the old `event.message || "Session worker failed."`
 * produced a sentence with no subject and dropped the only three fields that could have
 * named the cause. One UAT report then cost a full investigation to narrow, which is the
 * cost this function exists to stop paying.
 */
function describeErrorEvent(event: ErrorEvent): string {
  const where = event.filename ? `${event.filename}:${event.lineno ?? 0}` : "(location dropped by the browser)";
  return `${event.message || "(empty message — the usual shape of a worker that died at boot)"} @ ${where}`;
}

export function startSessionLoad(
  files: SessionBlobInput[],
  onProgress: (progress: SessionLoadProgress) => void,
  workerFactory: SessionWorkerFactory = defaultWorkerFactory,
  fallback: SessionLoadFallback = defaultFallback,
): SessionLoadTask {
  let settled = false;
  let rejectPromise: (reason: unknown) => void = () => undefined;
  let worker: SessionWorkerLike | undefined;
  /**
   * Boot failure and run failure are different faults and must not share a code. A Worker
   * that has already sent us anything is alive, so a later `onerror` is about the run.
   * One that dies before its first message never started, which points at the environment
   * (CSP, file://, no module-worker support, a 404 on the chunk) rather than at the data —
   * and only that case may be retried on the main thread.
   */
  let workerSpoke = false;

  const promise = new Promise<PipelineResult>((resolve, reject) => {
    rejectPromise = reject;

    /** Boot failed. Degrade to the main thread rather than leaving the user with nothing. */
    const degrade = (detail: string): void => {
      if (settled) return;
      settled = true;
      try { worker?.terminate(); } catch { /* a worker that never booted has nothing to stop */ }
      // EX-INV-7 shape: a runtime failure announces itself. The Diagnostic below is what the
      // user sees; this is what a bug report can paste.
      console.error("[DIT] session worker did not start, parsing on the main thread instead —", detail);
      void fallback(files).then(
        (result) => resolve({
          ...result,
          diagnostics: [
            ...result.diagnostics,
            { tier: "warn", code: "WORKER_FALLBACK_SYNC", detail },
          ],
        }),
        // The fallback is the last line: if it fails too, the load is genuinely dead, and the
        // boot detail is the useful half of the report.
        (fallbackError) => reject(new PipelineFatalError(
          "WORKER_BOOT_FAILED",
          `${detail}; main-thread retry also failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
        )),
      );
    };

    try {
      worker = workerFactory();
    } catch (error) {
      // `new Worker(url, { type: "module" })` throws outright on a browser without module
      // workers, and under a CSP that forbids the worker source. Previously this escaped
      // startSessionLoad as a raw error with no code.
      degrade(`worker construction threw: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    const requestId = crypto.randomUUID();

    worker.onmessage = (event) => {
      if (settled || event.data.requestId !== requestId) return;
      workerSpoke = true;
      if (event.data.type === "progress") {
        onProgress(event.data.progress);
        return;
      }
      settled = true;
      worker?.terminate();
      if (event.data.type === "complete") {
        mergeFallbackReport(event.data.fallbacks ?? []);
        resolve(event.data.result);
      } else if (event.data.type === "cancelled") {
        reject(new SessionLoadCancelledError());
      } else {
        reject(new PipelineFatalError(event.data.diagnostic.code, event.data.diagnostic.detail));
      }
    };

    worker.onerror = (event) => {
      if (settled) return;
      const detail = describeErrorEvent(event);
      if (!workerSpoke) {
        degrade(detail);
        return;
      }
      // The worker was alive and then threw. Re-running the same data on the main thread
      // would most likely reproduce it and would hide the fault, so this one stays fatal.
      settled = true;
      worker?.terminate();
      console.error("[DIT] session worker failed mid-run —", detail);
      reject(new PipelineFatalError("LOAD_FAILED", detail));
    };

    try {
      worker.postMessage({ type: "load", requestId, files });
    } catch (error) {
      // postMessage structure-clones its argument and throws on anything it cannot copy.
      // This used to sit outside the promise, so that path left the promise pending forever
      // and the progress bar stuck at "reading" — the same leak class as RC-5.
      degrade(`postMessage threw: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      try { worker?.terminate(); } catch { /* nothing to stop */ }
      rejectPromise(new SessionLoadCancelledError());
    },
  };
}
