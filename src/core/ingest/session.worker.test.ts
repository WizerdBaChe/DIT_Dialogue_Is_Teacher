/**
 * DW-20 — the session Worker had no tests at all, and it is not a forwarder.
 *
 * Two pieces of real logic live here and nowhere else: **per-file isolation (DSM-1)**, and the
 * **cross-file progress accumulator**. Both are the kind of code that fails quietly — a batch
 * that silently drops a file still renders something, and a byte counter that resets mid-batch
 * still reaches 100% eventually. Neither shows up as an exception.
 *
 * `sessionLoader.test.ts` is the model: it tests the OTHER side of the same boundary by injecting
 * a fake worker. This does the mirror image — a fake worker *scope*. The module captures `self`
 * once at evaluation time, so the stub has to be installed before the import below, which is why
 * this file uses a top-level `await import` rather than a static one.
 *
 * Deliberately two-sided throughout: isolation must not become suppression. A suite that only
 * proved "one bad file does not stop the batch" would pass just as happily against a worker that
 * swallowed everything, which is a worse bug than the one it was guarding.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionWorkerLoadRequest, SessionWorkerMessage } from "./contracts";
import { StreamCancelledError } from "./jsonlStream";

/** Everything the worker posts back, in order. Reset per load by `load()`. */
const posted: SessionWorkerMessage[] = [];

const scope = {
  onmessage: null as ((event: MessageEvent<SessionWorkerLoadRequest>) => void) | null,
  postMessage: (message: SessionWorkerMessage): void => {
    posted.push(message);
  },
};

vi.stubGlobal("self", scope);
await import("./session.worker");

let requestSeq = 0;
let uuidSeq = 0;

/** A well-formed Claude Code record. `sessionId: null` omits the field, which the normalizer reports. */
function line(text: string, sessionId: string | null = "worker-test"): string {
  uuidSeq += 1;
  return JSON.stringify({
    type: "assistant",
    uuid: `00000000-0000-4000-a000-${String(uuidSeq).padStart(12, "0")}`,
    parentUuid: null,
    timestamp: "2026-08-27T00:00:00.000Z",
    ...(sessionId === null ? {} : { sessionId }),
    message: { role: "assistant", model: "fixture", content: [{ type: "text", text }] },
  });
}

function transcript(path: string, ...lines: string[]): { path: string; blob: Blob } {
  return { path, blob: new Blob([`${lines.join("\n")}\n`], { type: "application/x-ndjson" }) };
}

/**
 * A file the reader cannot open. `parseJsonlBlob` reaches for `blob.stream()` first, so throwing
 * there reproduces the real shape: the handle was valid when the batch started and the read failed
 * afterwards (a revoked permission, a removed drive, a file replaced mid-scan).
 */
function unreadable(size: number, error: unknown): Blob {
  return { size, stream: () => { throw error; } } as unknown as Blob;
}

/** Drives one load through the worker's own message handler and waits for its terminal message. */
async function load(files: Array<{ path: string; blob: Blob }>): Promise<SessionWorkerMessage[]> {
  posted.length = 0;
  requestSeq += 1;
  const requestId = `req-${requestSeq}`;
  scope.onmessage?.({ data: { type: "load", requestId, files } } as MessageEvent<SessionWorkerLoadRequest>);
  await vi.waitFor(() => expect(posted.some((message) => message.type !== "progress")).toBe(true));
  // Every message must carry the request it belongs to: the loader drops messages whose
  // requestId does not match, so a worker that forgot one would hang the caller forever.
  expect(posted.every((message) => message.requestId === requestId)).toBe(true);
  return [...posted];
}

/** `Array.prototype.at` is outside this project's `lib` target; the gate caught the slip. */
const last = <T,>(items: T[]): T => items[items.length - 1];

const terminal = (messages: SessionWorkerMessage[]): SessionWorkerMessage =>
  last(messages.filter((message) => message.type !== "progress"));

const progressOf = (messages: SessionWorkerMessage[]): Array<Extract<SessionWorkerMessage, { type: "progress" }>> =>
  messages.filter((message): message is Extract<SessionWorkerMessage, { type: "progress" }> => message.type === "progress");

describe("session.worker · per-file isolation (DSM-1)", () => {
  it("merges several readable files into one document", async () => {
    const messages = await load([
      transcript("main.jsonl", line("first"), line("second")),
      transcript("more.jsonl", line("third")),
    ]);

    const done = terminal(messages);
    expect(done.type).toBe("complete");
    if (done.type !== "complete") return;
    expect(done.result.doc.spans.length).toBeGreaterThan(0);
    expect(done.result.diagnostics).toEqual([]);
  });

  it("skips a file it cannot read, names it, and keeps the rest of the batch", async () => {
    const messages = await load([
      transcript("main.jsonl", line("kept")),
      { path: "broken.jsonl", blob: unreadable(4096, new Error("the drive went away")) },
      transcript("also-kept.jsonl", line("still here")),
    ]);

    const done = terminal(messages);
    expect(done.type).toBe("complete");
    if (done.type !== "complete") return;
    // The failure is NAMED, not silent: it travels as a Diagnostic carrying the path, so the
    // user can tell "two of your three files loaded" from "everything loaded".
    expect(done.result.diagnostics).toContainEqual(
      expect.objectContaining({ tier: "warn", code: "FILE_PARSE_FAILED", count: 1, detail: "broken.jsonl" }),
    );
    expect(done.result.doc.spans.length).toBeGreaterThan(0);
  });

  it("stays fatal when EVERY file fails — isolation is not suppression", async () => {
    const messages = await load([
      { path: "a.jsonl", blob: unreadable(10, new Error("gone")) },
      { path: "b.jsonl", blob: unreadable(10, new Error("also gone")) },
    ]);

    const done = terminal(messages);
    expect(done.type).toBe("error");
    if (done.type !== "error") return;
    // FILE_PARSE_FAILED, not NO_MAIN_TRANSCRIPT: report what happened (nothing could be read),
    // not the consequence (therefore no main file), which would point at the wrong problem.
    expect(done.diagnostic).toMatchObject({ tier: "fatal", code: "FILE_PARSE_FAILED" });
  });

  it("behaves identically to a clean batch when no file fails", async () => {
    const clean = await load([transcript("main.jsonl", line("only"))]);
    const done = terminal(clean);
    expect(done.type).toBe("complete");
    if (done.type !== "complete") return;
    expect(done.result.diagnostics.some((d) => d.code === "FILE_PARSE_FAILED")).toBe(false);
  });
});

describe("session.worker · progress accumulates across files", () => {
  it("never moves backwards and ends on the batch total", async () => {
    const files = [
      transcript("a.jsonl", line("one"), line("two")),
      transcript("b.jsonl", line("three")),
      transcript("c.jsonl", line("four")),
    ];
    const total = files.reduce((sum, file) => sum + file.blob.size, 0);

    const updates = progressOf(await load(files));

    // One total for the whole batch, fixed from the first message — a per-file total would make
    // the bar restart three times.
    expect(new Set(updates.map((u) => u.progress.totalBytes))).toEqual(new Set([total]));
    const loaded = updates.map((u) => u.progress.loadedBytes);
    expect(loaded).toEqual([...loaded].sort((a, b) => a - b));
    expect(last(loaded)).toBe(total);
    expect(last(updates).progress.lineCount).toBe(4);
  });

  it("counts a file it could not read, so the bar does not stall on the failure", async () => {
    const good = transcript("a.jsonl", line("one"));
    const total = good.blob.size + 2048;

    const updates = progressOf(await load([good, { path: "b.jsonl", blob: unreadable(2048, new Error("nope")) }]));

    // The unreadable file's bytes are still bytes the user is waiting on. Without the `+=` in
    // the catch, the bar would freeze at the good file's size and never reach the end.
    expect(last(updates).progress.loadedBytes).toBe(total);
  });

  it("opens on `reading` at zero before any file is touched", async () => {
    const updates = progressOf(await load([transcript("a.jsonl", line("one"))]));
    expect(updates[0]?.progress).toMatchObject({ phase: "reading", loadedBytes: 0, lineCount: 0 });
  });
});

describe("session.worker · what crosses the boundary", () => {
  it("carries a typed fatal, not a string", async () => {
    const done = terminal(await load([]));
    expect(done.type).toBe("error");
    if (done.type !== "error") return;
    expect(done.diagnostic).toMatchObject({ tier: "fatal", code: "EMPTY_INPUT" });
  });

  it("reports a malformed request instead of going silent", async () => {
    /*
     * Found by writing this file. The byte total was computed BEFORE the try block, so a request
     * whose entry had no blob threw outside every handler: `load()` rejected into a floating
     * `void`, no message was ever posted, and the caller's promise stayed pending forever with
     * the progress bar on "reading" — the RC-5 leak class this codebase has already named twice
     * (`sessionLoader.ts`'s postMessage path is the other one).
     *
     * Nothing in `src/` builds a request like this today, so it is a hardening, not a live bug.
     * It is worth one line regardless: the failure mode is the worst available — no error, no
     * timeout, no way for the user to tell the app is not merely slow.
     */
    const done = terminal(await load([{ path: "x.jsonl", blob: undefined as unknown as Blob }]));
    expect(done.type).toBe("error");
    if (done.type !== "error") return;
    expect(done.diagnostic).toMatchObject({ tier: "fatal", code: "LOAD_FAILED" });
  });

  it("aborts the whole batch on cancellation and leaves the rest unread", async () => {
    /*
     * Cancellation is the ONE exception to per-file isolation, and the asymmetry is deliberate:
     * a file that cannot be read is a fact about that file, while a cancelled load is a statement
     * about the batch.
     *
     * Recorded while writing this (DW-22): no production caller can reach this branch today.
     * `parseJsonlBlob` only raises `StreamCancelledError` when given an `isCancelled` callback,
     * and the worker never passes one — the UI cancels by `terminate()`ing the worker instead
     * (`sessionLoader.cancel()`). So the `cancelled` message has a consumer and no producer,
     * which is P-005's shape seen from the other end. Pinned here rather than deleted: the
     * branch is correct, and deleting it would remove the only place cancellation is defined.
     */
    const untouched = vi.fn(() => { throw new Error("this file must never be read"); });
    const done = terminal(await load([
      { path: "a.jsonl", blob: unreadable(10, new StreamCancelledError()) },
      { path: "b.jsonl", blob: { size: 10, stream: untouched } as unknown as Blob },
    ]));

    expect(done.type).toBe("cancelled");
    expect(untouched).not.toHaveBeenCalled();
  });

  it("ignores a message that is not a load request", async () => {
    posted.length = 0;
    scope.onmessage?.({ data: { type: "ping" } as unknown as SessionWorkerLoadRequest } as MessageEvent<SessionWorkerLoadRequest>);
    await Promise.resolve();
    expect(posted).toEqual([]);
  });
});

describe("session.worker · the fallback record is per run", () => {
  /*
   * The worker is reused across loads, and `getFallbackReport()` is module-level state inside the
   * worker thread. Without the `resetFallbackReport()` at the top of each run, session two would
   * arrive carrying session one's degradations — and because they only surface in a console
   * report, nobody would notice they belonged to a file that is no longer open.
   *
   * A record with no `sessionId` is the trigger: `normalizer/finalizeMeta` reports
   * `missing-session-id` for it. Two-sided on purpose — a clean transcript must report nothing,
   * or "does not accumulate" would be true of a channel that never carries anything.
   */
  const codesOf = (message: SessionWorkerMessage): string[] =>
    message.type === "complete" ? message.fallbacks.map((record) => record.reason) : [];

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports nothing for a transcript that needs no fallback", async () => {
    const clean = await load([transcript("a.jsonl", line("fine"))]);
    expect(codesOf(terminal(clean))).toEqual([]);
  });

  it("reports a degradation, and reports the same one again rather than twice", async () => {
    const first = codesOf(terminal(await load([transcript("a.jsonl", line("no id", null))])));
    expect(first).toContain("missing-session-id");

    // Same degradation, different file: the second run must report it once, not twice. A worker
    // that skipped `resetFallbackReport()` would carry the first run's count into this one.
    const second = codesOf(terminal(await load([transcript("b.jsonl", line("no id either", null))])));
    expect(second).toEqual(first);
  });
});
