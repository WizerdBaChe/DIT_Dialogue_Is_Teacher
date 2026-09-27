// @vitest-environment jsdom
/**
 * 總覽導讀三句話的兩道閘 (2026-09 UX 走查 F1、F3)。
 *
 * 兩者都是**資產的性質**，不是「改這個檔時記得…」的提醒：
 *  - F1：導讀句不得用方位詞指路。側欄在 390px 整個消失，方位詞只在其中一個寬度成立。
 *  - F3：第 3 步承諾的「展開 why」必須跟講解來源的狀態一致。承諾一個不存在的控制，
 *        使用者會把「沒設定講解」讀成「壞了」。
 *
 * 證據等級：兩道都是 rung 1（對有限域窮舉）——F1 窮舉兩個語系 × 全部導讀句，F3 窮舉
 * `provider` 表的全部 ProviderId × 兩個語系。列舉一律**從表推導**，不手抄；手抄的清單
 * 會在新增一個 provider 或一句導讀時安靜地漏掉它。每道閘各帶一個已知為真的正對照。
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { ProviderId } from "@/types/spanTree";
import { LOCALE_ORDER, MESSAGES, type Locale } from "@/i18n";
import { useSessionStore } from "@/store/sessionStore";
import { OverviewView } from "./OverviewView";

afterEach(() => {
  cleanup();
  useSessionStore.getState().resetToSample();
});

/** 從字典自己的 provider 表推導全集，而不是抄一份 union 的成員。 */
const ALL_PROVIDERS = Object.keys(MESSAGES["zh-TW"].provider) as ProviderId[];

/**
 * 方位詞。中文兩個、英文以詞界比對——`left`／`right` 當單字才算指路，
 * 不然 "already"、"bright" 這種會誤報，而一個會誤報的閘遲早被關掉。
 */
const POSITION_WORDS = /左側|右側|左邊|右邊|\bleft\b|\bright\b/i;

/** 導讀句 = 總覽上那段引導文字的全部，同樣從字典結構推導。 */
function guidanceStrings(locale: Locale): Array<[string, string]> {
  const { overview } = MESSAGES[locale];
  return [
    [`${locale} overview.purpose`, overview.purpose],
    [`${locale} overview.steps.confirmTitle`, overview.steps.confirmTitle],
    [`${locale} overview.steps.readTitle`, overview.steps.readTitle],
    [`${locale} overview.steps.readBody`, overview.steps.readBody],
    [`${locale} overview.steps.extendTitle`, overview.steps.extendTitle],
    [`${locale} overview.steps.extendBody(true)`, overview.steps.extendBody(true)],
    [`${locale} overview.steps.extendBody(false)`, overview.steps.extendBody(false)],
  ];
}

describe("guidance copy never points at a screen edge (F1)", () => {
  for (const locale of LOCALE_ORDER) {
    it(`${locale}: no guidance sentence names a side of the screen`, () => {
      for (const [key, text] of guidanceStrings(locale)) {
        expect(POSITION_WORDS.test(text), `${key} still points at a screen edge: ${text}`).toBe(false);
      }
    });
  }

  /** 正對照：走查記錄下來的原句必須被這個判準抓到，否則它只是通過，不是在量。 */
  it("flags the exact sentences the walkthrough reported (known-true positive)", () => {
    expect(POSITION_WORDS.test("先確認任務，再沿左側結構逐步閱讀。")).toBe(true);
    expect(POSITION_WORDS.test("左側顯示目前位置；可逐項跳轉或按逐步瀏覽。")).toBe(true);
    expect(POSITION_WORDS.test("then read through the structure on the left.")).toBe(true);
  });

  /**
   * 負對照：只是**含有**那幾個字母的字不得被誤判，不然這道閘會把正確的字也擋掉。
   * 注意 "left over"（兩個字）該被抓，"leftover"（一個字）不該——詞界就是這條線。
   */
  it("does not flag wording that merely contains those letters", () => {
    expect(POSITION_WORDS.test("leftover 的 brightly lit 說明")).toBe(false);
    expect(POSITION_WORDS.test("copyright 與 alright")).toBe(false);
  });
});

describe("step 3 promises a why only when a notes source can produce one (F3 / ruling R3)", () => {
  for (const locale of LOCALE_ORDER) {
    it(`${locale}: the no-source sentence differs and says how to get a why`, () => {
      const { extendBody } = MESSAGES[locale].overview.steps;
      expect(extendBody(false)).not.toBe(extendBody(true));
      // 沒有來源時，句子要指向「去設定」，不是宣告 why 已經在那裡。
      expect(extendBody(false)).toMatch(locale === "zh-TW" ? /設定講解來源/ : /Set a notes source/);
    });
  }

  it.each(ALL_PROVIDERS)("renders the state-matched sentence for providerId %s", (providerId) => {
    act(() => {
      useSessionStore.setState({ providerId });
    });
    const { container } = render(<OverviewView />);
    const steps = [...container.querySelectorAll(".overview-steps li p")];
    const stepThree = steps[steps.length - 1]?.textContent ?? "";
    const { extendBody } = MESSAGES[useSessionStore.getState().locale].overview.steps;

    expect(stepThree).toBe(extendBody(providerId !== "none"));
    // 「不講解」是預設值，也正是走查撞到的那一格：這裡釘住它拿到的是「先去設定」那一句。
    if (providerId === "none") expect(stepThree).toBe(extendBody(false));
    else expect(stepThree).toBe(extendBody(true));
  });

  it("covers every provider the dictionary knows about, so a new one cannot slip past", () => {
    // 全集從表推導的另一面：表長大了，上面那組案例也跟著長大。
    expect(ALL_PROVIDERS).toContain("none");
    expect(ALL_PROVIDERS.length).toBeGreaterThan(1);
    for (const locale of LOCALE_ORDER) {
      expect(Object.keys(MESSAGES[locale].provider)).toEqual(ALL_PROVIDERS);
    }
  });
});
