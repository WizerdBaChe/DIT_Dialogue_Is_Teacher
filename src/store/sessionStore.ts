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
  type OllamaStatus,
  type OpenCodeStatus,
} from "@/core/llm";
import { annotateOpenCodeWithPrivacy } from "@/adapters/dit/privacyAdapter";
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
import { MESSAGES, type Locale } from "@/i18n/locales";
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
let cloudConsent: { scope: string; consentId: string } | null = null;
let cacheLoadGeneration = 0;
let activeSessionLoad: SessionLoadTask | null = null;
const annotationJobController = new AnnotationJobController();
const annotationRepository = createAnnotationRepository((error) => {
  useSessionStore.setState({ storageNotice: `Annotation storage degraded to memory: ${error.message}` });
});

/** 取某個 view item 的代表 span (group 取第一個成員)。 */
function primarySpan(item: ViewItem): Span {
  return item.type === "span" ? item.node.span : item.nodes[0].span;
}

interface CacheConfigState {
  providerId: ProviderId;
  locale: Locale;
  ollamaConfig: OllamaConfigState;
  cloudConfig: CloudConfigState;
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
  current.pause();
  cancelPendingPrivacyReview();
  cloudConsent = null;
  const generation = ++cacheLoadGeneration;
  const viewItems = buildViewModel(doc);
  if (import.meta.env.DEV && typeof window !== "undefined") {
    (window as unknown as { __DIT?: unknown }).__DIT = { doc, viewItems };
  }
  useSessionStore.setState({
    doc,
    viewItems,
    warnings,
    error: null,
    primaryView: "overview",
    sessionOrigin,
    structureDrawerOpen: false,
    mapOpen: false,
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
    cacheReady: false,
    restoredAnnotationCount: 0,
  });
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
      restoredAnnotationCount: latest.size,
      annotations: { ...state.annotations, ...restored },
    }));
    await refreshCurrentCacheMatches();
  })().catch((error) => {
    if (generation !== cacheLoadGeneration) return;
    useSessionStore.setState({ cacheReady: true, storageNotice: `Annotation restore failed: ${(error as Error).message}` });
  });
}

function loadPipeline(build: () => PipelineResult, origin: SessionOrigin): void {
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

  providerId: ProviderId;
  showAnnotations: boolean;
  primaryView: PrimaryView;
  sessionOrigin: SessionOrigin;
  structureCollapsed: boolean;
  structureDrawerOpen: boolean;
  mapOpen: boolean;
  mapZoomLevel: MapZoomLevel;
  mapFocusId: string | null;
  mapError: string | null;
  /** UI 語言；也決定講解層 prompt 的輸出語言 (R7)。 */
  locale: Locale;

  /** Ollama 連線設定 (使用者可在面板調整)。 */
  ollamaConfig: OllamaConfigState;
  /** 最近一次 Ollama 探測結果 (null = 尚未探測)。 */
  ollamaStatus: OllamaStatus | null;
  /** OpenCode-backed cloud provider settings and connection status. */
  cloudConfig: CloudConfigState;
  openCodeStatus: OpenCodeStatus | null;
  privacyPolicyId: "balanced" | "strict";
  privacyReview: PrivacyReviewState | null;
  annotationRunMode: AnnotationRunMode;
  sessionFingerprint: string | null;
  itemFingerprints: Record<string, string>;
  cachedForCurrentConfig: Record<string, true>;
  cacheReady: boolean;
  restoredAnnotationCount: number;
  storageNotice: string | null;

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
  loadFromText: (raw: string, origin?: SessionOrigin) => void;
  loadFromFiles: (files: TranscriptFileInput[], origin?: SessionOrigin) => void;
  loadFromBlobs: (files: SessionBlobInput[], origin?: SessionOrigin) => Promise<void>;
  cancelSessionLoad: () => void;
  dismissSessionLoadStatus: () => void;
  reset: () => void;
  setProvider: (id: ProviderId) => void;
  setLocale: (locale: Locale) => void;
  setOllamaModel: (model: string) => void;
  updateOllamaConfig: (patch: Partial<OllamaConfigState>) => void;
  refreshOllamaStatus: () => Promise<void>;
  updateCloudConfig: (patch: Partial<CloudConfigState>) => void;
  setOpenCodeModel: (modelID: string) => void;
  refreshOpenCodeStatus: () => Promise<void>;
  setPrivacyPolicy: (id: "balanced" | "strict") => void;
  approvePrivacyReview: () => void;
  cancelPrivacyReview: () => void;
  setAnnotationRunMode: (mode: AnnotationRunMode) => void;
  toggleAnnotations: () => void;

  /** 全域重置：回到內建範例與預設設定。 */
  resetToSample: () => void;
  /** 局域重置：清除所有講解結果 (不動已載入的 session)。 */
  clearAnnotations: () => void;
  /** 局域重置：取消選取並停止重播 (不動已載入的 session)。 */
  clearSelection: () => void;
  setPrimaryView: (view: PrimaryView) => void;
  startReading: () => void;
  toggleStructureCollapsed: () => void;
  openStructureDrawer: () => void;
  closeStructureDrawer: () => void;
  openMap: () => void;
  closeMap: () => void;
  setMapZoom: (level: MapZoomLevel, focusId?: string) => void;
  setMapFocus: (id: string) => void;
  jumpToMapItem: (id: string) => void;
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

  providerId: "none",
  showAnnotations: true,
  primaryView: "overview",
  sessionOrigin: "sample",
  structureCollapsed: false,
  structureDrawerOpen: false,
  mapOpen: false,
  mapZoomLevel: "global",
  mapFocusId: null,
  mapError: null,
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
  privacyPolicyId: "balanced",
  privacyReview: null,
  annotationRunMode: "missing",
  sessionFingerprint: null,
  itemFingerprints: {},
  cachedForCurrentConfig: {},
  cacheReady: false,
  restoredAnnotationCount: 0,
  storageNotice: null,

  annotateProgress: null,

  activeId: null,
  playingId: null,
  isPlaying: false,

  annotations: {},
  annotatingIds: {},
  annotationErrors: {},

  loadFromText: (raw, origin = "user") => loadPipeline(() => buildSessionDocument(raw), origin),

  loadFromFiles: (files, origin = "user") => loadPipeline(() => buildSessionDocumentFromFiles(files), origin),

  loadFromBlobs: async (files, origin = "user") => {
    activeSessionLoad?.cancel();
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

  cancelSessionLoad: () => {
    activeSessionLoad?.cancel();
  },

  dismissSessionLoadStatus: () => set({ sessionLoadProgress: null, sessionLoadError: null }),

  reset: () => {
    activeSessionLoad?.cancel();
    get().pause();
    cancelPendingPrivacyReview();
    cloudConsent = null;
    ++cacheLoadGeneration;
    set({
      doc: null,
      viewItems: [],
      warnings: [],
      error: null,
      sessionLoadProgress: null,
      sessionLoadError: null,
      primaryView: "overview",
      structureDrawerOpen: false,
      mapOpen: false,
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
      restoredAnnotationCount: 0,
    });
  },

  setProvider: (id) => {
    if (id !== "cloud") {
      cancelPendingPrivacyReview();
      cloudConsent = null;
    }
    set({ providerId: id, showAnnotations: id !== "none", annotationErrors: {} });
    if (id === "ollama") void get().refreshOllamaStatus();
    if (id === "cloud") void get().refreshOpenCodeStatus();
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
    cloudConsent = null;
    set((s) => ({ cloudConfig: { ...s.cloudConfig, ...patch } }));
    void refreshCurrentCacheMatches();
  },

  setOpenCodeModel: (modelID) => {
    cloudConsent = null;
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

  setPrivacyPolicy: (privacyPolicyId) => {
    if (pendingPrivacyReviewer) return;
    cloudConsent = null;
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
    cloudConsent = {
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
    cloudConsent = null;
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
    set({ primaryView, mapOpen: false, mapError: null });
  },

  startReading: () => {
    get().pause();
    set({ primaryView: "reader", mapOpen: false, mapError: null });
  },

  toggleStructureCollapsed: () => set((state) => ({ structureCollapsed: !state.structureCollapsed })),

  openStructureDrawer: () => {
    const state = get();
    if (!state.doc || state.privacyReview) return;
    state.pause();
    set({ structureDrawerOpen: true, mapOpen: false, mapError: null });
  },

  closeStructureDrawer: () => set({ structureDrawerOpen: false }),

  openMap: () => {
    const state = get();
    if (!state.doc || state.privacyReview || state.structureDrawerOpen) return;
    state.pause();
    set({
      mapOpen: true,
      mapZoomLevel: "global",
      mapFocusId: state.playingId ?? state.activeId ?? state.viewItems[0]?.id ?? null,
      mapError: null,
    });
  },

  closeMap: () => set({ mapOpen: false, mapError: null }),

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

  setActive: (id) => {
    get().pause();
    set({ activeId: id, playingId: null, primaryView: "reader", structureDrawerOpen: false, mapOpen: false, mapError: null });
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
      if (providerId === "cloud") {
        const cloud = get().cloudConfig;
        const scope = `${doc.session.id}\0${cloud.baseUrl}\0${cloud.providerID}\0${cloud.modelID}\0${get().privacyPolicyId}`;
        ann = await annotateOpenCodeWithPrivacy(span, context, {
          gateway: defaultPrivacyGateway,
          transport: createOpenCodeTransport(cloud),
          privacyRequest: { policyId: get().privacyPolicyId },
          reviewer: async (inspection) => {
            if (cloudConsent?.scope === scope) return { consentId: cloudConsent.consentId };
            if (pendingPrivacyReviewer) {
              throw new PrivacyError("PRIVACY_DETECTOR_FAILED", "Another privacy review is already in progress; no data was sent.");
            }
            return new Promise<PrivacyConsent | null>((resolve) => {
              pendingPrivacyReviewer = resolve;
              set({ privacyReview: { inspection, itemId: id }, structureDrawerOpen: false, mapOpen: false, mapError: null });
            });
          },
        });
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
