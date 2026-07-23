import { describe, expect, it, vi } from "vitest";
import { detectRuntimeOS, getRuntimeStartCommand, WebRuntimeController } from "./webRuntimeController";

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
    expect(controller.startCommand("ollama")).toBe(getRuntimeStartCommand("ollama"));
    expect(controller.startCommand("opencode")).toBe(getRuntimeStartCommand("opencode"));
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

describe("detectRuntimeOS", () => {
  it("detects Windows from platform", () => {
    expect(detectRuntimeOS({ platform: "Win32", userAgent: "" })).toBe("windows");
  });

  it("detects Windows from userAgent when platform is unavailable", () => {
    expect(detectRuntimeOS({ platform: "", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" })).toBe("windows");
  });

  it("treats macOS as posix", () => {
    expect(detectRuntimeOS({ platform: "MacIntel", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" })).toBe("posix");
  });

  it("treats Linux as posix", () => {
    expect(detectRuntimeOS({ platform: "Linux x86_64", userAgent: "Mozilla/5.0 (X11; Linux x86_64)" })).toBe("posix");
  });

  it("falls back to posix when neither hint is available (e.g. no navigator in this context)", () => {
    expect(detectRuntimeOS({ platform: "", userAgent: "" })).toBe("posix");
  });
});

describe("getRuntimeStartCommand", () => {
  it("gives the Windows opencode command the .cmd launcher and PowerShell ollama syntax", () => {
    expect(getRuntimeStartCommand("opencode", "windows")).toMatch(/^opencode\.cmd serve /);
    expect(getRuntimeStartCommand("ollama", "windows")).toBe('$env:OLLAMA_ORIGINS="*"; ollama serve');
  });

  it("drops .cmd and uses posix shell syntax on macOS/Linux", () => {
    expect(getRuntimeStartCommand("opencode", "posix")).toMatch(/^opencode serve /);
    expect(getRuntimeStartCommand("opencode", "posix")).not.toContain(".cmd");
    expect(getRuntimeStartCommand("ollama", "posix")).toBe('OLLAMA_ORIGINS="*" ollama serve');
  });

  it("keeps the same CORS/port arguments across both OS variants", () => {
    const windows = getRuntimeStartCommand("opencode", "windows").replace("opencode.cmd", "opencode");
    const posix = getRuntimeStartCommand("opencode", "posix");
    expect(windows).toBe(posix);
  });
});
