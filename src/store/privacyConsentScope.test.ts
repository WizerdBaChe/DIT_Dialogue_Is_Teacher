// @vitest-environment jsdom
/**
 * R11 (S-03) — 「同一個 scope 只需同意一次」。
 *
 * 這個行為在 2026-08-15 之前從來沒有生效過：核准端自己重組一份 scope 字串，格式和
 * `privacyReviewer(scope)` 產生的那份不一樣（少了 provider 前綴），兩者永遠不相等，於是
 * 每一則講解都重新彈出隱私複核。這裡用一個假的 `annotateWithPrivacy` 把 reviewer 叫出來，
 * 釘住核准之後第二次講解不會再要求複核，而且同意紀錄裡存的就是發起時的那一份 scope。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrivacyConsent, PrivacyInspection } from "@/core/privacy/contracts";

const reviewerCalls: string[] = [];
const consentsSeen: Array<PrivacyConsent | null> = [];

vi.mock("@/adapters/dit/privacyAdapter", () => ({
  annotateWithPrivacy: async (
    _span: unknown,
    _context: unknown,
    options: { reviewer: (inspection: PrivacyInspection) => Promise<PrivacyConsent | null> },
  ) => {
    reviewerCalls.push("called");
    const consent = await options.reviewer({
      findings: [{ id: "f1", detectorId: "secret", kind: "secret", start: 0, end: 4, confidence: 0.99 }],
      redactedPreview: "<SECRET_1>",
    } as unknown as PrivacyInspection);
    consentsSeen.push(consent);
    return { what: "w", why: "y", generalLesson: "g", confidence: 0.5 };
  },
}));

const { useSessionStore } = await import("./sessionStore");

beforeEach(() => {
  reviewerCalls.length = 0;
  consentsSeen.length = 0;
  useSessionStore.getState().resetToSample();
  useSessionStore.setState({ providerId: "cloud" });
});

afterEach(() => {
  useSessionStore.getState().resetToSample();
});

describe("privacy consent scope (R11 S-03)", () => {
  it("approving once stops the next annotation from asking again", async () => {
    const items = useSessionStore.getState().viewItems;
    expect(items.length).toBeGreaterThan(1);

    const first = useSessionStore.getState().annotateItem(items[0].id);
    await vi.waitFor(() => expect(useSessionStore.getState().privacyReview).not.toBeNull());
    useSessionStore.getState().approvePrivacyReview();
    await first;

    // 第二則：同一個 session、同一個 provider、同一份設定 —— scope 相同，不該再問一次。
    const second = useSessionStore.getState().annotateItem(items[1].id);
    await second;

    expect(useSessionStore.getState().privacyReview).toBeNull();
    expect(consentsSeen).toHaveLength(2);
    expect(consentsSeen[1]?.consentId).toBe(consentsSeen[0]?.consentId);
  });
});
