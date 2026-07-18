import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrivacyEnvelope } from "@/core/privacy";
import { checkOpenCode, createOpenCodeTransport, DEFAULT_OPENCODE_CONFIG } from "./cloud";

const envelope: PrivacyEnvelope = {
  sanitizedText: "Analyze the action without exposing <EMAIL_1>.",
  policy: { id: "balanced", version: "1.0.0" },
  detectorVersions: { secrets: "1.0.0" },
  summary: { email: 1 },
  consentId: "consent-test",
  createdAt: "2026-07-18T00:00:00.000Z",
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkOpenCode", () => {
  it("reports ready only when the provider, model, and DIT agent are available", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ healthy: true, version: "1.17.20" }))
      .mockResolvedValueOnce(jsonResponse({
        connected: ["opencode"],
        all: [{ id: "opencode", models: { "deepseek-v4-flash-free": {}, "mimo-v2.5-free": {} } }],
      }))
      .mockResolvedValueOnce(jsonResponse([{ name: "dit-annotator" }]));
    vi.stubGlobal("fetch", fetchMock);

    const status = await checkOpenCode(DEFAULT_OPENCODE_CONFIG);

    expect(status).toMatchObject({
      state: "ready",
      version: "1.17.20",
      models: ["deepseek-v4-flash-free", "mimo-v2.5-free"],
    });
  });

  it("reports an unavailable configured model", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ healthy: true, version: "1.17.20" }))
      .mockResolvedValueOnce(jsonResponse({ connected: ["opencode"], all: [{ id: "opencode", models: {} }] }))
      .mockResolvedValueOnce(jsonResponse([{ name: "dit-annotator" }])));

    await expect(checkOpenCode(DEFAULT_OPENCODE_CONFIG)).resolves.toMatchObject({ state: "model-missing" });
  });

  it("replaces an opaque status fetch failure with loopback and CORS guidance", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(checkOpenCode(DEFAULT_OPENCODE_CONFIG)).resolves.toMatchObject({
      state: "offline",
      message: "Cannot reach OpenCode at http://127.0.0.1:4096: the loopback server is offline or this page origin is not allowed by CORS",
    });
  });
});

describe("createOpenCodeTransport", () => {
  it("creates an isolated session, disables tools, parses JSON, and requests cleanup", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "ses_test" }))
      .mockResolvedValueOnce(jsonResponse({
        parts: [{
          type: "text",
          text: '```json\n{"what":"Reads the architecture","why":"Checks the intended structure","generalLesson":"Review design before implementation","confidence":"high"}\n```',
        }],
      }))
      .mockResolvedValueOnce(jsonResponse(true));
    vi.stubGlobal("fetch", fetchMock);

    const annotation = await createOpenCodeTransport().annotate(envelope, "en");

    expect(annotation).toEqual({
      what: "Reads the architecture",
      why: "Checks the intended structure",
      generalLesson: "Review design before implementation",
      confidence: 0.85,
      provider: "cloud",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:4096/session");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ title: "DIT privacy-reviewed annotation" });
    expect(fetchMock.mock.calls[1][0]).toBe("http://127.0.0.1:4096/session/ses_test/message");
    const messageBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as Record<string, unknown>;
    expect(messageBody).toMatchObject({
      agent: "dit-annotator",
      model: { providerID: "opencode", modelID: "deepseek-v4-flash-free" },
    });
    expect(messageBody.parts).toEqual([{ type: "text", text: envelope.sanitizedText }]);
    expect(messageBody.tools).toMatchObject({ bash: false, read: false, write: false, websearch: false });
    expect(fetchMock.mock.calls[2]).toEqual([
      "http://127.0.0.1:4096/session/ses_test",
      { method: "DELETE" },
    ]);
  });

  it("surfaces a readable OpenCode response error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("server unavailable", { status: 503 })));

    await expect(createOpenCodeTransport().annotate(envelope, "en"))
      .rejects.toThrow("Cannot create OpenCode session: HTTP 503: server unavailable");
  });

  it("replaces an opaque browser fetch failure with loopback and CORS guidance", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")));

    await expect(createOpenCodeTransport().annotate(envelope, "en"))
      .rejects.toThrow("Cannot reach OpenCode at http://127.0.0.1:4096. Start the loopback server and allow this page origin in OpenCode CORS settings.");
  });
});
