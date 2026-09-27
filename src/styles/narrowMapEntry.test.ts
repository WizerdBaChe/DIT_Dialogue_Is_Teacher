/**
 * 窄版一定要留得下一個地圖入口 (2026-09 UX 走查 F10)。
 *
 * 走查在 390px 量到「開啟 Session 地圖」是 0×0，但沒有核對是否有別的東西承接。核對結果
 * （real Chromium @390，2026-09-07）：小地圖是 `display:none`，浮動的「地圖」鈕 51×44 接手，
 * 可見也可聚焦。所以 F10 不是缺陷——**但它是一個沒有防護的正確**：那兩條規則躺在同一個
 * 響應式區塊裡，靠的是誰都沒去動它。動掉其中一條，閱讀頁在窄版就一個地圖入口也不剩。
 *
 * 因此這裡把它寫成資產的性質，而不是一次量測的紀錄：**任何一個把小地圖藏起來的區塊，都必須
 * 在同一個區塊裡把窄版的地圖鈕放出來。** 這是位置無關的寫法——不釘行號、不釘斷點數值，區塊
 * 搬家或斷點改值都不會誤報，只有「藏了卻沒補」才會掉。
 *
 * 證據等級：rung 1（對樣式表裡全部隱藏小地圖的區塊窮舉），附一個已知為真的正對照與一個
 * 負對照——一個永遠通過的樣式檢查跟一個沒有在檢查的樣式檢查，從輸出上看一模一樣。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * 從磁碟讀，不用 `import css from "./index.css?raw"`：在這套 Vitest 設定底下，`?raw` 對 CSS
 * 回傳的是**空字串**（對 .tsx 才正常，見 OverviewView.test.ts）。空字串會讓下面每一條斷言
 * 都無害地通過——這正是那條「先證明這把尺量得到東西」的校準案存在的理由，它當場就抓到了。
 */
const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");

const HIDES_MINIMAP = /\.reader-minimap\s*\{[^}]*display:\s*none/;
const REVEALS_NARROW_LAUNCHER = /\.map-launcher-narrow-only\s*\{[^}]*display:\s*(?!none)[a-z-]+/;

/** 取出每個 at-rule（@media / @container）的區塊內容，用括號配對而不是貪婪比對。 */
export function atRuleBlocks(source: string): Array<{ prelude: string; body: string }> {
  const blocks: Array<{ prelude: string; body: string }> = [];
  const starts = [...source.matchAll(/@(?:media|container)[^{]*\{/g)];
  for (const match of starts) {
    const openIndex = match.index! + match[0].length - 1;
    let depth = 0;
    let end = openIndex;
    for (let i = openIndex; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    blocks.push({ prelude: match[0].slice(0, -1).trim(), body: source.slice(openIndex + 1, end) });
  }
  return blocks;
}

/** 判準本身，抽出來是為了能用已知輸入校準它。回傳「違規區塊的 prelude」清單。 */
export function blocksHidingTheMapEntry(source: string): string[] {
  return atRuleBlocks(source)
    .filter((block) => HIDES_MINIMAP.test(block.body) && !REVEALS_NARROW_LAUNCHER.test(block.body))
    .map((block) => block.prelude);
}

describe("a narrow reader always keeps one map entry (F10)", () => {
  it("finds the responsive blocks at all, so a passing result means something", () => {
    // 先證明這把尺量得到東西：找不到任何區塊時，下面那條會空手通過。
    expect(atRuleBlocks(css).length).toBeGreaterThan(0);
    expect(css).toMatch(HIDES_MINIMAP);
    expect(css).toMatch(REVEALS_NARROW_LAUNCHER);
  });

  it("never hides the minimap without revealing the narrow-only map button", () => {
    expect(blocksHidingTheMapEntry(css)).toEqual([]);
  });

  /** 已知為真的正對照：把補償那行拿掉，判準必須抓到。 */
  it("flags a block that hides the minimap and leaves nothing behind (known-true positive)", () => {
    const broken = `
      @container dit-app (max-width: 719px) {
        .map-launcher { right: 12px; }
        .reader-minimap { display: none; }
      }
    `;
    expect(blocksHidingTheMapEntry(broken)).toEqual(["@container dit-app (max-width: 719px)"]);
  });

  /** 負對照：補償有寫的區塊不得被誤判，不然這道閘會擋掉正確的樣式。 */
  it("does not flag a block that hides the minimap and reveals the button", () => {
    const fine = `
      @container dit-app (max-width: 719px) {
        .map-launcher-narrow-only { display: inline-flex; }
        .reader-minimap { display: none; }
      }
    `;
    expect(blocksHidingTheMapEntry(fine)).toEqual([]);
  });

  /** 「補償」寫成 display:none 不算補償——藏兩個仍然是零個入口。 */
  it("does not accept a narrow-only button that is itself hidden", () => {
    const stillBroken = `
      @container dit-app (max-width: 719px) {
        .map-launcher-narrow-only { display: none; }
        .reader-minimap { display: none; }
      }
    `;
    expect(blocksHidingTheMapEntry(stillBroken)).toHaveLength(1);
  });
});
