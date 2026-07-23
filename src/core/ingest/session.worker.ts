/// <reference lib="webworker" />
import { parseJsonlBlob } from "./jsonlStream";
import { buildSessionDocumentFromParsedFiles } from "@/core/pipeline";
import type { ParsedTranscriptFileInput } from "@/core/pipeline";
import { getFallbackReport, resetFallbackReport } from "@/core/diagnostics";
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
    const parsedFiles: ParsedTranscriptFileInput[] = [];

    for (const file of request.files) {
      const result = await parseJsonlBlob(file.blob, {
        onProgress: ({ bytesRead, lineCount }) => progress({
          phase: "parsing",
          loadedBytes: completedBytes + bytesRead,
          lineCount: completedLines + lineCount,
          sourcePath: file.path,
        }),
      });
      parsedFiles.push({ path: file.path, parsed: result.parsed, inputBytes: result.inputBytes });
      completedBytes += result.inputBytes;
      completedLines += result.lineCount;
    }

    const result = buildSessionDocumentFromParsedFiles(parsedFiles, (phase) => progress({ phase }));
    // 降級記錄跟著結果一起回主執行緒，否則 worker 這一側的記錄會隨 terminate 消失。
    post({ type: "complete", requestId: request.requestId, result, fallbacks: getFallbackReport() });
  } catch (error) {
    post({
      type: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : "Session loading failed.",
    });
  }
}
