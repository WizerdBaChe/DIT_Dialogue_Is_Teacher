/**
 * Pipeline：把原始輸入轉成可渲染的 Span Tree (資料流可追蹤的單一入口)。
 *   原始文字 → Adapter → Normalizer → Denoiser → 自檢 → SessionDocument
 * 各步驟為純函式組合，任何一步的問題都收進 diagnostics 一併回報。
 *
 * R9：檔案層改為「逐檔結果 + 批次判定」的狀態機 (DSM-1)。在此之前，任何一個無法辨識的
 * 檔案都會讓整批載入失敗——真實的 `subagents/` 目錄裡有 `.meta.json` 旁檔，於是選一個
 * 真實 session 資料夾必定失敗 (RC-1a)。現在單檔失敗只是 `ok_partial`，並且「這批檔案裡
 * 沒有主檔」是一個具名狀態，不再靜默把 subagent 當成主檔 (RC-1b)。
 */
import { detectAdapter, getAdapter } from "@/core/adapters";
import { normalize } from "@/core/normalize/normalizer";
import { denoise } from "@/core/denoise/denoiser";
import { distill } from "@/core/distill/distiller";
import { validateSessionDocument } from "@/core/validate/spanTreeSchema";
import { PipelineFatalError, type Diagnostic } from "@/core/diagnostics/contracts";
import type { SessionDocument, SourceId } from "@/types/spanTree";
import type { ParseResult, RawEvent } from "@/core/adapters";

export interface PipelineResult {
  doc: SessionDocument;
  diagnostics: Diagnostic[];
}

export interface TranscriptFileInput {
  path: string;
  content: string;
}

/**
 * 逐檔解析結果。`parsed` 是唯一的成功狀態；其餘兩種帶著原因活到批次層，
 * 由批次層決定它們是 warn (還有別的檔案可用) 還是 fatal (全軍覆沒)。
 */
export type ParsedFileOutcome =
  | { status: "parsed"; path: string; parsed: ParseResult; inputBytes: number }
  | { status: "unrecognized"; path: string; inputBytes: number }
  | { status: "parse_failed"; path: string; inputBytes: number; detail: string };

export type PipelineBuildPhase = "organizing" | "validating";
export type PipelinePhaseListener = (phase: PipelineBuildPhase) => void;

/** 輸入過大保護：仍處理，但提示使用者效能可能受影響 (backend checklist 5.1 / 6.2)。 */
const LARGE_INPUT_BYTES = 8 * 1024 * 1024;

function buildFromParsed(parsed: ParseResult, inputBytes: number, onPhase?: PipelinePhaseListener): PipelineResult {
  const diagnostics: Diagnostic[] = [...parsed.diagnostics];

  if (inputBytes > LARGE_INPUT_BYTES) {
    diagnostics.unshift({ tier: "info", code: "LARGE_INPUT", detail: `${(inputBytes / 1024 / 1024).toFixed(1)} MB` });
  }

  onPhase?.("organizing");
  let doc = normalize(parsed);
  doc = denoise(doc);
  doc = distill(doc); // 後端「整理」：產出精簡因果骨架 (preset v1)。

  onPhase?.("validating");
  const validation = validateSessionDocument(doc);
  if (!validation.ok) {
    diagnostics.push(...validation.issues.map((issue): Diagnostic => ({ tier: "warn", code: "SELF_CHECK_ISSUE", detail: issue })));
  }

  if (doc.spans.length === 0) throw new PipelineFatalError("NO_RENDERABLE_CONTENT");

  return { doc, diagnostics };
}

export function buildSessionDocument(raw: string, sourceId?: SourceId): PipelineResult {
  if (!raw || !raw.trim()) throw new PipelineFatalError("EMPTY_INPUT");

  const adapter = sourceId ? getAdapter(sourceId) : detectAdapter(raw);
  if (!adapter) throw new PipelineFatalError("FILE_UNRECOGNIZED", "1");

  return buildFromParsed(adapter.parse(raw), raw.length);
}

function isSubagentPath(path: string): boolean {
  return /(^|[\\/])subagents[\\/]/i.test(path);
}

/** Build one session from a main transcript plus any selected subagent files. */
export function buildSessionDocumentFromFiles(files: TranscriptFileInput[], sourceId?: SourceId): PipelineResult {
  const outcomes = files
    .filter((file) => file.content.trim())
    .map((file): ParsedFileOutcome => {
      const adapter = sourceId ? getAdapter(sourceId) : detectAdapter(file.content);
      if (!adapter) return { status: "unrecognized", path: file.path, inputBytes: file.content.length };
      return { status: "parsed", path: file.path, parsed: adapter.parse(file.content), inputBytes: file.content.length };
    });

  return buildSessionDocumentFromParsedFiles(outcomes);
}

/**
 * 選錯資料夾防呆：正常情況下「非 subagents/ 路徑」的檔案只會有一個 sessionId (單一 main transcript)；
 * subagents/ 底下每個檔案本來就各自有自己的 sessionId，不列入比對。若非 subagents 路徑的檔案出現
 * 超過一種 sessionId，代表選取範圍混進了多個不相關的 session (例如整包 .claude/projects/ 或多個月份
 * 的 Codex rollout 檔)，直接拒絕合併，而不是悄悄挑第一個當 main、其餘硬拼成一棵錯亂的樹。
 */
function countTopLevelSessions(files: Array<{ path: string; parsed: ParseResult }>): number {
  return new Set(
    files
      .filter((file) => !isSubagentPath(file.path))
      .map((file) => file.parsed.meta.id)
      .filter((id): id is string => Boolean(id)),
  ).size;
}

/**
 * 批次判定 (DSM-1 `collecting`)。五個結果狀態各自具名：
 *   ok · ok_partial · no_main · multi_session · empty
 */
export function buildSessionDocumentFromParsedFiles(
  outcomes: ParsedFileOutcome[],
  onPhase?: PipelinePhaseListener,
): PipelineResult {
  const parsedFiles = outcomes.filter((o): o is Extract<ParsedFileOutcome, { status: "parsed" }> => o.status === "parsed");
  const unrecognized = outcomes.filter((o) => o.status === "unrecognized");
  const failed = outcomes.filter((o): o is Extract<ParsedFileOutcome, { status: "parse_failed" }> => o.status === "parse_failed");

  if (outcomes.length === 0) throw new PipelineFatalError("EMPTY_INPUT");
  if (parsedFiles.length === 0) {
    // 全軍覆沒才是 fatal。只要有一個檔案活著，無法辨識的檔案就只是 warn。
    if (failed.length > 0) throw new PipelineFatalError("FILE_PARSE_FAILED", failed.map((f) => f.path).join("、"));
    throw new PipelineFatalError("FILE_UNRECOGNIZED", unrecognized.map((f) => f.path).join("、"));
  }

  const sessionCount = countTopLevelSessions(parsedFiles);
  if (sessionCount > 1) throw new PipelineFatalError("MULTIPLE_SESSIONS", String(sessionCount));

  const main = parsedFiles.find((file) => !isSubagentPath(file.path));
  if (!main) throw new PipelineFatalError("NO_MAIN_TRANSCRIPT");

  const batchDiagnostics: Diagnostic[] = [];
  if (unrecognized.length > 0) {
    batchDiagnostics.push({
      tier: "warn",
      code: "FILE_UNRECOGNIZED",
      count: unrecognized.length,
      detail: unrecognized.map((f) => f.path).join("、"),
    });
  }
  if (failed.length > 0) {
    batchDiagnostics.push({
      tier: "warn",
      code: "FILE_PARSE_FAILED",
      count: failed.length,
      detail: failed.map((f) => f.path).join("、"),
    });
  }

  const ordered = [main, ...parsedFiles.filter((file) => file !== main)];

  const sequenced: Array<{ event: RawEvent; sequence: number }> = [];
  let sequence = 0;
  for (const { path, parsed } of ordered) {
    for (const event of parsed.events) {
      sequenced.push({ event: { ...event, sourcePath: path }, sequence: sequence++ });
    }
  }
  sequenced.sort((left, right) => {
    const leftTime = left.event.timestamp ? Date.parse(left.event.timestamp) : Number.NaN;
    const rightTime = right.event.timestamp ? Date.parse(right.event.timestamp) : Number.NaN;
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return leftTime - rightTime;
    return left.sequence - right.sequence;
  });

  const parsed: ParseResult = {
    meta: ordered[0].parsed.meta,
    events: sequenced.map(({ event }) => event),
    diagnostics: [
      ...batchDiagnostics,
      ...ordered.flatMap(({ path, parsed: result }) => result.diagnostics.map((d): Diagnostic => ({ ...d, path: d.path ?? path }))),
    ],
  };
  return buildFromParsed(parsed, ordered.reduce((total, file) => total + file.inputBytes, 0), onPhase);
}
