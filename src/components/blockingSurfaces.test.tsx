// @vitest-environment jsdom
/**
 * DSM-3 的元件層契約。這裡刻意連 `showModal` 是否被呼叫都斷言——Prism 就是在這一點上
 * 出過事：`<dialog open>` 讓守衛永遠為偽，showModal 從未執行，表面悄悄退化成非模態，
 * 而所有 store 層測試依然全綠（F7：有些機器不可能被行程內測試看見）。
 * 佔位、遮蔽、失效這三件事仍然需要真瀏覽器，見 §5 手動驗收。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { ParseNoticeDialog } from "./ParseNoticeDialog";
import { WelcomeDialog } from "./WelcomeDialog";
import { SessionBrowserDialog } from "./SessionBrowserDialog";
import { SettingsDialog } from "./SettingsDialog";
import { useSessionStore } from "@/store/sessionStore";
import { selectSurfaceWants } from "@/store/surfaceSelectors";
import { selectActiveSurface } from "@/core/surface/blockingSurface";
import type { Diagnostic } from "@/core/diagnostics/contracts";

const FATAL: Diagnostic = { tier: "fatal", code: "NO_MAIN_TRANSCRIPT" };

let showModal: ReturnType<typeof vi.fn>;
let close: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // jsdom 沒有實作這兩個方法；補上 spy 才能斷言「真的走了 showModal 這條路」。
  showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
  HTMLDialogElement.prototype.showModal = showModal as unknown as () => void;
  HTMLDialogElement.prototype.close = close as unknown as () => void;
});

afterEach(() => {
  cleanup();
  act(() => {
    useSessionStore.setState({
      diagnostics: [],
      error: null,
      parseNoticeAcknowledged: true,
      welcomeOpen: false,
      settingsOpen: false,
      browseState: "no_directory",
      privacyReview: null,
      mapOpen: false,
      structureDrawerOpen: false,
      snapshotMode: false,
    });
  });
});

function renderAll(): void {
  render(<><ParseNoticeDialog /><WelcomeDialog /><SessionBrowserDialog /><SettingsDialog /></>);
}

function openDialogIds(): string[] {
  return [...document.querySelectorAll("dialog")].filter((d) => d.hasAttribute("open")).map((d) => d.id);
}

describe("blocking surfaces", () => {
  it("opens through showModal(), never through a static open attribute", () => {
    renderAll();
    act(() => { useSessionStore.setState({ welcomeOpen: true }); });

    expect(showModal).toHaveBeenCalled();
    expect(openDialogIds()).toEqual(["welcome-dialog"]);
  });

  /** RC-4 的元件層回歸：首次啟動遇到 fatal，以前兩個彈窗會同時 showModal。 */
  it("REGRESSION: welcome + fatal cannot both be open; the fatal wins and welcome queues", () => {
    renderAll();
    act(() => {
      useSessionStore.setState({ welcomeOpen: true, diagnostics: [FATAL], parseNoticeAcknowledged: false });
    });

    expect(openDialogIds()).toEqual(["parse-notice-dialog"]);
    expect(document.querySelector("#welcome-dialog-title")).toBeNull();
  });

  it("the queued surface takes over the moment the one above it resolves", () => {
    renderAll();
    act(() => {
      useSessionStore.setState({ welcomeOpen: true, diagnostics: [FATAL], parseNoticeAcknowledged: false });
    });
    expect(openDialogIds()).toEqual(["parse-notice-dialog"]);

    act(() => { useSessionStore.getState().acknowledgeParseNotice(); });

    expect(close).toHaveBeenCalled();
    expect(openDialogIds()).toEqual(["welcome-dialog"]);
  });

  it("never opens more than one surface, whatever the combination", () => {
    renderAll();
    act(() => {
      useSessionStore.setState({
        welcomeOpen: true,
        settingsOpen: true,
        browseState: "indexed",
        diagnostics: [FATAL],
        parseNoticeAcknowledged: false,
      });
    });
    expect(openDialogIds()).toHaveLength(1);

    act(() => { useSessionStore.setState({ diagnostics: [], parseNoticeAcknowledged: true }); });
    expect(openDialogIds()).toHaveLength(1);

    act(() => { useSessionStore.setState({ welcomeOpen: false }); });
    expect(openDialogIds()).toEqual(["session-browser-dialog"]);
  });

  it("an action-only surface ignores Escape; an escapable one resolves to cancel", () => {
    renderAll();
    act(() => { useSessionStore.setState({ diagnostics: [FATAL], parseNoticeAcknowledged: false }); });
    act(() => {
      document.querySelector("#parse-notice-dialog")!.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(useSessionStore.getState().parseNoticeAcknowledged).toBe(false);
    expect(openDialogIds()).toEqual(["parse-notice-dialog"]);

    act(() => { useSessionStore.setState({ diagnostics: [], parseNoticeAcknowledged: true, browseState: "indexed" }); });
    act(() => {
      document.querySelector("#session-browser-dialog")!.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(useSessionStore.getState().browseState).toBe("no_directory");
  });

  it("the arbiter and the store agree on who wants to be open", () => {
    act(() => { useSessionStore.setState({ browseState: "indexing", settingsOpen: true }); });
    const wants = selectSurfaceWants(useSessionStore.getState());
    expect(wants["session-browser"]).toBe(true);
    expect(wants.settings).toBe(true);
    expect(selectActiveSurface(wants)).toBe("session-browser");
  });

  it("snapshot mode keeps the welcome surface out of the arbitration entirely", () => {
    act(() => { useSessionStore.setState({ welcomeOpen: true, snapshotMode: true }); });
    expect(selectSurfaceWants(useSessionStore.getState()).welcome).toBe(false);
  });
});
