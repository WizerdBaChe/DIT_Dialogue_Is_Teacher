import { describe, expect, it, vi } from "vitest";
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
}

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

    worker.emit({ type: "error", message: "validation failed" });

    await expect(task.promise).rejects.toThrow("validation failed");
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
      warnings: [],
    };

    worker.emit({
      type: "progress",
      progress: { phase: "parsing", loadedBytes: 10, totalBytes: 20, lineCount: 1, sourcePath: "main.jsonl" },
    });
    worker.emit({ type: "complete", result });

    await expect(task.promise).resolves.toEqual(result);
    expect(onProgress).toHaveBeenCalledOnce();
    expect(worker.terminated).toBe(true);
  });
});
