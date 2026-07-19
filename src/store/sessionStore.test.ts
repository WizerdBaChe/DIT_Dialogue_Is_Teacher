import { afterEach, describe, expect, it, vi } from "vitest";
import { selectCurrentPosition, useSessionStore } from "./sessionStore";
import { r4MainSession, r4SubagentSession, sampleSession } from "@/fixtures";

afterEach(() => {
  useSessionStore.getState().pause();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  useSessionStore.setState({
    providerId: "none",
    annotationErrors: {},
    ollamaStatus: null,
    primaryView: "overview",
    sessionOrigin: "sample",
    structureCollapsed: false,
  });
});

describe("provider status recovery", () => {
  it("clears stale node errors after Ollama becomes ready", async () => {
    useSessionStore.setState({ annotationErrors: { "node-1": "Ollama is offline" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ models: [{ name: "qwen2.5-coder:7b" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ));

    await useSessionStore.getState().refreshOllamaStatus();

    expect(useSessionStore.getState().ollamaStatus?.state).toBe("ready");
    expect(useSessionStore.getState().annotationErrors).toEqual({});
  });

  it("clears errors when switching analysis providers", () => {
    useSessionStore.setState({ annotationErrors: { "node-1": "Previous provider failed" } });

    useSessionStore.getState().setProvider("none");

    expect(useSessionStore.getState().annotationErrors).toEqual({});
  });
});

describe("multi-file session loading", () => {
  it("loads the main transcript and subagents directory through the store", () => {
    useSessionStore.getState().loadFromFiles([
      { path: "main.jsonl", content: r4MainSession },
      { path: "subagents/agent-1.jsonl", content: r4SubagentSession },
    ]);

    expect(useSessionStore.getState().doc?.session.id).toBe("r4-cross-file");
    expect(useSessionStore.getState().viewItems.some(
      (item) => item.type === "group" && item.group.kind === "subagent",
    )).toBe(true);
  });

  it("keeps the previous valid document when a replacement fails", () => {
    useSessionStore.getState().loadFromFiles([
      { path: "main.jsonl", content: r4MainSession },
      { path: "subagents/agent-1.jsonl", content: r4SubagentSession },
    ]);
    const previousDocument = useSessionStore.getState().doc;

    useSessionStore.getState().loadFromText("not-jsonl");

    expect(useSessionStore.getState().doc).toBe(previousDocument);
    expect(useSessionStore.getState().error).toContain("無法辨識輸入格式");
  });
});

describe("workspace navigation", () => {
  it("publishes sample, user, and reset sessions into the overview", () => {
    useSessionStore.getState().loadFromText(sampleSession, "sample");
    expect(useSessionStore.getState().sessionOrigin).toBe("sample");
    expect(useSessionStore.getState().primaryView).toBe("overview");
    expect(useSessionStore.getState().activeId).toBe(useSessionStore.getState().viewItems[0]?.id);

    useSessionStore.getState().loadFromFiles([{ path: "main.jsonl", content: r4MainSession }]);
    expect(useSessionStore.getState().sessionOrigin).toBe("user");
    expect(useSessionStore.getState().primaryView).toBe("overview");
    expect(useSessionStore.getState().activeId).toBe(useSessionStore.getState().viewItems[0]?.id);

    useSessionStore.getState().setPrimaryView("subagents");
    useSessionStore.getState().resetToSample();
    expect(useSessionStore.getState().sessionOrigin).toBe("sample");
    expect(useSessionStore.getState().primaryView).toBe("overview");
    expect(useSessionStore.getState().activeId).toBe(useSessionStore.getState().viewItems[0]?.id);
  });

  it("returns to the reader when a navigation view opens an item", () => {
    useSessionStore.getState().loadFromFiles([
      { path: "main.jsonl", content: r4MainSession },
      { path: "subagents/agent-1.jsonl", content: r4SubagentSession },
    ]);
    const items = useSessionStore.getState().viewItems;
    const targetId = items[items.length - 1]?.id;
    expect(targetId).toBeTruthy();

    useSessionStore.getState().gotoIndex(1);
    useSessionStore.getState().setPrimaryView("subagents");
    useSessionStore.getState().setActive(targetId!);

    expect(useSessionStore.getState().activeId).toBe(targetId);
    expect(useSessionStore.getState().playingId).toBeNull();
    expect(useSessionStore.getState().primaryView).toBe("reader");
  });

  it("pauses manual tabs and start reading while preserving the active item", () => {
    vi.useFakeTimers();
    useSessionStore.getState().loadFromFiles([{ path: "main.jsonl", content: r4MainSession }]);
    useSessionStore.getState().gotoIndex(1);
    useSessionStore.getState().play();
    expect(useSessionStore.getState().isPlaying).toBe(true);
    const activeId = useSessionStore.getState().activeId;

    useSessionStore.getState().setPrimaryView("overview");
    expect(useSessionStore.getState().isPlaying).toBe(false);
    expect(useSessionStore.getState().activeId).toBe(activeId);

    useSessionStore.getState().startReading();
    expect(useSessionStore.getState().primaryView).toBe("reader");
    expect(useSessionStore.getState().isPlaying).toBe(false);
    expect(useSessionStore.getState().activeId).toBe(activeId);
  });

  it("routes previous, next, and replay controls to the reader", () => {
    vi.useFakeTimers();
    useSessionStore.getState().loadFromFiles([{ path: "main.jsonl", content: r4MainSession }]);

    useSessionStore.getState().setPrimaryView("overview");
    useSessionStore.getState().next();
    expect(useSessionStore.getState().primaryView).toBe("reader");
    expect(useSessionStore.getState().isPlaying).toBe(false);

    useSessionStore.getState().setPrimaryView("overview");
    useSessionStore.getState().prev();
    expect(useSessionStore.getState().primaryView).toBe("reader");
    expect(useSessionStore.getState().isPlaying).toBe(false);

    useSessionStore.getState().setPrimaryView("overview");
    useSessionStore.getState().play();
    expect(useSessionStore.getState().primaryView).toBe("reader");
    expect(useSessionStore.getState().isPlaying).toBe(true);
  });

  it("reports position from playingId before activeId", () => {
    useSessionStore.getState().loadFromFiles([{ path: "main.jsonl", content: r4MainSession }]);
    let position = selectCurrentPosition(useSessionStore.getState());
    expect(position).toEqual({ current: 1, total: useSessionStore.getState().viewItems.length });

    useSessionStore.getState().gotoIndex(1);
    position = selectCurrentPosition(useSessionStore.getState());
    expect(position.current).toBe(2);

    useSessionStore.setState({ playingId: "missing-id" });
    expect(selectCurrentPosition(useSessionStore.getState())).toEqual({
      current: null,
      total: useSessionStore.getState().viewItems.length,
    });
  });

  it("collapses structure without changing selection or playback", () => {
    vi.useFakeTimers();
    useSessionStore.getState().loadFromFiles([{ path: "main.jsonl", content: r4MainSession }]);
    useSessionStore.getState().play();
    const before = useSessionStore.getState();

    useSessionStore.getState().toggleStructureCollapsed();
    const after = useSessionStore.getState();

    expect(after.structureCollapsed).toBe(true);
    expect(after.activeId).toBe(before.activeId);
    expect(after.playingId).toBe(before.playingId);
    expect(after.isPlaying).toBe(before.isPlaying);
    expect(after.primaryView).toBe(before.primaryView);
  });
});
