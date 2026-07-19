import { ClaudeCodeJsonlAccumulator } from "@/core/adapters/claudeCodeJsonl";
import type { ParseResult } from "@/core/adapters";

export interface JsonlStreamProgress {
  bytesRead: number;
  lineCount: number;
}

export interface JsonlStreamOptions {
  isCancelled?: () => boolean;
  onProgress?: (progress: JsonlStreamProgress) => void;
}

export interface JsonlStreamResult {
  parsed: ParseResult;
  inputBytes: number;
  lineCount: number;
}

export class StreamCancelledError extends Error {
  constructor() {
    super("Session loading was cancelled.");
    this.name = "StreamCancelledError";
  }
}

/** Decode and parse UTF-8 JSONL without assuming chunk or code-point boundaries. */
export async function parseClaudeCodeJsonlChunks(
  chunks: AsyncIterable<Uint8Array>,
  options: JsonlStreamOptions = {},
): Promise<JsonlStreamResult> {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const accumulator = new ClaudeCodeJsonlAccumulator();
  let carry = "";
  let bytesRead = 0;
  let lineCount = 0;

  const pushCompleteLines = (): void => {
    const lines = carry.split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) {
      accumulator.pushLine(line.endsWith("\r") ? line.slice(0, -1) : line);
      lineCount += 1;
    }
  };

  for await (const chunk of chunks) {
    if (options.isCancelled?.()) throw new StreamCancelledError();
    bytesRead += chunk.byteLength;
    carry += decoder.decode(chunk, { stream: true });
    pushCompleteLines();
    options.onProgress?.({ bytesRead, lineCount });
  }

  carry += decoder.decode();
  if (carry.length > 0) {
    accumulator.pushLine(carry.endsWith("\r") ? carry.slice(0, -1) : carry);
    lineCount += 1;
  }
  if (options.isCancelled?.()) throw new StreamCancelledError();
  options.onProgress?.({ bytesRead, lineCount });

  return { parsed: accumulator.finish(), inputBytes: bytesRead, lineCount };
}

async function* blobChunks(blob: Blob): AsyncGenerator<Uint8Array> {
  const reader = blob.stream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

export function parseClaudeCodeJsonlBlob(blob: Blob, options?: JsonlStreamOptions): Promise<JsonlStreamResult> {
  return parseClaudeCodeJsonlChunks(blobChunks(blob), options);
}
