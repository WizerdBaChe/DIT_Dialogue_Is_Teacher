/**
 * The derived-title cleanliness gate (author ruling 2026-08-27: 「只要確認名稱不髒就可以擴」).
 *
 * Every REJECT case below is a string that actually appears in the local corpora — taken from
 * `node scripts/measure-corpus.mjs titles`, not invented. Two of them are the author's own words
 * in the R11.2 B1 verdict (「甚至出現 1.混用 還有一些 <> 的東西」), which is the whole reason this
 * gate exists.
 *
 * Deliberately two-sided: a predicate that rejected everything would "fix" the dirty titles by
 * sending every session to its filename, and would score perfectly on a one-sided suite.
 */
import { describe, expect, it } from "vitest";
import { isUsableTitle } from "./titleQuality";

describe("isUsableTitle · rejects what the corpus showed is not a title", () => {
  it.each([
    ['<scheduled-task name="prism-r35-continue" file="C:\\Users\\gunda\\...">', "an injected wrapper the whitelist did not recognise"],
    ["1. 混用", "the author's own example: a list marker plus two characters"],
    ["ok", "an acknowledgement, not a description"],
    ["權限L2", "three word characters"],
    ["```", "a fence with nothing in it"],
    ["/doctor", "a slash command is an order to the machine, not a description"],
    ["", "empty"],
    ["   \n  ", "whitespace only"],
  ])("rejects %j — %s", (text) => {
    expect(isUsableTitle(text)).toBe(false);
  });

  it("rejects null and undefined without throwing", () => {
    expect(isUsableTitle(null)).toBe(false);
    expect(isUsableTitle(undefined)).toBe(false);
  });
});

describe("isUsableTitle · keeps real titles", () => {
  it.each([
    ["幫我看一下這個 bug 為什麼只在 Windows 上發生", "a real request"],
    ["Fix the flaky test in sessionLoader", "English prose"],
    ["把 R11.2 的驗收卡合併進 R12", "CJK prose with numbers"],
    ["改用 filter", "short but four word characters — the threshold's edge, kept"],
    ["修 bug 的地方", "short CJK"],
    ["A/B test the new layout", "a slash INSIDE the text is not a command prefix"],
    ["用 <div> 包起來會怎樣", "a tag inside the text is fine; only a leading one is rejected"],
  ])("keeps %j — %s", (text) => {
    expect(isUsableTitle(text)).toBe(true);
  });

  it("judges on the FIRST line only, because that is all the list shows", () => {
    // A good opening line followed by a pasted stack trace is still a good title.
    expect(isUsableTitle("重構載入路徑\n\n<error>\n  at foo\n</error>")).toBe(true);
    // ...and a bad opening line is not rescued by good text further down.
    expect(isUsableTitle("ok\n\n然後幫我把這段重構掉，順便補測試")).toBe(false);
  });
});

describe("isUsableTitle · the threshold's direction is deliberate", () => {
  it("keeps a title the moment it reaches four word characters", () => {
    // The rung below is usually the filename — a `rollout-…` hash for Codex. Rejecting a short
    // but real title costs the user more than letting a marginal one through, so the bias is
    // fixed in that direction, matching this project's rule everywhere else.
    expect(isUsableTitle("abc")).toBe(false);
    expect(isUsableTitle("abcd")).toBe(true);
    expect(isUsableTitle("一二三")).toBe(false);
    expect(isUsableTitle("一二三四")).toBe(true);
  });

  it("does not count digits or punctuation toward the threshold", () => {
    // `1. 混用` is 6 characters and 2 of them are words. Counting length instead of word
    // characters is what would let it through.
    expect(isUsableTitle("1234567890")).toBe(false);
    expect(isUsableTitle("!!!...???")).toBe(false);
  });
});
