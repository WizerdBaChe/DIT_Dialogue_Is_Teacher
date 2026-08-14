/**
 * 匯出資料契約 (FR-8 / R6)。
 * 對應文件：docs/rounds/r6-export/PSM_R6_EXPORT_v0.1.md §4.2
 */
import type { SensitiveKind } from "@/core/privacy/contracts";
import type { Annotation, SessionDocument, SessionMeta } from "@/types/spanTree";

/** export 包裝層版本，與資料本體的 SCHEMA_VERSION 獨立演進 (EX-INV-5)。 */
export const EXPORT_VERSION = "1" as const;

export interface SessionExport {
  /** 固定字串，用來辨識「這是 DIT 匯出檔」而不是任意 JSON。 */
  ditExport: "session";
  exportVersion: typeof EXPORT_VERSION;
  /** ISO 8601；由呼叫端注入，核心函式保持純函式可測 (不在函式內叫 Date.now)。 */
  exportedAt: string;
  /** 產生此檔的應用版本，取自 package.json version。 */
  appVersion: string;
  document: SessionDocument;
  /** 講解快取，一併匯出 (D-R6-05)。無講解時為空物件，不省略欄位。 */
  annotations: Record<string, Annotation>;
}

/* ==========================================================================
   對話紀錄匯出 (transcript)
   與 SessionExport 是兩種不同的東西，不要混用：
   - SessionExport 是「可還原成節點視圖的完整存檔」，含 raw 事件與講解。
   - TranscriptExport 是「給人讀的對話逐字稿」，只留使用者提問／AI 思考／每輪回覆文字，
     刻意丟掉 raw、工具參數與結果全文，因此**不可**用來還原視圖。
   兩者版本號各自獨立演進。
   ========================================================================== */

/** transcript 包裝層版本，與 EXPORT_VERSION、SCHEMA_VERSION 皆獨立。 */
export const TRANSCRIPT_EXPORT_VERSION = "1" as const;

/**
 * 逐字稿裡一則訊息的種類。
 * - `thinking` / `assistant`：AI 的思考與回覆文字。
 * - `tool_summary`：一次工具呼叫的單行摘要 (取自 span.summary)，用來補上「這中間做了什麼」，
 *   避免回覆之間出現無法解釋的跳躍；不含參數與結果全文。
 * - `subagent_prompt`：派給子代理的提問 (旁鏈裡的 user_msg)。它不是使用者對主線說的話，
 *   所以不切分輪次，只當成該輪裡的一則訊息。
 */
export type TranscriptMessageKind = "thinking" | "assistant" | "tool_summary" | "subagent_prompt";

export interface TranscriptMessage {
  /** 對應的 Span id，讓逐字稿能回指節點視圖 (資料流可追蹤)。 */
  spanId: string;
  kind: TranscriptMessageKind;
  startedAt: string | null;
  text: string;
  /** 來自子代理旁鏈 (僅在 includeSubagents 開啟時可能出現)。 */
  subagent: boolean;
}

/** 一輪對話：一則使用者提問，加上到下一則提問之前的所有 AI 輸出。 */
export interface TranscriptTurn {
  /** 1-based，供標題顯示與錨點使用。 */
  index: number;
  /** 取 user 的時間；開場輪沒有 user 時取第一則訊息的時間。 */
  startedAt: string | null;
  /**
   * 開場輪為 null：session 在第一則使用者提問之前就有 AI 輸出時 (例如續接的 session)，
   * 那些內容仍要保留，不能因為沒有提問就被丟掉。
   */
  user: { spanId: string; text: string } | null;
  messages: TranscriptMessage[];
}

export interface TranscriptOptions {
  /** 納入 AI 思考內容。 */
  includeThinking: boolean;
  /** 納入工具呼叫的單行摘要。 */
  includeToolSummary: boolean;
  /** 納入子代理旁鏈的對話。預設關閉——旁鏈是子代理的內部發言，不是主線對話。 */
  includeSubagents: boolean;
}

export const DEFAULT_TRANSCRIPT_OPTIONS: TranscriptOptions = {
  includeThinking: true,
  includeToolSummary: true,
  includeSubagents: false,
};

/**
 * 逐字稿的內容統計。
 *
 * 統計的是「套用範圍過濾之後的素材」——也就是排除合成事件、並套用 includeSubagents 之後
 * 的數量——但**不**受 includeThinking / includeToolSummary 影響。這樣標頭才能誠實地寫出
 * 「思考 3（未納入）」，而不是把被關掉的內容直接歸零、假裝它不存在。
 */
export interface TranscriptStats {
  turns: number;
  userMessages: number;
  assistantMessages: number;
  thinkingBlocks: number;
  toolCalls: number;
  /** 因 includeSubagents 關閉而被排除的旁鏈節點數；為 0 時代表沒有子代理內容。 */
  excludedSubagentSpans: number;
}

/**
 * 渲染器 (Markdown / HTML) 用到的所有文案。
 *
 * 渲染器必須是純函式，不能自己 `useT()` 讀 store，所以文案由呼叫端從 i18n 注入。
 * 這也讓匯出檔跟著使用者當下的介面語言走，而不是寫死中文。
 */
export interface TranscriptLabels {
  /** 副標：標明這份檔案是什麼。 */
  documentKind: string;
  sessionTitleFallback: string;
  /** 標頭欄位名。 */
  fieldSession: string;
  fieldSource: string;
  fieldProject: string;
  fieldStarted: string;
  fieldExported: string;
  fieldContents: string;
  /**
   * 內容統計的整句文案。寫成函式而不是「標籤 + 數字」由渲染器拼接，因為語序因語言而異
   * （「3 輪」vs「3 turns」、「提問 2」vs「2 prompts」）——拼接法會在其中一種語言下讀起來是壞的。
   * `included` 為 false 時，該語言自行附上「未納入」的註記。
   */
  statTurns: (count: number) => string;
  statUserMessages: (count: number) => string;
  statAssistantMessages: (count: number) => string;
  statThinkingBlocks: (count: number, included: boolean) => string;
  statToolCalls: (count: number, included: boolean) => string;
  subagentsExcluded: (count: number) => string;
  /** 輪次與角色。 */
  turnHeading: (index: number) => string;
  openingTurnHeading: string;
  roleUser: string;
  roleThinking: string;
  roleAssistant: string;
  roleToolActivity: string;
  roleSubagentPrompt: string;
  subagentBadge: string;
  /** 遮蔽紀錄。`redactionNote` 是列在標頭的整句說明，`redactionResidual` 是複查未過的警告。 */
  redactionNote: (summary: string) => string;
  redactionResidual: (blocks: number) => string;
  redactionNothingFound: string;
  sensitiveKind: Record<SensitiveKind, string>;
  /** HTML 檢視頁專用。 */
  outlineHeading: string;
  emptyTranscript: string;
}

/**
 * 遮蔽紀錄。存在此欄位即代表這份逐字稿的內容被改寫過——讀的人才分得出 `<EMAIL_1>` 是遮蔽
 * 結果，而不是原文裡本來就有的字。沒開遮蔽時整個欄位不存在，不放一個 applied: false 的空殼。
 */
export interface TranscriptRedaction {
  policyId: string;
  /** 各類敏感資訊被處理的次數。 */
  summary: Partial<Record<SensitiveKind, number>>;
  /** 遮蔽後仍疑似含密鑰的段落數；> 0 代表這份檔案分享前需要人工再看一遍。 */
  residualSecretBlocks: number;
}

export interface TranscriptExport {
  /** 固定字串，與 SessionExport 的 "session" 區隔。 */
  ditExport: "transcript";
  exportVersion: typeof TRANSCRIPT_EXPORT_VERSION;
  /** ISO 8601；由呼叫端注入，核心函式保持純函式可測。 */
  exportedAt: string;
  appVersion: string;
  session: SessionMeta;
  options: TranscriptOptions;
  stats: TranscriptStats;
  turns: TranscriptTurn[];
  /** 僅在使用者開啟遮蔽時存在。 */
  redaction?: TranscriptRedaction;
}
