import { describe, expect, it } from "vitest";
import { applyFindings, createRedactionState, isPlaceholder, resolveOverlaps, type AppliedFinding } from "./apply";
import { PrivacyError, type PrivacyAction, type SensitiveKind } from "./contracts";

function finding(
  kind: SensitiveKind,
  start: number,
  end: number,
  action: PrivacyAction,
  confidence = 0.9,
): AppliedFinding {
  return { id: `${kind}:${start}`, detectorId: "test", kind, start, end, confidence, suggestedAction: action, action };
}

describe("resolveOverlaps — 密鑰優先於其他類別", () => {
  /**
   * 迴歸案例：`postgres://admin:PASSWORD@host` 會同時被密鑰規則 (只命中密碼) 與 email 規則
   * (命中 `PASSWORD@host`) 命中。外傳政策把密鑰判成 block 所以它自然贏；匯出政策為了不擋住
   * 檔案而降成 replace，若排序只看 action 就會打平，改由「範圍較長者勝」讓 email 吃掉主機名。
   */
  it("動作相同時仍由密鑰勝出，不讓範圍較長的非密鑰吃掉它", () => {
    const secret = finding("secret", 17, 25, "replace", 0.95);
    const email = finding("email", 17, 34, "replace", 0.98);

    expect(resolveOverlaps([email, secret])).toEqual([secret]);
  });

  it("密鑰被判成 block 時同樣勝出（外傳流程的既有行為不變）", () => {
    const secret = finding("secret", 17, 25, "block", 0.95);
    const email = finding("email", 17, 34, "replace", 0.98);

    expect(resolveOverlaps([email, secret])).toEqual([secret]);
  });

  it("級別不同就不算無法裁決，不拋 ambiguous", () => {
    const secret = finding("secret", 10, 20, "replace", 0.9);
    const email = finding("email", 15, 25, "replace", 0.9);

    expect(() => resolveOverlaps([secret, email])).not.toThrow();
    expect(resolveOverlaps([secret, email])).toEqual([secret]);
  });

  it("同級別、同動作、同信心又互不包含時仍拋錯要求人工處理", () => {
    const left = finding("email", 10, 20, "replace", 0.9);
    const right = finding("phone", 15, 25, "replace", 0.9);

    expect(() => resolveOverlaps([left, right])).toThrow(PrivacyError);
  });

  it("不重疊的 findings 全數保留，並依位置排序", () => {
    const a = finding("email", 30, 40, "replace");
    const b = finding("phone", 0, 10, "replace");

    expect(resolveOverlaps([a, b]).map((f) => f.start)).toEqual([0, 30]);
  });
});

describe("applyFindings — 佔位符編號", () => {
  it("編號依閱讀順序遞增，替換仍由後往前所以 offset 不被推移", () => {
    const input = "a@x.com 與 b@y.com";
    const findings = [finding("email", 0, 7, "replace"), finding("email", 10, 17, "replace")];

    expect(applyFindings(input, findings).text).toBe("<EMAIL_1> 與 <EMAIL_2>");
  });

  it("findings 傳入順序顛倒也不影響編號——編號看位置，不看傳入順序", () => {
    const input = "a@x.com 與 b@y.com";
    const findings = [finding("email", 10, 17, "replace"), finding("email", 0, 7, "replace")];

    expect(applyFindings(input, findings).text).toBe("<EMAIL_1> 與 <EMAIL_2>");
  });

  it("同一個值對到同一個佔位符", () => {
    const input = "a@x.com 與 a@x.com";
    const findings = [finding("email", 0, 7, "replace"), finding("email", 10, 17, "replace")];

    expect(applyFindings(input, findings).text).toBe("<EMAIL_1> 與 <EMAIL_1>");
  });

  it("共用 state 時，跨多次呼叫的編號才會連續且一致", () => {
    const state = createRedactionState();
    const first = applyFindings("a@x.com", [finding("email", 0, 7, "replace")], state);
    const second = applyFindings("b@y.com", [finding("email", 0, 7, "replace")], state);
    const third = applyFindings("a@x.com", [finding("email", 0, 7, "replace")], state);

    expect([first.text, second.text, third.text]).toEqual(["<EMAIL_1>", "<EMAIL_2>", "<EMAIL_1>"]);
  });

  it("不共用 state 時每次都從 1 開始——這正是文件層級必須傳入 state 的原因", () => {
    expect(applyFindings("b@y.com", [finding("email", 0, 7, "replace")]).text).toBe("<EMAIL_1>");
  });

  it("redact 直接刪除，keep_review 只記統計不動文字", () => {
    expect(applyFindings("keep secret here", [finding("secret", 5, 11, "redact")]).text).toBe("keep  here");

    const kept = applyFindings("keep secret here", [finding("secret", 5, 11, "keep_review")]);
    expect(kept.text).toBe("keep secret here");
    expect(kept.summary.secret).toBe(1);
  });
});

describe("isPlaceholder", () => {
  it("認得自己產生的佔位符，包含多字底線的類別名", () => {
    expect(isPlaceholder("<SECRET_1>")).toBe(true);
    expect(isPlaceholder("<IP_ADDRESS_12>")).toBe(true);
    expect(isPlaceholder("<USER_PATH_3>")).toBe(true);
  });

  it("不把一般文字誤認成佔位符", () => {
    expect(isPlaceholder("hunter2secret")).toBe(false);
    expect(isPlaceholder("<not a placeholder>")).toBe(false);
    expect(isPlaceholder("<SECRET>")).toBe(false);
    expect(isPlaceholder("prefix<SECRET_1>")).toBe(false);
  });
});
