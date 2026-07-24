// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { WelcomeDialog } from "./WelcomeDialog";
import { useSessionStore } from "@/store/sessionStore";

afterEach(() => {
  cleanup();
  useSessionStore.setState({ welcomeOpen: false, settingsOpen: false, providerId: "none", snapshotMode: false });
});

describe("WelcomeDialog (first-run language + provider picker)", () => {
  it("renders nothing until welcomeOpen is true", () => {
    render(<WelcomeDialog />);
    expect(document.querySelector("#welcome-dialog-title")).toBeNull();
  });

  it("opens when welcomeOpen is set", () => {
    render(<WelcomeDialog />);
    act(() => useSessionStore.setState({ welcomeOpen: true }));
    expect(document.querySelector("#welcome-dialog-title")).not.toBeNull();
  });

  it("never opens in snapshot mode", () => {
    render(<WelcomeDialog />);
    act(() => useSessionStore.setState({ welcomeOpen: true, snapshotMode: true }));
    expect(document.querySelector("#welcome-dialog-title")).toBeNull();
  });

  it("only shows common provider chips until 更多選項 is toggled", () => {
    render(<WelcomeDialog />);
    act(() => useSessionStore.setState({ welcomeOpen: true }));
    const chips = () => Array.from(document.querySelectorAll(".welcome-provider-chip")).map((el) => el.textContent);
    expect(chips()).toEqual(["不講解", "Ollama", "LM Studio", "Anthropic"]);

    fireEvent.click(document.querySelector(".welcome-more-toggle")!);
    expect(chips()).toEqual(["不講解", "Ollama", "LM Studio", "Anthropic", "Jan", "本地代理", "OpenRouter", "Groq", "自訂端點"]);
  });

  it("clicking a provider chip applies it live via setProvider", () => {
    render(<WelcomeDialog />);
    act(() => useSessionStore.setState({ welcomeOpen: true }));
    const ollamaChip = Array.from(document.querySelectorAll(".welcome-provider-chip")).find((el) => el.textContent === "Ollama");
    fireEvent.click(ollamaChip!);
    expect(useSessionStore.getState().providerId).toBe("ollama");
  });

  it("skip closes the dialog and persists onboarding-completed without opening Settings", () => {
    render(<WelcomeDialog />);
    act(() => useSessionStore.setState({ welcomeOpen: true, providerId: "ollama" }));
    const skipButton = Array.from(document.querySelectorAll("button")).find((btn) => btn.textContent === "先略過，我自己看看");
    fireEvent.click(skipButton!);
    expect(useSessionStore.getState().welcomeOpen).toBe(false);
    expect(useSessionStore.getState().settingsOpen).toBe(false);
  });

  it("start opens Settings when a non-none provider was chosen, to finish connection details", () => {
    render(<WelcomeDialog />);
    act(() => useSessionStore.setState({ welcomeOpen: true, providerId: "ollama" }));
    const startButton = Array.from(document.querySelectorAll("button")).find((btn) => btn.textContent === "開始使用");
    fireEvent.click(startButton!);
    expect(useSessionStore.getState().welcomeOpen).toBe(false);
    expect(useSessionStore.getState().settingsOpen).toBe(true);
  });

  it("start does not force-open Settings when provider is left as 不設定", () => {
    render(<WelcomeDialog />);
    act(() => useSessionStore.setState({ welcomeOpen: true, providerId: "none" }));
    const startButton = Array.from(document.querySelectorAll("button")).find((btn) => btn.textContent === "開始使用");
    fireEvent.click(startButton!);
    expect(useSessionStore.getState().settingsOpen).toBe(false);
  });
});
