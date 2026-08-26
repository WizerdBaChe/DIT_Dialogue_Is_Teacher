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
 * 更能說明這個 session 在幹嘛。**降級一律留下痕跡**，不靜默假裝知道——但痕跡留在
 * `SessionIndex.diagnostics` 這條使用者看得到的通道，不是 console 的 fallback 通道 (R9.1 RC-B)。
 */
import { detectAdapter } from "@/core/adapters";
// R11.2 R1: reuse the adapter's own Codex text-flattening and auto-review-dump detection instead
// of writing a second copy here that would drift from the parser's actual behaviour.
import { flattenTextBlocks as flattenCodexTextBlocks, isAutoReviewDump as isCodexAutoReviewDump } from "@/core/adapters/codexJsonl";
import type { Diagnostic } from "@/core/diagnostics/contracts";
import { stripInjectedPreamble } from "@/core/text/preamble";
import type { SourceId } from "@/types/spanTree";
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
  /**
   * R11.2 R1: this counter is shared between the two envelope shapes — `absorb()` only ever
   * matches ONE of them per record (`record.type === "user"` for Claude Code vs
   * `record.type === "response_item"` with `payload.role === "user"` for Codex), so a single
   * file's lines can never feed both readings at once. `classifySession` still receives it under
   * two separate field names (`humanTurnCount` / `codexHumanTurnCount`) so which rule set consumed
   * it stays visible in the type, even though the underlying number is this one counter.
   */
  humanTurnCount: number;
  syntheticPromptCount: number;
  assistantCount: number;
  hasCompaction: boolean;
  hasAgentId: boolean;
  sidechainCount: number;
  recordCount: number;
  /**
   * R11.2 R1: did the scanned window contain at least one Codex `response_item/message` with
   * `role` `"user"` or `"assistant"`? Deliberately excludes the `"developer"` system-prompt
   * envelope, which is present in almost every rollout — counting it would make this flag true
   * unconditionally and defeat its purpose (see `ClassificationInput.codexSignalUsable`).
   */
  codexMessageSeen: boolean;
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
    codexMessageSeen: false,
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
    // R11.2 R1: Codex's own envelope — the real role/content live nested in `payload`, not at
    // the top level, so this cannot reuse the Claude-Code `"user"`/`"assistant"` cases above.
    case "response_item": {
      const payload = record.payload as { type?: unknown; role?: unknown; content?: unknown } | undefined;
      if (!payload || payload.type !== "message") break;
      const role = payload.role;
      if (role === "developer") break; // 系統提示注入，非對話內容，跟 codexJsonl.ts 的排除一致。
      if (role === "assistant") {
        stats.assistantCount += 1;
        stats.codexMessageSeen = true;
        break;
      }
      if (role !== "user") break;
      stats.codexMessageSeen = true;
      const flattened = flattenCodexTextBlocks(payload.content);
      // Auto-review 審查子代理轉述的歷史掛的也是 role:"user" 信封，但不是真人打的字——
      // 不能算真人回合，也不能拿來當標題來源，否則標題會變成一整份機器轉述的歷史。
      if (isCodexAutoReviewDump(flattened)) break;
      stats.humanTurnCount += 1;
      const text = stripInjectedPreamble(flattened).trim();
      if (text && !stats.firstHumanText) stats.firstHumanText = text;
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
  /** 認領此檔案的來源；沒有 adapter 認領（或還沒能讀到完整的一行去問）就是 `undefined`。 */
  source: SourceId | undefined;
}

async function scanFile(file: DirectoryFile): Promise<ScanResult> {
  const stats = emptyStats();
  const seen = new Set<string>();
  const whole = file.size <= INDEX_SCAN_HEAD_BYTES + INDEX_SCAN_TAIL_BYTES;

  let headWindow = INDEX_SCAN_HEAD_BYTES;
  let headText = whole ? await readText(file) : await readText(file, { start: 0, end: headWindow });

  // 來源判定用檔頭：與載入時走的是同一個 detectAdapter，索引與載入不會有兩套看法。
  let source = detectAdapter(headText)?.id;

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
    // P2-1: the first window's verdict was taken against a truncated fragment of the straddling
    // line (or nothing at all). Re-running detectAdapter against the widened text is what this
    // widening exists for — a stale verdict here is what made a legitimate session vanish.
    source = detectAdapter(headText)?.id;
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

  return { stats, countsExact: whole, headScanUsable, source };
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
  /*
   * 連第一則真人訊息都沒有，只能顯示 HASH。
   *
   * R9.1 RC-B：這裡原本呼叫 `reportFallback`，每索引一次就把 console 洗一輪。那條通道是為了
   * 抓「使用者看不見的替代」——本專案已經因為無聲降級吃過一次指向錯目標的虧。但這一處不是：
   * `titleSource: "filename"` 是回傳型別的一部分，清單上有自己的 class 與 tooltip，使用者本來
   * 就看得到「這是檔名不是標題」。**已經說出口的降級不必再從暗處喊一次**；改由索引器在
   * 收尾時出一條聚合診斷（見 buildSessionIndex 的 INDEX_TITLE_FROM_FILENAME）。
   */
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
  /**
   * R12 M2：使用者在一級選單挑的 agent 系統。有值時，**認得出來但屬於另一套**的檔案不列入，
   * 並以 `INDEX_SOURCE_MISMATCH` 報出被略過的筆數。
   *
   * 三件事刻意不變，因為它們是 R11 WC-1.2 通過驗收的行為：
   *  - 沒給值時，行為與 R11 完全相同（一個位元組都不差），所有既有測試因此仍然有效。
   *  - `source === null`（表頭讀不完整、無從判定）**不會**被濾掉。「讀不到」跟「讀到了、
   *    說不是這一套」是兩件事，把前者當後者濾掉正是 C1 那個缺陷的形狀。
   *  - 略過**永遠帶著計數說出來**，不是安靜地少幾筆。作者當初回報的就是「Codex session
   *    憑空消失」，無聲的過濾不因為這次有選單就變得可以接受。
   */
  expectSource?: SourceId;
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
  let otherSource = 0;

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

    const { stats, countsExact, headScanUsable, source } = result;

    /*
     * R11 WC-1.2 (C1): three outcomes, not two, and they must not collapse into each other.
     *  - headScanUsable && !source → confidently not ours: we read complete lines and no
     *    registered adapter (Claude Code or Codex) claimed the file. Excluded.
     *  - !headScanUsable → could not read enough to ask at all. Kept, listed with kind
     *    "unknown"/"insufficient-signal" and source left unresolved (`null` on the entry) —
     *    "couldn't read it" must stay visibly different from "read it, it says no".
     *  - headScanUsable && source → a registered adapter claims it. Kept, and the resolved
     *    source is carried onto the entry so the picker can show which harness it came from.
     *    Pre-R11 this branch was still excluded unless source === "claude-code"; that dropped
     *    every Codex session from the folder browser (UAT C1) even though it was fully readable.
     */
    if (headScanUsable && !source) continue;

    /*
     * R12 M2: the level-1 choice decides WHERE to look, so a readable file belonging to the
     * other harness is out of scope for this browse. Counted and reported, never silent — and
     * `source === null` deliberately falls through to be kept (see BuildIndexOptions.expectSource).
     */
    if (options.expectSource && source && source !== options.expectSource) {
      otherSource += 1;
      continue;
    }

    /*
     * `<dir>/<id>/subagents/` is a Claude Code layout convention; Codex rollouts have no such
     * sibling directory. Only compute the pairing for a confirmed Claude Code file — guessing a
     * prefix match for any other source risks a coincidental false pairing for zero benefit.
     */
    const subagentPaths = source === "claude-code"
      ? subagents.filter((candidate) => candidate.path.startsWith(subagentPrefixFor(file.path))).map((candidate) => candidate.path)
      : [];
    const { title, titleSource } = pickTitle(stats, file.path);

    const { kind, reason } = classifySession({
      path: file.path,
      hasAgentId: stats.hasAgentId,
      allSidechain: stats.recordCount > 0 && stats.sidechainCount === stats.recordCount,
      humanTurnCount: stats.humanTurnCount,
      syntheticPromptCount: stats.syntheticPromptCount,
      // R11.2 R1: `stats.humanTurnCount` is the same underlying counter for both envelope
      // shapes (see the field's own doc comment) — `absorb()` guarantees only one shape's
      // branch ever increments it per file, so handing it to both names here is not a
      // shortcut, it is what "this file's own count, read through its own shape" already is.
      codexHumanTurnCount: stats.humanTurnCount,
      codexSignalUsable: stats.codexMessageSeen,
      headScanUsable,
      source,
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
      source: source ?? null,
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
  if (otherSource > 0) {
    diagnostics.push({ tier: "warn", code: "INDEX_SOURCE_MISMATCH", count: otherSource, detail: options.expectSource });
  }
  // 具名降級的出口：一條聚合 info，而不是每個檔案一次 console (RC-B)。
  const titleFromFilename = entries.filter((entry) => entry.titleSource === "filename").length;
  if (titleFromFilename > 0) {
    diagnostics.push({ tier: "info", code: "INDEX_TITLE_FROM_FILENAME", count: titleFromFilename });
  }
  if (entries.length === 0) diagnostics.push({ tier: "info", code: "INDEX_EMPTY" });

  entries.sort((left, right) => (right.endedAt ?? "").localeCompare(left.endedAt ?? ""));
  return { entries, diagnostics };
}
