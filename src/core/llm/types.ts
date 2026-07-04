/**
 * LLM 教學講解層介面 (可插拔 Provider — 對應 D-4)
 * 逐節點 (span) 切 chunk 講解；全局摘要不走此介面。
 * 三種實作：none (預設/零外傳)、ollama (本地優先)、cloud (樁，日後接雲端 API)。
 */
import type { Annotation, ProviderId, Span } from "@/types/spanTree";

/** 講解所需的最小上下文 (刻意精簡，利於小模型 / 並行)。 */
export interface AnnotateContext {
  sessionTitle: string;
  /** 前一個節點的摘要，提供因果脈絡。 */
  prevSummary?: string;
  /** 輸出語言，跟隨 UI 語言 (R7)；未指定時 prompt 預設繁體中文。 */
  locale?: "zh-TW" | "en";
}

export interface LLMProvider {
  id: ProviderId;
  /** 是否需要把資料外傳 (供 UI 的責任說明判斷)。 */
  readonly sendsDataOut: boolean;
  /**
   * 對單一 span 產生講解。
   * 回傳 null 代表「不講解 / 無法講解」(例如 none provider，或服務不可用)。
   * 實作須容錯：失敗時 reject 並附可讀訊息，由呼叫端決定如何呈現。
   */
  annotate(span: Span, ctx: AnnotateContext): Promise<Annotation | null>;
}
