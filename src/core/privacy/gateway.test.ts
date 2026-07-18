import { describe, expect, it } from "vitest";
import { LocalPrivacyGateway, PrivacyError } from "./index";

describe("LocalPrivacyGateway", () => {
  it("replaces repeated identifiers consistently and authorizes only the sanitized envelope", async () => {
    const gateway = new LocalPrivacyGateway();
    const inspection = await gateway.inspect(
      "Email jane.doe@example.com twice: jane.doe@example.com. Path C:\\Users\\jane\\repo. Host 10.2.3.4.",
    );

    expect(inspection.sanitizedText).not.toContain("jane.doe@example.com");
    expect(inspection.sanitizedText.match(/<EMAIL_1>/g)).toHaveLength(2);
    expect(inspection.sanitizedText).toContain("C:\\Users\\<USER_PATH_1>\\repo");
    expect(inspection.sanitizedText).toContain("<IP_ADDRESS_1>");
    expect(inspection.summary).toMatchObject({ email: 2, user_path: 1, ip_address: 1 });

    const envelope = await gateway.authorize(inspection.id, { consentId: "consent-session-1" });
    expect(envelope.sanitizedText).toBe(inspection.sanitizedText);
    expect(envelope.consentId).toBe("consent-session-1");
  });

  it.each([
    "api_key = ghp_abcdefghijklmnopqrstuvwxyz123456",
    "password: correct-horse-battery-staple",
    "Authorization eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturevalue",
    "-----BEGIN PRIVATE KEY-----\nsecret-material\n-----END PRIVATE KEY-----",
  ])("fails closed for a secret canary without exposing it in the error: %s", async (canary) => {
    const gateway = new LocalPrivacyGateway();
    let error: unknown;
    try {
      await gateway.inspect(`Do not send ${canary}`);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PrivacyError);
    expect((error as PrivacyError).code).toBe("PRIVACY_SECRET_BLOCKED");
    expect((error as Error).message).not.toContain(canary);
  });

  it("requires a live inspection and an explicit consent id", async () => {
    const gateway = new LocalPrivacyGateway();
    const inspection = await gateway.inspect("No identifiers here.");

    await expect(gateway.authorize(inspection.id, { consentId: "" }))
      .rejects.toMatchObject({ code: "PRIVACY_REVIEW_CANCELLED" });
    await expect(gateway.authorize(inspection.id, { consentId: "second-attempt" }))
      .rejects.toMatchObject({ code: "PRIVACY_INSPECTION_EXPIRED" });
  });

  it("uses project terms supplied by the integrating application", async () => {
    const gateway = new LocalPrivacyGateway();
    const inspection = await gateway.inspect("Project Kestrel depends on Kestrel.", { customTerms: ["Kestrel"] });
    expect(inspection.sanitizedText).toBe("Project <PROJECT_TERM_1> depends on <PROJECT_TERM_1>.");
  });
});
