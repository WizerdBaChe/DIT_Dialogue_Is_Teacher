import { afterEach, describe, expect, it, vi } from "vitest";
import { selectCurrentPosition, useSessionStore } from "./sessionStore";
import { r4MainSession, r4SubagentSession, sampleSession } from "@/fixtures";
import { buildSessionDocument } from "@/core/pipeline";
import { buildSessionExport } from "@/core/export/buildExport";

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
    structureDrawerOpen: false,
    mapOpen: false,
    mapZoomLevel: "global",
    mapFocusId: null,
    mapError: null,
    minimapEnabled: true,
    mapShortcutEnabled: true,
    snapshotMode: false,
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
  it("lands the sample on the overview but takes a loaded session straight to the reader", () => {
    useSessionStore.getState().loadFromText(sampleSession, "sample");
    expect(useSessionStore.getState().sessionOrigin).toBe("sample");
    expect(useSessionStore.getState().primaryView).toBe("overview");
    expect(useSessionStore.getState().activeId).toBe(useSessionStore.getState().viewItems[0]?.id);

    useSessionStore.getState().loadFromFiles([{ path: "main.jsonl", content: r4MainSession }]);
    expect(useSessionStore.getState().sessionOrigin).toBe("user");
    expect(useSessionStore.getState().primaryView).toBe("reader");
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

  it("opens and closes the narrow structure drawer without changing position", () => {
    vi.useFakeTimers();
    useSessionStore.getState().loadFromFiles([{ path: "main.jsonl", content: r4MainSession }]);
    useSessionStore.getState().gotoIndex(1);
    useSessionStore.getState().play();
    const activeId = useSessionStore.getState().activeId;

    useSessionStore.getState().openStructureDrawer();
    expect(useSessionStore.getState().structureDrawerOpen).toBe(true);
    expect(useSessionStore.getState().isPlaying).toBe(false);
    expect(useSessionStore.getState().activeId).toBe(activeId);

    useSessionStore.getState().closeStructureDrawer();
    expect(useSessionStore.getState().structureDrawerOpen).toBe(false);
    expect(useSessionStore.getState().activeId).toBe(activeId);
  });

  it("closes the drawer when selecting an item or synchronizing to desktop", () => {
    useSessionStore.getState().loadFromFiles([{ path: "main.jsonl", content: r4MainSession }]);
    const targetId = useSessionStore.getState().viewItems[1]?.id;
    expect(targetId).toBeTruthy();

    useSessionStore.getState().openStructureDrawer();
    useSessionStore.getState().setActive(targetId!);
    expect(useSessionStore.getState().structureDrawerOpen).toBe(false);
    expect(useSessionStore.getState().primaryView).toBe("reader");
    expect(useSessionStore.getState().activeId).toBe(targetId);

    useSessionStore.getState().openStructureDrawer();
    useSessionStore.getState().closeStructureDrawer();
    expect(useSessionStore.getState().structureDrawerOpen).toBe(false);
  });

  it("opens the map at the current position and pauses replay", () => {
    vi.useFakeTimers();
    useSessionStore.getState().loadFromFiles([{ path: "main.jsonl", content: r4MainSession }]);
    useSessionStore.getState().play();
    const currentId = useSessionStore.getState().playingId ?? useSessionStore.getState().activeId;

    useSessionStore.getState().openMap();

    expect(useSessionStore.getState().mapOpen).toBe(true);
    expect(useSessionStore.getState().mapZoomLevel).toBe("global");
    expect(useSessionStore.getState().mapFocusId).toBe(currentId);
    expect(useSessionStore.getState().isPlaying).toBe(false);

    const focusId = useSessionStore.getState().viewItems[1]?.id;
    useSessionStore.getState().setMapZoom("section", focusId);
    expect(useSessionStore.getState().mapZoomLevel).toBe("section");
    expect(useSessionStore.getState().mapFocusId).toBe(focusId);
  });

  it("jumps from a real map landmark to the reader and closes overlays", () => {
    useSessionStore.getState().loadFromFiles([{ path: "main.jsonl", content: r4MainSession }]);
    const targetId = useSessionStore.getState().viewItems[1]?.id;
    expect(targetId).toBeTruthy();
    useSessionStore.getState().setPrimaryView("subagents");
    useSessionStore.getState().openMap();

    useSessionStore.getState().jumpToMapItem(targetId!);

    expect(useSessionStore.getState().mapOpen).toBe(false);
    expect(useSessionStore.getState().primaryView).toBe("reader");
    expect(useSessionStore.getState().activeId).toBe(targetId);
    expect(useSessionStore.getState().playingId).toBeNull();
  });

  it("rejects clusters and invalid map ids without changing position", () => {
    useSessionStore.getState().loadFromFiles([{ path: "main.jsonl", content: r4MainSession }]);
    const activeId = useSessionStore.getState().activeId;
    useSessionStore.getState().openMap();

    useSessionStore.getState().jumpToMapItem("cluster:global:0:4");

    expect(useSessionStore.getState().activeId).toBe(activeId);
    expect(useSessionStore.getState().mapOpen).toBe(true);
    expect(useSessionStore.getState().mapError).toContain("cluster:global:0:4");
  });

  it("toggles navigation preferences and preserves them across session replacement", () => {
    useSessionStore.getState().setMinimapEnabled(false);
    useSessionStore.getState().setMapShortcutEnabled(false);
    expect(useSessionStore.getState().minimapEnabled).toBe(false);
    expect(useSessionStore.getState().mapShortcutEnabled).toBe(false);

    useSessionStore.getState().loadFromFiles([{ path: "main.jsonl", content: r4MainSession }]);
    useSessionStore.getState().resetToSample();

    expect(useSessionStore.getState().minimapEnabled).toBe(false);
    expect(useSessionStore.getState().mapShortcutEnabled).toBe(false);
  });
});

describe("snapshot hydration (EX-03)", () => {
  it("hydrates a SessionExport payload, lands on overview, and skips cache restore", () => {
    const { doc } = buildSessionDocument(r4MainSession);
    const annotations = { "some-item": { what: "x", why: "y", generalLesson: "z", confidence: 0.5, provider: "ollama" as const } };
    const payload = buildSessionExport(doc, { exportedAt: "2026-07-21T00:00:00.000Z", appVersion: "0.1.0", annotations });

    useSessionStore.getState().hydrateSessionExport(payload);

    const state = useSessionStore.getState();
    expect(state.snapshotMode).toBe(true);
    expect(state.doc?.session.id).toBe(doc.session.id);
    expect(state.primaryView).toBe("overview");
    expect(state.annotations).toEqual(annotations);
    expect(state.cacheReady).toBe(true);
    expect(state.restoredAnnotationCount).toBe(0);
  });
});
