/**
 * Adapter 註冊表 (可擴充)
 * 新增來源只需在此 register，pipeline 與 UI 不必改動。
 */
import type { SourceAdapter } from "./types";
import type { SourceId } from "@/types/spanTree";
import { claudeCodeJsonlAdapter } from "./claudeCodeJsonl";

const registry: SourceAdapter[] = [claudeCodeJsonlAdapter];

/** 依 id 取得指定 adapter。 */
export function getAdapter(id: SourceId): SourceAdapter | undefined {
  return registry.find((a) => a.id === id);
}

/** 自動偵測能處理此輸入的第一個 adapter。 */
export function detectAdapter(raw: string): SourceAdapter | undefined {
  return registry.find((a) => a.canParse(raw));
}

/** 列出所有已註冊 adapter (供 UI 顯示)。 */
export function listAdapters(): SourceAdapter[] {
  return [...registry];
}

export type { SourceAdapter, RawEvent, ParseResult } from "./types";
