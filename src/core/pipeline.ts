/**
 * Pipeline：把原始輸入轉成可渲染的 Span Tree (資料流可追蹤的單一入口)。
 *   原始文字 → Adapter → Normalizer → Denoiser → 自檢 → SessionDocument
 * 各步驟為純函式組合，任何一步的問題都收進 warnings 一併回報。
 */
import { detectAdapter, getAdapter } from "@/core/adapters";
import { normalize } from "@/core/normalize/normalizer";
import { denoise } from "@/core/denoise/denoiser";
import { distill } from "@/core/distill/distiller";
import { validateSessionDocument } from "@/core/validate/spanTreeSchema";
import type { SessionDocument, SourceId } from "@/types/spanTree";
import type { ParseResult, RawEvent } from "@/core/adapters";

export interface PipelineResult {
  doc: SessionDocument;
  warnings: string[];
}

export interface TranscriptFileInput {
  path: string;
  content: string;
}

export class PipelineError extends Error {}

/**
 * 建構 SessionDocument。
 * @param raw   原始輸入文字 (.jsonl 內容)。
 * @param sourceId 指定來源；省略則自動偵測。
 */
function buildFromParsed(parsed: ParseResult, inputBytes: number): PipelineResult {
  const warnings = [...parsed.warnings];

  // 輸入過大保護：仍處理，但提示使用者效能可能受影響 (backend checklist 5.1 / 6.2)。
  const LARGE_INPUT_BYTES = 8 * 1024 * 1024;
  if (inputBytes > LARGE_INPUT_BYTES) {
    warnings.unshift(`輸入較大 (${(inputBytes / 1024 / 1024).toFixed(1)} MB)，渲染可能變慢。`);
  }

  let doc = normalize(parsed);
  doc = denoise(doc);
  doc = distill(doc); // 後端「整理」：產出精簡因果骨架 (preset v1)。

  const validation = validateSessionDocument(doc);
  if (!validation.ok) warnings.push(...validation.issues.map((i) => `自檢：${i}`));

  if (doc.spans.length === 0) {
    throw new PipelineError("解析後沒有任何可呈現的節點。請確認檔案是有效的 Claude Code session。");
  }

  return { doc, warnings };
}

export function buildSessionDocument(raw: string, sourceId?: SourceId): PipelineResult {
  if (!raw || !raw.trim()) {
    throw new PipelineError("輸入為空，請提供 Claude Code 的 .jsonl 內容。");
  }

  const adapter = sourceId ? getAdapter(sourceId) : detectAdapter(raw);
  if (!adapter) {
    throw new PipelineError("無法辨識輸入格式。目前支援 Claude Code 的 .jsonl transcript。");
  }

  return buildFromParsed(adapter.parse(raw), raw.length);
}

function isSubagentPath(path: string): boolean {
  return /(^|[\\/])subagents[\\/]/i.test(path);
}

/** Build one session from a main transcript plus any selected subagent files. */
export function buildSessionDocumentFromFiles(files: TranscriptFileInput[], sourceId?: SourceId): PipelineResult {
  const nonEmpty = files.filter((file) => file.content.trim());
  if (nonEmpty.length === 0) throw new PipelineError("輸入為空，請提供至少一個 .jsonl transcript。");

  const main = nonEmpty.find((file) => !isSubagentPath(file.path)) ?? nonEmpty[0];
  const ordered = [main, ...nonEmpty.filter((file) => file !== main)];
  const parsedFiles = ordered.map((file) => {
    const adapter = sourceId ? getAdapter(sourceId) : detectAdapter(file.content);
    if (!adapter) throw new PipelineError(`無法辨識輸入格式：${file.path}`);
    return { file, parsed: adapter.parse(file.content) };
  });

  const sequenced: Array<{ event: RawEvent; sequence: number }> = [];
  let sequence = 0;
  for (const { file, parsed } of parsedFiles) {
    for (const event of parsed.events) {
      sequenced.push({ event: { ...event, sourcePath: file.path }, sequence: sequence++ });
    }
  }
  sequenced.sort((left, right) => {
    const leftTime = left.event.timestamp ? Date.parse(left.event.timestamp) : Number.NaN;
    const rightTime = right.event.timestamp ? Date.parse(right.event.timestamp) : Number.NaN;
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return leftTime - rightTime;
    return left.sequence - right.sequence;
  });

  const parsed: ParseResult = {
    meta: parsedFiles[0].parsed.meta,
    events: sequenced.map(({ event }) => event),
    warnings: parsedFiles.flatMap(({ file, parsed: result }) => result.warnings.map((warning) => `${file.path}: ${warning}`)),
  };
  return buildFromParsed(parsed, nonEmpty.reduce((total, file) => total + file.content.length, 0));
}
