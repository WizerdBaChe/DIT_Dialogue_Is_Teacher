/**
 * View Model：把 Span Tree 攤平成「可渲染的卡片清單」(渲染與資料解耦)。
 * - tool_result 巢狀在其 tool_use 卡片內。
 * - edit-loop 群組成員收成單一 group 卡片。
 * - 其餘 span 各自為一張卡片。
 * 卡片順序即逐步瀏覽的步驟順序。
 */
import type { SessionDocument, Span, SpanGroup } from "@/types/spanTree";

export interface SpanNode {
  span: Span;
  /** 巢狀於此 span 下的工具結果。 */
  children: Span[];
}

export type ViewItem =
  | { type: "span"; id: string; node: SpanNode }
  | { type: "group"; id: string; group: SpanGroup; nodes: SpanNode[] };

export function buildViewModel(doc: SessionDocument): ViewItem[] {
  const byId = new Map(doc.spans.map((s) => [s.id, s]));

  // spanId → 所屬 group (僅 edit-loop 等需折疊者)。
  const groupOf = new Map<string, SpanGroup>();
  for (const g of doc.groups) {
    for (const sid of g.spanIds) groupOf.set(sid, g);
  }

  // 預先收集每個 span 的子節點 (tool_result)。
  const childrenOf = new Map<string, Span[]>();
  for (const s of doc.spans) {
    if (s.type === "tool_result" && s.parentId && byId.has(s.parentId)) {
      const arr = childrenOf.get(s.parentId) ?? [];
      arr.push(s);
      childrenOf.set(s.parentId, arr);
    }
  }

  const nodeOf = (s: Span): SpanNode => ({ span: s, children: childrenOf.get(s.id) ?? [] });

  const items: ViewItem[] = [];
  const emittedGroups = new Set<string>();

  for (const s of doc.spans) {
    // tool_result 已巢狀於父卡片，不獨立呈現。
    if (s.type === "tool_result" && s.parentId && byId.has(s.parentId)) continue;

    const group = groupOf.get(s.id);
    if (group) {
      if (emittedGroups.has(group.id)) continue;
      emittedGroups.add(group.id);
      const nodes = group.spanIds
        .map((sid) => byId.get(sid))
        .filter((x): x is Span => Boolean(x))
        .filter((span) => !(span.type === "tool_result" && span.parentId && group.spanIds.includes(span.parentId)))
        .map(nodeOf);
      items.push({ type: "group", id: group.id, group, nodes });
      continue;
    }

    items.push({ type: "span", id: s.id, node: nodeOf(s) });
  }

  return items;
}
