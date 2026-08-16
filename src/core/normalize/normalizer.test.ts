import { describe, expect, it } from "vitest";
import { normalize } from "./normalizer";
import type { ParseResult, RawEvent } from "@/core/adapters/types";

function parsed(events: RawEvent[], meta: ParseResult["meta"] = {}): ParseResult {
  return { meta, events, diagnostics: [] };
}

describe("normalize — session title fallback (R7B-03, B4.6)", () => {
  it("keeps the adapter-supplied title when present", () => {
    const doc = normalize(parsed(
      [{ kind: "user_text", text: "hello there", raw: {} }],
      { title: "Explicit title" },
    ));
    expect(doc.session.title).toBe("Explicit title");
  });

  it("derives a title from the first user_text event's first non-empty line", () => {
    const doc = normalize(parsed([
      { kind: "user_text", text: "  Fix the login bug  \nsome more context", raw: {} },
    ]));
    expect(doc.session.title).toBe("Fix the login bug");
  });

  it("normalizes internal whitespace/newlines within the first line", () => {
    const doc = normalize(parsed([
      { kind: "user_text", text: "Please   fix\tthe    thing", raw: {} },
    ]));
    expect(doc.session.title).toBe("Please fix the thing");
  });

  it("truncates to 48 characters with an ellipsis", () => {
    const longLine = "A".repeat(60);
    const doc = normalize(parsed([{ kind: "user_text", text: longLine, raw: {} }]));
    expect(doc.session.title).toBe(`${"A".repeat(48)}…`);
  });

  it("strips a synthetic '#'-headed attachment block and its indented/list continuation", () => {
    const text = [
      "# Files mentioned by the user",
      "  - src/App.tsx",
      "  - src/index.ts",
      "Actually just review the auth flow",
    ].join("\n");
    const doc = normalize(parsed([{ kind: "user_text", text, raw: {} }]));
    expect(doc.session.title).toBe("Actually just review the auth flow");
  });

  it("falls back to the existing placeholder when no user_text event has any text", () => {
    const doc = normalize(parsed([{ kind: "assistant_text", text: "hi", raw: {} }]));
    expect(doc.session.title).toBe("未命名 session");
  });

  it("falls back to the placeholder when the first user_text is entirely header/blank noise", () => {
    const text = ["# Files mentioned by the user", "  - a.ts", "  - b.ts"].join("\n");
    const doc = normalize(parsed([{ kind: "user_text", text, raw: {} }]));
    expect(doc.session.title).toBe("未命名 session");
  });

  it("strips a Codex-style <tag>...</tag> preamble even when its closing tag runs into the next header on the same line (R7B-05 real-sample finding)", () => {
    const text = [
      "<recommended_plugins>",
      "Here is a list of plugins that are available but not installed.",
      "",
      "- GitHub (github@openai-curated-remote)",
      "- Slack (slack@openai-curated-remote)",
      "</recommended_plugins># AGENTS.md instructions",
      "",
      "<INSTRUCTIONS>",
      "some imported project instructions",
      "</INSTRUCTIONS>",
      "Please fix the flaky login test",
    ].join("\n");
    const doc = normalize(parsed([{ kind: "user_text", text, raw: {} }]));
    expect(doc.session.title).toBe("Please fix the flaky login test");
  });
});

describe("normalize — synthetic marker", () => {
  it("marks adapter-narrated system events so verbatim outputs can drop them", () => {
    const doc = normalize(parsed([
      { kind: "user_text", text: "fix it", raw: {} },
      { kind: "unknown", text: "此回合被中斷（原因：使用者取消）", raw: {} },
      { kind: "assistant_text", text: "done", raw: {} },
    ]));

    /*
     * 這條斷言在 R9.2（逐字稿匯出）寫成時是 `assistant_msg`，因為當時 `unknown` 就對映到那裡。
     * R9.1（RC-D）之後 `unknown` 有了自己的 `marker` 型別——兩輪各自在自己的分支上綠燈，
     * 合併時才碰頭。以較晚且刻意的 R9.1 決定為準：標記卡不該偽裝成模型發言。
     * 逐字稿的排除規則看的是 `synthetic` 而不是型別（transcript.ts `isOutOfScope`），
     * 所以匯出行為不因此改變——這也是為什麼只有斷言要改，程式不用改。
     */
    expect(doc.spans[1].type).toBe("marker");
    expect(doc.spans[1].synthetic).toBe(true);
  });

  it("leaves real model and user output unmarked", () => {
    const doc = normalize(parsed([
      { kind: "user_text", text: "fix it", raw: {} },
      { kind: "thinking", text: "hmm", raw: {} },
      { kind: "assistant_text", text: "done", raw: {} },
    ]));
    expect(doc.spans.every((span) => span.synthetic === undefined)).toBe(true);
  });
});

describe("normalize — tool_use with no resolvable name (R11.2 R2)", () => {
  it("renders an explicit placeholder, never a raw identifier, when toolName is missing", () => {
    const doc = normalize(parsed([
      { kind: "tool_use", toolInput: { raw: "…" }, raw: {} },
    ]));
    expect(doc.spans[0].summary).toBe("未命名操作");
    expect(doc.spans[0].tool?.name).toBe("未命名操作");
  });

  it("uses the same placeholder for the title (summary) and the tool badge (span.tool.name)", () => {
    const doc = normalize(parsed([
      { kind: "tool_use", raw: {} },
    ]));
    expect(doc.spans[0].summary).toBe(doc.spans[0].tool?.name);
  });

  it("still shows a real tool name normally", () => {
    const doc = normalize(parsed([
      { kind: "tool_use", toolName: "shell_command", toolInput: {}, raw: {} },
    ]));
    expect(doc.spans[0].summary).toBe("shell_command");
    expect(doc.spans[0].tool?.name).toBe("shell_command");
  });
});
