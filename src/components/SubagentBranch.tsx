import type { ReactNode } from "react";
import type { SpanGroup } from "@/types/spanTree";
import type { SpanNode } from "@/core/view/viewModel";
import { useT } from "@/i18n";
import { SPAN_DOT } from "./labels";

export function SubagentMiniGraph({ nodes }: { nodes: SpanNode[] }): ReactNode {
  const t = useT();
  const visible = nodes.slice(0, 8);
  const width = Math.max(180, visible.length * 54);
  return (
    <svg
      className="subagent-mini-graph"
      viewBox={`0 0 ${width} 56`}
      role="img"
      aria-label={t.subagent.graphAria(nodes.length)}
      preserveAspectRatio="xMinYMid meet"
    >
      {visible.length > 1 && <line x1="27" y1="22" x2={27 + (visible.length - 1) * 54} y2="22" className="subagent-link" />}
      {visible.map((node, index) => {
        const x = 27 + index * 54;
        return (
          <g key={node.span.id} transform={`translate(${x} 22)`}>
            <circle r="12" className="subagent-node" />
            <text textAnchor="middle" dominantBaseline="central" className="subagent-symbol">
              {SPAN_DOT[node.span.type]}
            </text>
            <text y="25" textAnchor="middle" className="subagent-index">{index + 1}</text>
          </g>
        );
      })}
      {nodes.length > visible.length && <text x={width - 4} y="50" textAnchor="end" className="subagent-more">+{nodes.length - visible.length}</text>}
    </svg>
  );
}

export function SubagentBranchButton({
  group,
  nodes,
  active,
  onSelect,
}: {
  group: SpanGroup;
  nodes: SpanNode[];
  active: boolean;
  onSelect: () => void;
}): ReactNode {
  const t = useT();
  return (
    <button
      type="button"
      className={`subagent-branch-button ${active ? "active" : ""}`}
      onClick={onSelect}
      aria-pressed={active}
    >
      <span className="subagent-branch-head">{t.subagent.branch(group.label, nodes.length)}</span>
      <SubagentMiniGraph nodes={nodes} />
    </button>
  );
}
