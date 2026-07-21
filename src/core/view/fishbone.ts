/**
 * Fishbone view builder：把 DistilledSkeleton 轉成魚骨視圖要渲染的「站點 + 支線」結構。
 * 與渲染解耦；負責解析每個骨架節點/支線對應到哪個 viewItem (供 drill-down 重用既有卡片)。
 */
import type { SessionDocument, SkeletonNodeKind, SkeletonRibKind } from "@/types/spanTree";
import { reportFallback } from "@/core/diagnostics";
import type { ViewItem } from "./viewModel";

export interface FishboneRib {
  /** 對應的 viewItem id (群組支線取 groupId)，供點擊展開詳情。 */
  viewItemId: string;
  kind: SkeletonRibKind;
  label: string;
}

export interface FishboneStation {
  viewItemId: string;
  kind: SkeletonNodeKind;
  label: string;
  order: number;
  ribs: FishboneRib[];
}

/**
 * spanId → 承載它的 top-level viewItem id。
 * tool_result 巢狀在父卡片、群組成員收在 group 卡片裡，這些 span 本身都不是 viewItem，
 * 但它們都有一張「看得到的卡片」可對應。
 */
function buildSpanOwnerMap(viewItems: ViewItem[]): Map<string, string> {
  const owner = new Map<string, string>();
  for (const item of viewItems) {
    if (item.type === "span") {
      owner.set(item.node.span.id, item.id);
      for (const child of item.node.children) owner.set(child.id, item.id);
      continue;
    }
    owner.set(item.id, item.id);
    for (const node of item.nodes) {
      owner.set(node.span.id, item.id);
      for (const child of node.children) owner.set(child.id, item.id);
    }
  }
  return owner;
}

/**
 * 建立魚骨站點。每個主線節點是一站，其支線掛在底下。
 * viewItemId 解析規則：先找承載該 span 的 viewItem 卡片；真的對應不到就整筆捨棄。
 * 絕不可退回 viewItems[0] — 那會讓站點的位置、子代理掛載與「跳到這一步」全部指向錯誤的項目。
 */
export function buildFishbone(doc: SessionDocument, viewItems: ViewItem[]): FishboneStation[] {
  const skeleton = doc.skeleton;
  if (!skeleton) return [];

  const owner = buildSpanOwnerMap(viewItems);

  const stations: FishboneStation[] = skeleton.nodes
    .slice()
    .sort((a, b) => a.order - b.order)
    .flatMap((n) => {
      const viewItemId = owner.get(n.spanId);
      if (!viewItemId) {
        reportFallback("fishbone/station", "span-not-in-view-model", { spanId: n.spanId, kind: n.kind });
        return [];
      }
      return [{ viewItemId, kind: n.kind, label: n.label, order: n.order, ribs: [] as FishboneRib[] }];
    });

  // 把支線掛到「掛載目標所在或之前最近」的站點。
  for (const rib of skeleton.ribs) {
    const target = [...stations].reverse().find((s) => s.order <= rib.order) ?? stations[0];
    if (!target) continue;
    const viewItemId = owner.get(rib.groupId ?? rib.spanId);
    if (!viewItemId) {
      reportFallback("fishbone/rib", "span-not-in-view-model", { spanId: rib.spanId, groupId: rib.groupId, kind: rib.kind });
      continue;
    }
    target.ribs.push({ viewItemId, kind: rib.kind, label: rib.label });
  }

  return stations;
}
