/**
 * Session 狀態 (Zustand)。UI 只與此 store 互動，不直接碰 pipeline / provider，維持低耦合。
 */
import { create } from "zustand";
import type { Annotation, ProviderId, SessionDocument, Span } from "@/types/spanTree";
import type { PrimaryView, SessionOrigin } from "@/core/view/workspace";
import type { MapZoomLevel } from "@/core/view/sessionMap";
import {
  buildSessionDocument,
  buildSessionDocumentFromFiles,
  PipelineError,
  type PipelineResult,
  type TranscriptFileInput,
} from "@/core/pipeline";
import { buildViewModel, type ViewItem } from "@/core/view/viewModel";
import {
  getProvider,
  checkOllama,
  DEFAULT_OLLAMA_CONFIG,
  checkOpenCode,
  DEFAULT_OPENCODE_CONFIG,
  createOpenCodeTransport,
  OPENCODE_AGENT_VERSION,
  getPreset,
  checkGenericEndpoint,
  DEFAULT_GENERIC_TIMEOUT_MS,
  createGenericTransport,
  checkAnthropic,
  DEFAULT_ANTHROPIC_CONFIG,
  createAnthropicTransport,
  isGenericChatPreset,
  type OllamaStatus,
  type OpenCodeStatus,
  type GenericChatPresetId,
  type EndpointStatus,
  type AnthropicConfig,
} from "@/core/llm";
import { annotateWithPrivacy } from "@/adapters/dit/privacyAdapter";
import { loadConfigFile } from "@/core/config/configFile";
import { defaultPrivacyGateway, PrivacyError, type PrivacyConsent, type PrivacyInspection } from "@/core/privacy";
import { balancedPrivacyPolicy, strictPrivacyPolicy } from "@/core/privacy/policies";
import { PROMPT_VERSION } from "@/core/llm/prompt";
import {
  AnnotationJobController,
  buildAnnotationCacheKey,
  createAnnotationRepository,
  fingerprintItem,
  fingerprintSession,
  type AnnotationProvenance,
  type AnnotationRecord,
  type AnnotationRunMode,
} from "@/core/annotation";
import { sampleSession } from "@/fixtures";
import type { SessionExport } from "@/core/export/contracts";
import { MESSAGES, type Locale } from "@/i18n/locales";
import { resetFallbackReport } from "@/core/diagnostics";
import { readOnboardingCompleted, writeOnboardingCompleted } from "@/core/onboarding/repository";
import {
  SessionLoadCancelledError,
  startSessionLoad,
  type SessionBlobInput,
  type SessionLoadProgress,
  type SessionLoadTask,
} from "@/core/ingest";

/** Ollama 在 store 內的可調設定。 */
interface OllamaConfigState {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  /** 停用模型思考 (送 think:false)；僅對支援 thinking 的模型有意義。 */
  disableThinking: boolean;
  /** 保活時間 (keep_alive)，例如 "10m"；連續講解免於冷載入。空字串 = 用 Ollama 預設。 */
  keepAlive: string;
  /** 單段輸出上限 (num_predict)；0 = 不限 (用模型預設)。 */
  numPredict: number;
}

/** OpenCode server settings for cloud annotation. Provider credentials remain in OpenCode. */
interface CloudConfigState {
  baseUrl: string;
  providerID: string;
  modelID: string;
  agent: string;
  timeoutMs: number;
}

/** R8: generic OpenAI-chat-compatible preset config (lmstudio/jan/openrouter/groq/custom). */
export interface GenericPresetConfigState {
  baseUrl: string;
  model: string;
  /** In-memory only by default (R8 §7 tier 2); tier 1 is `dit.config.json` (INV-R8-3). */
  apiKey: string;
  timeoutMs: number;
}

const GENERIC_PRESET_IDS: GenericChatPresetId[] = ["lmstudio", "jan", "openrouter", "groq", "custom"];

/** 資料夾載入防呆門檻 (方案 A)：超過任一項就先跳確認，而不是直接合併。見設計討論：
 *  選到 .claude/projects/ 或 .codex/sessions/<年>/<月>/ 這種上層目錄時，檔案數/總大小通常會明顯偏高。 */
const FOLDER_LOAD_FILE_COUNT_THRESHOLD = 40;
const FOLDER_LOAD_BYTES_THRESHOLD = 15 * 1024 * 1024;

export interface PendingFolderLoad {
  files: SessionBlobInput[];
  fileCount: number;
  totalBytes: number;
}

const DEFAULT_GENERIC_PRESET_CONFIGS: Record<GenericChatPresetId, GenericPresetConfigState> = {
  lmstudio: { baseUrl: getPreset("lmstudio").baseUrl, model: "", apiKey: "", timeoutMs: DEFAULT_GENERIC_TIMEOUT_MS },
  jan: { baseUrl: getPreset("jan").baseUrl, model: "", apiKey: "", timeoutMs: DEFAULT_GENERIC_TIMEOUT_MS },
  openrouter: { baseUrl: getPreset("openrouter").baseUrl, model: "meta-llama/llama-3.1-8b-instruct:free", apiKey: "", timeoutMs: DEFAULT_GENERIC_TIMEOUT_MS },
  groq: { baseUrl: getPreset("groq").baseUrl, model: "llama-3.1-8b-instant", apiKey: "", timeoutMs: DEFAULT_GENERIC_TIMEOUT_MS },
  custom: { baseUrl: "", model: "", apiKey: "", timeoutMs: DEFAULT_GENERIC_TIMEOUT_MS },
};

/** 「講解全部」的進度，供 UI 顯示，緩解等待焦慮。null = 未在執行。 */
export interface AnnotateProgress {
  total: number;
  done: number;
  cached: number;
  failed: number;
  status: "running" | "stopped" | "completed";
  /** 目前正在講解的 view item id (null = 節點間空檔 / 已完成)。 */
  currentId: string | null;
}

export interface PrivacyReviewState {
  inspection: PrivacyInspection;
  itemId: string;
}

interface PositionState {
  viewItems: ViewItem[];
  activeId: string | null;
  playingId: string | null;
}

export interface CurrentPosition {
  current: number | null;
  total: number;
}

export function selectCurrentPosition(state: PositionState): CurrentPosition {
  const selectedId = state.playingId ?? state.activeId;
  const index = selectedId ? state.viewItems.findIndex((item) => item.id === selectedId) : -1;
  return {
    current: index >= 0 ? index + 1 : null,
    total: state.viewItems.length,
  };
}

const REPLAY_INTERVAL_MS = 1600;
let replayTimer: ReturnType<typeof setInterval> | null = null;
/** 「講解全部」取消旗標 (模組層級，不入 state 以免每次勾選觸發 re-render)。 */
let pendingPrivacyReviewer: ((consent: PrivacyConsent | null) => void) | null = null;
let dataOutConsent: { scope: string; consentId: string } | null = null;
let cacheLoadGeneration = 0;
let activeSessionLoad: SessionLoadTask | null = null;
const annotationJobController = new AnnotationJobController();
const annotationRepository = createAnnotationRepository((error) => {
  useSessionStore.setState({ storageNotice: `Annotation storage degraded to memory: ${error.message}` });
});
/** 測試專用：讓 sessionStore.test.ts 能直接寫入快取記錄，驗證 LS-INV-6 的還原語意。 */
export const __testAnnotationRepository = annotationRepository;

/** 取某個 view item 的代表 span (group 取第一個成員)。 */
function primarySpan(item: ViewItem): Span {
  return item.type === "span" ? item.node.span : item.nodes[0].span;
}

interface CacheConfigState {
  providerId: ProviderId;
  locale: Locale;
  ollamaConfig: OllamaConfigState;
  cloudConfig: CloudConfigState;
  presetConfigs: Record<GenericChatPresetId, GenericPresetConfigState>;
  anthropicConfig: AnthropicConfig;
  privacyPolicyId: "balanced" | "strict";
}

function currentProvenance(state: CacheConfigState): Omit<AnnotationProvenance, "createdAt"> | null {
  if (state.providerId === "none") return null;
  if (state.providerId === "ollama") {
    return {
      providerId: "ollama",
      modelId: state.ollamaConfig.model,
      promptVersion: PROMPT_VERSION,
      locale: state.locale,
      privacyPolicyId: null,
      privacyPolicyVersion: null,
    };
  }
  if (state.providerId === "cloud") {
    const policy = state.privacyPolicyId === "strict" ? strictPrivacyPolicy : balancedPrivacyPolicy;
    return {
      providerId: "opencode",
      modelId: `${state.cloudConfig.providerID}/${state.cloudConfig.modelID}`,
      promptVersion: `${PROMPT_VERSION}:agent-${OPENCODE_AGENT_VERSION}:${state.cloudConfig.agent}`,
      locale: state.locale,
      privacyPolicyId: policy.id,
      privacyPolicyVersion: policy.version,
    };
  }
  // R8: new presets (anthropic-byok / lmstudio / jan / openrouter / groq / custom). sendsDataOut
  // presets go through the Privacy Envelope (INV-R8-1), so they carry a privacy policy; the two
  // local ones (lmstudio/jan) don't, same as ollama.
  const preset = getPreset(state.providerId as Exclude<typeof state.providerId, "none" | "ollama" | "cloud">);
  const modelId = state.providerId === "anthropic-byok" ? state.anthropicConfig.model : state.presetConfigs[state.providerId as GenericChatPresetId].model;
  if (!preset.sendsDataOut) {
    return { providerId: state.providerId, modelId, promptVersion: PROMPT_VERSION, locale: state.locale, privacyPolicyId: null, privacyPolicyVersion: null };
  }
  const policy = state.privacyPolicyId === "strict" ? strictPrivacyPolicy : balancedPrivacyPolicy;
  return {
    providerId: state.providerId,
    modelId,
    promptVersion: PROMPT_VERSION,
    locale: state.locale,
    privacyPolicyId: policy.id,
    privacyPolicyVersion: policy.version,
  };
}

async function buildItemFingerprintMap(viewItems: ViewItem[]): Promise<Record<string, string>> {
  const entries = await Promise.all(viewItems.map(async (item, index) => {
    const previousSummary = index > 0 ? primarySpan(viewItems[index - 1]).summary : undefined;
    return [item.id, await fingerprintItem(primarySpan(item), previousSummary)] as const;
  }));
  return Object.fromEntries(entries);
}

async function refreshCurrentCacheMatches(): Promise<void> {
  const state = useSessionStore.getState();
  const provenance = currentProvenance(state);
  if (!provenance || !state.sessionFingerprint) {
    useSessionStore.setState({ cachedForCurrentConfig: {} });
    return;
  }
  const sessionFingerprint = state.sessionFingerprint;
  const entries = await Promise.all(Object.entries(state.itemFingerprints).map(async ([itemId, itemFingerprint]) => {
    const cacheKey = await buildAnnotationCacheKey(itemFingerprint, provenance);
    const record = await annotationRepository.get(cacheKey);
    return [itemId, record] as const;
  }));
  if (useSessionStore.getState().sessionFingerprint !== sessionFingerprint) return;
  const cachedForCurrentConfig: Record<string, true> = {};
  const annotations: Record<string, Annotation> = { ...useSessionStore.getState().annotations };
  for (const [itemId, record] of entries) {
    if (!record) continue;
    cachedForCurrentConfig[itemId] = true;
    annotations[itemId] = record.annotation;
  }
  useSessionStore.setState({ cachedForCurrentConfig, annotations });
}

function cancelPendingPrivacyReview(): void {
  pendingPrivacyReviewer?.(null);
  pendingPrivacyReviewer = null;
}

function publishPipelineResult({ doc, warnings }: PipelineResult, sessionOrigin: SessionOrigin): void {
  const current = useSessionStore.getState();
  const snapshotMode = current.snapshotMode;
  current.pause();
  cancelPendingPrivacyReview();
  dataOutConsent = null;
  const generation = ++cacheLoadGeneration;
  const viewItems = buildViewModel(doc);
  if (import.meta.env.DEV && typeof window !== "undefined") {
    (window as unknown as { __DIT?: unknown }).__DIT = { doc, viewItems, store: useSessionStore };
  }
  useSessionStore.setState({
    doc,
    viewItems,
    warnings,
    warningsDismissed: false,
    // 每次重新發布都重算：有提示就強制彈窗一次，使用者按過確認才會消失 (見 ParseNoticeDialog)。
    parseNoticeAcknowledged: warnings.length === 0,
    error: null,
    // 使用者自己載入的 session 直接進閱讀；總覽只當作內建範例的著陸頁。
    primaryView: sessionOrigin === "user" ? "reader" : "overview",
    sessionOrigin,
    structureDrawerOpen: false,
    mapOpen: false,
    settingsOpen: false,
    mapZoomLevel: "global",
    mapFocusId: null,
    mapError: null,
    activeId: viewItems[0]?.id ?? null,
    playingId: null,
    annotations: {},
    annotatingIds: {},
    annotationErrors: {},
    annotateProgress: null,
    privacyReview: null,
    sessionFingerprint: null,
    itemFingerprints: {},
    cachedForCurrentConfig: {},
    cacheReady: snapshotMode,
    cachedAnnotationCount: 0,
    restoreNotice: null,
  });
  // EX-INV-4：快照模式下跳過 IndexedDB 快取還原 (file:// 的 null origin 部分瀏覽器會直接拒絕)。
  if (snapshotMode) return;
  void (async () => {
    const itemFingerprints = await buildItemFingerprintMap(viewItems);
    const sessionFingerprint = await fingerprintSession(doc);
    const records = await annotationRepository.getBySession(sessionFingerprint);
    if (generation !== cacheLoadGeneration) return;
    const currentItemIds = new Set(viewItems.map((item) => item.id));
    const latest = new Map<string, AnnotationRecord>();
    for (const record of records) {
      if (!currentItemIds.has(record.itemId) || itemFingerprints[record.itemId] !== record.itemFingerprint) continue;
      const existing = latest.get(record.itemId);
      if (!existing || existing.provenance.createdAt < record.provenance.createdAt) latest.set(record.itemId, record);
    }
    const restored = Object.fromEntries([...latest].map(([itemId, record]) => [itemId, record.annotation]));
    useSessionStore.setState((state) => ({
      sessionFingerprint,
      itemFingerprints,
      cacheReady: true,
      cachedAnnotationCount: latest.size,
      restoreNotice: latest.size > 0 ? { count: latest.size } : null,
      annotations: { ...state.annotations, ...restored },
    }));
    await refreshCurrentCacheMatches();
  })().catch((error) => {
    if (generation !== cacheLoadGeneration) return;
    useSessionStore.setState({ cacheReady: true, storageNotice: `Annotation restore failed: ${(error as Error).message}` });
  });
}

function loadPipeline(build: () => PipelineResult, origin: SessionOrigin): void {
  // 必須在 build() 之前清空：降級記錄只反映目前這份資料，而 normalizer 的事件是在 build() 期間產生的。
  resetFallbackReport();
  try {
    publishPipelineResult(build(), origin);
  } catch (error) {
    const locale = useSessionStore.getState().locale;
    const message = error instanceof PipelineError ? error.message : MESSAGES[locale].header.loadFailed((error as Error).message);
    useSessionStore.setState({ error: message, cacheReady: true });
  }
}

interface SessionState {
  doc: SessionDocument | null;
  viewItems: ViewItem[];
  warnings: string[];
  error: string | null;
  sessionLoadProgress: SessionLoadProgress | null;
  sessionLoadError: string | null;
  /** 資料夾載入超過數量/大小門檻時，暫存待確認的檔案；null = 沒有待確認的載入。 */
  pendingFolderLoad: PendingFolderLoad | null;

  providerId: ProviderId;
  showAnnotations: boolean;
  primaryView: PrimaryView;
  sessionOrigin: SessionOrigin;
  structureCollapsed: boolean;
  structureDrawerOpen: boolean;
  mapOpen: boolean;
  /** 設定對話框開關 (R7 設計改版：取代原本的內嵌 settings tray)。 */
  settingsOpen: boolean;
  /** 首次使用歡迎彈窗開關；由 checkOnboarding() 依 IndexedDB 旗標決定是否在啟動時開啟。 */
  welcomeOpen: boolean;
  mapZoomLevel: MapZoomLevel;
  mapFocusId: string | null;
  mapError: string | null;
  minimapEnabled: boolean;
  mapShortcutEnabled: boolean;
  /** UI 語言；也決定講解層 prompt 的輸出語言 (R7)。 */
  locale: Locale;

  /** Ollama 連線設定 (使用者可在面板調整)。 */
  ollamaConfig: OllamaConfigState;
  /** 最近一次 Ollama 探測結果 (null = 尚未探測)。 */
  ollamaStatus: OllamaStatus | null;
  /** OpenCode-backed cloud provider settings and connection status. */
  cloudConfig: CloudConfigState;
  openCodeStatus: OpenCodeStatus | null;
  /** R8: lmstudio/jan/openrouter/groq/custom — one config + one status per preset. */
  presetConfigs: Record<GenericChatPresetId, GenericPresetConfigState>;
  presetStatus: Partial<Record<GenericChatPresetId, EndpointStatus>>;
  /** R8: Anthropic BYOK (direct browser call, see ADR-031/anthropicProvider.ts). */
  anthropicConfig: AnthropicConfig;
  anthropicStatus: EndpointStatus | null;
  /** R8 §7: whether `dit.config.json` contributed any key at startup (UI hint only). */
  configFileLoaded: boolean;
  privacyPolicyId: "balanced" | "strict";
  privacyReview: PrivacyReviewState | null;
  annotationRunMode: AnnotationRunMode;
  sessionFingerprint: string | null;
  itemFingerprints: Record<string, string>;
  cachedForCurrentConfig: Record<string, true>;
  cacheReady: boolean;
  /** 持久衍生狀態：目前 session 於本機快取命中的講解則數；每次 session 發布重算 (LS-INV-6)。 */
  cachedAnnotationCount: number;
  /** 瞬時事件：本次載入首次從快取還原時設定；`dismissRestoreNotice()` 或切換 session 時清為 null。 */
  restoreNotice: { count: number } | null;
  storageNotice: string | null;
  /** 解析提示已被使用者收起；提示內容仍留在 warnings，總覽的則數不受影響。 */
  warningsDismissed: boolean;
  /** 強制解析提示彈窗是否已被使用者按確認看過；每次重新發布 session 都會重算 (見 ParseNoticeDialog)。 */
  parseNoticeAcknowledged: boolean;

  /** 靜態 HTML 快照模式；true 時隱藏載入／講解／Provider／匯出入口並跳過快取還原 (EX-INV-4)。 */
  snapshotMode: boolean;

  /** 「講解全部」進度 (null = 未執行)。 */
  annotateProgress: AnnotateProgress | null;

  activeId: string | null;
  playingId: string | null;
  isPlaying: boolean;

  /** 講解結果，鍵為 view item id。 */
  annotations: Record<string, Annotation>;
  annotatingIds: Record<string, true>;
  annotationErrors: Record<string, string>;

  // ---- actions ----
  /** 由匯出的 SessionExport 重新水合 store，供靜態快照的進入點使用 (EX-03)。 */
  hydrateSessionExport: (payload: SessionExport) => void;
  loadFromText: (raw: string, origin?: SessionOrigin) => void;
  loadFromFiles: (files: TranscriptFileInput[], origin?: SessionOrigin) => void;
  loadFromBlobs: (files: SessionBlobInput[], origin?: SessionOrigin) => Promise<void>;
  /** 資料夾選取入口專用：數量/大小超過門檻先暫存待確認，否則直接載入。 */
  requestFolderLoad: (files: SessionBlobInput[]) => void;
  confirmPendingFolderLoad: () => void;
  cancelPendingFolderLoad: () => void;
  cancelSessionLoad: () => void;
  dismissSessionLoadStatus: () => void;
  dismissWarnings: () => void;
  acknowledgeParseNotice: () => void;
  dismissError: () => void;
  dismissStorageNotice: () => void;
  dismissRestoreNotice: () => void;
  reset: () => void;
  setProvider: (id: ProviderId) => void;
  setLocale: (locale: Locale) => void;
  setOllamaModel: (model: string) => void;
  updateOllamaConfig: (patch: Partial<OllamaConfigState>) => void;
  refreshOllamaStatus: () => Promise<void>;
  updateCloudConfig: (patch: Partial<CloudConfigState>) => void;
  setOpenCodeModel: (modelID: string) => void;
  refreshOpenCodeStatus: () => Promise<void>;
  updatePresetConfig: (id: GenericChatPresetId, patch: Partial<GenericPresetConfigState>) => void;
  refreshPresetStatus: (id: GenericChatPresetId) => Promise<void>;
  updateAnthropicConfig: (patch: Partial<AnthropicConfig>) => void;
  refreshAnthropicStatus: () => Promise<void>;
  /** R8 §7: best-effort load of `dit.config.json` (tier 1 key persistence); no-op if absent/unreadable. */
  loadPersistedConfig: () => Promise<void>;
  setPrivacyPolicy: (id: "balanced" | "strict") => void;
  approvePrivacyReview: () => void;
  cancelPrivacyReview: () => void;
  setAnnotationRunMode: (mode: AnnotationRunMode) => void;
  toggleAnnotations: () => void;

  /** 全域重置：回到內建範例與預設設定。 */
  resetToSample: () => void;
  /** 局域重置：清除所有講解結果 (不動已載入的 session)。 */
  clearAnnotations: () => void;
  /** 局域重置：取消選取並停止逐步瀏覽 (不動已載入的 session)。 */
  clearSelection: () => void;
  setPrimaryView: (view: PrimaryView) => void;
  startReading: () => void;
  toggleStructureCollapsed: () => void;
  openStructureDrawer: () => void;
  closeStructureDrawer: () => void;
  openMap: () => void;
  closeMap: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  /** App 掛載時呼叫一次：讀 IndexedDB 旗標，尚未看過歡迎導覽且非快照模式才開啟。 */
  checkOnboarding: () => Promise<void>;
  openWelcome: () => void;
  /** 不論是按「開始使用」、略過、或 Escape/backdrop 關閉，都視為看過一次，寫入旗標。 */
  completeOnboarding: () => void;
  setMapZoom: (level: MapZoomLevel, focusId?: string) => void;
  setMapFocus: (id: string) => void;
  jumpToMapItem: (id: string) => void;
  setMinimapEnabled: (enabled: boolean) => void;
  setMapShortcutEnabled: (enabled: boolean) => void;
  setActive: (id: string) => void;

  play: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  gotoIndex: (i: number) => void;

  annotateItem: (id: string) => Promise<boolean>;
  annotateAll: () => Promise<void>;
  /** 中止進行中的「講解全部」(目前節點跑完即停)。 */
  cancelAnnotateAll: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  doc: null,
  viewItems: [],
  warnings: [],
  error: null,
  sessionLoadProgress: null,
  sessionLoadError: null,
  pendingFolderLoad: null,

  providerId: "none",
  showAnnotations: true,
  primaryView: "overview",
  sessionOrigin: "sample",
  structureCollapsed: false,
  structureDrawerOpen: false,
  mapOpen: false,
  settingsOpen: false,
  welcomeOpen: false,
  mapZoomLevel: "global",
  mapFocusId: null,
  mapError: null,
  minimapEnabled: true,
  mapShortcutEnabled: true,
  locale: "zh-TW",

  ollamaConfig: {
    baseUrl: DEFAULT_OLLAMA_CONFIG.baseUrl,
    model: DEFAULT_OLLAMA_CONFIG.model,
    timeoutMs: DEFAULT_OLLAMA_CONFIG.timeoutMs,
    disableThinking: false,
    keepAlive: DEFAULT_OLLAMA_CONFIG.keepAlive ?? "10m",
    numPredict: DEFAULT_OLLAMA_CONFIG.numPredict ?? 512,
  },
  ollamaStatus: null,
  cloudConfig: { ...DEFAULT_OPENCODE_CONFIG },
  openCodeStatus: null,
  presetConfigs: { ...DEFAULT_GENERIC_PRESET_CONFIGS },
  presetStatus: {},
  anthropicConfig: { ...DEFAULT_ANTHROPIC_CONFIG },
  anthropicStatus: null,
  configFileLoaded: false,
  privacyPolicyId: "balanced",
  privacyReview: null,
  annotationRunMode: "missing",
  sessionFingerprint: null,
  itemFingerprints: {},
  cachedForCurrentConfig: {},
  cacheReady: false,
  cachedAnnotationCount: 0,
  restoreNotice: null,
  storageNotice: null,
  warningsDismissed: false,
  parseNoticeAcknowledged: true,
  snapshotMode: false,

  annotateProgress: null,

  activeId: null,
  playingId: null,
  isPlaying: false,

  annotations: {},
  annotatingIds: {},
  annotationErrors: {},

  hydrateSessionExport: (payload) => {
    // 先設 snapshotMode，讓 publishPipelineResult 同步讀到並跳過快取還原 (EX-INV-4)。
    set({ snapshotMode: true });
    loadPipeline(() => ({ doc: payload.document, warnings: [] }), "user");
    set({ annotations: payload.annotations, primaryView: "overview" });
  },

  loadFromText: (raw, origin = "user") => loadPipeline(() => buildSessionDocument(raw), origin),

  loadFromFiles: (files, origin = "user") => loadPipeline(() => buildSessionDocumentFromFiles(files), origin),

  loadFromBlobs: async (files, origin = "user") => {
    activeSessionLoad?.cancel();
    // worker 的記錄會在 complete 時併回來，這裡先清掉上一份 session 的。
    resetFallbackReport();
    const totalBytes = files.reduce((sum, file) => sum + file.blob.size, 0);
    set({
      sessionLoadProgress: { phase: "reading", loadedBytes: 0, totalBytes, lineCount: 0, sourcePath: null },
      sessionLoadError: null,
    });
    const task = startSessionLoad(files, (progress) => {
      if (activeSessionLoad === task) set({ sessionLoadProgress: progress });
    });
    activeSessionLoad = task;
    try {
      const result = await task.promise;
      if (activeSessionLoad !== task) return;
      publishPipelineResult(result, origin);
      set({
        sessionLoadProgress: {
          phase: "ready",
          loadedBytes: totalBytes,
          totalBytes,
          lineCount: get().sessionLoadProgress?.lineCount ?? 0,
          sourcePath: null,
        },
        sessionLoadError: null,
      });
    } catch (error) {
      if (activeSessionLoad !== task) return;
      if (error instanceof SessionLoadCancelledError) {
        set({ sessionLoadProgress: null, sessionLoadError: null });
      } else {
        const locale = get().locale;
        set({
          sessionLoadProgress: null,
          sessionLoadError: MESSAGES[locale].header.loadFailed((error as Error).message),
        });
      }
    } finally {
      if (activeSessionLoad === task) activeSessionLoad = null;
    }
  },

  requestFolderLoad: (files) => {
    const totalBytes = files.reduce((sum, file) => sum + file.blob.size, 0);
    if (files.length > FOLDER_LOAD_FILE_COUNT_THRESHOLD || totalBytes > FOLDER_LOAD_BYTES_THRESHOLD) {
      set({ pendingFolderLoad: { files, fileCount: files.length, totalBytes } });
      return;
    }
    void get().loadFromBlobs(files, "user");
  },

  confirmPendingFolderLoad: () => {
    const pending = get().pendingFolderLoad;
    if (!pending) return;
    set({ pendingFolderLoad: null });
    void get().loadFromBlobs(pending.files, "user");
  },

  cancelPendingFolderLoad: () => set({ pendingFolderLoad: null }),

  cancelSessionLoad: () => {
    activeSessionLoad?.cancel();
  },

  dismissSessionLoadStatus: () => set({ sessionLoadProgress: null, sessionLoadError: null }),
  dismissWarnings: () => set({ warningsDismissed: true }),
  acknowledgeParseNotice: () => set({ parseNoticeAcknowledged: true }),
  dismissError: () => set({ error: null }),
  dismissStorageNotice: () => set({ storageNotice: null }),
  dismissRestoreNotice: () => set({ restoreNotice: null }),

  reset: () => {
    activeSessionLoad?.cancel();
    get().pause();
    cancelPendingPrivacyReview();
    dataOutConsent = null;
    ++cacheLoadGeneration;
    set({
      doc: null,
      viewItems: [],
      warnings: [],
      warningsDismissed: false,
      parseNoticeAcknowledged: true,
      error: null,
      sessionLoadProgress: null,
      sessionLoadError: null,
      pendingFolderLoad: null,
      primaryView: "overview",
      structureDrawerOpen: false,
      mapOpen: false,
      settingsOpen: false,
      mapZoomLevel: "global",
      mapFocusId: null,
      mapError: null,
      activeId: null,
      playingId: null,
      privacyReview: null,
      sessionFingerprint: null,
      itemFingerprints: {},
      cachedForCurrentConfig: {},
      cacheReady: true,
      cachedAnnotationCount: 0,
      restoreNotice: null,
    });
  },

  setProvider: (id) => {
    if (id !== "cloud" && id !== get().providerId) {
      cancelPendingPrivacyReview();
      dataOutConsent = null;
    }
    set({ providerId: id, showAnnotations: id !== "none", annotationErrors: {} });
    if (id === "ollama") void get().refreshOllamaStatus();
    if (id === "cloud") void get().refreshOpenCodeStatus();
    if (id === "anthropic-byok") void get().refreshAnthropicStatus();
    if (isGenericChatPreset(id)) void get().refreshPresetStatus(id);
    void refreshCurrentCacheMatches();
  },

  // 切換語言即時生效；不動已載入 doc / 講解結果 (狀態不丟失，符 R7 驗收)。
  setLocale: (locale) => {
    set({ locale });
    void refreshCurrentCacheMatches();
  },

  setOllamaModel: (model) => {
    set((s) => ({ ollamaConfig: { ...s.ollamaConfig, model } }));
    void get().refreshOllamaStatus();
    void refreshCurrentCacheMatches();
  },

  updateOllamaConfig: (patch) => {
    set((s) => ({ ollamaConfig: { ...s.ollamaConfig, ...patch } }));
    if (patch.model) void refreshCurrentCacheMatches();
  },

  updateCloudConfig: (patch) => {
    dataOutConsent = null;
    set((s) => ({ cloudConfig: { ...s.cloudConfig, ...patch } }));
    void refreshCurrentCacheMatches();
  },

  setOpenCodeModel: (modelID) => {
    dataOutConsent = null;
    set((s) => ({ cloudConfig: { ...s.cloudConfig, modelID } }));
    void refreshCurrentCacheMatches();
  },

  refreshOllamaStatus: async () => {
    const checkingMsg = MESSAGES[get().locale].ollama.states.checking;
    set((s) => ({ ollamaStatus: { ...(s.ollamaStatus ?? { models: [] as string[] }), state: "checking", baseUrl: s.ollamaConfig.baseUrl, model: s.ollamaConfig.model, message: checkingMsg } as OllamaStatus }));
    const status = await checkOllama(get().ollamaConfig);
    set((state) => ({
      ollamaStatus: status,
      annotationErrors: status.state === "ready" ? {} : state.annotationErrors,
    }));
  },

  refreshOpenCodeStatus: async () => {
    const config = get().cloudConfig;
    set({
      openCodeStatus: {
        state: "checking",
        baseUrl: config.baseUrl,
        version: null,
        models: [],
        message: MESSAGES[get().locale].cloud.states.checking,
      },
    });
    const status = await checkOpenCode(config);
    set((state) => ({
      openCodeStatus: status,
      annotationErrors: status.state === "ready" ? {} : state.annotationErrors,
    }));
  },

  updatePresetConfig: (id, patch) => {
    if ("apiKey" in patch) dataOutConsent = null;
    set((s) => ({ presetConfigs: { ...s.presetConfigs, [id]: { ...s.presetConfigs[id], ...patch } } }));
    void refreshCurrentCacheMatches();
    if ("baseUrl" in patch || "apiKey" in patch) void get().refreshPresetStatus(id);
  },

  refreshPresetStatus: async (id) => {
    const preset = getPreset(id);
    const config = get().presetConfigs[id];
    set((s) => ({ presetStatus: { ...s.presetStatus, [id]: { state: "checking", baseUrl: config.baseUrl, model: config.model, models: s.presetStatus[id]?.models ?? [], message: "Checking…" } } }));
    const status = await checkGenericEndpoint(preset, config);
    // Auto-pick a model once we learn what's available, so the user isn't stuck on an empty select.
    if (!config.model && status.models.length > 0) {
      set((s) => ({ presetConfigs: { ...s.presetConfigs, [id]: { ...s.presetConfigs[id], model: status.models[0] } } }));
    }
    set((state) => ({
      presetStatus: { ...state.presetStatus, [id]: status },
      annotationErrors: status.state === "ready" ? {} : state.annotationErrors,
    }));
  },

  updateAnthropicConfig: (patch) => {
    if ("apiKey" in patch) dataOutConsent = null;
    set((s) => ({ anthropicConfig: { ...s.anthropicConfig, ...patch } }));
    void refreshCurrentCacheMatches();
    if ("apiKey" in patch) void get().refreshAnthropicStatus();
  },

  refreshAnthropicStatus: async () => {
    const config = get().anthropicConfig;
    set({ anthropicStatus: { state: "checking", baseUrl: config.baseUrl, model: config.model, models: [], message: "Checking…" } });
    const status = await checkAnthropic(config);
    set((state) => ({
      anthropicStatus: status,
      annotationErrors: status.state === "ready" ? {} : state.annotationErrors,
    }));
  },

  loadPersistedConfig: async () => {
    const fileConfig = await loadConfigFile();
    if (!fileConfig) return;
    set((s) => {
      const presetConfigs = { ...s.presetConfigs };
      let anthropicConfig = s.anthropicConfig;
      for (const [id, key] of Object.entries(fileConfig.keys ?? {})) {
        if (!key) continue;
        if (id === "anthropic-byok") anthropicConfig = { ...anthropicConfig, apiKey: key };
        else if (GENERIC_PRESET_IDS.includes(id as GenericChatPresetId)) {
          const presetId = id as GenericChatPresetId;
          presetConfigs[presetId] = { ...presetConfigs[presetId], apiKey: key };
        }
      }
      if (fileConfig.custom?.baseUrl) presetConfigs.custom = { ...presetConfigs.custom, baseUrl: fileConfig.custom.baseUrl };
      if (fileConfig.custom?.model) presetConfigs.custom = { ...presetConfigs.custom, model: fileConfig.custom.model };
      return { presetConfigs, anthropicConfig, configFileLoaded: true };
    });
    // "local-proxy" isn't a valid ProviderId this round (the opencode path keeps id "cloud", see ADR-032).
    if (fileConfig.activePreset && (fileConfig.activePreset as string) !== "local-proxy") {
      get().setProvider(fileConfig.activePreset as ProviderId);
    }
  },

  setPrivacyPolicy: (privacyPolicyId) => {
    if (pendingPrivacyReviewer) return;
    dataOutConsent = null;
    set({ privacyPolicyId });
    void refreshCurrentCacheMatches();
  },

  setAnnotationRunMode: (annotationRunMode) => set({ annotationRunMode }),

  approvePrivacyReview: () => {
    const reviewer = pendingPrivacyReviewer;
    const review = get().privacyReview;
    if (!reviewer || !review) return;
    const consentId = `consent_${crypto.randomUUID()}`;
    const { doc, cloudConfig, privacyPolicyId } = get();
    dataOutConsent = {
      scope: `${doc?.session.id ?? "none"}\0${cloudConfig.baseUrl}\0${cloudConfig.providerID}\0${cloudConfig.modelID}\0${privacyPolicyId}`,
      consentId,
    };
    pendingPrivacyReviewer = null;
    set({ privacyReview: null });
    reviewer({ consentId });
  },

  cancelPrivacyReview: () => {
    annotationJobController.cancel();
    cancelPendingPrivacyReview();
    set({ privacyReview: null });
  },

  toggleAnnotations: () => set((s) => ({ showAnnotations: !s.showAnnotations })),

  resetToSample: () => {
    activeSessionLoad?.cancel();
    get().pause();
    cancelPendingPrivacyReview();
    dataOutConsent = null;
    set({ providerId: "none", showAnnotations: true, ollamaStatus: null, openCodeStatus: null, annotateProgress: null, privacyReview: null, sessionLoadProgress: null, sessionLoadError: null });
    get().loadFromText(sampleSession, "sample");
  },

  // 清空講解後，魚骨「可帶走的觀念」(讀 annotations) 也會自動消失。
  clearAnnotations: () => {
    annotationJobController.cancel();
    set({ annotations: {}, annotatingIds: {}, annotationErrors: {}, annotateProgress: null });
  },

  clearSelection: () => {
    get().pause();
    set({ activeId: null, playingId: null });
  },

  setPrimaryView: (primaryView) => {
    get().pause();
    set({ primaryView, mapOpen: false, settingsOpen: false, mapError: null });
  },

  startReading: () => {
    get().pause();
    set({ primaryView: "reader", mapOpen: false, settingsOpen: false, mapError: null });
  },

  toggleStructureCollapsed: () => set((state) => ({ structureCollapsed: !state.structureCollapsed })),

  openStructureDrawer: () => {
    const state = get();
    if (!state.doc || state.privacyReview) return;
    state.pause();
    set({ structureDrawerOpen: true, mapOpen: false, settingsOpen: false, mapError: null });
  },

  closeStructureDrawer: () => set({ structureDrawerOpen: false }),

  openMap: () => {
    const state = get();
    if (!state.doc || state.privacyReview || state.structureDrawerOpen) return;
    state.pause();
    set({
      mapOpen: true,
      settingsOpen: false,
      mapZoomLevel: "global",
      mapFocusId: state.playingId ?? state.activeId ?? state.viewItems[0]?.id ?? null,
      mapError: null,
    });
  },

  closeMap: () => set({ mapOpen: false, mapError: null }),

  openSettings: () => {
    const state = get();
    if (state.privacyReview) return;
    set({ settingsOpen: true, mapOpen: false, structureDrawerOpen: false, mapError: null });
  },

  closeSettings: () => set({ settingsOpen: false }),

  checkOnboarding: async () => {
    if (get().snapshotMode) return;
    const completed = await readOnboardingCompleted();
    if (!completed) set({ welcomeOpen: true });
  },

  openWelcome: () => set({ welcomeOpen: true, settingsOpen: false }),

  completeOnboarding: () => {
    set({ welcomeOpen: false });
    void writeOnboardingCompleted();
  },

  setMapZoom: (mapZoomLevel, focusId) => set((state) => ({
    mapZoomLevel,
    mapFocusId: focusId ?? state.mapFocusId,
    mapError: null,
  })),

  setMapFocus: (mapFocusId) => set({ mapFocusId, mapError: null }),

  jumpToMapItem: (id) => {
    const state = get();
    if (!state.viewItems.some((item) => item.id === id)) {
      set({ mapError: MESSAGES[state.locale].map.invalidTarget(id) });
      return;
    }
    state.pause();
    set({
      activeId: id,
      playingId: null,
      primaryView: "reader",
      structureDrawerOpen: false,
      mapOpen: false,
      mapFocusId: id,
      mapError: null,
    });
  },

  setMinimapEnabled: (minimapEnabled) => set({ minimapEnabled }),

  setMapShortcutEnabled: (mapShortcutEnabled) => set({ mapShortcutEnabled }),

  setActive: (id) => {
    get().pause();
    set({ activeId: id, playingId: null, primaryView: "reader", structureDrawerOpen: false, mapOpen: false, settingsOpen: false, mapError: null });
  },

  gotoIndex: (i) => {
    const { viewItems } = get();
    if (viewItems.length === 0) return;
    const idx = Math.max(0, Math.min(viewItems.length - 1, i));
    set({ playingId: viewItems[idx].id, activeId: viewItems[idx].id, primaryView: "reader", mapOpen: false, mapError: null });
  },

  play: () => {
    const { viewItems, playingId } = get();
    if (viewItems.length === 0) return;
    if (replayTimer) {
      clearInterval(replayTimer);
      replayTimer = null;
      set({ isPlaying: false });
      return;
    }
    let idx = viewItems.findIndex((v) => v.id === playingId);
    if (idx >= viewItems.length - 1) idx = -1;
    set({ isPlaying: true });
    get().gotoIndex(idx + 1);
    replayTimer = setInterval(() => {
      const cur = get().viewItems.findIndex((v) => v.id === get().playingId);
      if (cur >= get().viewItems.length - 1) {
        get().pause();
        return;
      }
      get().gotoIndex(cur + 1);
    }, REPLAY_INTERVAL_MS);
  },

  pause: () => {
    if (replayTimer) {
      clearInterval(replayTimer);
      replayTimer = null;
    }
    set({ isPlaying: false });
  },

  next: () => {
    get().pause();
    const { viewItems, playingId, activeId } = get();
    const cur = viewItems.findIndex((v) => v.id === (playingId ?? activeId));
    get().gotoIndex(cur + 1);
  },

  prev: () => {
    get().pause();
    const { viewItems, playingId, activeId } = get();
    const cur = viewItems.findIndex((v) => v.id === (playingId ?? activeId));
    get().gotoIndex(cur - 1);
  },

  annotateItem: async (id) => {
    const { doc, viewItems, providerId, annotatingIds } = get();
    if (!doc || providerId === "none" || annotatingIds[id]) return false;

    const idx = viewItems.findIndex((v) => v.id === id);
    if (idx < 0) return false;
    const span = primarySpan(viewItems[idx]);
    const prev = idx > 0 ? primarySpan(viewItems[idx - 1]).summary : undefined;

    set((s) => ({ annotatingIds: { ...s.annotatingIds, [id]: true }, annotationErrors: omit(s.annotationErrors, id) }));
    let succeeded = false;
    try {
      const oc = get().ollamaConfig;
      const context = { sessionTitle: doc.session.title, prevSummary: prev, locale: get().locale };
      let ann: Annotation | null;
      const privacyReviewer = (scope: string) => async (inspection: PrivacyInspection): Promise<PrivacyConsent | null> => {
        if (dataOutConsent?.scope === scope) return { consentId: dataOutConsent.consentId };
        if (pendingPrivacyReviewer) {
          throw new PrivacyError("PRIVACY_DETECTOR_FAILED", "Another privacy review is already in progress; no data was sent.");
        }
        return new Promise<PrivacyConsent | null>((resolve) => {
          pendingPrivacyReviewer = resolve;
          set({ privacyReview: { inspection, itemId: id }, structureDrawerOpen: false, mapOpen: false, settingsOpen: false, mapError: null });
        });
      };

      if (providerId === "cloud") {
        const cloud = get().cloudConfig;
        const scope = `cloud\0${doc.session.id}\0${cloud.baseUrl}\0${cloud.providerID}\0${cloud.modelID}\0${get().privacyPolicyId}`;
        ann = await annotateWithPrivacy(span, context, {
          gateway: defaultPrivacyGateway,
          transport: createOpenCodeTransport(cloud),
          privacyRequest: { policyId: get().privacyPolicyId },
          reviewer: privacyReviewer(scope),
        });
      } else if (providerId === "anthropic-byok") {
        const anthropic = get().anthropicConfig;
        if (!anthropic.apiKey.trim()) throw new Error("An Anthropic API key is required.");
        const scope = `anthropic-byok\0${doc.session.id}\0${anthropic.baseUrl}\0${anthropic.model}\0${get().privacyPolicyId}`;
        ann = await annotateWithPrivacy(span, context, {
          gateway: defaultPrivacyGateway,
          transport: createAnthropicTransport(anthropic),
          privacyRequest: { policyId: get().privacyPolicyId },
          reviewer: privacyReviewer(scope),
        });
      } else if (isGenericChatPreset(providerId)) {
        const preset = getPreset(providerId);
        const config = get().presetConfigs[providerId];
        if (preset.needsKey && !config.apiKey.trim()) throw new Error("An API key is required for this endpoint.");
        if (preset.sendsDataOut) {
          const scope = `${providerId}\0${doc.session.id}\0${config.baseUrl}\0${config.model}\0${get().privacyPolicyId}`;
          ann = await annotateWithPrivacy(span, context, {
            gateway: defaultPrivacyGateway,
            transport: createGenericTransport(providerId, preset, config),
            privacyRequest: { policyId: get().privacyPolicyId },
            reviewer: privacyReviewer(scope),
          });
        } else {
          ann = await getProvider(providerId, { generic: config }).annotate(span, context);
        }
      } else {
        const provider = getProvider(providerId, {
          ollama: {
            baseUrl: oc.baseUrl,
            model: oc.model,
            timeoutMs: oc.timeoutMs,
            think: oc.disableThinking ? false : undefined,
            keepAlive: oc.keepAlive || undefined,
            numPredict: oc.numPredict > 0 ? oc.numPredict : undefined,
          },
        });
        ann = await provider.annotate(span, context);
      }
      if (ann) {
        const cacheState = get();
        const provenance = currentProvenance(cacheState);
        if (provenance) {
          const itemFingerprint = cacheState.itemFingerprints[id] ?? await fingerprintItem(span, prev);
          const sessionFingerprint = cacheState.sessionFingerprint ?? await fingerprintSession(doc);
          const cacheKey = await buildAnnotationCacheKey(itemFingerprint, provenance);
          const record: AnnotationRecord = {
            cacheKey,
            sessionFingerprint,
            itemFingerprint,
            itemId: id,
            annotation: ann,
            provenance: { ...provenance, createdAt: new Date().toISOString() },
          };
          await annotationRepository.put(record);
          set((state) => ({
            sessionFingerprint,
            itemFingerprints: { ...state.itemFingerprints, [id]: itemFingerprint },
            cachedForCurrentConfig: { ...state.cachedForCurrentConfig, [id]: true },
            annotations: { ...state.annotations, [id]: ann },
          }));
        } else {
          set((state) => ({ annotations: { ...state.annotations, [id]: ann } }));
        }
        succeeded = true;
      }
    } catch (e) {
      if (!(e instanceof PrivacyError && e.code === "PRIVACY_REVIEW_CANCELLED")) {
        set((s) => ({ annotationErrors: { ...s.annotationErrors, [id]: (e as Error).message } }));
      }
    } finally {
      set((s) => ({ annotatingIds: omit(s.annotatingIds, id) }));
    }
    return succeeded;
  },

  annotateAll: async () => {
    const { viewItems, providerId, annotationRunMode, cachedForCurrentConfig, annotationErrors } = get();
    if (providerId === "none" || viewItems.length === 0) return;
    if (get().annotateProgress?.status === "running") return;
    await annotationJobController.start({
      mode: annotationRunMode,
      items: viewItems.map((item) => ({
        id: item.id,
        cached: Boolean(cachedForCurrentConfig[item.id]),
        failed: Boolean(annotationErrors[item.id]),
      })),
      runItem: (id) => get().annotateItem(id),
      onSnapshot: (snapshot) => set({
        annotateProgress: {
          total: snapshot.total,
          done: snapshot.done,
          cached: snapshot.cached,
          failed: snapshot.failed,
          status: snapshot.status,
          currentId: snapshot.currentId,
        },
      }),
    });
  },

  cancelAnnotateAll: () => {
    annotationJobController.cancel();
  },
}));

function omit<T extends Record<string, unknown>>(obj: T, key: string): T {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}
