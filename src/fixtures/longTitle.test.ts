/**
 * F6 的 fixture 必須真的能問出 F6 要問的問題 (2026-09 UX 走查)。
 *
 * B2 問的是「兩份同前綴標題在觸控下（沒有 hover、拿不到 `title`）分辨得出來嗎」。這只有在
 * 兩份標題**共用一段夠長的前綴、而且只在尾端不同**時才問得出來——一旦有人把 fixture 改成
 * 兩個一眼就不同的標題，B2 仍然會被勾成通過，卻什麼都沒驗到。所以 fixture 的性質要有守衛，
 * 不然它會安靜地退化成兩份普通的 session。
 *
 * 證據等級：rung 0（這兩份具體檔案的性質）。這不是產品行為的閘，是**驗收器材的校準**。
 */
import { describe, expect, it } from "vitest";
import { longTitleAttemptOne, longTitleAttemptTwo } from "./index";
import { buildSessionDocument } from "@/core/pipeline";

/** 閱讀頁標題列在窄版大約能顯示的字數量級；截斷點落在共用前綴裡，兩份才會長得一樣。 */
const NARROW_VISIBLE_CHARS = 20;

function titleOf(raw: string): string {
  return buildSessionDocument(raw).doc.session.title;
}

function sharedPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

describe("the long-title fixtures stay ambiguous under truncation (F6)", () => {
  const first = titleOf(longTitleAttemptOne);
  const second = titleOf(longTitleAttemptTwo);

  it("parses both fixtures into a real title, not a filename fallback", () => {
    // 先證明這把尺量得到東西：標題若退化成檔名，下面兩條都會量到別的東西。
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });

  it("shares a prefix long enough that a narrow reader heading truncates to the same text", () => {
    const shared = sharedPrefixLength(first, second);
    expect(shared).toBeGreaterThan(NARROW_VISIBLE_CHARS);
    // 截斷後真的一模一樣——這就是 B2 要拿去問作者的那個畫面。
    expect(first.slice(0, NARROW_VISIBLE_CHARS)).toBe(second.slice(0, NARROW_VISIBLE_CHARS));
  });

  it("differs only after that prefix, so the whole title is what disambiguates them", () => {
    const shared = sharedPrefixLength(first, second);
    expect(first.slice(shared)).not.toBe(second.slice(shared));
  });
});
