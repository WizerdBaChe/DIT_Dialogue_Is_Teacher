/**
 * Distiller：把 Span Tree「整理」成精簡因果骨架 (DistilledSkeleton, preset v1)。
 * 這是後端資料處理的核心「蒸餾」步驟，與任何視圖無關。
 *
 * 確定性規則 (無 LLM)：
 *   主線 (spine)：
 *     - objective ← 第一個使用者訊息 (任務目標)
 *     - decision  ← 標記為 decision 的思考節點 (關鍵轉折)
 *     - outcome   ← 最後一個節點 (最終結果/總結)
 *   支線 (rib)：掛在最近的前一個主線節點上
 *     - error       ← 標記 error 的結果
 *     - retry       ← 標記 retry 的工具呼叫
 *     - investigation ← 取證型工具 (Read/Grep/Glob/WebFetch/WebSearch)
 *     - edit-loop   ← 反覆修改群組
 *   其餘 (中間敘述、成功的中間結果) 視為噪音，不進骨架 → 達成精簡。
 *
 * 格式為 preset v1，欄位與規則後續可調 (見 docs/BACKLOG.md)。
 */
import {
  SCHEMA_VERSION,
  type DistilledSkeleton,
  type SessionDocument,
  type SkeletonNode,
  type SkeletonRib,
} from "@/types/spanTree";

const INVESTIGATION_TOOLS = new Set(["Read", "Grep", "Glob", "WebFetch", "WebSearch", "NotebookRead"]);

function shorten(text: string, max = 28): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

export function distill(doc: SessionDocument): SessionDocument {
  const spans = doc.spans;
  const groupBySpanId = new Map<string, string>();
  for (const g of doc.groups) for (const sid of g.spanIds) groupBySpanId.set(sid, g.id);

  // ---- 主線 ----
  const nodes: SkeletonNode[] = [];
  const spineSpanIds = new Set<string>();

  const firstUser = spans.find((s) => s.type === "user_msg");
  if (firstUser) {
    nodes.push({ spanId: firstUser.id, kind: "objective", label: shorten(firstUser.summary), order: firstUser.order });
    spineSpanIds.add(firstUser.id);
  }
  for (const s of spans) {
    if (s.tags.includes("decision")) {
      nodes.push({ spanId: s.id, kind: "decision", label: shorten(s.summary), order: s.order });
      spineSpanIds.add(s.id);
    }
  }
  const last = spans[spans.length - 1];
  if (last && !spineSpanIds.has(last.id)) {
    nodes.push({ spanId: last.id, kind: "outcome", label: shorten(last.summary), order: last.order });
    spineSpanIds.add(last.id);
  }
  nodes.sort((a, b) => a.order - b.order);

  /** 找出某 order 之前最近的主線節點。 */
  const attachFor = (order: number): string =>
    [...nodes].reverse().find((n) => n.order <= order)?.spanId ?? nodes[0]?.spanId ?? "";

  // ---- 支線 ----
  const ribs: SkeletonRib[] = [];
  const seenGroups = new Set<string>();

  for (const s of spans) {
    if (spineSpanIds.has(s.id)) continue;
    // 工具結果巢狀於其操作之下；錯誤已上拋到父 tool_use，故略過 tool_result 避免重複支線。
    if (s.type === "tool_result") continue;

    const groupId = groupBySpanId.get(s.id);
    if (groupId) {
      if (seenGroups.has(groupId)) continue;
      seenGroups.add(groupId);
      const g = doc.groups.find((x) => x.id === groupId)!;
      ribs.push({ spanId: s.id, groupId, attachTo: attachFor(s.order), kind: "edit-loop", label: g.label, order: s.order });
      continue;
    }

    let kind: SkeletonRib["kind"] | null = null;
    if (s.tags.includes("error")) kind = "error";
    else if (s.tags.includes("retry")) kind = "retry";
    else if (s.type === "tool_use" && INVESTIGATION_TOOLS.has(s.tool?.name ?? "")) kind = "investigation";

    if (kind) {
      ribs.push({ spanId: s.id, attachTo: attachFor(s.order), kind, label: shorten(s.summary), order: s.order });
    }
  }

  const skeleton: DistilledSkeleton = { schemaVersion: SCHEMA_VERSION, nodes, ribs };
  return { ...doc, skeleton };
}
