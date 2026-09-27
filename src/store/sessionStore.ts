/**
 * Session 狀態 (Zustand)。UI 只與此 store 互動，不直接碰 pipeline / provider，維持低耦合。
 */
import { create } from "zustand";
import type { Annotation, ProviderId, SessionDocument, SourceId, Span } from "@/types/spanTree";
import { SUPPORTED_SOURCES } from "@/core/source/profiles";
import type { PrimaryView, SessionOrigin } from "@/core/view/workspace";
import type { MapZoomLevel } from "@/core/view/sessionMap";
import {
  buildSessionDocument,
  buildSessionDocumentFromFiles,
  type PipelineResult,
  type TranscriptFileInput,
} from "@/core/pipeline";
import { hasFatal, PipelineFatalError, type Diagnostic } from "@/core/diagnostics/contracts";
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
import { MESSAGES, LOCALE_ORDER, type Locale } from "@/i18n/locales";
import { resetFallbackReport } from "@/core/diagnostics";
import { readOnboardingCompleted, writeOnboardingCompleted } from "@/core/onboarding/repository";
import {
  SessionLoadCancelledError,
  startSessionLoad,
  type SessionBlobInput,
  type SessionLoadProgress,
  type SessionLoadTask,
} from "@/core/ingest";
import {
  buildSessionIndex,
  chainMembers,
  clearDirectoryHandle,
  directorySourceFromFileList,
  DirectoryPermissionError,
  DirectoryPickCancelledError,
  isDirectoryPickerSupported,
  pickDirectory,
  readDirectoryHandles,
  restoreDirectorySource,
  saveDirectoryHandle,
  type DirectorySource,
  type SessionIndexEntry,
  type SessionKind,
} from "@/core/index";

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

/**
 * DSM-4：Session 瀏覽器的狀態。
 *
 *   closed --pick--> picking --cancel--> closed
 *                    picking --got handle--> indexing --ok--> indexed
 *                                            indexing --fail--> index_failed --retry--> picking
 *   closed --resume, no picker--> fallback --user presses 選擇資料夾--> indexing
 *   indexed --refresh--> indexing
 *   indexed --choose--> loading --done|fail--> indexed
 *
 * 最後那一條（loading）是這台機器存在的理由：**載入失敗必須回到清單，而不是回到空白的 app**。
 *
 * R9.1 RC-A：`closed` 是唯一讓瀏覽器整個消失的值（見 surfaceSelectors），因此它只能由
 * **使用者的意思**抵達——關閉、初始、或在系統選擇器按取消。任何失敗都不得落在這裡；
 * 舊名 `no_directory` 讓「還沒選目錄」與「失敗了但還沒有任何條目」看起來像同一件事，
 * 於是失敗可以無聲退場。改名是為了讓「誰有資格讓瀏覽器消失」變成讀得出來的事。
 *
 * 2026-09 UX 走查 F7：`fallback` 是這一輪新增的，理由同上一段。沒有目錄選擇器的瀏覽器原本
 * 借用 `picking`，於是畫面說「等待你選擇資料夾…」——但**沒有東西在等**：那條路徑沒有開任何
 * 選擇器，要等的是使用者去按對話框裡的「選擇資料夾」。一個狀態承載兩種現實，文案就只能對其中
 * 一種說實話。分成兩個值之後，兩句話各自為真。
 *
 * 全集寫成執行期常數再導出型別，不是反過來：`browseFailure.test.ts` 的「只有 closed 會讓瀏覽器
 * 消失」是對這個全集窮舉的閘，手抄一份清單就會在新增狀態時安靜地漏掉它——這一次差點就是。
 */
export const BROWSE_STATES = [
  "closed", "picking", "fallback", "indexing", "indexed", "index_failed", "loading",
] as const;
export type BrowseState = (typeof BROWSE_STATES)[number];

/**
 * 一次載入嘗試留下的、非錯誤的告知。目前只有一種：使用者按了取消。
 *
 * 2026-09 UX 走查 F8：`cancelSessionLoad()` 原本只呼叫 `task.cancel()`，進度條隨即消失，
 * 畫面上什麼都沒說。使用者不知道取消成功了沒，也不知道原本那份文件還在不在——而它其實一直在
 * （狀態列上那句「載入期間保留目前文件」講的就是這件事，只是它跟著進度條一起不見了）。
 *
 * 存成代碼而不是句子：文案的唯一定義處是字典，元件不自己組字 (SM-12 rule 2)。
 */
export type SessionLoadNotice = "cancelled";

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
/**
 * 目前這則待核准的複核，當初是用哪個 scope 字串發起的。
 *
 * R11 (S-03)：核准端原本自己重組一份 scope，而重組的格式和 `privacyReviewer(scope)`
 * 那三處產生的格式不一樣（少了 provider 前綴，且不管哪個 provider 都讀 `cloudConfig`）。
 * 兩份字串永遠不相等，於是「同一個 scope 只需同意一次」從來沒有生效過——每一則講解都
 * 重新彈出複核；更糟的是非 cloud 供應商的同意紀錄裡存的是 cloud 的 endpoint 與 model，
 * 也就是同意書上寫錯了對象。
 *
 * 修法不是把兩份格式對齊——那正是它們當初能分岔的原因。改成把發起時的那一份原樣留著，
 * 核准時直接沿用，格式只有一個產生點。
 */
let pendingPrivacyScope: string | null = null;
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
  pendingPrivacyScope = null;
}

/**
 * 每一個「意義只屬於當前 session」的欄位的歸零值。
 *
 * R9 (RC-5)：在此之前，`publishPipelineResult` 用一份 30 行的手寫清單逐欄復位，`reset()`
 * 又抄了一份較短的。新增一個 session 範圍的欄位卻忘了加進其中一份，就會留下一個永遠不會
 * 被清掉的旗標——Prism RC-37 的「地圖建立中…永久卡死」正是這一類。現在只有一份清單，
 * 且由 sessionStore.test.ts 對照執行期的鍵集合斷言。
 */
const SESSION_SCOPED_INITIAL_STATE = {
  diagnostics: [] as Diagnostic[],
  warningsDismissed: false,
  parseNoticeAcknowledged: true,
  error: null as Diagnostic | null,
  structureDrawerOpen: false,
  mapOpen: false,
  settingsOpen: false,
  mapZoomLevel: "global" as MapZoomLevel,
  mapFocusId: null as string | null,
  mapError: null as string | null,
  activeId: null as string | null,
  playingId: null as string | null,
  annotations: {} as Record<string, Annotation>,
  annotatingIds: {} as Record<string, true>,
  annotationErrors: {} as Record<string, string>,
  annotateProgress: null as AnnotateProgress | null,
  privacyReview: null as PrivacyReviewState | null,
  sessionFingerprint: null as string | null,
  itemFingerprints: {} as Record<string, string>,
  cachedForCurrentConfig: {} as Record<string, true>,
  cachedAnnotationCount: 0,
  restoreNotice: null as { count: number } | null,
};

/** 測試用：斷言「所有 session 範圍欄位都在同一份清單裡」。 */
export const __sessionScopedKeys = Object.keys(SESSION_SCOPED_INITIAL_STATE);

/**
 * R12 M3：把一級選單的選擇帶進**載入**路徑——但只當作驗證，不當作覆寫。
 *
 * 索引那一側（M2 的 `expectSource`）是「去哪裡找」，選擇具有決定權。載入這一側不同：檔案已經
 * 在手上了，adapter 也已經按內容認出它是什麼。這時若選擇與內容不合，**內容才是事實**——照著
 * 選擇去重新解讀一份 Codex 檔案只會長出一棵錯的樹。所以這裡不改任何解析結果，只多說一句。
 *
 * 也就是 INV-R12-3 的落地：不合就具名講出來，絕不無聲改判。
 */
function verifyAgainstChosenSource(result: PipelineResult, chosen: SourceId | null): PipelineResult {
  const actual = result.doc.session.source;
  if (!chosen || actual === chosen) return result;
  return {
    doc: result.doc,
    diagnostics: [...result.diagnostics, { tier: "warn", code: "LOAD_SOURCE_MISMATCH", detail: actual }],
  };
}

function publishPipelineResult({ doc, diagnostics }: PipelineResult, sessionOrigin: SessionOrigin): void {
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
    ...SESSION_SCOPED_INITIAL_STATE,
    doc,
    viewItems,
    diagnostics,
    // 每次重新發布都重算。R9 D5：只有 fatal 才強制彈窗；info/warn 走非阻斷的橫幅，
    // 因為「有 2 行是我還沒支援的已知型別」不該把使用者攔在確認鍵前面 (RC-3)。
    parseNoticeAcknowledged: !hasFatal(diagnostics),
    // 使用者自己載入的 session 直接進閱讀；總覽只當作內建範例的著陸頁。
    primaryView: sessionOrigin === "user" ? "reader" : "overview",
    sessionOrigin,
    activeId: viewItems[0]?.id ?? null,
    cacheReady: snapshotMode,
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

/**
 * 目前索引所依據的目錄來源。放在模組層而非 state：它帶著檔案 handle（不可序列化，也不該
 * 觸發 re-render），state 只保留可顯示的結果。載入某一筆時要重新從這裡取檔案內容。
 */
let activeDirectorySource: DirectorySource | null = null;

/**
 * DSM-4 · R11.2 C6：挑選/索引是跨多個 await 的非同步流程（`buildSessionIndex` 逐檔掃描，
 * 幾百個 session 掃完要一段時間），而 `closeBrowser()` 只把 `browseState` 寫回 `"closed"`，
 * 從未取消背景中還在跑的那次索引。索引完成時它的 `.then`/`await` 續行毫無防備地把
 * `browseState` 又寫回 `"indexing"`/`"indexed"`——`selectSurfaceWants()` 只認
 * `browseState !== "closed"`，於是對話框在使用者關掉之後自己重新彈出，且因為索引其實已在
 * 背景跑完，它重新出現時落在 `"indexed"`，看起來像是「沒有經過索引中的狀態」。
 *
 * 這個世代計數器讓每一次「使用者要求打開瀏覽器」的動作認領一個世代；`closeBrowser()` 遞增
 * 它，使任何仍在飛行中的舊世代在恢復時發現自己已經過期，直接放棄寫入而不是覆蓋 `"closed"`。
 */
let browseGeneration = 0;

/**
 * 上次挑選的目錄 handle，在模組載入時就先讀好 (R9.1 RC-A step 4)。
 *
 * `showDirectoryPicker()` 與 `requestPermission()` 都必須發生在使用者手勢裡。原本點擊路徑
 * 的第一個 await 是 IndexedDB 開啟——而快取清空後的第一次還要跑一次 schema 升級，那是一趟
 * 貨真價實的往返。把它移到啟動時，點擊路徑的第一個 await 就是選擇器本身。
 *
 * 還沒讀完就被點到時值是 null，行為退化成「開選擇器」——比毀掉手勢安全。
 */
let cachedDirectoryHandles: Partial<Record<SourceId, unknown>> = {};

/**
 * R12 M2：handle 讀取發生在模組載入時，那時還沒有任何介面可以顯示訊息。讀出來的診斷先存在
 * 這裡，由下一次 `runIndex` 併進 `indexDiagnostics`——這是 `INDEX_HANDLE_NOT_PERSISTED` 已經
 * 在走的同一條路（存的時候拿到診斷、索引完成後才顯示），不是新發明的通道。
 */
let pendingHandleNotices: Diagnostic[] = [];
void readDirectoryHandles(SUPPORTED_SOURCES).then(({ handles, notices }) => {
  /*
   * DW-21：合併，不是覆寫。原本是 `cachedDirectoryHandles = handles`——整包取代。使用者若在
   * 這個 promise 落地之前就選好資料夾（冷啟動的第一次互動，而 IndexedDB 的第一次開啟還要跑
   * schema 升級，那是一趟真的往返），剛選的 handle 會被上一輪存下的舊值蓋掉，該來源在這個
   * session 剩下的時間都會「回到上一次的位置」或退化成開選擇器。下次重載又會自己好
   * （選擇當下已經寫進 IndexedDB 了），所以沒有人會把它當成 bug 回報。
   *
   * 順序即優先權：這個 session 裡剛選的一定比啟動時讀到的新，所以已經有值的鍵不被覆蓋；
   * 沒被選過的來源仍然照常採用存起來的位置。
   */
  cachedDirectoryHandles = { ...handles, ...cachedDirectoryHandles };
  pendingHandleNotices = notices;
});

/**
 * 整個目錄讀不起來（不是單一檔案讀不到）。R9.1 RC-A：這裡原本回報 `INDEX_FILE_UNREADABLE`
 * 的 warn，語意與分級都比實際情況輕——使用者面對的是「一個條目都沒有」，那是 fatal。
 */
function toIndexDiagnostic(error: unknown): Diagnostic {
  return { tier: "fatal", code: "INDEX_DIRECTORY_UNREADABLE", detail: error instanceof Error ? error.message : String(error) };
}

type SetState = (partial: Partial<SessionState>) => void;

/**
 * `generation` must be the value `browseGeneration` held when the caller started this browse
 * operation. Every `set()` that follows an `await` re-checks it against the live counter first —
 * if the user closed the dialog (or started a fresh pick) while this indexing run was still in
 * flight, `browseGeneration` has since moved on and this stale run must not write over `"closed"`.
 */
async function runIndex(
  set: SetState,
  source: DirectorySource,
  generation: number,
  expectSource?: SourceId,
): Promise<void> {
  activeDirectorySource = source;
  if (browseGeneration !== generation) return;
  set({ browseState: "indexing", browseDirectoryName: source.name, browseProgress: [0, 0], indexDiagnostics: [] });
  const index = await buildSessionIndex(source, {
    expectSource,
    onProgress: (done, total) => {
      if (browseGeneration !== generation) return;
      set({ browseProgress: [done, total] });
    },
  });
  if (browseGeneration !== generation) return;
  // R12 M2: anything the module-load handle read wanted to say gets its first surface here,
  // then is dropped so it is reported once rather than on every browse.
  const carried = pendingHandleNotices;
  pendingHandleNotices = [];
  set({
    browseState: "indexed",
    browseProgress: null,
    indexEntries: index.entries,
    indexDiagnostics: [...carried, ...index.diagnostics],
  });
}

/** 任何載入路徑的失敗都收斂成同一個 typed diagnostic，寫進同一個欄位 (RC-5)。 */
function toFatalDiagnostic(error: unknown): Diagnostic {
  if (error instanceof PipelineFatalError) return error.diagnostic;
  return { tier: "fatal", code: "LOAD_FAILED", detail: error instanceof Error ? error.message : String(error) };
}

function loadPipeline(build: () => PipelineResult, origin: SessionOrigin): void {
  // 必須在 build() 之前清空：降級記錄只反映目前這份資料，而 normalizer 的事件是在 build() 期間產生的。
  resetFallbackReport();
  try {
    publishPipelineResult(build(), origin);
  } catch (error) {
    // 重新武裝阻斷面：新的 fatal 必須被看見一次，即使上一份 session 的提示已被確認過。
    useSessionStore.setState({ error: toFatalDiagnostic(error), parseNoticeAcknowledged: false, cacheReady: true });
  }
}

export interface SessionState {
  doc: SessionDocument | null;
  viewItems: ViewItem[];
  /** R9：分級診斷取代原本不分級的 `warnings: string[]`，見 core/diagnostics/contracts.ts。 */
  diagnostics: Diagnostic[];
  /**
   * 載入失敗的唯一擁有者。R9 之前同步路徑寫 `error`、worker 路徑寫 `sessionLoadError`，
   * 同一件事有兩個擁有者、兩處要顯示 (RC-5)。
   */
  error: Diagnostic | null;
  sessionLoadProgress: SessionLoadProgress | null;
  /** 上一次載入嘗試留下的告知（目前只有「已取消」）；與 progress 互斥，見 SessionLoadStatus。 */
  sessionLoadNotice: SessionLoadNotice | null;

  /**
   * R12 M2：一級選單挑的 agent 系統，`null` = 還沒挑。
   *
   * 這是**探索階段**的狀態，不是檢視階段的。載入完成後檢視走的仍是同一套 `SessionDocument`
   * 與同一個 viewer，跟這個值無關（INV-R12-4）——它只決定「去哪裡找、用誰的規則找」。
   */
  activeSource: SourceId | null;

  // ---- DSM-4：Session 瀏覽器 (R9) ----
  browseState: BrowseState;
  browseDirectoryName: string | null;
  /** 索引進度 [已掃, 總數]；null = 不在索引中。 */
  browseProgress: [number, number] | null;
  indexEntries: SessionIndexEntry[];
  indexDiagnostics: Diagnostic[];
  /** 分類篩選。D4：預設全開，分類是徽章不是過濾器。 */
  browseFilter: Record<SessionKind, boolean>;

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
  /** 解析提示已被使用者收起；提示內容仍留在 diagnostics，總覽的則數不受影響。 */
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

  // ---- DSM-4 actions ----
  /**
   * R12 M2：挑一級選單。**只設定狀態，不開任何選擇器**——瀏覽器要求 `showDirectoryPicker()`
   * 發生在使用者手勢裡，把兩件事綁在一起會讓「挑系統」這個動作也被算進手勢預算，而使用者
   * 這時可能只是想看看有哪些選項。二級的資料夾／單檔按鈕才是真正發動的地方。
   */
  chooseSource: (source: SourceId) => void;
  /** 回到一級選單。清掉索引結果：那份清單屬於前一套系統，留著會被誤讀成新選擇的內容。 */
  clearSource: () => void;
  /** 開啟系統目錄選擇器並索引 (FSA 路徑)。 */
  pickAndIndexDirectory: () => Promise<void>;
  /** webkitdirectory 後備路徑：<input> 已經交出檔案了，直接索引。 */
  indexFileList: (files: File[], name: string) => Promise<void>;
  /** 還原上次的目錄 (只有 FSA 有此能力)；沒有存過就開啟選擇器。 */
  resumeLastDirectory: () => Promise<void>;
  closeBrowser: () => void;
  toggleBrowseFilter: (kind: SessionKind) => void;
  /** 從清單挑一個 session 載入。載入結束後回到清單，清單不消失。 */
  loadIndexEntry: (path: string) => Promise<void>;
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

/** 首次啟動時依瀏覽器語言猜初始 locale (問題4)：目前只分繁中/英文兩種字典，非中文一律落在 en。
 *  只在「還沒看過 onboarding」時呼叫，不會覆蓋使用者已經明確選過的語言。 */
function detectInitialLocale(): Locale | null {
  if (typeof navigator === "undefined") return null;
  const langs = navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  const lang = (langs[0] ?? "").toLowerCase();
  if (!lang) return null;
  const detected: Locale = lang.startsWith("zh") ? "zh-TW" : "en";
  return LOCALE_ORDER.includes(detected) ? detected : null;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  doc: null,
  viewItems: [],
  diagnostics: [],
  error: null,
  sessionLoadProgress: null,
  sessionLoadNotice: null,

  activeSource: null,
  browseState: "closed",
  browseDirectoryName: null,
  browseProgress: null,
  indexEntries: [],
  indexDiagnostics: [],
  browseFilter: { dialogue: true, subagent: true, machine: true, unknown: true },

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
    loadPipeline(() => ({ doc: payload.document, diagnostics: [] }), "user");
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
      error: null,
      // 新的嘗試取代上一次的結局；兩者同時在畫面上會互相矛盾。
      sessionLoadNotice: null,
    });
    // startSessionLoad 本身也會丟（建構 Worker 失敗：CSP、file://、瀏覽器不支援 module worker）。
    // 它原本在 try 之外，於是那條路徑會讓進度條永遠停在「讀取中」——這正是 RC-5 的洩漏型缺陷，
    // 由 DSM-4 的 transition test 撞出來。任何會丟的東西都必須在同一個 try 裡。
    let task: SessionLoadTask | undefined;
    try {
      task = startSessionLoad(files, (progress) => {
        if (activeSessionLoad === task) set({ sessionLoadProgress: progress });
      });
      activeSessionLoad = task;
      const result = await task.promise;
      if (activeSessionLoad !== task) return;
      publishPipelineResult(verifyAgainstChosenSource(result, get().activeSource), origin);
      set({
        sessionLoadProgress: {
          phase: "ready",
          loadedBytes: totalBytes,
          totalBytes,
          lineCount: get().sessionLoadProgress?.lineCount ?? 0,
          sourcePath: null,
        },
      });
    } catch (error) {
      // task 未建立時 activeSessionLoad 仍是上一輪的值（或 null），不能用它當守衛，
      // 否則建構失敗這條路徑會整個被跳過，進度條又留在原地。
      if (task && activeSessionLoad !== task) return;
      if (error instanceof SessionLoadCancelledError) {
        set({ sessionLoadProgress: null, error: null });
      } else {
        set({ sessionLoadProgress: null, error: toFatalDiagnostic(error), parseNoticeAcknowledged: false, cacheReady: true });
      }
    } finally {
      if (task && activeSessionLoad === task) activeSessionLoad = null;
    }
  },

  /*
   * R9.1 RC-A：挑選與索引是**兩個階段**，錯誤分類必須跟著分開。
   *
   * 原本兩段共用一個 try，而「取消」的判準是 AbortError——但 `pickDirectory` 內部已經把
   * 任何 AbortError 轉成 DirectoryPickCancelledError，而索引階段的 `getFile()` 在剛授權的
   * handle 上是會丟 AbortError 的。結果：索引階段的失敗被讀成「使用者按了取消」，落到當時
   * 的 `no_directory` 讓整個瀏覽器消失，第二次因為 handle 已熱身就正常了——正是作者回報的
   * 「第一次靜默失敗、第二次才成功」。
   *
   * 因此：**只有第一段可以產生取消**；拿到 handle 之後的任何失敗一律是 index_failed。
   */
  chooseSource: (source) => set({ activeSource: source }),

  /*
   * R12 M2: going back to level 1 drops the index. The entries belong to the system that was
   * chosen when they were scanned, and leaving them on screen under a different choice is a
   * wrong-target display — the same class of defect as the folder memory being shared. The
   * remembered handles are NOT cleared: that is the position memory, and it survives on purpose.
   */
  clearSource: () => {
    browseGeneration += 1;
    set({ activeSource: null, browseState: "closed", indexEntries: [], indexDiagnostics: [], browseDirectoryName: null, browseProgress: null });
  },

  pickAndIndexDirectory: async () => {
    // Claims a fresh generation for this browse attempt (R11.2 C6). Every `set()` beyond the
    // first `await` below re-checks it, so a `closeBrowser()` (or a second pick) that lands
    // while `pickDirectory()`/`runIndex()` is still pending stops this run from writing over it.
    const generation = ++browseGeneration;
    const chosen = get().activeSource;
    set({ browseState: "picking" });
    let picked: Awaited<ReturnType<typeof pickDirectory>>;
    try {
      picked = await pickDirectory();
    } catch (error) {
      if (browseGeneration !== generation) return;
      if (error instanceof DirectoryPickCancelledError) {
        set({ browseState: get().indexEntries.length > 0 ? "indexed" : "closed" });
        return;
      }
      set({ browseState: "index_failed", indexDiagnostics: [toIndexDiagnostic(error)] });
      return;
    }
    if (browseGeneration !== generation) return;
    // R12 M2: remembered per source, so the two systems never overwrite each other's position.
    if (chosen) cachedDirectoryHandles = { ...cachedDirectoryHandles, [chosen]: picked.handle };
    // 記不住目錄不該擋住索引，但也不該無人知曉：診斷在索引完成後併進清單 (RC-A step 5)。
    const persisted = chosen ? saveDirectoryHandle(chosen, picked.handle) : Promise.resolve(null);
    try {
      await runIndex(set, picked.source, generation, chosen ?? undefined);
    } catch (error) {
      if (browseGeneration !== generation) return;
      set({ browseState: "index_failed", indexDiagnostics: [toIndexDiagnostic(error)] });
      return;
    }
    const storeNotice = await persisted;
    if (browseGeneration !== generation) return;
    if (storeNotice) set({ indexDiagnostics: [...get().indexDiagnostics, storeNotice] });
  },

  indexFileList: async (files, name) => {
    // WebKit fallback (no File System Access API): symmetric with pickAndIndexDirectory's
    // try/catch above `runIndex`. Without this, a throw here pinned the UI at "indexing"
    // forever — there is no picker step before this call to fail out of instead (R11 M3).
    const generation = ++browseGeneration;
    try {
      await runIndex(set, directorySourceFromFileList(files, name), generation, get().activeSource ?? undefined);
    } catch (error) {
      if (browseGeneration !== generation) return;
      set({ browseState: "index_failed", indexDiagnostics: [toIndexDiagnostic(error)] });
    }
  },

  resumeLastDirectory: async () => {
    const generation = ++browseGeneration;
    if (!isDirectoryPickerSupported()) {
      // 後備路徑沒有持久化能力，只能請使用者重選。
      // R11 M3 finding: this used to set browseState "closed", but selectSurfaceWants()
      // only opens the session-browser surface when browseState !== "closed" — so the
      // dialog (and the <input type="file" webkitdirectory> fallback that lives inside it,
      // see SessionBrowserDialog.tsx) never mounted. The old comment's claim that "the UI
      // opens the <input>" was false; there was no entry point at all. Opening the dialog
      // is right; the user then clicks the "Choose folder" header button, whose choose()
      // falls back to fileInputRef.click() when isDirectoryPickerSupported() is false.
      //
      // 2026-09 UX 走查 F7：但這裡原本設的是 `picking`，於是畫面說「等待你選擇資料夾…」——
      // 沒有任何選擇器被打開，沒有東西在等，要動的是使用者。`fallback` 是同一個對話框、
      // 不同的一句話：它指名那顆使用者需要按的按鈕。
      set({ browseState: "fallback" });
      return;
    }
    /*
     * 同步讀模組層快取，不在點擊路徑上碰 IndexedDB——見 cachedDirectoryHandles。
     *
     * R12 M2：讀的是**這一套系統**上次的位置。沒挑系統時（理論上到不了，二級按鈕在一級選完
     * 之前不存在）退化成開選擇器，而不是拿另一套的位置頂替——那正是分開存要避免的事。
     */
    const chosen = get().activeSource;
    const stored = chosen ? cachedDirectoryHandles[chosen] : null;
    if (!stored) {
      await get().pickAndIndexDirectory();
      return;
    }
    set({ browseState: "picking" });
    let source: DirectorySource;
    try {
      // 權限可能已被撤回，這裡會在使用者手勢內重新要一次。
      source = await restoreDirectorySource(stored as Parameters<typeof restoreDirectorySource>[0]);
    } catch (error) {
      if (browseGeneration !== generation) return;
      if (error instanceof DirectoryPermissionError) {
        // Only this source's memory is dropped; the other system's position is untouched.
        if (chosen) {
          const { [chosen]: _dropped, ...rest } = cachedDirectoryHandles;
          cachedDirectoryHandles = rest;
          void clearDirectoryHandle(chosen);
        }
        set({ browseState: "index_failed", indexDiagnostics: [{ tier: "fatal", code: "INDEX_PERMISSION_LOST" }] });
        return;
      }
      set({ browseState: "index_failed", indexDiagnostics: [toIndexDiagnostic(error)] });
      return;
    }
    if (browseGeneration !== generation) return;
    // 授權之後的失敗與「權限沒拿到」是兩件事，不共用一個 catch (RC-A)。
    try {
      await runIndex(set, source, generation, chosen ?? undefined);
    } catch (error) {
      if (browseGeneration !== generation) return;
      set({ browseState: "index_failed", indexDiagnostics: [toIndexDiagnostic(error)] });
    }
  },

  closeBrowser: () => {
    // R11.2 C6: invalidate any in-flight browse generation so its eventual `set()` calls
    // (see `runIndex`) recognize they're stale and stop short of reopening the dialog.
    browseGeneration++;
    set({ browseState: "closed", browseProgress: null });
  },

  toggleBrowseFilter: (kind) => set((state) => ({
    browseFilter: { ...state.browseFilter, [kind]: !state.browseFilter[kind] },
  })),

  loadIndexEntry: async (path) => {
    const { indexEntries } = get();
    const entry = indexEntries.find((candidate) => candidate.path === path);
    const source = activeDirectorySource;
    if (!entry || !source) return;

    // Same class as runIndex (R11.2 C6): the close button stays reachable while this is in
    // flight ("loading" doesn't hide the dialog header). Capture the live generation so the
    // `finally` below can tell whether `closeBrowser()` ran while we were awaiting.
    const generation = browseGeneration;
    set({ browseState: "loading" });
    try {
      const files = await source.list();
      const byPath = new Map(files.map((file) => [file.path, file]));
      /*
       * 2026-09-compact-chain: a row stands for its whole chain. Blobs go in chain order — the
       * root, then each continuation — with every member's own subagents right behind it; the
       * pipeline relies on that order to drop the records a continuation copied from its parent.
       * A path that is not itself a chain root (only reachable from stale state, the picker folds
       * children) loads as before: itself plus its own descendants.
       */
      const blobs: SessionBlobInput[] = [];
      for (const [position, memberPath] of chainMembers(indexEntries, entry.path).entries()) {
        const member = indexEntries.find((candidate) => candidate.path === memberPath);
        if (!member) continue;
        for (const path of [member.path, ...member.subagentPaths]) {
          const file = byPath.get(path);
          if (!file) continue;
          const blob: SessionBlobInput = { path, blob: await file.read() };
          if (position > 0 && path === member.path) blob.role = "continuation";
          blobs.push(blob);
        }
      }
      await get().loadFromBlobs(blobs, "user");
    } catch (error) {
      set({ error: toFatalDiagnostic(error), parseNoticeAcknowledged: false });
    } finally {
      // 不論成敗都回到清單 (DSM-4)：失敗把使用者丟回空白畫面才是真正的死路。
      // 但若使用者已經關閉瀏覽器，這件事的優先序反過來——不得覆寫 "closed"。
      if (browseGeneration === generation) set({ browseState: "indexed" });
    }
  },

  /*
   * 2026-09 UX 走查 F8。回饋在**這裡**給，不從 loadFromBlobs 的 catch 反推。
   *
   * 那個 catch 認的是 `SessionLoadCancelledError`，而 `reset()` 與「開始下一次載入」也都會
   * 呼叫 `task.cancel()`——照那條路走，重置之後會冒出一句「已取消載入，仍顯示原本的文件」，
   * 而那時文件根本已經被換掉了。取消的**意思**只有使用者按這顆按鈕時才成立，所以判準放在
   * 意思的來源處，不放在它引發的例外上。這與 D-023 無關、也不動它：那條裁決講的是「選擇器
   * 拒絕」與「使用者取消」在 API 層分不開，處理方式不變，這裡加的是取消**成功之後**說一句話。
   */
  cancelSessionLoad: () => {
    if (!activeSessionLoad) return;
    activeSessionLoad.cancel();
    set({ sessionLoadNotice: "cancelled" });
  },

  dismissSessionLoadStatus: () => set({ sessionLoadProgress: null, sessionLoadNotice: null, error: null }),
  dismissWarnings: () => set({ warningsDismissed: true }),
  // 確認即清掉 fatal：使用者已經看過原因與下一步，留著它只會讓空狀態重複同一句話。
  acknowledgeParseNotice: () => set({ parseNoticeAcknowledged: true, error: null }),
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
      ...SESSION_SCOPED_INITIAL_STATE,
      doc: null,
      viewItems: [],
      sessionLoadProgress: null,
      // reset() 也會取消進行中的載入，但那不是使用者按了「取消載入」，不該留下那句告知。
      sessionLoadNotice: null,
      primaryView: "overview",
      cacheReady: true,
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
    // EX-INV-1/3: a snapshot must issue zero network requests. `loadConfigFile()` fetches
    // `./dit.config.json`, so this is the one enforcement point for every caller (M2, R11).
    if (get().snapshotMode) return;
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
    // 沿用發起這則複核時的 scope，不重組（見 pendingPrivacyScope）。
    dataOutConsent = pendingPrivacyScope === null ? null : { scope: pendingPrivacyScope, consentId };
    pendingPrivacyReviewer = null;
    pendingPrivacyScope = null;
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
    set({ providerId: "none", showAnnotations: true, ollamaStatus: null, openCodeStatus: null, annotateProgress: null, privacyReview: null, sessionLoadProgress: null, error: null });
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
    if (completed) return;
    const detected = detectInitialLocale();
    set({ welcomeOpen: true, ...(detected ? { locale: detected } : {}) });
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
          pendingPrivacyScope = scope;
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
