// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Header } from "./Header";
import { useSessionStore } from "@/store/sessionStore";

afterEach(() => {
  cleanup();
  useSessionStore.getState().resetToSample();
});

describe("Header layout (LS-03, D-R65-02)", () => {
  it("keeps the provider select out of the header row (it lives in the settings dialog now)", () => {
    const { container } = render(<Header />);
    const header = container.querySelector("header.header");
    expect(header).not.toBeNull();
    expect(header?.querySelector("#hdr-provider")).toBeNull();
  });

  it("keeps workspace tabs directly in the header, not inside any settings surface", () => {
    const { container } = render(<Header />);
    const header = container.querySelector("header.header");
    expect(header?.querySelector(".workspace-tabs")).not.toBeNull();
  });
});

describe("Settings dialog trigger (R7 settings-dialog redesign)", () => {
  it("toggles the store's settingsOpen flag instead of rendering an inline tray", () => {
    const { container } = render(<Header />);
    const toggle = container.querySelector(".settings-toggle-btn") as HTMLButtonElement;

    expect(useSessionStore.getState().settingsOpen).toBe(false);
    fireEvent.click(toggle);
    expect(useSessionStore.getState().settingsOpen).toBe(true);
    fireEvent.click(toggle);
    expect(useSessionStore.getState().settingsOpen).toBe(false);
  });
});
