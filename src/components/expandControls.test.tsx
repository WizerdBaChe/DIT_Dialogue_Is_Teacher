// @vitest-environment jsdom
/**
 * 展開控制的鍵盤等價性 (2026-09 UX 走查 F2)。
 *
 * 這是一道**類別閘**，不是三個一次性檢查：規則講的是「閱讀頁裡每一個把內容展開／收合的
 * 控制」，所以測試先把那一類元素全部撈出來，再逐一驗，新增一種展開控制而忘了它就會掉在
 * 這裡。走查當時只列舉到六個頭（thinking ×2、io ×4），那是示範 session 可視範圍的產物，
 * 不是這一類的全集——群組頭有同樣的缺陷，因此也在這裡受檢。
 *
 * 證據等級（verification ladder）：
 *  - rung 1（對這個類別窮舉）：每一個展開控制都是原生 <button type="button">、帶
 *    aria-expanded 且該值跟著收合狀態翻轉、aria-controls 指得到它開的那塊內容。
 *  - 已知為真的正對照：同一個判準套在「改掉之前那種 div onClick 頭」上必須**失敗**。
 *    沒有這一條，一個永遠通過的檢查看起來跟一個沒有在量的檢查一模一樣。
 *  - Enter／Space 實際啟動是**原生 button 的平台契約**，而 jsdom 不實作鍵盤啟動
 *    （已實測：對 <button> 送 keydown Enter／Space 產生 0 次 click）。所以這裡驗的是
 *    「它是不是那個平台會替你處理的元素」，真正按鍵留在人工驗收 A2。這也正是修法選
 *    原生 button 而不是自製 keydown 的原因：自製的那份沒有這個契約可以引用。
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { Span, SpanGroup } from "@/types/spanTree";
import type { SpanNode } from "@/core/view/viewModel";
import { IOBlock, ThinkingBlock } from "./parts";
import { GroupCard } from "./GroupCard";

afterEach(cleanup);

/** 「這是一個展開控制」的唯一判準，測試與被測程式共用同一組 class 名。 */
const EXPAND_CONTROL_SELECTOR = ".thinking-head, .io-head, .group-head";

function span(id: string, overrides: Partial<Span> = {}): Span {
  return {
    id,
    parentId: null,
    order: 0,
    type: "tool_use",
    startedAt: null,
    durationMs: null,
    summary: `summary ${id}`,
    text: `text ${id}`,
    tags: [],
    ...overrides,
  } as Span;
}

const GROUP: SpanGroup = { id: "g1", label: "npm test", spanIds: ["s1"], kind: "retry" };
const GROUP_NODES: SpanNode[] = [{ span: span("s1"), children: [] }];

/** 三個生產者各出一個控制；集合起來就是這一類在閱讀頁裡的全部形狀。 */
const PRODUCERS: Array<{ name: string; render: () => void }> = [
  { name: "ThinkingBlock", render: () => void render(<ThinkingBlock text={"reasoning\nlines"} />) },
  { name: "IOBlock", render: () => void render(<IOBlock title="結果" text={"line one\nline two"} />) },
  { name: "GroupCard", render: () => void render(<GroupCard itemId="g1" group={GROUP} nodes={GROUP_NODES} />) },
];

describe("expand controls are reachable without a mouse (F2)", () => {
  for (const producer of PRODUCERS) {
    it(`${producer.name} renders its head as a native button that owns its expanded state`, () => {
      producer.render();
      const controls = [...document.querySelectorAll(EXPAND_CONTROL_SELECTOR)];
      expect(controls.length).toBeGreaterThan(0);

      for (const control of controls) {
        // 原生 button：Tab 可達與 Enter／Space 啟動由平台提供，不是這裡自己實作的。
        expect(control.tagName).toBe("BUTTON");
        expect(control.getAttribute("type")).toBe("button");
        // 一顆會送出表單的按鈕在對話框裡是另一種缺陷，所以 type 也一併釘住。
        const controlledId = control.getAttribute("aria-controls");
        expect(controlledId).toBeTruthy();
        expect(document.getElementById(controlledId as string)).not.toBeNull();
      }
    });

    it(`${producer.name} flips aria-expanded when its head is activated`, () => {
      producer.render();
      const control = document.querySelector(EXPAND_CONTROL_SELECTOR) as HTMLButtonElement;
      const before = control.getAttribute("aria-expanded");
      expect(before).toMatch(/^(true|false)$/);
      fireEvent.click(control);
      expect(control.getAttribute("aria-expanded")).toBe(before === "true" ? "false" : "true");
    });
  }

  /**
   * 正對照：走查記錄的舊形狀（`div onClick`，無 tabIndex、無 aria-expanded）。判準必須
   * 判它不合格——否則上面那些通過只證明了判準很寬鬆，沒有證明缺陷不在了。
   */
  it("rejects the div-onClick head this finding was about (known-true positive)", () => {
    const { container } = render(
      <div className="thinking">
        <div className="thinking-head">思考鏈 ▾</div>
        <div className="thinking-body">text</div>
      </div>,
    );
    const control = container.querySelector(EXPAND_CONTROL_SELECTOR) as HTMLElement;
    expect(control).not.toBeNull();
    expect(control.tagName).not.toBe("BUTTON");
    expect(control.getAttribute("aria-expanded")).toBeNull();
  });
});
