import { useId, type ReactNode } from "react";
import { useT } from "@/i18n";
import { SPAN_DOT, SPAN_LEGEND_ORDER } from "./labels";

/**
 * R11 M6：符號說明從 `<details>` 收合改成 hover/focus 顯示的 tooltip。
 * 收合版沒有引導效果（作者 UAT A7）——沒人知道要點開。改成一律可見的網格，
 * 逐項再掛一顆 tooltip；泡泡內容是 t.spanKindDefinition[type]，即該符號的
 * 一句話定義（複本在 src/i18n/locales.ts，zh-TW / EN 兩語系同源）。
 */
export function StructureLegend(): ReactNode {
  const t = useT();
  const uid = useId();
  const items = SPAN_LEGEND_ORDER.map((type) => [type, SPAN_DOT[type], t.spanKind[type]] as const);

  return (
    <div className="tree-legend" aria-label={t.sidebar.legendLabel}>
      <span className="tree-legend-title">{t.sidebar.legendLabel}</span>
      <div className="tree-legend-grid">
        {items.map(([type, symbol, label]) => {
          const tooltipId = `${uid}-${type}`;
          return (
            <button type="button" className="tree-legend-item" key={type} aria-describedby={tooltipId}>
              <span className="tree-legend-symbol" aria-hidden="true">{symbol}</span>
              {label}
              <span role="tooltip" id={tooltipId} className="legend-tooltip-bubble">
                <span className="legend-tooltip-line">{t.spanKindDefinition[type]}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="tree-legend-note">{t.sidebar.legendNote}</p>
    </div>
  );
}
