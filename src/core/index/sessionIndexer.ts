/**
 * Session 索引器 (DSM-4 的 `indexing`)。
 *
 * 表頭掃描，**不是完整解析**：每個檔案只讀頭尾各一段，算出足以在清單上做決定的東西。
 *
 * 頭尾大小是量出來的，不是猜的。實測 `~/.claude/projects/` 的 83 個帶標題紀錄的檔案，
 * 標題那一行的位置分布很極端——中位數在**距檔尾 7.5 KB**（標題是後來才追加的），
 * 但也有落在檔頭 60 KB 處的。頭尾各 64 KB 只涵蓋 81/83；頭尾各 128 KB 涵蓋 83/83，
 * 全目錄總讀取量約 25 MB。故取 128 KB。
 *
 * 沒掃到標題不是失敗：`titleSource` 會降級到「第一則真人訊息」，那往往比 AI 生成的標題
 * 更能說明這個 session 在幹嘛。**降級一律留下痕跡**，不靜默假裝知道。
 */
import { detectAdapter } from "@/core/adapters";
import { reportFallback } from "@/core/diagnostics";
import type { Diagnostic } from "@/core/diagnostics/contracts";
import { stripInjectedPreamble } from "@/core/text/preamble";
import { classifySession, isSubagentPath, isSyntheticPrompt } from "./classifySession";
import type { DirectoryFile, DirectorySource, SessionIndex, SessionIndexEntry, TitleSource } from "./contracts";

export const INDEX_SCAN_HEAD_BYTES = 128 * 1024;
export const INDEX_SCAN_TAIL_BYTES = 128 * 1024;
/**
 * 一行可能比整個檔頭視窗還大：夾帶截圖的使用者訊息會把 base64 影像塞進同一行 JSON，
 * 實測有超過 128 KB 的。這種檔案的檔頭切片裡沒有任何一行是完整的，掃描會一無所獲，
 * 而「開頭讀不到東西」若直接當成「沒有真人訊息」，就會把一份真人對話標成機器任務。
 * 因此第一次掃不到紀錄時，把檔頭視窗放大一次再試。
 */
export const INDEX_SCAN_HEAD_MAX_BYTES = 1024 * 1024;
/** 超過這個長度的單行不像一般紀錄，比較像夾帶了 base64 影像；見 scanFile 的邊界處理。 */
const OVERSIZED_LINE_BYTES = 32 * 1024;
/** 上限存在是為了不讓一個超大目錄卡住 UI。超過就明說被略過幾個，絕不靜默截斷。 */
export const INDEX_MAX_FILES = 500;

const TITLE_MAX_LENGTH = 64;

interface ScanStats {
  sessionId: string | null;
  cwd: string | null;
  customTitle: string | null;
  aiTitle: string | null;
  firstHumanText: string | null;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  humanTurnCount: number;
  syntheticPromptCount: number;
  assistantCount: number;
  hasCompaction: boolean;
  hasAgentId: boolean;
  sidechainCount: number;
  recordCount: number;
}

function emptyStats(): ScanStats {
  return {
    sessionId: null,
    cwd: null,
    customTitle: null,
    aiTitle: null,
    firstHumanText: null,
    firstTimestamp: null,
    lastTimestamp: null,
    humanTurnCount: 0,
    syntheticPromptCount: 0,
    assistantCount: 0,
    hasCompaction: false,
    hasAgentId: false,
    sidechainCount: 0,
    recordCount: 0,
  };
}

interface ContentBlock { type?: string; text?: string }

/**
 * 一筆紀錄算不算「真人出手的一個回合」，以及（若有）淨化後剩下的文字。
 *
 * 回合與文字要分開回報：`/doctor` 這類斜線指令淨化後文字整段消失，但那是一個人按下去的。
 * 用「有沒有文字」當人機判準，會把每一個以斜線指令開場的 session 都標成機器任務。
 * 排除：isMeta (工具注入的 skill 內文、system-reminder)、壓縮摘要、tool_result 回填。
 */
function humanTurn(record: Record<string, unknown>): { text: string | null } | null {
  if (record.type !== "user") return null;
  if (record.isMeta === true || record.isCompactSummary === true) return null;
  const content = (record.message as { content?: unknown } | undefined)?.content;

  if (typeof content === "string") return { text: stripInjectedPreamble(content).trim() || null };
  if (!Array.isArray(content)) return null;

  const blocks = content as ContentBlock[];
  if (blocks.some((block) => block?.type === "tool_result")) return null;
  const text = blocks
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => stripInjectedPreamble(block.text as string))
    .join("\n")
    .trim();
  return { text: text || null };
}

function absorb(stats: ScanStats, record: Record<string, unknown>): void {
  stats.recordCount += 1;
  if (typeof record.sessionId === "string" && !stats.sessionId) stats.sessionId = record.sessionId;
  if (typeof record.cwd === "string" && !stats.cwd) stats.cwd = record.cwd;
  if (typeof record.agentId === "string") stats.hasAgentId = true;
  if (record.isSidechain === true) stats.sidechainCount += 1;

  const timestamp = typeof record.timestamp === "string" ? record.timestamp : null;
  if (timestamp) {
    if (!stats.firstTimestamp || timestamp < stats.firstTimestamp) stats.firstTimestamp = timestamp;
    if (!stats.lastTimestamp || timestamp > stats.lastTimestamp) stats.lastTimestamp = timestamp;
  }

  switch (record.type) {
    case "custom-title":
      if (typeof record.customTitle === "string" && record.customTitle.trim()) stats.customTitle = record.customTitle;
      break;
    case "ai-title":
      if (typeof record.aiTitle === "string" && record.aiTitle.trim()) stats.aiTitle = record.aiTitle;
      break;
    case "assistant":
      stats.assistantCount += 1;
      break;
    case "system":
      if (record.subtype === "compact_boundary") stats.hasCompaction = true;
      break;
    case "user": {
      const turn = humanTurn(record);
      if (!turn) break;
      stats.humanTurnCount += 1;
      if (!turn.text) break;
      if (isSyntheticPrompt(turn.text)) stats.syntheticPromptCount += 1;
      else if (!stats.firstHumanText) stats.firstHumanText = turn.text;
      break;
    }
    default:
      break;
  }
}

/**
 * 把一段位元組切成完整的行。`dropFirst` 用於檔尾段（第一行多半被切一半），
 * `dropLast` 用於檔頭段（最後一行多半被切一半）。切半的行直接丟掉，不硬解。
 */
function completeLines(text: string, dropFirst: boolean, dropLast: boolean): string[] {
  const lines = text.split("\n");
  if (dropFirst && lines.length > 0) lines.shift();
  if (dropLast && lines.length > 0) lines.pop();
  return lines;
}

function feed(stats: ScanStats, lines: string[], seen: Set<string>): void {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // 頭尾兩段在小檔案上可能重疊；用 uuid 去重，沒有 uuid 的就用整行。
    const key = trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      absorb(stats, JSON.parse(trimmed) as Record<string, unknown>);
    } catch {
      // 索引階段的壞行不值得打擾使用者——載入時 adapter 會正式報告一次。
    }
  }
}

async function readText(file: DirectoryFile, range?: { start: number; end: number }): Promise<string> {
  const blob = await file.read(range);
  return blob.text();
}

interface ScanResult {
  stats: ScanStats;
  countsExact: boolean;
  /** 檔頭切片裡至少有一行是完整的。false = 計數不可信，分類必須棄權。 */
  headScanUsable: boolean;
  isClaudeCode: boolean;
}

async function scanFile(file: DirectoryFile): Promise<ScanResult> {
  const stats = emptyStats();
  const seen = new Set<string>();
  const whole = file.size <= INDEX_SCAN_HEAD_BYTES + INDEX_SCAN_TAIL_BYTES;

  let headWindow = INDEX_SCAN_HEAD_BYTES;
  let headText = whole ? await readText(file) : await readText(file, { start: 0, end: headWindow });

  // 來源判定用檔頭：與載入時走的是同一個 detectAdapter，索引與載入不會有兩套看法。
  const adapter = detectAdapter(headText);
  const isClaudeCode = adapter?.id === "claude-code";

  feed(stats, completeLines(headText, false, !whole), seen);

  /*
   * 視窗邊界必定切掉一行，而被切掉的那一行有時就是唯一的真人訊息：夾帶截圖的使用者訊息
   * 會把 base64 影像塞進同一行 JSON，實測有 132 KB 的單行。落在檔頭邊界時，那則訊息整個
   * 消失，計數變成 0，然後被判成「沒有真人訊息」＝機器任務——正是要避免的誤傷。
   *
   * 但也不能為此無條件放大：一般行長 1–25 KB，每個檔案都多讀就是幾十 MB 的浪費。
   * 折衷是看**被切掉那一段有多長**：超過 32 KB 就不像普通一行，才值得再讀一次。
   */
  const straddling = headText.length - (headText.lastIndexOf("\n") + 1);
  if (!whole && headWindow < INDEX_SCAN_HEAD_MAX_BYTES && straddling > OVERSIZED_LINE_BYTES) {
    headWindow = Math.min(file.size, INDEX_SCAN_HEAD_MAX_BYTES);
    headText = await readText(file, { start: 0, end: headWindow });
    feed(stats, completeLines(headText, false, headWindow < file.size), seen);
  }

  // 檔頭一筆完整紀錄都讀不到（第一行就超過放大後的視窗）：計數全不可信，分類必須棄權。
  const headScanUsable = stats.recordCount > 0;

  if (!whole) {
    const tailStart = Math.max(headWindow, file.size - INDEX_SCAN_TAIL_BYTES);
    if (tailStart < file.size) {
      const tailText = await readText(file, { start: tailStart, end: file.size });
      feed(stats, completeLines(tailText, true, false), seen);
    }
  }

  return { stats, countsExact: whole, headScanUsable, isClaudeCode };
}

function firstLine(text: string, max: number): string {
  const line = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).find((l) => l.length > 0) ?? "";
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

function pickTitle(stats: ScanStats, path: string): { title: string; titleSource: TitleSource } {
  if (stats.customTitle) return { title: firstLine(stats.customTitle, TITLE_MAX_LENGTH), titleSource: "custom" };
  if (stats.aiTitle) return { title: firstLine(stats.aiTitle, TITLE_MAX_LENGTH), titleSource: "ai" };
  if (stats.firstHumanText) return { title: firstLine(stats.firstHumanText, TITLE_MAX_LENGTH), titleSource: "derived" };
  // 連第一則真人訊息都沒有，只能顯示 HASH——這正是使用者抱怨的狀態，所以要留下記錄。
  reportFallback("sessionIndexer/pickTitle", "no-title-signal", { path });
  return { title: baseName(path).replace(/\.jsonl$/i, ""), titleSource: "filename" };
}

/** `<dir>/<id>.jsonl` 的子代理在 `<dir>/<id>/subagents/`——是兄弟，不是子項 (RC-1b)。 */
function subagentPrefixFor(path: string): string {
  return `${path.replace(/\.jsonl$/i, "")}/subagents/`;
}

function topLevelDir(path: string): string | null {
  const parts = path.split("/");
  return parts.length > 1 ? parts[0] : null;
}

export interface BuildIndexOptions {
  maxFiles?: number;
  /** 逐檔進度，供 UI 顯示；索引 140 個檔案要讀約 25 MB。 */
  onProgress?: (done: number, total: number) => void;
}

export async function buildSessionIndex(
  source: DirectorySource,
  options: BuildIndexOptions = {},
): Promise<SessionIndex> {
  const maxFiles = options.maxFiles ?? INDEX_MAX_FILES;
  const diagnostics: Diagnostic[] = [];

  const all = (await source.list()).filter((file) => /\.jsonl$/i.test(file.path));
  const mains = all.filter((file) => !isSubagentPath(file.path));
  const subagents = all.filter((file) => isSubagentPath(file.path));

  const scanned = mains.slice(0, maxFiles);
  if (mains.length > maxFiles) {
    diagnostics.push({ tier: "info", code: "INDEX_TRUNCATED", detail: String(maxFiles), count: mains.length - maxFiles });
  }

  const entries: SessionIndexEntry[] = [];
  let unreadable = 0;
  let unreadableDetail = "";

  for (const [done, file] of scanned.entries()) {
    options.onProgress?.(done, scanned.length);
    let result: ScanResult;
    try {
      result = await scanFile(file);
    } catch (error) {
      unreadable += 1;
      if (!unreadableDetail) unreadableDetail = `${file.path} (${error instanceof Error ? error.message : String(error)})`;
      continue;
    }

    const { stats, countsExact, headScanUsable } = result;

    /*
     * 本輪只索引 Claude Code (作者裁決)。但「不是 Claude Code」與「讀不出來所以不知道」
     * 是兩件事，不能都當成前者處理：
     *  - 讀得到完整的行、而且 adapter 不認領 → 有把握地排除（Codex 或其他東西）。
     *  - 一行完整的都讀不到 → 沒有把握，那就列出來標成「無法判定」，而不是靜默消失。
     * 從清單上憑空少一個檔案，比誠實地說「不知道」更糟。
     */
    if (headScanUsable && !result.isClaudeCode) continue;
    const prefix = subagentPrefixFor(file.path);
    const subagentPaths = subagents.filter((candidate) => candidate.path.startsWith(prefix)).map((candidate) => candidate.path);
    const { title, titleSource } = pickTitle(stats, file.path);

    const { kind, reason } = classifySession({
      path: file.path,
      hasAgentId: stats.hasAgentId,
      allSidechain: stats.recordCount > 0 && stats.sidechainCount === stats.recordCount,
      humanTurnCount: stats.humanTurnCount,
      syntheticPromptCount: stats.syntheticPromptCount,
      headScanUsable,
      isClaudeCode: result.isClaudeCode,
    });

    entries.push({
      id: stats.sessionId ?? baseName(file.path).replace(/\.jsonl$/i, ""),
      path: file.path,
      project: topLevelDir(file.path),
      // 專案路徑取自紀錄自報的 cwd。目錄名是編碼過的（`:` `\` `.` 全變成 `-`），
      // 反解會猜錯，所以解不出來就留 null。
      projectPath: stats.cwd,
      title,
      titleSource,
      source: "claude-code",
      startedAt: stats.firstTimestamp,
      endedAt: stats.lastTimestamp,
      sizeBytes: file.size,
      humanPromptCount: stats.humanTurnCount,
      assistantCount: stats.assistantCount,
      countsExact,
      hasCompaction: stats.hasCompaction,
      subagentPaths,
      kind,
      kindReason: reason,
    });
  }
  options.onProgress?.(scanned.length, scanned.length);

  if (unreadable > 0) {
    diagnostics.push({ tier: "warn", code: "INDEX_FILE_UNREADABLE", count: unreadable, detail: unreadableDetail });
  }
  if (entries.length === 0) diagnostics.push({ tier: "info", code: "INDEX_EMPTY" });

  entries.sort((left, right) => (right.endedAt ?? "").localeCompare(left.endedAt ?? ""));
  return { entries, diagnostics };
}
