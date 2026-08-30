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

  /**
   * 2026-08-27. Measured on the local Codex corpus: 2 rollouts open with
   * `<scheduled-task name="…" file="…">`, and it survived to the session list as a title — the
   * author reported it as 「一些 `<>` 的東西」. TWO separate reasons, both fixed here:
   * the tag was not on the whitelist, AND the matcher required the opening tag to be exactly
   * `<tag>`, so no attributed tag could ever match.
   */
  describe("attributed injection tags (2026-08-27)", () => {
    it("strips a whitelisted tag that carries attributes", () => {
      const text = '<scheduled-task name="prism-r35-continue" file="C:\\tasks\\p.md">\nrun it\n</scheduled-task>\n接下來請幫我改這段';
      expect(stripInjectedPreamble(text)).toBe("接下來請幫我改這段");
    });

    it("still strips the same tag with no attributes", () => {
      expect(stripInjectedPreamble("<scheduled-task>\nnotice\n</scheduled-task>\nreal text")).toBe("real text");
    });

    it("leaves a NON-whitelisted attributed tag alone — the whitelist did not get wider", () => {
      // The relaxation is about attributes on known tags, not about admitting unknown ones.
      // A user pasting their own XML must still get it back untouched (R7.5-INV-3).
      const text = '<div class="note">mine</div>\ntrailing';
      expect(stripInjectedPreamble(text)).toBe(text);
    });

    it("does not treat a tag as whitelisted just because it starts with a whitelisted name", () => {
      // `<scheduled-task-runner>` is a different tag; matching it would be the classic
      // prefix-match error this project has already been bitten by in the classifier.
      const text = "<scheduled-task-runner>x</scheduled-task-runner>\ntrailing";
      expect(stripInjectedPreamble(text)).toBe(text);
    });
  });
});
