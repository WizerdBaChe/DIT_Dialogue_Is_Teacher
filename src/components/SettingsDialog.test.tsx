// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { SettingsDialog } from "./SettingsDialog";
import { useSessionStore } from "@/store/sessionStore";

afterEach(() => {
  cleanup();
  useSessionStore.getState().resetToSample();
});

function openDialog() {
  act(() => {
    useSessionStore.getState().openSettings();
  });
}

describe("SettingsDialog (R7 settings-dialog redesign)", () => {
  it("renders nothing in the document body until settingsOpen is true", () => {
    render(<SettingsDialog />);
    expect(document.querySelector("#settings-dialog-title")).toBeNull();
  });

  it("renders the five settings groups as vertical panel-group sections, in order", () => {
    render(<SettingsDialog />);
    openDialog();
    const groups = Array.from(document.querySelectorAll(".settings-panel-group"));
    const legends = groups.map((el) => el.querySelector("legend")?.textContent);
    // ExportControls renders its own .settings-panel-group (not double-wrapped), so it's last here.
    expect(legends).toEqual(["Session", "教學講解", "語言", "導航", "匯出"]);
  });

  it("shows the language name only once — as the card legend, not also as a visible label (R7.5 W4/AN-4)", () => {
    render(<SettingsDialog />);
    openDialog();
    const groups = Array.from(document.querySelectorAll(".settings-panel-group"));
    const languageGroup = groups.find((el) => el.querySelector("legend")?.textContent === "語言");
    expect(languageGroup).toBeDefined();
    expect(languageGroup?.querySelector("label")).toBeNull();
    const select = languageGroup?.querySelector("#hdr-locale");
    expect(select?.getAttribute("aria-label")).toBeTruthy();
  });

  it("keeps the provider label and select as adjacent children of the same rows grid", () => {
    render(<SettingsDialog />);
    openDialog();
    const rowsGrid = document.querySelector(".settings-actions.rows");
    expect(rowsGrid).not.toBeNull();
    const children = Array.from(rowsGrid?.children ?? []);
    const labelIndex = children.findIndex((el) => el.getAttribute("for") === "hdr-provider");
    const selectIndex = children.findIndex((el) => el.id === "hdr-provider");
    expect(labelIndex).toBeGreaterThanOrEqual(0);
    expect(selectIndex).toBe(labelIndex + 1);
  });

  it("shows option-hint text under the three non-obvious controls only", () => {
    render(<SettingsDialog />);
    openDialog();
    const hints = Array.from(document.querySelectorAll(".option-hint")).map((el) => el.textContent);
    expect(hints).toHaveLength(3);
    expect(hints.some((text) => text?.includes("未處理"))).toBe(true);
    expect(hints.some((text) => text?.includes("重新呼叫"))).toBe(true);
    expect(hints.some((text) => text?.includes("M"))).toBe(true);
  });

  it("closes on Escape (dialog cancel) and clears settingsOpen", () => {
    render(<SettingsDialog />);
    openDialog();
    const dialog = document.querySelector("#settings-dialog") as HTMLDialogElement;
    act(() => {
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(useSessionStore.getState().settingsOpen).toBe(false);
  });

  it("closes on a backdrop click (target is the dialog element itself), not on clicks inside the shell", () => {
    render(<SettingsDialog />);
    openDialog();
    const dialog = document.querySelector("#settings-dialog") as HTMLDialogElement;
    const shell = document.querySelector(".settings-dialog-shell") as HTMLDivElement;
    expect(shell).not.toBeNull();

    fireEvent.click(shell);
    expect(useSessionStore.getState().settingsOpen).toBe(true);

    fireEvent.click(dialog);
    expect(useSessionStore.getState().settingsOpen).toBe(false);
  });
});
