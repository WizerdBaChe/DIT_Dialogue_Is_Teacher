/**
 * Span Tree — DIT 的核心資料契約 (canonical schema)
 * 對應文件：docs/RPD_DIT_v0.1.md → 附錄 Span Tree Canonical Schema (v0.1)
 *
 * 設計原則：
 * - 所有來源 (Claude Code / Codex / 貼上) 正規化後皆產出此結構，下游模組只認此契約 (低耦合)。
 * - 每個 Span 保留 `raw` 原始事件，確保資料流可追蹤 (Traceable Data Flow)。
 * - 預留多 session 擴充 (D-5)：頂層以 SessionDocument 包裝，未來可裝進 SessionLibrary。
 */

export const SCHEMA_VERSION = "0.1" as const;

/**
 * 來源識別碼，新增來源時擴充此聯集。
 * R11 M4 WC-4.4(3) / D-008：`"paste"` 已移除——宣告了，但沒有 adapter 或 UI 路徑產生過它，
 * 兩個既有 adapter 都各自寫死自己的 `"claude-code"`／`"codex"`。跟 R9.1 移除 `milestone`
 * 是同一個模式：型別裡宣告、從未產生、圖例/清單卻照樣列出。要恢復需要一個真正的 paste
 * 入口點，屆時再加回來，而不是先宣告一個沒人要求的能力。
 */
export type SourceId = "claude-code" | "codex";

/**
 * 一個 session 的標題是從哪一階來的。**每一階都是具名降級 (named degradation)**：清單上有
 * 自己的 class 與 tooltip，使用者看得見，所以不走 `reportFallback` 那條「無聲替代」通道。
 *
 * R12 M1 起，這個聯集從 `core/index/contracts.ts` 移到這裡（原處改為 re-export，呼叫端全部
 * 不動）。理由是層級：階梯的**順序**現在由 `core/source/profiles.ts` 的探索側寫宣告、由
 * `core/index/` 執行，兩者是同層的兄弟切片，不該互相 import；共用的詞彙要住在下層。
 *
 * `"sidecar"` 在 R12 M5 加入——**和產生它的程式碼同一張卡**，遵守這個檔案上面那段
 * `"paste"`／`milestone` 的教訓：型別裡宣告了、從來沒有路徑產出、清單卻照樣列出。
 * M1 當時刻意不先加，就是為了不重演第三次。
 */
export type TitleSource = "custom" | "ai" | "derived" | "sidecar" | "filename";

/**
 * 「這一步是誰／哪個機制做的」(R12 M4)。
 *
 * 概念層刻意做成**來源無關**：`RawEvent` 的檔頭自述「Normalizer 只認 RawEvent[]，不認得任何
 * 特定來源格式」，把 `attributionSkill` 這種欄位名帶下去會違反它。而「來歷」本身也不是
 * Claude 專屬——Codex 有 `sub_agent_activity`，也有 MCP 呼叫。抽象放在概念，欄位名留在
 * 各自的 adapter。
 *
 * 量測 (`RESEARCH_R12_CLAUDE_METADATA_2026-08-26.md`，525 檔 / 208,527 筆)：
 * 73.1% 的 session 至少帶一種來歷，skill 27 種、subagent 9 種、MCP server 12 種。
 */
export interface Attribution {
  kind: "skill" | "subagent" | "mcp-tool";
  /** 來源紀錄的原字串。不改寫、不美化、不翻譯——它是那邊的識別名。 */
  name: string;
  /**
   * 只有 `mcp-tool` 有：工具所屬的 server。
   * 實測 server 與 tool **永遠成對**（both 8,629、serverOnly 0、toolOnly 0），所以缺一半時
   * 不補、不猜——那代表遇到了量測沒看過的形狀，寧可少講也不要編。
   */
  server?: string;
}

/** Span 的語意型別。 */
export type SpanType =
  | "user_msg"
  | "assistant_msg"
  | "thinking"
  | "tool_use"
  | "tool_result"
  | "subagent"
  | "group"
  /**
   * 結構性事件，不是誰說的話 (R9.1 RC-D)：對話被壓縮、API 出錯、模型拒答。
   * 原本這些被映射成 assistant_msg，標記的身分在 normalize 這一步就消失了，
   * 於是蒸餾層只能靠位置猜——一個結尾的壓縮標記因此被加冕為整段對話的「結果」。
   */
  | "marker";

/** 由降噪/規則產生的標籤，用於標示學習價值高的節點。 */
export type SpanTag = "retry" | "error" | "decision" | "milestone";

/**
 * 降噪分組的種類。R11.2 M6 (B15)：`GroupKind` 本身即為單一權威來源——`GroupKind`
 * 型別由 `GROUP_KINDS` 陣列衍生，而非兩邊各自宣告後靠人工對齊。任何消費端 (群組卡片
 * 標籤、側欄圖例) 只要以 `Record<GroupKind, …>` 或走訪 `GROUP_KINDS` 取資料，新增/
 * 刪除一種分組時，遺漏的一邊會在編譯期或 `GROUP_KINDS.length` 走訪處直接現形，
 * 不必仰賴人工記得同步兩張表。
 */
export const GROUP_KINDS = ["edit-loop", "retry", "subagent", "verbose"] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

/** 教學講解層的來源 Provider。 */
/**
 * "cloud" denotes the OpenCode-backed local-proxy path (kept as-is, see ADR-032 in the R8 PSM
 * doc); the new R8 presets are additive. A full `local-proxy`/`cloud` rename is deferred to a
 * future round once the local-proxy transport ambiguity is resolved.
 */
export type ProviderId =
  | "none"
  | "ollama"
  | "cloud"
  | "lmstudio"
  | "jan"
  | "anthropic-byok"
  | "openrouter"
  | "groq"
  | "custom";

/** 由 LLM Annotator 產生的教學講解，可選。 */
export interface Annotation {
  what: string;
  why: string;
  generalLesson: string;
  confidence: number; // 0..1
  provider: ProviderId;
}

/** 工具操作的結構化資訊 (僅 type === "tool_use")。 */
export interface ToolInfo {
  name: string; // Read | Edit | Bash | ...
  params: Record<string, unknown>;
}

/** 工具結果的結構化資訊 (僅 type === "tool_result")。 */
export interface ResultInfo {
  isError: boolean;
  /**
   * R10-B：來源根本沒有記錄這次呼叫的成敗時為 true。`isError: false` 有兩種來源——「來源說成功」
   * 與「來源沒說」——把後者顯示成前者就是無中生有的保證。Codex 的 `patch_apply_end.success` 與
   * `mcp_tool_call_end.result.Err` 有記錄；一般 exec（實測 9,342 筆）完全沒有任何狀態欄位。
   * 選用欄位，缺席即代表「有記錄」，因此舊的匯出檔仍可讀，`SCHEMA_VERSION` 不動。
   */
  outcomeUnknown?: boolean;
  /** 結果文字 (可能很長，渲染端可摺疊)。 */
  text: string;
}

/** Span Tree 的節點。 */
export interface Span {
  id: string;
  /** 巢狀關係：subagent / 群組 / 工具結果掛在對應的呼叫下。null 為頂層。 */
  parentId: string | null;
  /** 線性播放順序 (step-through)。 */
  order: number;
  type: SpanType;
  startedAt: string | null; // ISO-8601
  durationMs: number | null;
  /** 一行摘要 (降噪後顯示)。 */
  summary: string;
  /** 完整文字內容 (思考內文 / 訊息全文 / 結果全文)。 */
  text: string;
  tool?: ToolInfo;
  result?: ResultInfo;
  /**
   * 此節點的文字是 adapter 代為敘述的系統事件（回合中斷、上下文壓縮、無法配對的呼叫、
   * 未知事件型別…），而不是模型或使用者真的說出口的話。
   *
   * 節點視圖照舊把它當一張卡片顯示——那是它該在的地方；但任何「逐字對話」的輸出
   * （如 transcript 匯出）必須排除，否則這些敘述會冒充成 AI 的發言。
   * 可選欄位，不影響既有 SCHEMA_VERSION 的相容性。
   */
  synthetic?: boolean;
  /**
   * 這一步的來歷，來源有標才有 (R12 M4)。
   *
   * 是**陣列**而不是單值，因為實測會共現：skill 跑在 subagent 裡有 646 筆，
   * agent+MCP 369 筆，四種齊全 1 筆。單值型別會逼實作在真實資料上做取捨。
   *
   * 缺席即「來源沒標」，不得解讀成「沒有來歷」——兩者的差別由側寫的
   * `attribution.kinds` 回答（空陣列 = 這套系統不記錄這件事）。
   */
  attribution?: readonly Attribution[];
  tags: SpanTag[];
  annotation?: Annotation;
  /** 原始事件，保底可回溯 (資料流可追蹤)。 */
  raw: unknown;
}

/** 降噪分組。 */
export interface SpanGroup {
  id: string;
  label: string;
  spanIds: string[];
  kind: GroupKind;
}

/** 這個 session 產出的 pull request (Claude Code `type: "pr-link"` 紀錄)。 */
export interface SessionPrLink {
  number: number | null;
  url: string;
  repository: string | null;
}

/** session 後設資料。 */
export interface SessionMeta {
  id: string;
  source: SourceId;
  tool: string;
  title: string;
  projectPath: string | null;
  startedAt: string | null;
  model: string | null;
  /** 選填：只有 Claude Code 會提供；R9 起收集，尚無消費端 (見 PSM_R9 §7)。 */
  prLinks?: SessionPrLink[];
}

/**
 * 蒸餾骨架 (Distilled Skeleton) — preset v1。
 * 把 Span Tree 進一步「整理」成精簡的因果骨架：主線節點 (spine) + 支線 (rib)。
 * 與視圖無關 (view-agnostic)：高密度模式可忽略，認知/魚骨模式直接渲染此結構。
 * 格式為預設第一版，後續可再調整 (見 docs/BACKLOG.md)。
 */
/**
 * R9.1 RC-D：`milestone` 已移除。它在型別裡宣告了但蒸餾器從未產生過，圖例卻照樣列出它，
 * 等於對使用者說謊；`sessionMap` 的章節邊界判斷也因此有一條永遠走不到的分支。
 * 不補產生規則是刻意的——現成的 `milestone` **標籤**掛在每一則使用者訊息上，拿它當主線
 * 站的判準會把整條主線變成使用者訊息清單，等於改寫已驗收的地圖行為。要恢復它需要一條
 * 自己的判準，已登 BACKLOG。`SpanTag` 的 milestone 不受影響，仍在卡片徽章上使用。
 */
export type SkeletonNodeKind = "objective" | "decision" | "outcome";
export type SkeletonRibKind = "investigation" | "error" | "retry" | "edit-loop";

/** 主線節點：一次任務的關鍵轉折。 */
export interface SkeletonNode {
  spanId: string;
  kind: SkeletonNodeKind;
  label: string;
  order: number;
}

/** 支線：掛在某主線節點上的彎路 (取證 / 錯誤 / 重試 / 反覆修改)。 */
export interface SkeletonRib {
  /** 代表 span (群組類支線取首個成員)。 */
  spanId: string;
  /** 若來自降噪群組，記其 id。 */
  groupId?: string;
  /** 掛載到哪個主線節點 (其 spanId)。 */
  attachTo: string;
  kind: SkeletonRibKind;
  label: string;
  order: number;
}

export interface DistilledSkeleton {
  schemaVersion: typeof SCHEMA_VERSION;
  nodes: SkeletonNode[];
  ribs: SkeletonRib[];
}

/** 單一 session 的完整文件 (頂層產物)。 */
export interface SessionDocument {
  schemaVersion: typeof SCHEMA_VERSION;
  session: SessionMeta;
  spans: Span[];
  groups: SpanGroup[];
  /** 蒸餾骨架；由 distiller 產生 (preset v1)。 */
  skeleton?: DistilledSkeleton;
}

/**
 * 多 session 擴充預留 (D-5)：個人技能庫。
 * 目前 MVP 不啟用，僅定義型別以確保架構不寫死單 session。
 */
export interface SessionLibrary {
  schemaVersion: typeof SCHEMA_VERSION;
  documents: SessionDocument[];
}
