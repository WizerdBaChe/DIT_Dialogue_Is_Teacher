import { afterEach, describe, expect, it, vi } from "vitest";
import type { Span } from "@/types/spanTree";
import { LocalPrivacyGateway } from "@/core/privacy";
import { createOpenCodeTransport } from "@/core/llm/cloud";
import { annotateOpenCodeWithPrivacy } from "./privacyAdapter";

const span: Span = {
  id: "span-1",
  parentId: null,
  order: 1,
  type: "assistant_msg",
  startedAt: null,
  durationMs: null,
  summary: "Contact jane@example.com about Project Kestrel",
  text: "Contact jane@example.com about Project Kestrel",
  tags: [],
  raw: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("annotateOpenCodeWithPrivacy", () => {
  it("does not call the transport when the user cancels the privacy preview", async () => {
    const annotate = vi.fn();
    await expect(annotateOpenCodeWithPrivacy(span, { sessionTitle: "Project Kestrel", locale: "en" }, {
      gateway: new LocalPrivacyGateway(),
      transport: { annotate },
      reviewer: async () => null,
    })).rejects.toMatchObject({ code: "PRIVACY_REVIEW_CANCELLED" });
    expect(annotate).not.toHaveBeenCalled();
  });

  it("sends only the authorized sanitized envelope to the transport", async () => {
    const annotate = vi.fn().mockResolvedValue({
      what: "Explains an action",
      why: "Provides context",
      generalLesson: "Review before acting",
      confidence: 0.8,
      provider: "cloud",
    });
    let preview = "";
    await annotateOpenCodeWithPrivacy(span, { sessionTitle: "Project Kestrel", locale: "en" }, {
      gateway: new LocalPrivacyGateway(),
      transport: { annotate },
      reviewer: async (inspection) => {
        preview = inspection.sanitizedText;
        return { consentId: "consent-session" };
      },
    });

    expect(preview).not.toContain("jane@example.com");
    expect(preview).not.toContain("Project Kestrel");
    expect(annotate).toHaveBeenCalledTimes(1);
    const sent = annotate.mock.calls[0][0];
    expect(sent.sanitizedText).toBe(preview);
    expect(JSON.stringify(sent)).not.toContain("jane@example.com");
  });

  it("blocks a secret before either review or transport", async () => {
    const reviewer = vi.fn();
    const annotate = vi.fn();
    const secretSpan = { ...span, text: "api_key=ghp_abcdefghijklmnopqrstuvwxyz123456" };
    await expect(annotateOpenCodeWithPrivacy(secretSpan, { sessionTitle: "Safe title", locale: "en" }, {
      gateway: new LocalPrivacyGateway(),
      transport: { annotate },
      reviewer,
    })).rejects.toMatchObject({ code: "PRIVACY_SECRET_BLOCKED" });
    expect(reviewer).not.toHaveBeenCalled();
    expect(annotate).not.toHaveBeenCalled();
  });

  it("keeps raw identifiers out of every OpenCode request body", async () => {
    const rawEmail = "jane@example.com";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "ses_private" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        parts: [{ type: "text", text: '{"what":"Safe","why":"Reviewed","generalLesson":"Minimize data","confidence":0.9}' }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(true), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await annotateOpenCodeWithPrivacy(span, { sessionTitle: "Project Kestrel", locale: "en" }, {
      gateway: new LocalPrivacyGateway(),
      transport: createOpenCodeTransport(),
      reviewer: async () => ({ consentId: "consent-e2e" }),
    });

    const requestBodies = fetchMock.mock.calls
      .map((call) => call[1]?.body)
      .filter(Boolean)
      .join("\n");
    expect(requestBodies).not.toContain(rawEmail);
    expect(requestBodies).not.toContain("Project Kestrel");
    expect(requestBodies).toContain("<EMAIL_1>");
  });
});
