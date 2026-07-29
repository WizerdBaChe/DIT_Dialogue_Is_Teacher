/**
 * 定義表的完整性 (R9.1 RC-G)。
 *
 * 與 `diagnosticCopy.test.ts` 同一個形狀、同一個理由：新增一種分類卻忘了寫定義，
 * 應該在這裡被抓到，而不是在使用者面前退化成「一個沒有解釋的名詞」——那正是作者
 * 回報的狀況。三段式缺一段也算沒解釋，因此三段都檢查。
 */
import { describe, expect, it } from "vitest";
import { CATEGORY_ORDER, isSkeletonNodeKind } from "./categoryDefinitions";
import { SKELETON_NODE_KIND_ORDER, SKELETON_RIB_KIND_ORDER } from "./sessionMap";
import { LOCALE_ORDER, MESSAGES } from "@/i18n/locales";

describe("category definitions are complete in every locale", () => {
  it.each(LOCALE_ORDER)("%s defines every category, with all three parts", (locale) => {
    const table = MESSAGES[locale].categoryDefinition;
    for (const key of CATEGORY_ORDER) {
      const definition = table[key];
      expect(definition, `missing definition for ${key}`).toBeDefined();
      expect(definition.what.length, `${key}.what is empty`).toBeGreaterThan(0);
      expect(definition.rule.length, `${key}.rule is empty`).toBeGreaterThan(0);
      expect(definition.example.length, `${key}.example is empty`).toBeGreaterThan(0);
    }
  });

  it("covers exactly the skeleton kinds that actually exist — no orphans, no gaps", () => {
    expect([...CATEGORY_ORDER].sort()).toEqual(
      [...SKELETON_NODE_KIND_ORDER, ...SKELETON_RIB_KIND_ORDER].sort(),
    );
  });

  it("classifies each key as a spine node or a rib, never both", () => {
    for (const key of CATEGORY_ORDER) {
      const asNode = isSkeletonNodeKind(key);
      expect(asNode).toBe((SKELETON_NODE_KIND_ORDER as string[]).includes(key));
      expect(asNode).not.toBe((SKELETON_RIB_KIND_ORDER as string[]).includes(key));
    }
  });
});
