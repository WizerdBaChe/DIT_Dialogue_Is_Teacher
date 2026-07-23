// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { ParseNoticeDialog } from "./ParseNoticeDialog";
import { useSessionStore } from "@/store/sessionStore";

afterEach(() => {
  cleanup();
  useSessionStore.getState().resetToSample();
});

function setWarnings(warnings: string[]) {
  act(() => {
    useSessionStore.setState({ warnings, parseNoticeAcknowledged: warnings.length === 0 });
  });
}

describe("ParseNoticeDialog (forced, plain-language parse-fallback notice)", () => {
  it("renders nothing when there are no warnings", () => {
    render(<ParseNoticeDialog />);
    expect(document.querySelector("#parse-notice-dialog-title")).toBeNull();
  });

  it("opens automatically once a session publishes with warnings", () => {
    render(<ParseNoticeDialog />);
    setWarnings(["web_search_end 找不到對應的 web__run 呼叫，已降級為獨立事件。"]);
    expect(document.querySelector("#parse-notice-dialog-title")).not.toBeNull();
  });

  it("does not close on Escape (cancel event) — only the confirm button may dismiss it", () => {
    render(<ParseNoticeDialog />);
    setWarnings(["web_search_end 找不到對應的 web__run 呼叫，已降級為獨立事件。"]);
    const dialog = document.querySelector("#parse-notice-dialog") as HTMLDialogElement;
    act(() => {
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(useSessionStore.getState().parseNoticeAcknowledged).toBe(false);
    expect(document.querySelector("#parse-notice-dialog-title")).not.toBeNull();
  });

  it("closes and marks acknowledged when the confirm button is clicked", () => {
    render(<ParseNoticeDialog />);
    setWarnings(["web_search_end 找不到對應的 web__run 呼叫，已降級為獨立事件。"]);
    const confirmButton = Array.from(document.querySelectorAll("button")).find((btn) => btn.textContent === "我知道了，繼續閱讀");
    expect(confirmButton).toBeDefined();
    fireEvent.click(confirmButton!);
    expect(useSessionStore.getState().parseNoticeAcknowledged).toBe(true);
    expect(document.querySelector("#parse-notice-dialog-title")).toBeNull();
  });

  it("keeps the raw technical warning text collapsed behind a details toggle by default", () => {
    const rawWarning = "web_search_end 找不到對應的 web__run 呼叫，已降級為獨立事件。";
    render(<ParseNoticeDialog />);
    setWarnings([rawWarning]);
    expect(document.querySelector(".parse-notice-details")).toBeNull();

    const toggle = document.querySelector(".parse-notice-details-toggle") as HTMLButtonElement;
    fireEvent.click(toggle);
    expect(document.querySelector(".parse-notice-details")?.textContent).toContain(rawWarning);

    fireEvent.click(toggle);
    expect(document.querySelector(".parse-notice-details")).toBeNull();
  });
});
