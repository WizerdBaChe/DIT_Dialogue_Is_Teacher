import { describe, expect, it } from "vitest";
import { secretDetector, directIdentifierDetector, highEntropyDetector, DEFAULT_PRIVACY_DETECTORS } from "./detectors";

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

describe("highEntropyDetector — M7 / D-006", () => {
  it("catches an unprefixed git commit SHA (the B3 UAT example) as high entropy", async () => {
    const input = "git push origin 453e23b0eb4543510ea1c668406de99e804891fd:main";

    const findings = await highEntropyDetector.detect(input, {});

    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("high_entropy");
    expect(input.slice(findings[0].start, findings[0].end)).toBe("453e23b0eb4543510ea1c668406de99e804891fd");
    // 這是刻意不預先裁定的部分（R11-Q1）：commit SHA 目前一律被抓到，不做排除。
  });

  it("catches a session UUID", async () => {
    const input = "see session 78b30412-5044-4304-aaef-ef72af956864 for details";

    const findings = await highEntropyDetector.detect(input, {});

    expect(findings.some((f) => input.slice(f.start, f.end) === "78b30412-5044-4304-aaef-ef72af956864")).toBe(true);
  });

  it("catches a long unprefixed random token", async () => {
    const input = "the value was Xk29pQmZ7vRtLh4NcW1sYbEoU8dGjF3q written down somewhere";

    const findings = await highEntropyDetector.detect(input, {});

    expect(findings.some((f) => input.slice(f.start, f.end) === "Xk29pQmZ7vRtLh4NcW1sYbEoU8dGjF3q")).toBe(true);
  });

  it("does not flag an ordinary kebab-case identifier or branch name", async () => {
    const input = "on branch feat/scientific-research-guide-domain-sync, run code-review-deep-checklist";

    const findings = await highEntropyDetector.detect(input, {});

    expect(findings).toHaveLength(0);
  });

  it("does not flag ordinary camelCase code identifiers", async () => {
    const input = "avoid dangerouslySetInnerHTML and prefer buildSessionDocumentFromFiles instead";

    const findings = await highEntropyDetector.detect(input, {});

    expect(findings).toHaveLength(0);
  });

  it("does not flag a degenerate repeated hex-looking run", async () => {
    const input = `padding: ${"a".repeat(40)}`;

    const findings = await highEntropyDetector.detect(input, {});

    expect(findings).toHaveLength(0);
  });

  it("carries confidence strictly below every prefixed rule (lowest existing is phone at 0.88)", async () => {
    const input = "Xk29pQmZ7vRtLh4NcW1sYbEoU8dGjF3q";

    const findings = await highEntropyDetector.detect(input, {});

    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) expect(finding.confidence).toBeLessThan(0.88);
  });

  it("is not part of the default detector set — it ships opt-in only (D-006)", () => {
    expect(DEFAULT_PRIVACY_DETECTORS).not.toContain(highEntropyDetector);
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
