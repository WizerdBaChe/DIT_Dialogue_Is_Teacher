import type { ReactNode } from "react";
import { useT } from "@/i18n";
import { SPAN_DOT, SPAN_LEGEND_ORDER } from "./labels";

export function StructureLegend(): ReactNode {
  const t = useT();
  const items = SPAN_LEGEND_ORDER.map((type) => [SPAN_DOT[type], t.spanKind[type]] as const);

  return (
    <div className="tree-legend" aria-label={t.sidebar.legendLabel}>
      <span className="tree-legend-title">{t.sidebar.legendLabel}</span>
      <div className="tree-legend-grid">
        {items.map(([symbol, label]) => (
          <span className="tree-legend-item" key={symbol}>
            <span className="tree-legend-symbol" aria-hidden="true">{symbol}</span>
            {label}
          </span>
        ))}
      </div>
      <p className="tree-legend-note">{t.sidebar.legendNote}</p>
    </div>
  );
}
