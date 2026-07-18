import { describe, expect, it, vi } from "vitest";
import { AnnotationJobController } from "./jobController";

const items = [
  { id: "cached", cached: true, failed: false },
  { id: "missing", cached: false, failed: false },
  { id: "failed", cached: false, failed: true },
];

describe("AnnotationJobController", () => {
  it("runs only missing items by default and reports cache hits", async () => {
    const runItem = vi.fn().mockResolvedValue(true);
    const result = await new AnnotationJobController().start({ mode: "missing", items, runItem });
    expect(runItem.mock.calls.map(([id]) => id)).toEqual(["missing", "failed"]);
    expect(result).toMatchObject({ status: "completed", total: 2, done: 2, cached: 1, failed: 0 });
  });

  it("retries only failed items", async () => {
    const runItem = vi.fn().mockResolvedValue(true);
    await new AnnotationJobController().start({ mode: "failed", items, runItem });
    expect(runItem).toHaveBeenCalledOnce();
    expect(runItem).toHaveBeenCalledWith("failed");
  });

  it("stops after the in-flight item and preserves pending ids for resume", async () => {
    const controller = new AnnotationJobController();
    const runItem = vi.fn(async () => {
      controller.cancel();
      return true;
    });
    const result = await controller.start({ mode: "all", items, runItem });
    expect(runItem).toHaveBeenCalledOnce();
    expect(result.status).toBe("stopped");
    expect(result.done).toBe(1);
    expect(result.pendingIds).toEqual(["missing", "failed"]);
  });
});
