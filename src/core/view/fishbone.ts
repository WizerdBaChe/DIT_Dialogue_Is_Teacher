/**
 * Fishbone view builder：把 DistilledSkeleton 轉成魚骨視圖要渲染的「站點 + 支線」結構。
 * 與渲染解耦；負責解析每個骨架節點/支線對應到哪個 viewItem (供 drill-down 重用既有卡片)。
 */
import type { SessionDocument, SkeletonNodeKind, SkeletonRibKind } from "@/types/spanTree";
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
 * 建立魚骨站點。每個主線節點是一站，其支線掛在底下。
 * viewItemId 解析規則：群組支線用 groupId，其餘用 spanId — 兩者都保證是一個 top-level viewItem。
 */
export function buildFishbone(doc: SessionDocument, viewItems: ViewItem[]): FishboneStation[] {
  const skeleton = doc.skeleton;
  if (!skeleton) return [];

  const viewItemIds = new Set(viewItems.map((v) => v.id));
  const resolve = (id: string): string => (viewItemIds.has(id) ? id : viewItems[0]?.id ?? id);

  const stations: FishboneStation[] = skeleton.nodes
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((n) => ({
      viewItemId: resolve(n.spanId),
      kind: n.kind,
      label: n.label,
      order: n.order,
      ribs: [],
    }));

  // 把支線掛到「掛載目標所在或之前最近」的站點。
  for (const rib of skeleton.ribs) {
    const target = [...stations].reverse().find((s) => s.order <= rib.order) ?? stations[0];
    if (!target) continue;
    target.ribs.push({
      viewItemId: resolve(rib.groupId ?? rib.spanId),
      kind: rib.kind,
      label: rib.label,
    });
  }

  return stations;
}
