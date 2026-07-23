import {
  RuntimeControlError,
  type RuntimeCapabilities,
  type RuntimeController,
  type RuntimeService,
  type RuntimeStartResult,
  type RuntimeStatus,
} from "./contracts";

/** 只分 Windows 與 posix（macOS／Linux 共用同一套 shell 語法），不必再細分下去。 */
export type RuntimeOS = "windows" | "posix";

interface PlatformHints {
  userAgent?: string;
  platform?: string;
}

const OPENCODE_CORS_ARGS =
  "--cors http://localhost:5173 --cors http://127.0.0.1:5173 --cors http://localhost:4173 --cors http://127.0.0.1:4173";

/** 依作業系統分流的啟動指令；未知環境（無 navigator，如 SSR/測試）預設 posix，語法較寬鬆、不會誤導 Windows 使用者去跑一個少了 `.cmd` 會失敗的指令。 */
const WEB_RUNTIME_START_COMMANDS_BY_OS: Readonly<Record<RuntimeOS, Readonly<Record<RuntimeService, string>>>> = {
  windows: {
    ollama: '$env:OLLAMA_ORIGINS="*"; ollama serve',
    opencode: `opencode.cmd serve --port 4096 --hostname 127.0.0.1 ${OPENCODE_CORS_ARGS}`,
  },
  posix: {
    ollama: 'OLLAMA_ORIGINS="*" ollama serve',
    opencode: `opencode serve --port 4096 --hostname 127.0.0.1 ${OPENCODE_CORS_ARGS}`,
  },
};

/**
 * 從 `navigator.platform`／`navigator.userAgent` 判斷是不是 Windows；兩者擇一命中即可，
 * 因為部分瀏覽器已棄用 `platform`、只剩 `userAgent` 可靠。傳入 `hints` 供測試注入，
 * 不傳則讀取全域 `navigator`（瀏覽器執行期的實際情況）。
 */
export function detectRuntimeOS(hints?: PlatformHints): RuntimeOS {
  const source = hints ?? (typeof navigator === "undefined" ? undefined : navigator);
  const platform = source?.platform ?? "";
  const userAgent = source?.userAgent ?? "";
  return /win/i.test(platform) || /windows/i.test(userAgent) ? "windows" : "posix";
}

/** 供元件直接取用單一服務的啟動指令；預設依偵測到的作業系統選字串，也可傳 `os` 覆寫（測試／預覽用）。 */
export function getRuntimeStartCommand(service: RuntimeService, os: RuntimeOS = detectRuntimeOS()): string {
  return WEB_RUNTIME_START_COMMANDS_BY_OS[os][service];
}

export type RuntimeStatusProbe = () => Promise<RuntimeStatus>;

const WEB_CAPABILITIES: RuntimeCapabilities = Object.freeze({
  canStart: false,
  canStopOwned: false,
  canCopyStartCommand: true,
});

/**
 * Browser-safe runtime boundary. It can probe loopback services and expose a
 * command for the user to copy, but it never invokes a local process.
 */
export class WebRuntimeController implements RuntimeController {
  private readonly probes: Partial<Record<RuntimeService, RuntimeStatusProbe>>;

  constructor(probes: Partial<Record<RuntimeService, RuntimeStatusProbe>> = {}) {
    this.probes = probes;
  }

  capabilities(_service: RuntimeService): RuntimeCapabilities {
    return WEB_CAPABILITIES;
  }

  async status(service: RuntimeService): Promise<RuntimeStatus> {
    const probe = this.probes[service];
    if (!probe) {
      return {
        service,
        state: "unknown",
        message: `No ${service} status probe is configured.`,
      };
    }
    return probe();
  }

  startCommand(service: RuntimeService): string {
    return getRuntimeStartCommand(service);
  }

  async start(service: RuntimeService): Promise<RuntimeStartResult> {
    throw new RuntimeControlError(
      "RUNTIME_START_UNSUPPORTED",
      service,
      "A web page cannot start local processes. Copy the start command instead.",
    );
  }

  async stopOwned(service: RuntimeService): Promise<void> {
    throw new RuntimeControlError(
      "RUNTIME_STOP_UNSUPPORTED",
      service,
      "This web page does not own a local process and cannot stop it.",
    );
  }
}
