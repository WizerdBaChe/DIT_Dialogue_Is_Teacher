import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionWorkerMessage } from "./contracts";
import { SessionLoadCancelledError, startSessionLoad } from "./sessionLoader";

type FakeMessage =
  | Omit<Extract<SessionWorkerMessage, { type: "progress" }>, "requestId">
  | Omit<Extract<SessionWorkerMessage, { type: "complete" }>, "requestId">
  | Omit<Extract<SessionWorkerMessage, { type: "error" }>, "requestId">;

class FakeWorker {
  onmessage: ((event: MessageEvent<SessionWorkerMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  requestId = "";
  terminated = false;

  postMessage(message: { requestId: string }): void {
    this.requestId = message.requestId;
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: FakeMessage): void {
    this.onmessage?.({ data: { ...message, requestId: this.requestId } } as MessageEvent<SessionWorkerMessage>);
  }

  emitError(event: Partial<ErrorEvent>): void {
    this.onerror?.(event as ErrorEvent);
  }
}

const emptyDoc = {
  schemaVersion: "0.1" as const,
  session: { id: "s", source: "codex" as const, tool: "codex", title: "t", projectPath: null, startedAt: null, model: null },
  spans: [],
  groups: [],
};

describe("startSessionLoad", () => {
  it("terminates promptly when cancelled", async () => {
    const worker = new FakeWorker();
    const onProgress = vi.fn();
    const task = startSessionLoad([], onProgress, () => worker);

    task.cancel();

    await expect(task.promise).rejects.toBeInstanceOf(SessionLoadCancelledError);
    expect(worker.terminated).toBe(true);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("does not publish a partial result when the worker fails", async () => {
    const worker = new FakeWorker();
    const task = startSessionLoad([], vi.fn(), () => worker);

    worker.emit({ type: "error", diagnostic: { tier: "fatal", code: "NO_RENDERABLE_CONTENT" } });

    // R9：錯誤跨執行緒是 typed 的，主執行緒拿到具名的 fatal，不是一句字串。
    await expect(task.promise).rejects.toMatchObject({
      diagnostic: { tier: "fatal", code: "NO_RENDERABLE_CONTENT" },
    });
    expect(worker.terminated).toBe(true);
  });

  it("forwards progress and resolves only the complete validated result", async () => {
    const worker = new FakeWorker();
    const onProgress = vi.fn();
    const task = startSessionLoad([], onProgress, () => worker);
    const result = {
      doc: {
        schemaVersion: "0.1" as const,
        session: { id: "s", source: "claude-code" as const, tool: "claude-code", title: "t", projectPath: null, startedAt: null, model: null },
        spans: [],
        groups: [],
      },
      diagnostics: [],
    };

    worker.emit({
      type: "progress",
      progress: { phase: "parsing", loadedBytes: 10, totalBytes: 20, lineCount: 1, sourcePath: "main.jsonl" },
    });
    worker.emit({ type: "complete", result, fallbacks: [] });

    await expect(task.promise).resolves.toEqual(result);
    expect(onProgress).toHaveBeenCalledOnce();
    expect(worker.terminated).toBe(true);
  });
});

/**
 * R11.2 F-01/F-02 — the Worker boundary.
 *
 * The UAT report "every Codex item fails with `Session worker failed.`" cost a full
 * investigation to narrow, because the boundary threw away `filename`/`lineno`, had no
 * code that separated "never started" from "died mid-run", and had no way to keep going.
 * These cases pin all three, and they are deliberately TWO-SIDED: a boot failure must
 * degrade, and a mid-run failure must still be fatal. A fallback that swallows both would
 * pass a one-sided suite and hide real data faults.
 */
describe("startSessionLoad · worker boundary (F-01/F-02)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const fallbackResult = { doc: emptyDoc, diagnostics: [] };

  it("degrades to the main thread when the worker cannot be constructed", async () => {
    const fallback = vi.fn().mockResolvedValue(fallbackResult);
    const task = startSessionLoad([], vi.fn(), () => { throw new TypeError("module workers unsupported"); }, fallback);

    const result = await task.promise;

    expect(fallback).toHaveBeenCalledOnce();
    // A NAMED degradation: it is in the return value and it renders, so it travels as a
    // Diagnostic and never through the silent fallback channel.
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ tier: "warn", code: "WORKER_FALLBACK_SYNC" }),
    );
    expect(result.diagnostics[0]?.detail).toContain("module workers unsupported");
  });

  it("degrades on an empty-message onerror and keeps filename and lineno", async () => {
    const worker = new FakeWorker();
    const fallback = vi.fn().mockResolvedValue(fallbackResult);
    const task = startSessionLoad([], vi.fn(), () => worker, fallback);

    // The exact shape a worker that 404s or fails to boot produces in Chrome.
    worker.emitError({ message: "", filename: "http://localhost:4173/assets/session.worker-abc.js", lineno: 0 });

    const result = await task.promise;
    const detail = result.diagnostics[0]?.detail ?? "";
    expect(detail).toContain("session.worker-abc.js");
    expect(detail).toContain("empty message");
    expect(worker.terminated).toBe(true);
  });

  it("stays fatal when the worker fails AFTER it has spoken, and does not silently re-parse", async () => {
    const worker = new FakeWorker();
    const fallback = vi.fn().mockResolvedValue(fallbackResult);
    const task = startSessionLoad([], vi.fn(), () => worker, fallback);

    worker.emit({
      type: "progress",
      progress: { phase: "parsing", loadedBytes: 1, totalBytes: 2, lineCount: 1, sourcePath: "a.jsonl" },
    });
    worker.emitError({ message: "boom", filename: "worker.js", lineno: 12 });

    await expect(task.promise).rejects.toMatchObject({
      diagnostic: { tier: "fatal", code: "LOAD_FAILED", detail: "boom @ worker.js:12" },
    });
    expect(fallback).not.toHaveBeenCalled();
  });

  it("reports WORKER_BOOT_FAILED when the main-thread retry fails too", async () => {
    const task = startSessionLoad(
      [], vi.fn(),
      () => { throw new Error("no worker"); },
      vi.fn().mockRejectedValue(new Error("also broken")),
    );

    await expect(task.promise).rejects.toMatchObject({
      diagnostic: { tier: "fatal", code: "WORKER_BOOT_FAILED" },
    });
  });

  it("degrades instead of hanging when postMessage cannot clone the request", async () => {
    const worker = new FakeWorker();
    worker.postMessage = () => { throw new DOMException("could not be cloned", "DataCloneError"); };
    const fallback = vi.fn().mockResolvedValue(fallbackResult);

    // Same leak class as RC-5: this used to sit outside the promise, so the promise never
    // settled and the progress bar stayed on "reading" forever.
    const result = await startSessionLoad([], vi.fn(), () => worker, fallback).promise;

    expect(result.diagnostics[0]?.code).toBe("WORKER_FALLBACK_SYNC");
    expect(result.diagnostics[0]?.detail).toContain("postMessage threw");
  });
});
