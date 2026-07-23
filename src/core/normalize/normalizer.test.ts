import { describe, expect, it } from "vitest";
import { normalize } from "./normalizer";
import type { ParseResult, RawEvent } from "@/core/adapters/types";

function parsed(events: RawEvent[], meta: ParseResult["meta"] = {}): ParseResult {
  return { meta, events, warnings: [] };
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
});
