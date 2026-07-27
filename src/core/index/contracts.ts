/**
 * Session 索引 (DSM-4) 的資料契約。
 *
 * 動機 (R9 問題 3)：`~/.claude/projects/<專案>/` 底下全是 HASH 檔名，使用者只能靠猜。
 * 索引層的工作是「不載入就先看得懂」——用一次表頭掃描算出標題、規模與分類，讓「載入」
 * 從盲選變成瀏覽後挑選。
 *
 * 本輪只索引 Claude Code (作者裁決 2026-07-27：Codex 的異常狀態太多，暫不納入)。
 * 認不出是 Claude Code 的檔案索引為 `unknown` 並排除於清單之外，**不猜測**。
 */
import type { Diagnostic } from "@/core/diagnostics/contracts";
import type { SourceId } from "@/types/spanTree";

/**
 * 一份 transcript 是什麼。分類是**徽章，不是預設篩選**——只有第 3 條是啟發式，
 * 會誤判；誤判時使用者仍必須看得到、點得到 (R9 D4)。
 */
export type SessionKind = "dialogue" | "subagent" | "machine" | "unknown";

/** 為什麼被歸到那一類。穩定短碼，顯示在徽章的 tooltip 裡，也方便日後 grep。 */
export type SessionKindReason =
  | "path-subagents"
  | "field-agentid"
  | "all-sidechain"
  | "no-human-prompt"
  | "synthetic-prompts-only"
  | "has-human-prompt"
  | "insufficient-signal"
  | "not-claude-code";

export type TitleSource = "custom" | "ai" | "derived" | "filename";

export interface SessionIndexEntry {
  /** transcript 自報的 sessionId；缺漏時退回檔名 (見 titleSource 的同一原則：不假裝知道)。 */
  id: string;
  /** 相對於使用者挑選的目錄，一律正斜線。 */
  path: string;
  /** 頂層目錄名 (Claude Code 把專案路徑編碼成目錄名)；解不出來就是 null。 */
  project: string | null;
  /** 解碼後的真實專案路徑，解不出來就是 null——不猜。 */
  projectPath: string | null;
  title: string;
  titleSource: TitleSource;
  source: SourceId;
  startedAt: string | null;
  endedAt: string | null;
  sizeBytes: number;
  /** 真人 prompt 則數。`countsExact` 為 false 時是下限。 */
  humanPromptCount: number;
  assistantCount: number;
  /** 表頭掃描是否涵蓋整個檔案。false 代表上面兩個計數是「至少」而非「剛好」。 */
  countsExact: boolean;
  hasCompaction: boolean;
  /** 同層的 <id>/subagents/*.jsonl，由索引器配對——這正是 RC-1b 的正解。 */
  subagentPaths: string[];
  kind: SessionKind;
  kindReason: SessionKindReason;
}

export interface SessionIndex {
  entries: SessionIndexEntry[];
  diagnostics: Diagnostic[];
}

/** 目錄裡的一個檔案。兩種存取後端 (FSA / webkitdirectory) 都收斂成這個形狀。 */
export interface DirectoryFile {
  /** 相對於挑選目錄的路徑，一律正斜線。 */
  path: string;
  size: number;
  /** 讀取內容；給 range 就只讀那一段 (FSA 與 File 都支援 slice)。 */
  read(range?: { start: number; end: number }): Promise<Blob>;
}

export interface DirectorySource {
  kind: "fsa" | "webkitdirectory";
  /** 顯示用的目錄名稱。 */
  name: string;
  list(): Promise<DirectoryFile[]>;
}
