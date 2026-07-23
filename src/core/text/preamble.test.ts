import { describe, expect, it } from "vitest";
import { stripInjectedPreamble } from "./preamble";

describe("stripInjectedPreamble — whitelist-based source-injected preamble strip (R7.5-INV-1/INV-3)", () => {
  it("strips a whitelisted tag's preamble block", () => {
    const text = "<recommended_plugins>\nGitHub\nSlack\n</recommended_plugins>\nFix the login bug";
    expect(stripInjectedPreamble(text)).toBe("Fix the login bug");
  });

  it("leaves a non-whitelisted <tag>...</tag> block untouched (INV-3 — user-pasted XML/HTML)", () => {
    const text = "<foo>\nsome user-authored content\n</foo>\nplease review this";
    expect(stripInjectedPreamble(text)).toBe(text);
  });

  it("strips preamble and keeps only the real text when both are present", () => {
    const text = [
      "<recommended_plugins>",
      "Here is a list of plugins that are available but not installed.",
      "</recommended_plugins># AGENTS.md instructions",
      "",
      "<INSTRUCTIONS>",
      "some imported project instructions",
      "</INSTRUCTIONS>",
      "Please fix the flaky login test",
    ].join("\n");
    expect(stripInjectedPreamble(text)).toBe("Please fix the flaky login test");
  });

  it("strips Claude Code's <command-name>/<system-reminder> style injections", () => {
    const text = "<command-name>/compact</command-name>\n<command-message>Compacted</command-message>\nactual follow-up question";
    expect(stripInjectedPreamble(text)).toBe("actual follow-up question");
  });

  it("returns an empty string when the whole message is injected preamble", () => {
    const text = "<system-reminder>\nbackground task notice\n</system-reminder>";
    expect(stripInjectedPreamble(text)).toBe("");
  });
});
