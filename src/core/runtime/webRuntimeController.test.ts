import { describe, expect, it, vi } from "vitest";
import { WEB_RUNTIME_START_COMMANDS, WebRuntimeController } from "./webRuntimeController";

describe("WebRuntimeController", () => {
  it("refreshes status only through the configured loopback probe", async () => {
    const probe = vi.fn()
      .mockResolvedValueOnce({ service: "ollama", state: "offline", message: "offline" })
      .mockResolvedValueOnce({ service: "ollama", state: "ready", message: "ready" });
    const controller = new WebRuntimeController({ ollama: probe });

    await expect(controller.status("ollama")).resolves.toMatchObject({ state: "offline" });
    await expect(controller.status("ollama")).resolves.toMatchObject({ state: "ready" });
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("exposes copyable fixed commands without process capabilities", () => {
    const controller = new WebRuntimeController();

    expect(controller.capabilities("ollama")).toEqual({
      canStart: false,
      canStopOwned: false,
      canCopyStartCommand: true,
    });
    expect(controller.startCommand("ollama")).toBe(WEB_RUNTIME_START_COMMANDS.ollama);
    expect(controller.startCommand("opencode")).toBe(WEB_RUNTIME_START_COMMANDS.opencode);
  });

  it("returns structured unsupported errors for start and owned stop", async () => {
    const controller = new WebRuntimeController();

    await expect(controller.start("ollama")).rejects.toMatchObject({
      name: "RuntimeControlError",
      code: "RUNTIME_START_UNSUPPORTED",
      service: "ollama",
    });
    await expect(controller.stopOwned("opencode")).rejects.toMatchObject({
      name: "RuntimeControlError",
      code: "RUNTIME_STOP_UNSUPPORTED",
      service: "opencode",
    });
  });

  it("reports unknown when no probe is configured", async () => {
    await expect(new WebRuntimeController().status("opencode")).resolves.toEqual({
      service: "opencode",
      state: "unknown",
      message: "No opencode status probe is configured.",
    });
  });
});
