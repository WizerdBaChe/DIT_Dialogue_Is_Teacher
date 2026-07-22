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

describe("Settings tray group layout (R7A-01, R7-INV-1)", () => {
  it("tags every settings-group with its content-driven g-* class", () => {
    const { container } = render(<Header />);
    fireEvent.click(container.querySelector(".settings-toggle-btn") as HTMLButtonElement);

    const groups = Array.from(document.querySelectorAll(".settings-group"));
    const groupClasses = groups.map((el) => Array.from(el.classList).find((c) => c.startsWith("g-")));
    expect(groupClasses).toEqual(["g-session", "g-teaching", "g-language", "g-navigation", "g-export"]);
  });
});
