import type { AnnotationJobItem, AnnotationJobSnapshot, AnnotationRunMode } from "./contracts";

export interface AnnotationJobSpec {
  mode: AnnotationRunMode;
  items: AnnotationJobItem[];
  runItem: (id: string) => Promise<boolean>;
  onSnapshot?: (snapshot: AnnotationJobSnapshot) => void;
}

export class AnnotationJobController {
  private cancelled = false;
  private active = false;

  cancel(): void {
    this.cancelled = true;
  }

  async start(spec: AnnotationJobSpec): Promise<AnnotationJobSnapshot> {
    if (this.active) throw new Error("An annotation job is already running.");
    this.active = true;
    this.cancelled = false;
    const selected = spec.items.filter((item) => {
      if (spec.mode === "all") return true;
      if (spec.mode === "failed") return item.failed;
      return !item.cached;
    });
    let snapshot: AnnotationJobSnapshot = {
      mode: spec.mode,
      status: "running",
      total: selected.length,
      done: 0,
      cached: spec.items.length - selected.length,
      failed: 0,
      currentId: null,
      pendingIds: selected.map((item) => item.id),
    };
    const emit = (patch: Partial<AnnotationJobSnapshot>) => {
      snapshot = { ...snapshot, ...patch };
      spec.onSnapshot?.({ ...snapshot, pendingIds: [...snapshot.pendingIds] });
    };
    emit({});
    try {
      for (const item of selected) {
        if (this.cancelled) break;
        emit({ currentId: item.id });
        const succeeded = await spec.runItem(item.id);
        const pendingIds = snapshot.pendingIds.filter((id) => id !== item.id);
        emit({
          currentId: null,
          done: snapshot.done + (succeeded ? 1 : 0),
          failed: snapshot.failed + (succeeded ? 0 : 1),
          pendingIds,
        });
      }
      emit({ status: this.cancelled ? "stopped" : "completed", currentId: null });
      return snapshot;
    } finally {
      this.active = false;
    }
  }
}
