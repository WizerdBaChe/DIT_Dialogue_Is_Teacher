import { describe, expect, it } from "vitest";
import { PRIMARY_VIEWS, primaryViewAfterKey } from "./workspace";

describe("workspace keyboard navigation", () => {
  it("exposes only the approved primary views", () => {
    expect(PRIMARY_VIEWS).toEqual(["overview", "reader", "subagents"]);
  });

  it("moves left and right with wrapping", () => {
    expect(primaryViewAfterKey("overview", "ArrowRight")).toBe("reader");
    expect(primaryViewAfterKey("overview", "ArrowLeft")).toBe("subagents");
    expect(primaryViewAfterKey("subagents", "ArrowRight")).toBe("overview");
  });

  it("supports Home and End without consuming unrelated keys", () => {
    expect(primaryViewAfterKey("subagents", "Home")).toBe("overview");
    expect(primaryViewAfterKey("overview", "End")).toBe("subagents");
    expect(primaryViewAfterKey("reader", "Enter")).toBeNull();
  });
});
