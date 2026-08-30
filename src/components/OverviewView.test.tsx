// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { OverviewView } from "./OverviewView";
import { useSessionStore } from "@/store/sessionStore";
import type { Diagnostic } from "@/core/diagnostics/contracts";

afterEach(() => {
  cleanup();
  useSessionStore.getState().resetToSample();
});

function setDiagnostics(diagnostics: Diagnostic[]) {
  act(() => {
    useSessionStore.setState({ diagnostics });
  });
}

const INFO: Diagnostic = { tier: "info", code: "CODEX_EVENT_UNPAIRED", detail: "exec_command_end", count: 3 };
const WARN: Diagnostic = { tier: "warn", code: "UNKNOWN_RECORD_TYPE", detail: "mystery", count: 1 };

describe("OverviewView info-tier diagnostics summary (R11.2 R3)", () => {
  it("renders nothing about the info summary when there are no info-tier diagnostics", () => {
    setDiagnostics([]);
    render(<OverviewView />);
    expect(document.querySelector(".overview-info-summary")).toBeNull();
  });

  it("stays absent when only warn-tier diagnostics are present (that count already has its own surface)", () => {
    setDiagnostics([WARN]);
    render(<OverviewView />);
    expect(document.querySelector(".overview-info-summary")).toBeNull();
  });

  it("renders a collapsed, on-demand disclosure when info-tier diagnostics are present", () => {
    setDiagnostics([INFO]);
    render(<OverviewView />);

    const toggle = document.querySelector(".overview-info-summary-toggle") as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".overview-info-summary-list")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const list = document.querySelector(".overview-info-summary-list");
    expect(list).not.toBeNull();
    // Honesty rule (P-001): state the capability limit, never a specific cause, never an
    // implied fix, never an ID relation between exec-* and call_* namespaces.
    expect(list?.textContent).toContain("exec_command_end");
    expect(list?.textContent).not.toMatch(/一定是|保證是|即將修復|will be fixed/);

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".overview-info-summary-list")).toBeNull();
  });

  it("never re-merges info into the existing noticeable() count in the step-1 summary", () => {
    setDiagnostics([INFO]);
    render(<OverviewView />);
    const summary = document.querySelector(".overview-steps li p")?.textContent ?? "";
    // noticeable() excludes info, so the existing "N 則解析提示" count must stay 0 here —
    // the new disclosure is an addition, not a rewrite of that count's meaning.
    // Anchored to the count's own phrase: a bare /0/ also matches the step count (10, 20, …)
    // and would stay green even if info leaked into warningCount.
    expect(summary).toMatch(/0 則解析提示/);
  });
});
