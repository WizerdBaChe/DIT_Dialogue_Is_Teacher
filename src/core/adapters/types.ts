/**
 * 來源 Adapter 介面 (低耦合擴充點)
 * 每個來源 (Claude Code / Codex / 貼上) 實作此介面，將原始輸入轉成來源無關的 RawEvent[]。
 * 下游 Normalizer 只認 RawEvent[]，不認得任何特定來源格式。
 */
import type { SessionMeta, SourceId } from "@/types/spanTree";

/** 來源無關的中介事件種類。 */
export type RawEventKind =
  | "user_text"
  | "assistant_text"
  | "thinking"
  | "tool_use"
  | "tool_result"
  | "unknown";

/** 來源無關的中介事件。Normalizer 以此建構 Span Tree。 */
export interface RawEvent {
  kind: RawEventKind;
  /** 來源行的唯一 id (若有)。 */
  uuid?: string;
  /** 父事件 id (若有)，用於建立巢狀關係。 */
  parentUuid?: string | null;
  timestamp?: string | null;
  /** 是否屬於 subagent 旁鏈。 */
  isSidechain?: boolean;
  /** 純文字內容 (訊息/思考/結果文字)。 */
  text?: string;
  /** 工具名稱 (kind === "tool_use")。 */
  toolName?: string;
  /** 工具輸入參數 (kind === "tool_use")。 */
  toolInput?: Record<string, unknown>;
  /** 關聯 id：tool_use 的自身 id，或 tool_result 指向的 tool_use id。 */
  toolUseId?: string;
  /** 工具結果是否為錯誤 (kind === "tool_result")。 */
  isError?: boolean;
  /** 原始事件，保底可回溯。 */
  raw: unknown;
}

/** Adapter 解析結果。 */
export interface ParseResult {
  meta: Partial<SessionMeta>;
  events: RawEvent[];
  /** 解析過程的非致命警告 (損壞行、未知型別等)，供自檢與 UI 提示。 */
  warnings: string[];
}

/** 來源 Adapter 介面。 */
export interface SourceAdapter {
  id: SourceId;
  /** 是否能處理此輸入 (用於自動偵測來源)。 */
  canParse(raw: string): boolean;
  /** 將原始輸入解析為中介事件流。實作須容錯，不得因單行損壞而整體拋例外。 */
  parse(raw: string): ParseResult;
}
