// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MESSAGES } from "@/i18n";
import { GROUP_KINDS, type SpanType } from "@/types/spanTree";
import { StructureLegend } from "./StructureLegend";
import { SPAN_DOT, SPAN_LEGEND_ORDER } from "./labels";

afterEach(cleanup);

const zh = MESSAGES["zh-TW"];
const symbolToType = new Map(
  SPAN_LEGEND_ORDER.map((type) => [SPAN_DOT[type], type] as const),
);

/** `group`'s definition is a function (R11.2 M6, B15) — the other kinds stay plain strings. */
function expectedDefinitionText(locale: (typeof MESSAGES)["zh-TW"], type: SpanType): string {
  if (type === "group") {
    const labels = GROUP_KINDS.map((kind) => locale.card.groupKindTag[kind]);
    return locale.spanKindDefinition.group(labels);
  }
  return locale.spanKindDefinition[type];
}

describe("StructureLegend hover/focus tooltip (R11 M6, UAT A7)", () => {
  it("renders the legend grid always visible — no collapsed <details> disclosure", () => {
    const { container } = render(<StructureLegend />);

    // R11 M6: a collapsed <details> had no discovery affordance (author UAT A7,
    // 部分通過). The legend is now an always-visible <div>; nothing to open.
    expect(container.querySelector("details.tree-legend")).toBeNull();

    const legend = container.querySelector("div.tree-legend");
    expect(legend).not.toBeNull();
    const grid = legend?.querySelector(".tree-legend-grid");
    expect(grid).not.toBeNull();
    expect(grid?.children.length).toBeGreaterThan(0);
  });

  it("exposes each symbol's tooltip with its real definition, wired for keyboard and screen reader", () => {
    render(<StructureLegend />);

    const triggers = screen.getAllByRole("button", { name: /./ });
    expect(triggers.length).toBe(SPAN_LEGEND_ORDER.length);

    for (const trigger of triggers) {
      // A bare `title` attribute would not satisfy keyboard/AT access — the
      // definition must be wired through aria-describedby to a role="tooltip"
      // element that stays in the accessibility tree (no display:none).
      const describedById = trigger.getAttribute("aria-describedby");
      expect(describedById).toBeTruthy();

      const tooltip = document.getElementById(describedById as string);
      expect(tooltip).not.toBeNull();
      expect(tooltip?.getAttribute("role")).toBe("tooltip");

      // The bubble must carry the real definition (t.spanKindDefinition),
      // not merely repeat the label already visible next to the symbol.
      const symbol = trigger.querySelector(".tree-legend-symbol")?.textContent ?? "";
      const type = symbolToType.get(symbol) as SpanType | undefined;
      expect(type).toBeDefined();
      expect(tooltip?.textContent).toBe(expectedDefinitionText(zh, type as SpanType));
      expect(tooltip?.textContent).not.toBe(zh.spanKind[type as SpanType]);

      // Keyboard focus must be able to reach the trigger (no tabindex="-1").
      expect(trigger.tabIndex).not.toBe(-1);
    }
  });

  it("group's tooltip enumerates every GroupKind label straight from card.groupKindTag — the single source (R11.2 M6, B15)", () => {
    render(<StructureLegend />);

    const triggers = screen.getAllByRole("button", { name: /./ });
    const groupTrigger = triggers.find(
      (trigger) => trigger.querySelector(".tree-legend-symbol")?.textContent === SPAN_DOT.group,
    );
    expect(groupTrigger).toBeDefined();

    const describedById = groupTrigger?.getAttribute("aria-describedby") as string;
    const tooltip = document.getElementById(describedById);

    // The card label and the legend must read the same table: every GroupKind's
    // card-facing label (t.card.groupKindTag) must appear verbatim in the group
    // tooltip. This is what fails if a GroupKind exists in one table and not the
    // other — no hand-listed GroupKind array here, GROUP_KINDS is the type's own
    // canonical source (src/types/spanTree.ts).
    for (const kind of GROUP_KINDS) {
      const label = zh.card.groupKindTag[kind];
      expect(tooltip?.textContent).toContain(label);
    }
  });
});
