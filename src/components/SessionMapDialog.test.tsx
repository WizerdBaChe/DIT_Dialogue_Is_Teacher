// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { SessionMapDialog } from "./SessionMapDialog";
import { useSessionStore } from "@/store/sessionStore";

afterEach(() => {
  cleanup();
  useSessionStore.getState().resetToSample();
});

describe("SessionMapDialog open/close sync with jsdom's stub HTMLDialogElement", () => {
  it("opens then closes via the mapOpen store flag without throwing, invoking closeMap on close", () => {
    useSessionStore.getState().resetToSample();
    render(<SessionMapDialog />);

    act(() => {
      useSessionStore.getState().openMap();
    });
    expect(useSessionStore.getState().mapOpen).toBe(true);

    const closeButton = document.querySelector(".map-close") as HTMLButtonElement;
    expect(closeButton).not.toBeNull();

    expect(() => fireEvent.click(closeButton)).not.toThrow();
    expect(useSessionStore.getState().mapOpen).toBe(false);
  });

  it("closes on a backdrop click (target is the dialog element itself), not on clicks inside the shell", () => {
    useSessionStore.getState().resetToSample();
    render(<SessionMapDialog />);

    act(() => {
      useSessionStore.getState().openMap();
    });

    const dialog = document.querySelector("#session-map-dialog") as HTMLDialogElement;
    const shell = document.querySelector(".session-map-shell") as HTMLDivElement;
    expect(shell).not.toBeNull();

    fireEvent.click(shell);
    expect(useSessionStore.getState().mapOpen).toBe(true);

    fireEvent.click(dialog);
    expect(useSessionStore.getState().mapOpen).toBe(false);
  });
});
