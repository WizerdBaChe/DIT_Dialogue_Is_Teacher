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

/**
 * 逐檔結果。R9：`unrecognized` 從「拋例外」降為一個結果值——真實 `subagents/` 目錄裡
 * 就是有 `.meta.json` 這種旁檔，讓它炸掉整批載入是 RC-1a 的直接成因。
 * R7-INV-9（不得默默退回任一來源）仍然成立：這裡不猜測來源，只是把「猜不到」講出來。
 */
export type JsonlStreamResult =
  | { status: "recognized"; parsed: ParseResult; inputBytes: number; lineCount: number }
  | { status: "unrecognized"; inputBytes: number; lineCount: number };

export class StreamCancelledError extends Error {
  constructor() {
    super("Session loading was cancelled.");
    this.name = "StreamCancelledError";
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

  /** 偵測失敗一次就不再重試：格式是整份檔案的屬性，不是逐行的。 */
  let detectionFailed = false;

  const pushLine = (line: string): void => {
    if (detectionFailed) return;
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
    if (!adapter) {
      detectionFailed = true;
      return;
    }
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
  options.onProgress?.({ bytesRead, lineCount });

  // 沒有 accumulator 有兩種成因：偵測失敗，或整份檔案都是空行。兩者對批次層是同一件事
  // ——這個檔案沒有可用內容——由批次層決定要 warn 還是 fatal。
  if (!accumulator) return { status: "unrecognized", inputBytes: bytesRead, lineCount };

  return { status: "recognized", parsed: accumulator.finish(), inputBytes: bytesRead, lineCount };
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
