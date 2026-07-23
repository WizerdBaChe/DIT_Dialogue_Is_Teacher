import { detectAdapter } from "@/core/adapters";
import type { LineAccumulator, ParseResult } from "@/core/adapters/types";

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

/** 串流路徑找不到任何 adapter 認領這份輸入時拋出 (R7-INV-9：不得默默退回任一來源)。 */
export class UnknownSourceError extends Error {
  constructor() {
    super("無法辨識輸入格式，找不到能處理此內容的來源 adapter。");
    this.name = "UnknownSourceError";
  }
}

function stripTrailingCr(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

/**
 * Decode and parse UTF-8 JSONL without assuming chunk or code-point boundaries.
 * 來源不寫死：緩衝到第一個非空行後才呼叫 `detectAdapter` 建立對應的 accumulator，
 * 偵測前緩衝的行 (含任何前導空白行) 會在偵測成功後依原順序 replay 進去，行號因此
 * 與實際檔案行號一致。偵測不到來源 → `UnknownSourceError`，不得默默當成 Claude Code。
 */
export async function parseJsonlChunks(
  chunks: AsyncIterable<Uint8Array>,
  options: JsonlStreamOptions = {},
): Promise<JsonlStreamResult> {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let accumulator: LineAccumulator | undefined;
  const pendingLines: string[] = [];
  let carry = "";
  let bytesRead = 0;
  let lineCount = 0;

  const pushLine = (line: string): void => {
    if (accumulator) {
      accumulator.pushLine(line);
      lineCount += 1;
      return;
    }
    if (!line.trim()) {
      pendingLines.push(line);
      return;
    }
    const adapter = detectAdapter(line);
    if (!adapter) throw new UnknownSourceError();
    accumulator = adapter.createAccumulator();
    for (const buffered of pendingLines) {
      accumulator.pushLine(buffered);
      lineCount += 1;
    }
    pendingLines.length = 0;
    accumulator.pushLine(line);
    lineCount += 1;
  };

  const pushCompleteLines = (): void => {
    const lines = carry.split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) pushLine(stripTrailingCr(line));
  };

  for await (const chunk of chunks) {
    if (options.isCancelled?.()) throw new StreamCancelledError();
    bytesRead += chunk.byteLength;
    carry += decoder.decode(chunk, { stream: true });
    pushCompleteLines();
    options.onProgress?.({ bytesRead, lineCount });
  }

  carry += decoder.decode();
  if (carry.length > 0) pushLine(stripTrailingCr(carry));
  if (options.isCancelled?.()) throw new StreamCancelledError();
  if (!accumulator) throw new UnknownSourceError();
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

export function parseJsonlBlob(blob: Blob, options?: JsonlStreamOptions): Promise<JsonlStreamResult> {
  return parseJsonlChunks(blobChunks(blob), options);
}
