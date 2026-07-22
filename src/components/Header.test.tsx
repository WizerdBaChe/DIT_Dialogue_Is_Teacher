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
  it("keeps the provider select out of the header row and moves it into the settings tray", () => {
    const { container } = render(<Header />);

    const header = container.querySelector("header.header");
    expect(header).not.toBeNull();
    expect(header?.querySelector("#hdr-provider")).toBeNull();
    expect(document.querySelector("#hdr-provider")).toBeNull();

    const settingsToggle = container.querySelector(".settings-toggle-btn") as HTMLButtonElement;
    fireEvent.click(settingsToggle);

    const tray = document.querySelector("#settings-tray");
    expect(tray).not.toBeNull();
    expect(tray?.querySelector("#hdr-provider")).not.toBeNull();
    expect(header?.querySelector("#hdr-provider")).toBeNull();
  });

  it("keeps workspace tabs directly in the header, not inside the settings tray", () => {
    const { container } = render(<Header />);
    const header = container.querySelector("header.header");
    expect(header?.querySelector(".workspace-tabs")).not.toBeNull();
  });
});
