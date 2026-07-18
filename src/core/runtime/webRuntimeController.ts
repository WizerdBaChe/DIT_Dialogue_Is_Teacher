import {
  RuntimeControlError,
  type RuntimeCapabilities,
  type RuntimeController,
  type RuntimeService,
  type RuntimeStartResult,
  type RuntimeStatus,
} from "./contracts";

export const WEB_RUNTIME_START_COMMANDS: Readonly<Record<RuntimeService, string>> = {
  ollama: '$env:OLLAMA_ORIGINS="*"; ollama serve',
  opencode:
    "opencode.cmd serve --port 4096 --hostname 127.0.0.1 --cors http://localhost:5173 --cors http://127.0.0.1:5173 --cors http://localhost:4173 --cors http://127.0.0.1:4173",
};

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
    return WEB_RUNTIME_START_COMMANDS[service];
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
