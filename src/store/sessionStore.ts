/**
 * Session 狀態 (Zustand)。UI 只與此 store 互動，不直接碰 pipeline / provider，維持低耦合。
 */
import { create } from "zustand";
import type { Annotation, ProviderId, SessionDocument, Span } from "@/types/spanTree";

/** 視圖模式：cognitive=認知/魚骨蒸餾；dense=高密度卡片時間軸。 */
export type ViewMode = "cognitive" | "dense";
import { buildSessionDocument, PipelineError } from "@/core/pipeline";
import { buildViewModel, type ViewItem } from "@/core/view/viewModel";
import { getProvider, checkOllama, DEFAULT_OLLAMA_CONFIG, type OllamaStatus } from "@/core/llm";
import { sampleSession } from "@/fixtures";

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

/** 雲端 provider 設定 (目前為 UI 骨架；呼叫端仍為樁，尚未送出)。 */
interface CloudConfigState {
  baseUrl: string;
  model: string;
  apiKey: string;
}

/** 「講解全部」的進度，供 UI 顯示，緩解等待焦慮。null = 未在執行。 */
export interface AnnotateProgress {
  total: number;
  done: number;
  /** 目前正在講解的 view item id (null = 節點間空檔 / 已完成)。 */
  currentId: string | null;
}

const REPLAY_INTERVAL_MS = 1600;
let replayTimer: ReturnType<typeof setInterval> | null = null;
/** 「講解全部」取消旗標 (模組層級，不入 state 以免每次勾選觸發 re-render)。 */
let annotateCancelled = false;

/** 取某個 view item 的代表 span (group 取第一個成員)。 */
function primarySpan(item: ViewItem): Span {
  return item.type === "span" ? item.node.span : item.nodes[0].span;
}

interface SessionState {
  doc: SessionDocument | null;
  viewItems: ViewItem[];
  warnings: string[];
  error: string | null;

  providerId: ProviderId;
  showAnnotations: boolean;
  viewMode: ViewMode;

  /** Ollama 連線設定 (使用者可在面板調整)。 */
  ollamaConfig: OllamaConfigState;
  /** 最近一次 Ollama 探測結果 (null = 尚未探測)。 */
  ollamaStatus: OllamaStatus | null;
  /** 雲端設定 (UI 骨架；尚未實際送出)。 */
  cloudConfig: CloudConfigState;

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
  loadFromText: (raw: string) => void;
  reset: () => void;
  setProvider: (id: ProviderId) => void;
  setOllamaModel: (model: string) => void;
  updateOllamaConfig: (patch: Partial<OllamaConfigState>) => void;
  refreshOllamaStatus: () => Promise<void>;
  updateCloudConfig: (patch: Partial<CloudConfigState>) => void;
  toggleAnnotations: () => void;

  /** 全域重置：回到內建範例與預設設定。 */
  resetToSample: () => void;
  /** 局域重置：清除所有講解結果 (不動已載入的 session)。 */
  clearAnnotations: () => void;
  /** 局域重置：取消選取並停止重播 (不動已載入的 session)。 */
  clearSelection: () => void;
  setViewMode: (mode: ViewMode) => void;
  setActive: (id: string) => void;

  play: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  gotoIndex: (i: number) => void;

  annotateItem: (id: string) => Promise<void>;
  annotateAll: () => Promise<void>;
  /** 中止進行中的「講解全部」(目前節點跑完即停)。 */
  cancelAnnotateAll: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  doc: null,
  viewItems: [],
  warnings: [],
  error: null,

  providerId: "none",
  showAnnotations: true,
  viewMode: "cognitive",

  ollamaConfig: {
    baseUrl: DEFAULT_OLLAMA_CONFIG.baseUrl,
    model: DEFAULT_OLLAMA_CONFIG.model,
    timeoutMs: DEFAULT_OLLAMA_CONFIG.timeoutMs,
    disableThinking: false,
    keepAlive: DEFAULT_OLLAMA_CONFIG.keepAlive ?? "10m",
    numPredict: DEFAULT_OLLAMA_CONFIG.numPredict ?? 512,
  },
  ollamaStatus: null,
  cloudConfig: { baseUrl: "", model: "", apiKey: "" },

  annotateProgress: null,

  activeId: null,
  playingId: null,
  isPlaying: false,

  annotations: {},
  annotatingIds: {},
  annotationErrors: {},

  loadFromText: (raw) => {
    get().pause();
    annotateCancelled = true;
    set({ annotateProgress: null });
    try {
      const { doc, warnings } = buildSessionDocument(raw);
      const viewItems = buildViewModel(doc);
      // 開發期除錯：把處理結果掛到 window，方便檢視資料流 (production build 不含)。
      if (import.meta.env.DEV) (window as unknown as { __DIT?: unknown }).__DIT = { doc, viewItems };
      set({
        doc,
        viewItems,
        warnings,
        error: null,
        activeId: viewItems[0]?.id ?? null,
        playingId: null,
        annotations: {},
        annotatingIds: {},
        annotationErrors: {},
      });
    } catch (e) {
      const msg = e instanceof PipelineError ? e.message : `載入失敗：${(e as Error).message}`;
      set({ doc: null, viewItems: [], warnings: [], error: msg, activeId: null });
    }
  },

  reset: () => {
    get().pause();
    set({ doc: null, viewItems: [], warnings: [], error: null, activeId: null, playingId: null });
  },

  setProvider: (id) => {
    set({ providerId: id, showAnnotations: id !== "none" });
    if (id === "ollama") void get().refreshOllamaStatus();
  },

  setOllamaModel: (model) => {
    set((s) => ({ ollamaConfig: { ...s.ollamaConfig, model } }));
    void get().refreshOllamaStatus();
  },

  updateOllamaConfig: (patch) => set((s) => ({ ollamaConfig: { ...s.ollamaConfig, ...patch } })),

  updateCloudConfig: (patch) => set((s) => ({ cloudConfig: { ...s.cloudConfig, ...patch } })),

  refreshOllamaStatus: async () => {
    set((s) => ({ ollamaStatus: { ...(s.ollamaStatus ?? { models: [] as string[] }), state: "checking", baseUrl: s.ollamaConfig.baseUrl, model: s.ollamaConfig.model, message: "探測中…" } as OllamaStatus }));
    const status = await checkOllama(get().ollamaConfig);
    set({ ollamaStatus: status });
  },

  toggleAnnotations: () => set((s) => ({ showAnnotations: !s.showAnnotations })),

  resetToSample: () => {
    get().pause();
    annotateCancelled = true;
    set({ providerId: "none", showAnnotations: true, viewMode: "cognitive", ollamaStatus: null, annotateProgress: null });
    get().loadFromText(sampleSession);
  },

  // 清空講解後，魚骨「可帶走的觀念」(讀 annotations) 也會自動消失。
  clearAnnotations: () => {
    annotateCancelled = true;
    set({ annotations: {}, annotatingIds: {}, annotationErrors: {}, annotateProgress: null });
  },

  clearSelection: () => {
    get().pause();
    set({ activeId: null, playingId: null });
  },

  setViewMode: (mode) => set({ viewMode: mode }),
  setActive: (id) => set({ activeId: id }),

  gotoIndex: (i) => {
    const { viewItems } = get();
    if (viewItems.length === 0) return;
    const idx = Math.max(0, Math.min(viewItems.length - 1, i));
    set({ playingId: viewItems[idx].id, activeId: viewItems[idx].id });
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
    if (!doc || providerId === "none" || annotatingIds[id]) return;

    const idx = viewItems.findIndex((v) => v.id === id);
    if (idx < 0) return;
    const span = primarySpan(viewItems[idx]);
    const prev = idx > 0 ? primarySpan(viewItems[idx - 1]).summary : undefined;

    set((s) => ({ annotatingIds: { ...s.annotatingIds, [id]: true }, annotationErrors: omit(s.annotationErrors, id) }));
    try {
      const oc = get().ollamaConfig;
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
      const ann = await provider.annotate(span, { sessionTitle: doc.session.title, prevSummary: prev });
      if (ann) set((s) => ({ annotations: { ...s.annotations, [id]: ann } }));
    } catch (e) {
      set((s) => ({ annotationErrors: { ...s.annotationErrors, [id]: (e as Error).message } }));
    } finally {
      set((s) => ({ annotatingIds: omit(s.annotatingIds, id) }));
    }
  },

  annotateAll: async () => {
    const { viewItems, providerId } = get();
    if (providerId === "none" || viewItems.length === 0) return;
    if (get().annotateProgress) return; // 已在執行，避免重入。
    annotateCancelled = false;
    set({ annotateProgress: { total: viewItems.length, done: 0, currentId: null } });
    // 逐節點循序處理 (本地小模型友善；避免一次大量並發壓垮 Ollama)。
    for (const item of viewItems) {
      if (annotateCancelled) break;
      set((s) => (s.annotateProgress ? { annotateProgress: { ...s.annotateProgress, currentId: item.id } } : {}));
      await get().annotateItem(item.id);
      set((s) =>
        s.annotateProgress ? { annotateProgress: { ...s.annotateProgress, done: s.annotateProgress.done + 1, currentId: null } } : {},
      );
    }
    // 保留最終進度供 UI 顯示「完成 / 已停止」，由使用者關閉或下次重跑時清除。
  },

  cancelAnnotateAll: () => {
    annotateCancelled = true;
  },
}));

function omit<T extends Record<string, unknown>>(obj: T, key: string): T {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}
