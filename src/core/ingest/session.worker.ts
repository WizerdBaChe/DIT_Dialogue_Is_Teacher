/// <reference lib="webworker" />
import { parseJsonlBlob, StreamCancelledError } from "./jsonlStream";
import { buildSessionDocumentFromParsedFiles } from "@/core/pipeline";
import type { ParsedFileOutcome } from "@/core/pipeline";
import { getFallbackReport, resetFallbackReport } from "@/core/diagnostics";
import { PipelineFatalError } from "@/core/diagnostics/contracts";
import type { SessionLoadProgress, SessionWorkerLoadRequest, SessionWorkerMessage } from "./contracts";

const workerScope = self as DedicatedWorkerGlobalScope;

function post(message: SessionWorkerMessage): void {
  workerScope.postMessage(message);
}

workerScope.onmessage = (event: MessageEvent<SessionWorkerLoadRequest>) => {
  if (event.data.type !== "load") return;
  void load(event.data);
};

async function load(request: SessionWorkerLoadRequest): Promise<void> {
  const totalBytes = request.files.reduce((sum, file) => sum + file.blob.size, 0);
  let completedBytes = 0;
  let completedLines = 0;

  const progress = (update: Partial<SessionLoadProgress> & Pick<SessionLoadProgress, "phase">): void => {
    post({
      type: "progress",
      requestId: request.requestId,
      progress: {
        phase: update.phase,
        loadedBytes: update.loadedBytes ?? completedBytes,
        totalBytes,
        lineCount: update.lineCount ?? completedLines,
        sourcePath: update.sourcePath ?? null,
      },
    });
  };

  try {
    // worker 會被重複使用來載入不同 session，記錄要按次清空。
    resetFallbackReport();
    progress({ phase: "reading", loadedBytes: 0, lineCount: 0 });
    const outcomes: ParsedFileOutcome[] = [];

    for (const file of request.files) {
      const onProgress = ({ bytesRead, lineCount }: { bytesRead: number; lineCount: number }): void => progress({
        phase: "parsing",
        loadedBytes: completedBytes + bytesRead,
        lineCount: completedLines + lineCount,
        sourcePath: file.path,
      });
      // 逐檔隔離 (DSM-1)：一個檔案讀不動不得影響其他檔案。取消是唯一會中止整批的例外。
      try {
        const result = await parseJsonlBlob(file.blob, { onProgress });
        outcomes.push(result.status === "recognized"
          ? { status: "parsed", path: file.path, parsed: result.parsed, inputBytes: result.inputBytes }
          : { status: "unrecognized", path: file.path, inputBytes: result.inputBytes });
        completedBytes += result.inputBytes;
        completedLines += result.lineCount;
      } catch (error) {
        if (error instanceof StreamCancelledError) throw error;
        outcomes.push({
          status: "parse_failed",
          path: file.path,
          inputBytes: file.blob.size,
          detail: error instanceof Error ? error.message : String(error),
        });
        completedBytes += file.blob.size;
      }
    }

    const result = buildSessionDocumentFromParsedFiles(outcomes, (phase) => progress({ phase }));
    // 降級記錄跟著結果一起回主執行緒，否則 worker 這一側的記錄會隨 terminate 消失。
    post({ type: "complete", requestId: request.requestId, result, fallbacks: getFallbackReport() });
  } catch (error) {
    if (error instanceof StreamCancelledError) {
      post({ type: "cancelled", requestId: request.requestId });
      return;
    }
    post({
      type: "error",
      requestId: request.requestId,
      diagnostic: error instanceof PipelineFatalError
        ? error.diagnostic
        : { tier: "fatal", code: "LOAD_FAILED", detail: error instanceof Error ? error.message : String(error) },
    });
  }
}
