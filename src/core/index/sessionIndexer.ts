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
import { profileFor, SIDECAR_JOIN_KEYS, SIDECAR_PARENT_KEYS } from "@/core/source/profiles";
import { isUsableTitle } from "@/core/text/titleQuality";
import type { SourceId } from "@/types/spanTree";
import { classifySession, isSubagentPath, isSyntheticPrompt } from "./classifySession";
import { readSidecars } from "./sidecarReader";
import type { ChainHead, DirectoryFile, DirectorySource, SessionIndex, SessionIndexEntry, TitleSource } from "./contracts";
import { resolveChains } from "./chains";

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
  /** The thread this one was forked from, when the source records one; feeds `sidecar-parent`. */
  parentSessionId: string | null;
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
  /**
   * 2026-09-compact-chain: uuids of the records fed so far from the HEAD window. Only the head
   * feeds it (a few thousand ids at most); it exists so the first boundary can ask "does this file
   * already hold the record my `logicalParentUuid` names?" — see `noteChainHead`.
   */
  seenUuids: Set<string>;
  /** The head boundary that makes this file a continuation, or null. */
  chainHead: ChainHead | null;
  /** True once the first head-window boundary has been judged; later boundaries never qualify. */
  chainHeadSettled: boolean;
}

function emptyStats(): ScanStats {
  return {
    sessionId: null,
    parentSessionId: null,
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
    seenUuids: new Set(),
    chainHead: null,
    chainHeadSettled: false,
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

/** 沿屬性鏈往下走；任何一節不是物件就停下。與 `sidecarReader` 的 `walk` 同一個形狀。 */
function walkPath(value: unknown, path: readonly string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** Which window a record came from. Only the head can settle a chain head (see `noteChainHead`). */
type ScanPhase = "head" | "tail";

/**
 * 2026-09-compact-chain: the FIRST boundary of the head window decides whether this file is a
 * continuation of another transcript. It is one iff its `logicalParentUuid` names a record this
 * file has not shown yet — in a continuation that record only appears later, as a preserved copy;
 * in an in-file compaction (the AppData shape, measured 2026-09-06) it appears before the boundary.
 * Tail boundaries never qualify: the tail window starts mid-file, so "not seen yet" would be true
 * for every ordinary in-file compaction that happens to land there.
 */
function noteChainHead(stats: ScanStats, record: Record<string, unknown>, phase: ScanPhase, timestamp: string | null): void {
  if (phase !== "head" || stats.chainHeadSettled) return;
  stats.chainHeadSettled = true;
  const boundaryUuid = typeof record.uuid === "string" ? record.uuid : null;
  const logicalParentUuid = typeof record.logicalParentUuid === "string" ? record.logicalParentUuid : null;
  if (!boundaryUuid || !logicalParentUuid || stats.seenUuids.has(logicalParentUuid)) return;
  stats.chainHead = { boundaryUuid, logicalParentUuid, boundaryTimestamp: timestamp };
}

function absorb(stats: ScanStats, record: Record<string, unknown>, phase: ScanPhase): void {
  stats.recordCount += 1;
  if (typeof record.sessionId === "string" && !stats.sessionId) stats.sessionId = record.sessionId;

  /*
   * R12 M5 (closes DW-18)：來源自報的 session id。在此之前只讀 Claude 的 `record.sessionId`，
   * 於是每個 Codex 條目的 `id` 都退化成檔名——「沒去看」被記成「沒有」。
   *
   * **要讀哪個欄位由側寫說了算**（`SidecarSpec.joinKey`）。2026-08-27 的複核抓到這裡原本是
   * 寫死的 `payload.id`：側寫宣告了 join key、卻沒有任何程式讀它，所以照著文件去改
   * `profiles.ts` 的那一行**什麼都不會發生**——正是 P-004 那個「宣告與實作對不上」的形狀，
   * 只是方向相反。而且本輪的 `sourceKnowledge` 閘門抓不到它：這個檔案沒有寫出來源字面量。
   *
   * 掃描當下還不知道哪個 adapter 會認領這個檔案，所以比對的是「有沒有這種 record type」——
   * 一種 type 只有一套 harness 會產，不會撞。
   */
  if (!stats.sessionId) {
    for (const key of SIDECAR_JOIN_KEYS) {
      if (record.type !== key.recordType) continue;
      const id = walkPath(record, key.path);
      if (typeof id === "string" && id.trim()) {
        stats.sessionId = id;
        break;
      }
    }
  }
  /*
   * The id of the thread this one was forked from, for the `sidecar-parent` rung (2026-08-27).
   * Captured unconditionally rather than only when `sessionId` is missing: the two ids live in
   * the same record and DIFFER exactly when this is a fork, which is the fact the rung needs.
   */
  if (!stats.parentSessionId) {
    for (const key of SIDECAR_PARENT_KEYS) {
      if (record.type !== key.recordType) continue;
      const id = walkPath(record, key.path);
      if (typeof id === "string" && id.trim()) {
        stats.parentSessionId = id;
        break;
      }
    }
  }
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
      if (record.subtype === "compact_boundary") {
        stats.hasCompaction = true;
        noteChainHead(stats, record, phase, timestamp);
      }
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
  // After the switch on purpose: a boundary must be judged against the records BEFORE it.
  if (phase === "head" && typeof record.uuid === "string") stats.seenUuids.add(record.uuid);
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

function feed(stats: ScanStats, lines: string[], seen: Set<string>, phase: ScanPhase): void {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // 頭尾兩段在小檔案上可能重疊；用 uuid 去重，沒有 uuid 的就用整行。
    const key = trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      absorb(stats, JSON.parse(trimmed) as Record<string, unknown>, phase);
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

  feed(stats, completeLines(headText, false, !whole), seen, "head");

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
    feed(stats, completeLines(headText, false, headWindow < file.size), seen, "head");
  }

  // 檔頭一筆完整紀錄都讀不到（第一行就超過放大後的視窗）：計數全不可信，分類必須棄權。
  const headScanUsable = stats.recordCount > 0;

  if (!whole) {
    const tailStart = Math.max(headWindow, file.size - INDEX_SCAN_TAIL_BYTES);
    if (tailStart < file.size) {
      const tailText = await readText(file, { start: tailStart, end: file.size });
      feed(stats, completeLines(tailText, true, false), seen, "tail");
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

/**
 * R12 M3：哪些檔案算是這個來源的 transcript，由側寫表說了算，不是寫死一種形狀。
 *
 * 沒有選來源時維持 R9 的行為（任何 `*.jsonl`），一個位元組都不差——既有測試因此仍然有效。
 *
 * 比對的是**檔名**不是完整路徑：Codex 的 rollout 埋在 `sessions/<年>/<月>/<日>/` 底下，
 * 拿 `^rollout-` 去比整條路徑永遠不會中。
 *
 * 誠實的落差：Codex 的樣式（`^rollout-*.jsonl`）真的可以讓 Claude 的檔案連掃都不掃；
 * Claude 的樣式是 `*.jsonl`，掃得到 Codex 的 rollout，要等掃完認出來源才會被 M2 的
 * `expectSource` 濾掉。結果正確，但省不掉那次掃描。收緊成 UUID 形狀會誤殺，不划算。
 */
function isTranscript(path: string, expectSource: SourceId | undefined): boolean {
  if (!expectSource) return /\.jsonl$/i.test(path);
  return profileFor(expectSource).discovery.transcripts.filePattern.test(baseName(path));
}

/**
 * 這一階能不能產出標題？產得出來就回字串，產不出來回 null。
 *
 * `filename` 永遠產得出來，所以它是每個階梯的最後一階——那不是巧合，是側寫測試釘住的性質
 * （「每個 ladder 都以 filename 收尾」），因為一個走完仍然沒有標題的階梯等於沒有標題可顯示。
 */
function rungValue(
  rung: TitleSource,
  stats: ScanStats,
  path: string,
  sidecar: ReadonlyMap<string, string>,
): string | null {
  switch (rung) {
    case "custom": return stats.customTitle ?? null;
    case "ai": return stats.aiTitle ?? null;
    case "sidecar": return (stats.sessionId && sidecar.get(stats.sessionId)) || null;
    /*
     * 只有分叉才走這一階。`parentSessionId === sessionId` 代表這不是分叉，兩個 id 指同一件事，
     * 那時再查一次側車只會拿到跟 `sidecar` 一模一樣的東西——卻掛上「承自母對話」的標記，
     * 對使用者說了一件不真實的事。所以先確認它真的是分叉，再借。
     */
    case "sidecar-parent": {
      const { parentSessionId, sessionId } = stats;
      if (!parentSessionId || parentSessionId === sessionId) return null;
      return sidecar.get(parentSessionId) || null;
    }
    /*
     * 2026-08-27 作者裁決：髒名字不端上畫面。判準是文字的性質，不是來源的性質，所以住在
     * `titleQuality`；量到的阻擋範圍是 Codex 8 份、Claude Code 1 份（那份標題字面是 `ok`）。
     */
    case "derived": return isUsableTitle(stats.firstHumanText) ? stats.firstHumanText : null;
    case "filename": {
      /*
       * 複核 2026-08-27：一個真的叫做 `.jsonl` 的檔案，去掉副檔名之後是**空字串**——而這一階
       * 是每個階梯的最後一階，於是那個空字串會一路走到畫面上，跟這裡原本的註解「顯示檔名
       * 仍然比顯示空字串誠實」剛好相反。去不掉副檔名就用完整檔名。
       */
      const stripped = baseName(path).replace(/\.jsonl$/i, "");
      return stripped.trim() ? stripped : baseName(path);
    }
  }
}

/**
 * 走側寫宣告的階梯 (R12 M5)。
 *
 * 在此之前這是一條寫死的鏈，前兩階（`custom`／`ai`）是 Claude Code 專屬的紀錄型別——於是每個
 * Codex session 都直接落到 `derived`，顯示第一則訊息的節錄而不是目的。那正是作者回報的 B1。
 *
 * 沒有選來源時（`expectSource` 未給）維持原本那條鏈，一階不差，既有測試因此仍然有效。
 *
 * R9.1 RC-B 的判斷在這裡照舊成立：**每一階都是具名降級，不走 `reportFallback`**。
 * `titleSource` 是回傳型別的一部分，清單上有自己的 class 與 tooltip，使用者看得見；
 * 已經說出口的降級不必再從暗處喊一次。聚合診斷由 `buildSessionIndex` 收尾時出。
 */
const DEFAULT_LADDER: readonly TitleSource[] = ["custom", "ai", "derived", "filename"];

function pickTitle(
  stats: ScanStats,
  path: string,
  expectSource: SourceId | undefined,
  sidecar: ReadonlyMap<string, string>,
): { title: string; titleSource: TitleSource } {
  const ladder = expectSource ? profileFor(expectSource).discovery.titleLadder : DEFAULT_LADDER;
  for (const rung of ladder) {
    const value = rungValue(rung, stats, path, sidecar);
    if (value && value.trim()) return { title: firstLine(value, TITLE_MAX_LENGTH), titleSource: rung };
  }
  // 側寫測試保證每個階梯以 `filename` 收尾，所以理論上到不了這裡；到得了就是側寫壞了。
  return { title: rungValue("filename", stats, path, sidecar) ?? baseName(path), titleSource: "filename" };
}

/**
 * `<dir>/<id>.jsonl` 的子代理在 `<dir>/<id>/<siblingDir>/`——是兄弟，不是子項 (RC-1b)。
 * 目錄名由側寫給 (R12 M7)，不再寫死。
 */
function subagentPrefixFor(path: string, siblingDir: string): string {
  return `${path.replace(/\.jsonl$/i, "")}/${siblingDir}/`;
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

  const { files: listed, unreadable: unlisted } = await source.list();
  /*
   * R12 M3：三層，語意各不相同，不能合併。實測 `~/.codex` 才看清楚為什麼（9,699 個檔案、
   * 361 個 `.jsonl`、358 個 rollout）：
   *
   *  1. `.jsonl` — 基準線。`.md`／`.json` 從來就不是候選，R9 起靜靜略過，沒人需要被告知。
   *  2. 來源自己的檔名樣式 — 「是 `.jsonl`，但不是這套系統的 transcript」。剩下那 3 個是
   *     `session_index.jsonl`、`transcription-history.jsonl` 與一個外掛 fixture——**它們就是
   *     Codex 的檔案**，只是不是對話紀錄。所以這裡**不能**說「不屬於你選的那套系統」，那句話
   *     是假的。走 info 級的 `INDEX_NOT_TRANSCRIPT`：不吵人，但也不是無聲，使用者看到
   *     361 變 358 時查得到原因。
   *  3. 掃過之後內容判定屬於另一套 — 這才是 `INDEX_SOURCE_MISMATCH`（warn），因為它真正的
   *     意思是「你可能選錯系統了」，是使用者可以行動的。
   *
   * 第 2 層原本被我併進第 3 層，實測才發現那會讓每一次 Codex 根目錄選取都固定謊報 3 筆。
   */
  const jsonl = listed.filter((file) => /\.jsonl$/i.test(file.path));
  const all = jsonl.filter((file) => isTranscript(file.path, options.expectSource));
  const mains = all.filter((file) => !isSubagentPath(file.path));
  const subagents = all.filter((file) => isSubagentPath(file.path));
  const excludedByName = jsonl.filter((file) => !isTranscript(file.path, options.expectSource) && !isSubagentPath(file.path)).length;

  /*
   * R12 M3：接受 `~/.codex` 也接受 `~/.codex/sessions`——後者是既有習慣，直接拒絕它只會
   * 讓人以為壞了。但兩者不等價：sidecar 在 `sessions/` 的上一層，而瀏覽器讀不到所選目錄的
   * 母目錄，所以選深了那個檔案就是碰不到。
   *
   * 判定用的是「sidecar 在不在清單裡」這個**正面事實**，不是從路徑形狀去推。推論在使用者
   * 選了更上層（例如家目錄）時會說出錯的話；直接找檔案不會。
   */
  const sidecars = options.expectSource ? profileFor(options.expectSource).discovery.sidecars : [];
  if (sidecars.length > 0 && all.length > 0) {
    const present = new Set(listed.map((file) => file.path));
    const missing = sidecars.filter((sidecar) => !present.has(sidecar.path));
    if (missing.length > 0) {
      diagnostics.push({
        tier: "warn",
        code: "INDEX_SIDECAR_OUT_OF_REACH",
        count: missing.length,
        detail: profileFor(options.expectSource!).discovery.rootHint,
      });
    }
  }

  // R12 M5：讀一次，整批共用。讀不到／壞掉都只是「少了那些標題」，索引照常完成。
  const { descriptions: sidecarTitles, diagnostics: sidecarDiagnostics } = await readSidecars(sidecars, listed);
  diagnostics.push(...sidecarDiagnostics);

  const scanned = mains.slice(0, maxFiles);
  if (mains.length > maxFiles) {
    diagnostics.push({ tier: "info", code: "INDEX_TRUNCATED", detail: String(maxFiles), count: mains.length - maxFiles });
  }

  const entries: SessionIndexEntry[] = [];
  /*
   * 2026-09 folder-listing-isolation: entries the listing itself could not reach join the same
   * count as files that failed to scan — to the user both are "a session that is not listed and
   * why". A non-`.jsonl` file was never a candidate (see the three layers above), so its failure
   * stays as quiet as its success would have been; a directory is counted because it may hold
   * sessions.
   */
  const unlistedCandidates = unlisted.filter((entry) => entry.kind === "directory" || /\.jsonl$/i.test(entry.path));
  let unreadable = unlistedCandidates.length;
  let unreadableDetail = unlistedCandidates[0] ? `${unlistedCandidates[0].path} (${unlistedCandidates[0].reason})` : "";
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
     * R12 M7：子代理的檔案佈局是**來源的性質**，由側寫說了算。
     *
     * 這裡原本是 `source === "claude-code" ? … : []` 的三元式——M1 的第三來源探針量到它是
     * 「安靜失敗」的一處：加一個新來源不會編譯失敗，只會拿到空陣列，而且沒有任何跡象。
     * 現在讀 `discovery.subagents`，缺一列就編不過（那張表是 `Record<SourceId, …>`）。
     *
     * `null` 的意思仍然是「這個來源沒有這種佈局」，不是「還沒做」——Codex 的 rollout 根本
     * 沒有兄弟目錄，拿前綴去猜只會換到巧合性的錯誤配對。
     */
    const layout = source ? profileFor(source).discovery.subagents : null;
    const subagentPaths = layout
      ? subagents.filter((candidate) => candidate.path.startsWith(subagentPrefixFor(file.path, layout.siblingDir))).map((candidate) => candidate.path)
      : [];
    const { title, titleSource } = pickTitle(stats, file.path, options.expectSource, sidecarTitles);

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
      chain: { head: stats.chainHead, parentPath: null },
      kind,
      kindReason: reason,
    });
  }
  options.onProgress?.(scanned.length, scanned.length);

  // 2026-09-compact-chain: link continuation files to the transcript they continue. Bounded
  // full reads, only for files with a chain head, only over time-filtered candidates (chains.ts).
  diagnostics.push(...(await resolveChains(entries, scanned)));

  if (unreadable > 0) {
    diagnostics.push({ tier: "warn", code: "INDEX_FILE_UNREADABLE", count: unreadable, detail: unreadableDetail });
  }
  if (otherSource > 0) {
    diagnostics.push({ tier: "warn", code: "INDEX_SOURCE_MISMATCH", count: otherSource, detail: options.expectSource });
  }
  if (excludedByName > 0) {
    diagnostics.push({ tier: "info", code: "INDEX_NOT_TRANSCRIPT", count: excludedByName });
  }
  // 具名降級的出口：一條聚合 info，而不是每個檔案一次 console (RC-B)。
  const titleFromFilename = entries.filter((entry) => entry.titleSource === "filename").length;
  if (titleFromFilename > 0) {
    diagnostics.push({ tier: "info", code: "INDEX_TITLE_FROM_FILENAME", count: titleFromFilename });
  }
  if (entries.length === 0) {
    /*
     * R12 · 複核發現：這句話原本寫死「沒有找到 Claude Code 的 session」，而 M2 之後選了
     * Codex 的使用者也會走到這裡——等於對著 Codex 使用者講 Claude Code。挑了系統就把系統名
     * 帶上，`detail` 取自側寫的 `label`（產品名，兩個語系相同），沒挑系統時維持原本的通用句。
     *
     * 同時把「資料夾裡有 .jsonl、但全被檔名擋掉」這個情況升級成可行動的訊息：那通常代表
     * 選錯系統（例如選了 Codex 卻挑 `~/.claude/projects`），而 Codex 的檔名樣式會在內容判定
     * 之前就全數排除，`INDEX_SOURCE_MISMATCH` 因此永遠碰不到——只留一條 info 說「檔名不符」
     * 會讓使用者看著空清單卻沒有下一步。
     */
    const label = options.expectSource ? profileFor(options.expectSource).label : undefined;
    diagnostics.push(
      excludedByName > 0 && label
        ? { tier: "warn", code: "INDEX_EMPTY_WRONG_SOURCE", count: excludedByName, detail: label }
        : { tier: "info", code: "INDEX_EMPTY", detail: label },
    );
  }

  entries.sort((left, right) => (right.endedAt ?? "").localeCompare(left.endedAt ?? ""));
  return { entries, diagnostics };
}
