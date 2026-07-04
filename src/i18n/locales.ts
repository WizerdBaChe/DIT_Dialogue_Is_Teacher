/**
 * i18n 訊息字典 (zh-TW / EN)。DIT 為單檔小工具，字串量小，故自製輕量字典，不引 i18next。
 *
 * 規則：
 * - zh-TW 為權威來源；`en` 以 `typeof zhTW` 約束，缺鍵/型別不符會在編譯期報錯。
 * - 需要插值的值一律寫成函式，維持型別安全與可預期的參數順序。
 * - 所有面向使用者的中文都住在這裡；元件內不得再出現硬編中文 (見 PSM R7 驗收)。
 * - 純視覺、與語言無關的常數 (節點記號、CSS class、Provider 排序) 留在 components/labels.ts。
 */
import type { ProviderId, SkeletonNodeKind, SkeletonRibKind, SpanTag, SpanType } from "@/types/spanTree";

export type Locale = "zh-TW" | "en";

export const LOCALE_ORDER: Locale[] = ["zh-TW", "en"];

/** 語言切換下拉的顯示名稱 (以各語言的自稱書寫)。 */
export const LOCALE_NATIVE_NAME: Record<Locale, string> = {
  "zh-TW": "繁體中文",
  en: "English",
};

const zhTW = {
  header: {
    brand: "DIT — Dialogue Is Teacher",
    tagline: "把 agent 執行軌跡轉成「可學習」的節點",
    modes: { cognitive: "認知", dense: "高密度" } as Record<string, string>,
    modeGroupLabel: "檢視模式",
    loadFile: "載入 .jsonl",
    reset: "重置",
    resetTitle: "回到內建範例與預設設定",
    showAnnotations: "顯示教學講解",
    annotateAll: "講解全部",
    clearAnnotations: "清除講解",
    clearAnnotationsTitle: "清除目前所有教學講解",
    prevTitle: "上一步",
    nextTitle: "下一步",
    replay: "重播",
    pause: "暫停",
    providerLabel: "講解來源",
    languageLabel: "語言",
    readFileFailed: (name: string) => `讀取檔案失敗：${name}`,
    loadFailed: (msg: string) => `載入失敗：${msg}`,
  },

  sidebar: {
    heading: "Session 結構",
    headingWithTree: "Session 結構（Span Tree）",
    empty: "尚未載入 session。",
    skeleton: (nodes: number, ribs: number) => `蒸餾骨架：主線 ${nodes} · 支線 ${ribs}`,
  },

  main: {
    emptyTitle: "載入一個 Claude Code session",
    emptyBodyPrefix: "點右上「載入 .jsonl」選擇 ",
    emptyPath: "~/.claude/projects/<專案>/*.jsonl",
    emptyBodySuffix: " 中的任一 session，DIT 會把它整理成可學習的節點。也可載入內建範例先看效果。",
    warnings: (warnings: string[]) =>
      `解析提示（${warnings.length}）：${warnings.slice(0, 3).join("；")}${warnings.length > 3 ? " …" : ""}`,
    infoTitle: "這是怎麼來的",
    infoBody:
      "原始 transcript 經過解析、正規化成 Span Tree、確定性降噪分組後渲染為上方節點。可切換右上「講解來源」加上逐節點教學，或用重播逐步走過整段任務。",
    flow: "原始 .jsonl → Adapter → Span Tree → 降噪/分組 → [講解] → 視圖",
  },

  card: {
    kindTag: "群組",
    paramsTitle: "參數",
    resultTitle: "結果",
    resultErrorTitle: "結果 · 錯誤",
    thinkingHead: "思考鏈",
    groupFolded: (steps: number) => `（折疊 ${steps} 步）`,
    groupHint: (collapsed: boolean) => `確定性降噪 · 點擊${collapsed ? "展開" : "收合"}`,
  },

  annotation: {
    via: (provider: string) => `來源 ${provider}`,
    generating: "教學講解產生中…",
    failed: (msg: string) => `講解失敗：${msg}`,
    generate: "產生教學講解",
    what: "這步在做什麼",
    why: "為什麼這樣做",
    lesson: "通用做法",
  },

  fishbone: {
    lessonPrefix: "帶走的觀念：",
    noSpineTitle: "此 session 無法蒸餾出主線",
    noSpineBody: "可能是事件太少或型別不足。切到「高密度」模式仍可逐步檢視全部內容。",
    spineTitle: (steps: number, nodes: number) => `主線：把 ${steps} 步蒸餾成 ${nodes} 個關鍵節點`,
    legendRibsSep: "支線：",
    regionLabel: "任務主線魚骨圖（可橫向捲動）",
    nodeAria: (kind: string, label: string) => `${kind}：${label}`,
    detailHead: "節點詳情（點上方節點或支線展開）",
    clearSelection: "清除選取",
    detailPlaceholder: "點上方任一節點，這裡會展開它「原本發生的內容」（已整理成卡片）。",
  },

  ollama: {
    panelLabel: "本地 Ollama 設定",
    states: {
      checking: "探測中…",
      ready: "已就緒",
      "model-missing": "已連線・指定模型未安裝",
      "no-model": "已連線・尚無模型",
      offline: "無法連線",
    } as Record<string, string>,
    defaultMsg: "準備探測本地 Ollama…",
    recheck: "重新檢查",
    expand: "展開 Ollama 設定",
    collapse: "收合 Ollama 設定",
    expandShort: "展開設定",
    collapseShort: "收合設定",
    copy: "複製",
    copied: "已複製",
    copyAria: "複製指令",
    model: "講解模型",
    notInstalled: "（未安裝）",
    timeout: "逾時",
    sec: (n: number) => `${n} 秒`,
    disableThinking: "停用思考",
    disableThinkingTitle:
      "僅對支援思考的模型 (qwen3 / deepseek-r1 / gpt-oss) 有效；gemma 等不支援者請勿勾選。",
    keepAlive: "保活",
    keepAliveTitle: "讓模型留在 VRAM、連續講解免於重複冷載入；對大模型最有感。",
    keepAliveOff: "關閉（用 Ollama 預設）",
    min: (n: number) => `${n} 分鐘`,
    numPredict: "輸出上限",
    numPredictOptions: {
      fast: "256 token（最快）",
      recommended: "512 token（建議）",
      long: "1024 token",
      unlimited: "不限",
    },
    hint:
      "模型較大 (≥4B) 首次回應需把模型載入 VRAM，可能較久 → 若逾時，先把「逾時」調到 120 秒再試。連續講解變慢多半是模型被卸載重載：把「保活」設長一點即可緩解。「停用思考」只適用 qwen3 / deepseek-r1 等會思考的模型。",
    offlineGuide: "請啟動 Ollama 並允許瀏覽器跨域存取，然後按「重新檢查」：",
    offlineHintPrefix: "↑ Windows PowerShell。或永久設定：",
    offlineHintMid: " 後重啟 Ollama。macOS/Linux：",
    offlineHintEnd: "。",
    noModelGuide: "尚未安裝任何模型。建議先 pull 一個輕量模型（擇一）：",
    noModelHint: "安裝完成後按「重新檢查」。7B 約需數 GB 空間；3B 較省資源。",
    modelMissingGuide: (model: string, installed: string) =>
      `指定模型「${model}」尚未安裝。可直接在上方下拉切換到已安裝的模型${installed}，或安裝它：`,
    modelMissingInstalled: (list: string[]) => (list.length ? `（${list.join("、")}）` : ""),
    readyNote: "講解將由本機模型產生，程式碼與紀錄不外傳。可按上方「講解全部」開始。",
  },

  cloud: {
    panelLabel: "雲端 API 設定",
    status: "尚未啟用（UI 預留）",
    msg: "雲端講解介面已就緒，但實際呼叫尚未接上；填入設定後按「講解全部」會提示尚未啟用。",
    expand: "展開雲端設定",
    collapse: "收合雲端設定",
    endpoint: "API 端點",
    endpointPlaceholder: "https://api.mistral.ai/v1（範例，尚未接上）",
    model: "模型",
    modelPlaceholder: "例：mistral-small-latest",
    apiKey: "API Key",
    apiKeyPlaceholder: "僅存在本機記憶體，不會寫入磁碟",
    hint:
      "雲端講解會把 session 片段送至外部服務，請確認內容不含機密。此區為預留骨架，待接上供應商 API（如 Mistral 免費方案）後即可使用；金鑰只留在本機記憶體、重新整理即清除。",
  },

  progress: {
    done: "講解完成",
    running: "講解中…",
    stopped: "已停止",
    count: (done: number, total: number, pct: number) => `${done} / ${total}（${pct}%）`,
    stop: "停止",
    stopTitle: "目前節點跑完即停",
    close: "關閉",
    closeAria: "關閉進度",
    current: (summary: string) => `目前：${summary}`,
  },

  spanKind: {
    user_msg: "使用者意圖",
    assistant_msg: "回覆",
    thinking: "思考",
    tool_use: "操作",
    tool_result: "結果",
    subagent: "子代理",
    group: "群組",
  } as Record<SpanType, string>,

  tag: {
    milestone: "里程碑",
    decision: "決策點",
    retry: "重試",
    error: "錯誤",
  } as Record<SpanTag, string>,

  provider: {
    none: "不講解（純結構，零外傳）",
    ollama: "本地 Ollama（離線）",
    cloud: "雲端 API（需外傳）",
  } as Record<ProviderId, string>,

  providerDisclaimer: {
    none: "不講解：僅做本地結構化與降噪，沒有任何資料離開你的裝置。",
    ollama:
      "本地 Ollama：講解由你機器上的模型產生，程式碼與紀錄不會外傳。連線狀態與模型設定見下方面板。",
    cloud:
      "雲端 API：你的 session 片段將傳送至外部服務以產生講解。請確認內容不含機密；是否外傳由你知情選擇，責任歸使用者。設定見下方面板（目前為預留骨架，尚未實際接上）。",
  } as Record<ProviderId, string>,

  skeletonNode: {
    objective: "目標",
    decision: "決策",
    milestone: "里程碑",
    outcome: "結果",
  } as Record<SkeletonNodeKind, string>,

  skeletonRib: {
    investigation: "取證",
    error: "錯誤",
    retry: "重試",
    "edit-loop": "反覆修改",
  } as Record<SkeletonRibKind, string>,
};

/** 字典型別以 zh-TW 為準；EN 必須提供相同形狀。 */
export type Messages = typeof zhTW;

const en: Messages = {
  header: {
    brand: "DIT — Dialogue Is Teacher",
    tagline: "Turn an agent's execution trace into learnable nodes",
    modes: { cognitive: "Cognitive", dense: "Dense" },
    modeGroupLabel: "View mode",
    loadFile: "Load .jsonl",
    reset: "Reset",
    resetTitle: "Return to the built-in sample and defaults",
    showAnnotations: "Show teaching notes",
    annotateAll: "Annotate all",
    clearAnnotations: "Clear notes",
    clearAnnotationsTitle: "Clear all current teaching notes",
    prevTitle: "Previous step",
    nextTitle: "Next step",
    replay: "Replay",
    pause: "Pause",
    providerLabel: "Notes source",
    languageLabel: "Language",
    readFileFailed: (name: string) => `Failed to read file: ${name}`,
    loadFailed: (msg: string) => `Load failed: ${msg}`,
  },

  sidebar: {
    heading: "Session structure",
    headingWithTree: "Session structure (Span Tree)",
    empty: "No session loaded yet.",
    skeleton: (nodes: number, ribs: number) => `Distilled skeleton: ${nodes} spine · ${ribs} ribs`,
  },

  main: {
    emptyTitle: "Load a Claude Code session",
    emptyBodyPrefix: 'Click "Load .jsonl" at the top right and pick any session under ',
    emptyPath: "~/.claude/projects/<project>/*.jsonl",
    emptyBodySuffix: "; DIT will organize it into learnable nodes. You can also load the built-in sample first.",
    warnings: (warnings: string[]) =>
      `Parse notes (${warnings.length}): ${warnings.slice(0, 3).join("; ")}${warnings.length > 3 ? " …" : ""}`,
    infoTitle: "Where this comes from",
    infoBody:
      'The raw transcript is parsed, normalized into a Span Tree, and deterministically denoised/grouped into the nodes above. Switch "Notes source" at the top right to add per-node teaching, or use replay to step through the whole task.',
    flow: "raw .jsonl → Adapter → Span Tree → denoise/group → [notes] → view",
  },

  card: {
    kindTag: "Group",
    paramsTitle: "Params",
    resultTitle: "Result",
    resultErrorTitle: "Result · Error",
    thinkingHead: "Reasoning",
    groupFolded: (steps: number) => ` (${steps} steps folded)`,
    groupHint: (collapsed: boolean) => `Deterministic denoise · click to ${collapsed ? "expand" : "collapse"}`,
  },

  annotation: {
    via: (provider: string) => `via ${provider}`,
    generating: "Generating teaching notes…",
    failed: (msg: string) => `Notes failed: ${msg}`,
    generate: "Generate teaching notes",
    what: "What this step does",
    why: "Why it's done this way",
    lesson: "General takeaway",
  },

  fishbone: {
    lessonPrefix: "Takeaway: ",
    noSpineTitle: "This session has no distillable spine",
    noSpineBody: 'Too few events or insufficient types, perhaps. Switch to "Dense" mode to step through everything.',
    spineTitle: (steps: number, nodes: number) => `Spine: ${steps} steps distilled into ${nodes} key nodes`,
    legendRibsSep: "Ribs:",
    regionLabel: "Task spine fishbone (scrolls horizontally)",
    nodeAria: (kind: string, label: string) => `${kind}: ${label}`,
    detailHead: "Node detail (click a node or rib above to expand)",
    clearSelection: "Clear selection",
    detailPlaceholder: 'Click any node above and its "original content" (organized into a card) expands here.',
  },

  ollama: {
    panelLabel: "Local Ollama settings",
    states: {
      checking: "Checking…",
      ready: "Ready",
      "model-missing": "Connected · specified model not installed",
      "no-model": "Connected · no models yet",
      offline: "Cannot connect",
    },
    defaultMsg: "Ready to probe local Ollama…",
    recheck: "Re-check",
    expand: "Expand Ollama settings",
    collapse: "Collapse Ollama settings",
    expandShort: "Expand settings",
    collapseShort: "Collapse settings",
    copy: "Copy",
    copied: "Copied",
    copyAria: "Copy command",
    model: "Model",
    notInstalled: " (not installed)",
    timeout: "Timeout",
    sec: (n: number) => `${n}s`,
    disableThinking: "Disable thinking",
    disableThinkingTitle:
      "Only affects thinking-capable models (qwen3 / deepseek-r1 / gpt-oss); leave unchecked for others like gemma.",
    keepAlive: "Keep-alive",
    keepAliveTitle: "Keep the model in VRAM so back-to-back notes skip cold reloads; most noticeable on large models.",
    keepAliveOff: "Off (use Ollama default)",
    min: (n: number) => `${n} min`,
    numPredict: "Output cap",
    numPredictOptions: {
      fast: "256 tokens (fastest)",
      recommended: "512 tokens (recommended)",
      long: "1024 tokens",
      unlimited: "Unlimited",
    },
    hint:
      'Large models (≥4B) load into VRAM on first response and may be slow → if it times out, bump "Timeout" to 120s and retry. Slowdowns over successive notes usually mean the model got unloaded/reloaded: set "Keep-alive" longer to ease it. "Disable thinking" applies only to thinking models like qwen3 / deepseek-r1.',
    offlineGuide: 'Start Ollama and allow cross-origin browser access, then press "Re-check":',
    offlineHintPrefix: "↑ Windows PowerShell. Or set permanently: ",
    offlineHintMid: " then restart Ollama. macOS/Linux: ",
    offlineHintEnd: ".",
    noModelGuide: "No model installed yet. Pull a lightweight model first (pick one):",
    noModelHint: 'After installing, press "Re-check". 7B needs a few GB; 3B is lighter.',
    modelMissingGuide: (model: string, installed: string) =>
      `The specified model "${model}" is not installed. Switch to an installed model in the dropdown above${installed}, or install it:`,
    modelMissingInstalled: (list: string[]) => (list.length ? ` (${list.join(", ")})` : ""),
    readyNote: 'Notes are generated by your local model; code and logs stay on device. Press "Annotate all" above to start.',
  },

  cloud: {
    panelLabel: "Cloud API settings",
    status: "Not enabled (UI placeholder)",
    msg: 'The cloud notes interface is ready but the actual call is not wired up; after filling settings, "Annotate all" will report it as not enabled.',
    expand: "Expand cloud settings",
    collapse: "Collapse cloud settings",
    endpoint: "API endpoint",
    endpointPlaceholder: "https://api.mistral.ai/v1 (example, not wired up)",
    model: "Model",
    modelPlaceholder: "e.g. mistral-small-latest",
    apiKey: "API Key",
    apiKeyPlaceholder: "Kept in memory only, never written to disk",
    hint:
      "Cloud notes send session fragments to an external service; make sure the content has no secrets. This section is a placeholder — usable once a provider API (e.g. Mistral's free tier) is wired up; the key stays in memory and clears on refresh.",
  },

  progress: {
    done: "Notes complete",
    running: "Annotating…",
    stopped: "Stopped",
    count: (done: number, total: number, pct: number) => `${done} / ${total} (${pct}%)`,
    stop: "Stop",
    stopTitle: "Stops after the current node finishes",
    close: "Close",
    closeAria: "Close progress",
    current: (summary: string) => `Current: ${summary}`,
  },

  spanKind: {
    user_msg: "User intent",
    assistant_msg: "Reply",
    thinking: "Thinking",
    tool_use: "Action",
    tool_result: "Result",
    subagent: "Subagent",
    group: "Group",
  },

  tag: {
    milestone: "Milestone",
    decision: "Decision",
    retry: "Retry",
    error: "Error",
  },

  provider: {
    none: "No notes (structure only, zero egress)",
    ollama: "Local Ollama (offline)",
    cloud: "Cloud API (sends data out)",
  },

  providerDisclaimer: {
    none: "No notes: local structuring and denoising only — nothing leaves your device.",
    ollama:
      "Local Ollama: notes come from a model on your machine; code and logs are not sent out. Connection status and model settings are in the panel below.",
    cloud:
      "Cloud API: your session fragments will be sent to an external service to generate notes. Make sure the content has no secrets; sending out is your informed choice and responsibility. Settings are in the panel below (currently a placeholder, not yet wired up).",
  },

  skeletonNode: {
    objective: "Objective",
    decision: "Decision",
    milestone: "Milestone",
    outcome: "Outcome",
  },

  skeletonRib: {
    investigation: "Investigate",
    error: "Error",
    retry: "Retry",
    "edit-loop": "Edit loop",
  },
};

export const MESSAGES: Record<Locale, Messages> = {
  "zh-TW": zhTW,
  en,
};
