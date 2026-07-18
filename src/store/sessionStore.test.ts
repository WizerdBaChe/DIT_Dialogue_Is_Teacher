import { afterEach, describe, expect, it, vi } from "vitest";
import { useSessionStore } from "./sessionStore";
import { r4MainSession, r4SubagentSession } from "@/fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  useSessionStore.setState({
    providerId: "none",
    annotationErrors: {},
    ollamaStatus: null,
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
});
