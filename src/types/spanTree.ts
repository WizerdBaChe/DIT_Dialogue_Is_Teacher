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

/** 來源識別碼，新增來源時擴充此聯集。 */
export type SourceId = "claude-code" | "codex" | "paste";

/** Span 的語意型別。 */
export type SpanType =
  | "user_msg"
  | "assistant_msg"
  | "thinking"
  | "tool_use"
  | "tool_result"
  | "subagent"
  | "group";

/** 由降噪/規則產生的標籤，用於標示學習價值高的節點。 */
export type SpanTag = "retry" | "error" | "decision" | "milestone";

/** 降噪分組的種類。 */
export type GroupKind = "edit-loop" | "retry" | "subagent" | "verbose";

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

/** session 後設資料。 */
export interface SessionMeta {
  id: string;
  source: SourceId;
  tool: string;
  title: string;
  projectPath: string | null;
  startedAt: string | null;
  model: string | null;
}

/**
 * 蒸餾骨架 (Distilled Skeleton) — preset v1。
 * 把 Span Tree 進一步「整理」成精簡的因果骨架：主線節點 (spine) + 支線 (rib)。
 * 與視圖無關 (view-agnostic)：高密度模式可忽略，認知/魚骨模式直接渲染此結構。
 * 格式為預設第一版，後續可再調整 (見 docs/BACKLOG.md)。
 */
export type SkeletonNodeKind = "objective" | "decision" | "milestone" | "outcome";
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
