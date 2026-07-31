import { describe, expect, it } from "vitest";
import { secretDetector, directIdentifierDetector } from "./detectors";

describe("secretDetector offsets", () => {
  it("locates the captured value, not an earlier occurrence of the same text", async () => {
    // Assembled from fragments so the literal never appears in the source: a
    // real-looking credential in a test file trips secret scanners.
    const input = "pass" + "word:pass" + "word";

    const [finding] = await secretDetector.detect(input, {});

    expect(finding).toBeDefined();
    // indexOf-based location returned 0 here (the label), so a caller masking
    // by these offsets kept the label and shipped the secret.
    expect(finding.start).toBe(9);
    expect(input.slice(finding.start, finding.end)).toBe("password");
  });

  it("isolates the password inside a connection string", async () => {
    const input = "postgres://appuser:hunter2secret@db.internal:5432/app";

    const [finding] = await secretDetector.detect(input, {});

    expect(input.slice(finding.start, finding.end)).toBe("hunter2secret");
  });

  it("reports whole-match rules at the match position", async () => {
    const key = `sk-${"A".repeat(32)}`;
    const input = `token is ${key} — keep it out of logs`;

    const [finding] = await secretDetector.detect(input, {});

    expect(input.slice(finding.start, finding.end)).toBe(key);
  });

  it("returns the same findings when the same input is scanned twice", async () => {
    const input = `ghp_${"a".repeat(24)} and xoxb-${"1".repeat(22)}`;

    const first = await secretDetector.detect(input, {});
    const second = await secretDetector.detect(input, {});

    expect(second).toEqual(first);
    expect(first).toHaveLength(2);
  });
});

describe("directIdentifierDetector offsets", () => {
  it("covers only the account name inside a home path", async () => {
    const input = "see C:\\Users\\nathan\\Documents and /home/nathan/.config";

    const findings = await directIdentifierDetector.detect(input, {});
    const paths = findings.filter((f) => f.kind === "user_path");

    expect(paths).toHaveLength(2);
    for (const finding of paths) {
      expect(input.slice(finding.start, finding.end)).toBe("nathan");
    }
  });
});
