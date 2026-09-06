// @vitest-environment jsdom
/**
 * 兩則「畫面有沒有把話說出口」的元件層檢查 (2026-09 UX 走查 F7、F8)。
 *
 * 兩個發現同一個形狀：狀態自己是對的，但畫面沒說，或說了一句對不上那個狀態的話。所以這裡
 * 驗的不是 store 的欄位（那在 store 層的測試裡），而是**使用者讀得到的那行字**。
 *
 * 證據等級：rung 0（情境）。F7 附上它的已知為真正對照——同一個入口在有選擇器的瀏覽器裡
 * 必須仍然說「等待你選擇資料夾…」，否則這道檢查只是把一句話換成另一句話。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useSessionStore } from "@/store/sessionStore";
import { MESSAGES } from "@/i18n";
import { SessionBrowserDialog } from "./SessionBrowserDialog";
import { SessionLoadStatus } from "./SessionLoadStatus";

const t = MESSAGES["zh-TW"];

// jsdom 沒有這兩個方法（連屬性都不存在，所以 vi.spyOn 會直接拒絕），只能整個補上——
// 與 blockingSurfaces.test.tsx 同一套做法。
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
});

afterEach(() => {
  cleanup();
  act(() => {
    useSessionStore.setState({
      browseState: "closed",
      sessionLoadProgress: null,
      sessionLoadNotice: null,
      welcomeOpen: false,
      settingsOpen: false,
      privacyReview: null,
      mapOpen: false,
      structureDrawerOpen: false,
      error: null,
      diagnostics: [],
      parseNoticeAcknowledged: true,
    });
  });
});

function browserAt(browseState: "picking" | "fallback"): string {
  act(() => {
    useSessionStore.setState({
      browseState,
      welcomeOpen: false,
      error: null,
      diagnostics: [],
      parseNoticeAcknowledged: true,
      privacyReview: null,
    });
  });
  render(<SessionBrowserDialog />);
  return document.querySelector("#session-browser-dialog")?.textContent ?? "";
}

describe("the folder dialog only claims to be waiting when something is (F7)", () => {
  it("tells the user to press the button when this browser has no directory picker", () => {
    const text = browserAt("fallback");
    expect(text).toContain(t.browser.fallbackPrompt);
    // 「等待你選擇資料夾…」在這條路徑上是假的：沒有選擇器被打開，沒有東西在等。
    expect(text).not.toContain(t.browser.picking);
    // 而它指名的那顆按鈕必須真的在畫面上，否則這句話換成另一種空頭承諾。
    expect(text).toContain(t.browser.pick);
  });

  /** 正對照：真的開著選擇器的那個狀態，仍然要說「等待」——不然這只是把文案改掉而已。 */
  it("still says it is waiting while a real picker is open", () => {
    const text = browserAt("picking");
    expect(text).toContain(t.browser.picking);
    expect(text).not.toContain(t.browser.fallbackPrompt);
  });
});

describe("cancelling a load leaves something on screen (F8)", () => {
  it("renders nothing when there is neither progress nor a notice", () => {
    const { container } = render(<SessionLoadStatus />);
    expect(container.firstChild).toBeNull();
  });

  it("announces the cancellation and that the document survived", () => {
    act(() => {
      useSessionStore.setState({ sessionLoadProgress: null, sessionLoadNotice: "cancelled" });
    });
    const { container } = render(<SessionLoadStatus />);

    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent).toContain(t.sessionLoad.cancelled);
    /*
     * 一顆關掉它的鈕，而不是一則自己不會走的訊息；而且**只有**那一顆——沒有進度可報時還留著
     * 取消鈕，等於邀請使用者取消一件已經停掉的事。
     *
     * 用按鈕本身斷言，不用字串比對：「已取消載入」本來就包含「取消載入」，拿文字比對會永遠
     * 失敗，而那是斷言寫錯，不是畫面錯。
     */
    const buttons = [...(status?.querySelectorAll("button") ?? [])].map((b) => b.textContent);
    expect(buttons).toEqual([t.sessionLoad.dismiss]);
  });

  it("keeps showing progress, not the notice, while a load is actually running", () => {
    act(() => {
      useSessionStore.setState({
        sessionLoadProgress: { phase: "parsing", loadedBytes: 10, totalBytes: 100, lineCount: 4, sourcePath: null },
        sessionLoadNotice: null,
      });
    });
    const { container } = render(<SessionLoadStatus />);
    expect(container.textContent).toContain(t.sessionLoad.previousPreserved);
    expect(container.textContent).not.toContain(t.sessionLoad.cancelled);
  });
});
