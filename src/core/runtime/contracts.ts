export type RuntimeService = "ollama" | "opencode";

export type RuntimeState = "ready" | "offline" | "unknown";

export interface RuntimeStatus {
  service: RuntimeService;
  state: RuntimeState;
  message: string;
}

export interface RuntimeCapabilities {
  canStart: boolean;
  canStopOwned: boolean;
  canCopyStartCommand: boolean;
}

export interface RuntimeStartResult {
  service: RuntimeService;
  outcome: "started" | "already-running";
}

export type RuntimeControlErrorCode =
  | "RUNTIME_START_UNSUPPORTED"
  | "RUNTIME_STOP_UNSUPPORTED";

export class RuntimeControlError extends Error {
  readonly code: RuntimeControlErrorCode;
  readonly service: RuntimeService;

  constructor(code: RuntimeControlErrorCode, service: RuntimeService, message: string) {
    super(message);
    this.name = "RuntimeControlError";
    this.code = code;
    this.service = service;
  }
}

export interface RuntimeController {
  capabilities(service: RuntimeService): RuntimeCapabilities;
  status(service: RuntimeService): Promise<RuntimeStatus>;
  startCommand(service: RuntimeService): string;
  start(service: RuntimeService): Promise<RuntimeStartResult>;
  stopOwned(service: RuntimeService): Promise<void>;
}
