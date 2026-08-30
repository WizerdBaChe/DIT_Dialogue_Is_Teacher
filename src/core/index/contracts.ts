/**
 * Session 索引 (DSM-4) 的資料契約。
 *
 * 動機 (R9 問題 3)：`~/.claude/projects/<專案>/` 底下全是 HASH 檔名，使用者只能靠猜。
 * 索引層的工作是「不載入就先看得懂」——用一次表頭掃描算出標題、規模與分類，讓「載入」
 * 從盲選變成瀏覽後挑選。
 *
 * 原本 (作者裁決 2026-07-27) 只索引 Claude Code——Codex 的異常狀態太多，暫不納入。R11 WC-1.2
 * 撤銷這條裁決 (作者 UAT C1 回報：資料夾瀏覽器把 Codex session 硬排除是缺陷，不是設計)：
 * 認得出來源 (Claude Code 或 Codex) 就留著；一行完整的都讀不到就標「無法判定」留著；只有
 * 「讀得到完整的行、卻沒有任何 adapter 認領」才排除。三者不可互相取代，**不猜測**任何一邊。
 */
import type { Diagnostic } from "@/core/diagnostics/contracts";
import type { SourceId, TitleSource } from "@/types/spanTree";

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
  | "not-claude-code"
  /**
   * R11 WC-1.2：認得出是 Codex（或任何非 Claude Code 的來源），但 `hasAgentId` /
   * `allSidechain` / `humanTurnCount` 這些訊號讀的是 Claude Code 的欄位名，對這份檔案
   * 必定讀不到東西。誠實回答「無法判定」，不要把「讀不到」拿去套 machine/dialogue 的規則。
   */
  | "codex-unclassified";

/**
 * R12 M1：定義移到 `@/types/spanTree`，這裡只 re-export。探索側寫 (`core/source/profiles.ts`)
 * 宣告階梯順序、索引層執行它，兩個同層切片不該互相 import，共用詞彙住在下層。
 */
export type { TitleSource };

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
  /**
   * R11 WC-1.2: the resolved harness, or `null` when the head scan could not read a complete
   * line at all (`headScanUsable: false`) — no adapter ever saw enough of the file to render a
   * verdict, so this must stay honestly unresolved rather than defaulting to `"claude-code"`.
   */
  source: SourceId | null;
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
