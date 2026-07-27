// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { ParseNoticeDialog } from "./ParseNoticeDialog";
import { useSessionStore } from "@/store/sessionStore";
import { hasFatal, type Diagnostic } from "@/core/diagnostics/contracts";

afterEach(() => {
  cleanup();
  useSessionStore.getState().resetToSample();
});

function setDiagnostics(diagnostics: Diagnostic[]) {
  act(() => {
    useSessionStore.setState({ diagnostics, error: null, parseNoticeAcknowledged: !hasFatal(diagnostics) });
  });
}

const FATAL: Diagnostic = { tier: "fatal", code: "NO_MAIN_TRANSCRIPT" };
const INFO: Diagnostic = { tier: "info", code: "NOISE_SKIPPED", count: 2 };
const WARN: Diagnostic = { tier: "warn", code: "UNKNOWN_RECORD_TYPE", detail: "mystery", count: 1 };

describe("ParseNoticeDialog (forced, plain-language parse-fallback notice)", () => {
  it("renders nothing when there are no diagnostics", () => {
    render(<ParseNoticeDialog />);
    expect(document.querySelector("#parse-notice-dialog-title")).toBeNull();
  });

  /**
   * R9 RC-3 的直接回歸測試。以前條件是 `warnings.length > 0`，於是一份只含 2 行
   * `stop_hook_summary` 的正常對話也會被強制彈窗攔下來（作者實測 68466cc1）。
   */
  it("REGRESSION: does not open for info/warn diagnostics — only fatal blocks", () => {
    render(<ParseNoticeDialog />);
    setDiagnostics([INFO, INFO, WARN]);
    expect(document.querySelector("#parse-notice-dialog-title")).toBeNull();
    expect(useSessionStore.getState().parseNoticeAcknowledged).toBe(true);
  });

  it("opens automatically once a session publishes a fatal diagnostic", () => {
    render(<ParseNoticeDialog />);
    setDiagnostics([FATAL]);
    expect(document.querySelector("#parse-notice-dialog-title")).not.toBeNull();
  });

  it("opens for a fatal delivered through the load error owner as well", () => {
    render(<ParseNoticeDialog />);
    act(() => {
      useSessionStore.setState({
        diagnostics: [],
        error: { tier: "fatal", code: "MULTIPLE_SESSIONS", detail: "3" },
        parseNoticeAcknowledged: false,
      });
    });
    expect(document.querySelector("#parse-notice-dialog-title")).not.toBeNull();
  });

  it("names both the cause and the next action — a fatal surface with no recovery is a dead end", () => {
    render(<ParseNoticeDialog />);
    setDiagnostics([FATAL]);
    const body = document.querySelector(".parse-notice-body")?.textContent ?? "";
    expect(body).toContain("子代理");
    expect(body).toContain("Session 瀏覽器");
  });

  it("does not close on Escape (cancel event) — only the confirm button may dismiss it", () => {
    render(<ParseNoticeDialog />);
    setDiagnostics([FATAL]);
    const dialog = document.querySelector("#parse-notice-dialog") as HTMLDialogElement;
    act(() => {
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(useSessionStore.getState().parseNoticeAcknowledged).toBe(false);
    expect(document.querySelector("#parse-notice-dialog-title")).not.toBeNull();
  });

  it("closes and marks acknowledged when the confirm button is clicked", () => {
    render(<ParseNoticeDialog />);
    setDiagnostics([FATAL]);
    const confirmButton = Array.from(document.querySelectorAll("button")).find((btn) => btn.textContent === "我知道了，繼續閱讀");
    expect(confirmButton).toBeDefined();
    fireEvent.click(confirmButton!);
    expect(useSessionStore.getState().parseNoticeAcknowledged).toBe(true);
    expect(document.querySelector("#parse-notice-dialog-title")).toBeNull();
  });

  it("keeps the accompanying technical detail collapsed behind a details toggle by default", () => {
    render(<ParseNoticeDialog />);
    setDiagnostics([FATAL, WARN]);
    expect(document.querySelector(".parse-notice-details")).toBeNull();

    const toggle = document.querySelector(".parse-notice-details-toggle") as HTMLButtonElement;
    fireEvent.click(toggle);
    expect(document.querySelector(".parse-notice-details")?.textContent).toContain("mystery");

    fireEvent.click(toggle);
    expect(document.querySelector(".parse-notice-details")).toBeNull();
  });
});
