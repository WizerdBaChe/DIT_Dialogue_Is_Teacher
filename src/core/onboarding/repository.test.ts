import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { readOnboardingCompleted, writeOnboardingCompleted } from "./repository";

describe("onboarding repository", () => {
  it("reports not completed before any write", async () => {
    await expect(readOnboardingCompleted()).resolves.toBe(false);
  });

  it("reports completed after writeOnboardingCompleted", async () => {
    await writeOnboardingCompleted();
    await expect(readOnboardingCompleted()).resolves.toBe(true);
  });
});
