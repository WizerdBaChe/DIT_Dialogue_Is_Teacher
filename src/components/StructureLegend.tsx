import type { ReactNode } from "react";
import { useT } from "@/i18n";

export function StructureLegend(): ReactNode {
  const t = useT();
  const items = [
    ["□", t.skeletonNode.objective],
    ["◇", t.skeletonNode.decision],
    ["⬡", t.skeletonNode.milestone],
    ["▰", t.skeletonNode.outcome],
    ["├", t.skeletonRib.investigation],
    ["△", t.skeletonRib.error],
    ["○", t.skeletonRib.retry],
    ["◆", t.skeletonRib["edit-loop"]],
    ["◆", t.workspace.tabs.subagents],
  ] as const;

  return (
    <div className="tree-legend" aria-label={t.sidebar.legendLabel}>
      <span className="tree-legend-title">{t.sidebar.legendLabel}</span>
      <div className="tree-legend-grid">
        {items.map(([symbol, label], index) => (
          <span className="tree-legend-item" key={`${symbol}:${label}:${index}`}>
            <span className="tree-legend-symbol" aria-hidden="true">{symbol}</span>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
