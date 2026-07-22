// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { StructureLegend } from "./StructureLegend";

afterEach(cleanup);

describe("StructureLegend collapse default (LS-06, D-R65-03)", () => {
  it("renders a <details> collapsed by default with a visible summary", () => {
    const { container } = render(<StructureLegend />);
    const details = container.querySelector("details.tree-legend") as HTMLDetailsElement;

    expect(details).not.toBeNull();
    expect(details.open).toBe(false);

    const summary = details.querySelector("summary");
    expect(summary).not.toBeNull();
    expect(summary?.textContent?.length).toBeGreaterThan(0);
  });
});
