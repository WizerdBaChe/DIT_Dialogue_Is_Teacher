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
    modeGroupLabel: "檢視模式",
    loadFile: "載入 .jsonl",
    loadFolder: "載入 Session 資料夾",
    loadFolderTitle: "同時讀取主檔與 subagents/*.jsonl",
    reset: "重置",
    resetTitle: "回到內建範例與預設設定",
    showAnnotations: "顯示教學講解",
    annotateAll: "講解全部",
    annotateModeLabel: "批次講解模式",
    annotateModes: { missing: "講解未處理", failed: "重試失敗", all: "全部重新講解" },
    annotateCount: (mode: string, count: number) => `${mode === "missing" ? "講解未處理" : mode === "failed" ? "重試失敗" : "全部重新講解"}（${count}）`,
    annotateDisabled: "請先選擇本地 Ollama 或 OpenCode",
    restored: (count: number) => `已從本機快取取回 ${count} 則先前產生的講解，這次不用重新呼叫 AI`,
    cachedAnnotationCount: (count: number) => `本機快取講解：${count} 則`,
    clearAnnotations: "清除本次顯示",
    clearAnnotationsTitle: "只清除畫面上的講解；已儲存內容仍保留，下次可自動還原",
    prevTitle: "上一步",
    nextTitle: "下一步",
    replayControlsLabel: "逐步瀏覽控制",
    replay: "逐步瀏覽",
    pause: "暫停",
    providerLabel: "講解來源",
    languageLabel: "語言",
    readFileFailed: (name: string) => `讀取檔案失敗：${name}`,
    loadFailed: (msg: string) => `載入失敗：${msg}`,
  },

  settings: {
    label: "設定區",
    open: "設定",
    close: "關閉設定",
    dialogTitle: "設定",
    closeDialog: "關閉",
    sessionGroup: "Session",
    teachingGroup: "教學講解",
    providerGroup: "講解來源",
    languageGroup: "語言",
    navigationGroup: "導航",
    showMinimap: "顯示微縮導航",
    enableMapShortcut: "啟用 M 地圖快捷鍵",
    batchModeHint: "「未處理」只補缺；「全部」會覆蓋既有講解結果。",
    cacheClearHint: "清除後下次講解需要重新呼叫 AI，本機快取不會自動恢復。",
    mapShortcutHint: "開啟後，在一般畫面按 M 鍵可快速開關 Session 地圖。",
  },

  workspace: {
    tablistLabel: "主要工作區",
    tabs: {
      overview: "總覽",
      reader: "閱讀",
      subagents: "子代理",
    },
  },

  overview: {
    startTitle: "從這裡開始",
    sampleBadge: "內建示範 Session",
    loadedBadge: "已載入 Session",
    purpose: "DIT 把代理執行紀錄整理成可學習的步驟。先確認任務，再沿左側結構逐步閱讀。",
    sessionSummary: (title: string, source: string, itemCount: number, warningCount: number) =>
      `${title} · ${source} · ${itemCount} 個步驟 · ${warningCount} 則解析提示`,
    steps: {
      confirmTitle: "確認 Session",
      readTitle: "沿主線閱讀",
      readBody: "左側顯示目前位置；可逐項跳轉或按逐步瀏覽。",
      extendTitle: "延伸理解",
      extendBody: "展開 why；需要全局或分支時再開地圖或子代理。",
    },
    startSample: "開始示範",
    startReading: "開始閱讀",
    continueReading: "繼續閱讀",
    startBrowsing: "開始逐步瀏覽",
    loadFile: "載入 .jsonl",
    loadFolder: "載入 Session 資料夾",
    legend: {
      label: "符號說明",
      spanHeading: "Span 層 · transcript 發生了什麼",
      skeletonHeading: "Skeleton 層 · 學習魚骨的節點／支線種類",
    },
  },

  sessionLoad: {
    phases: {
      reading: "讀取檔案",
      parsing: "解析記錄",
      organizing: "整理結構",
      validating: "驗證文件",
      ready: "載入完成",
    } as Record<string, string>,
    progress: (phase: string, percent: number, loadedMiB: string, lines: number) =>
      `${phase} · ${percent}% · ${loadedMiB} MiB · ${lines} 行`,
    cancel: "取消載入",
    dismiss: "關閉狀態",
    previousPreserved: "載入期間保留目前文件；只有完整驗證通過後才會替換。",
  },

  structure: {
    label: "Session 結構",
    position: (current: number | string, total: number) => `位置 ${current} / ${total}`,
    openDrawer: "結構",
    closeDrawer: "關閉 Session 結構",
    collapse: "收合 Session 結構",
    expand: "展開 Session 結構",
  },

  map: {
    open: "地圖",
    title: "Session 地圖",
    close: "關閉地圖",
    youAreHere: "你在這裡",
    currentOutOfView: "目前閱讀位置不在此檢視範圍內",
    anchoredAt: (label: string) => `本層以 ${label} 為中心`,
    anchorUnresolved: "無法定位取景中心；暫以第 1 站裁切",
    currentPosition: (current: number | string, total: number) => `位置 ${current} / ${total}`,
    levels: {
      global: "全局",
      section: "區段",
      detail: "細節",
    },
    landmarkList: "地圖地標",
    selected: "已選取地標",
    noSelection: "選擇一個地標以預覽。",
    jump: "跳到這一步",
    openCluster: "查看這個區段",
    clusterLabel: (count: number, first: number, last: number) => `聚合 ${count} 項 · ${first}–${last}`,
    branchCount: (count: number) => `${count} 條支線`,
    subagentCount: (count: number) => `${count} 個子代理`,
    recenter: "以此為中心",
    empty: "此 Session 沒有可建立地圖的骨架。",
    returnReader: "回到閱讀",
    invalidTarget: (id: string) => `地圖目標已失效：${id}`,
    minimapLabel: "開啟 Session 地圖；微縮圖顯示目前位置與 Reader 可見範圍",
    viewport: "Reader 可見範圍",
    clusterKind: "聚合區段",
  },

  sidebar: {
    heading: "Session 結構",
    headingWithTree: "Session 結構（Span Tree）",
    empty: "尚未載入 session。",
    skeleton: (nodes: number, ribs: number) => `蒸餾骨架：主線 ${nodes} · 支線 ${ribs}`,
    legendLabel: "屬性符號圖例",
    legendSummary: "符號說明",
    legendNote: "重要節點另以文字標籤標示（目標／決策／里程碑／結果），詳見 Session 地圖。",
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
      "原始 transcript 經過解析、正規化成 Span Tree、確定性降噪分組後渲染為上方節點。可切換設定匣中的「講解來源」加上逐節點教學，或用逐步瀏覽走過整段任務。",
    flow: "原始 .jsonl → Adapter → Span Tree → 降噪/分組 → [講解] → 視圖",
  },

  card: {
    kindTag: "群組",
    paramsTitle: "參數",
    resultTitle: "結果",
    resultErrorTitle: "結果 · 錯誤",
    thinkingHead: "思考鏈",
    groupFolded: (steps: number, collapsed: boolean) => `（${collapsed ? "折疊" : "展開"} ${steps} 步）`,
    groupHint: (collapsed: boolean) => `確定性降噪 · 點擊${collapsed ? "展開" : "收合"}`,
    collapsedSummary: (lineCount: number, firstLine: string) =>
      firstLine ? `${lineCount} 行 · ${firstLine}` : `${lineCount} 行`,
    collapsedParamsSummary: (count: number, preview: string) =>
      preview ? `${count} 項 · ${preview}` : `${count} 項`,
  },

  annotation: {
    via: (provider: string) => `來源 ${provider}`,
    generating: "教學講解產生中…",
    failed: (msg: string) => `講解失敗：${msg}`,
    retry: "重新產生",
    generate: "產生教學講解",
    what: "這步在做什麼",
    why: "為什麼這樣做",
    lesson: "通用做法",
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
    offlineHintPrefix: "↑ 已依你的作業系統顯示對應指令。永久設定：Windows 用 ",
    offlineHintMid: " 後重啟 Ollama；macOS/Linux 用 ",
    offlineHintEnd: "。",
    noModelGuide: "尚未安裝任何模型。建議先 pull 一個輕量模型（擇一）：",
    noModelHint: "安裝完成後按「重新檢查」。7B 約需數 GB 空間；3B 較省資源。",
    modelMissingGuide: (model: string, installed: string) =>
      `指定模型「${model}」尚未安裝。可直接在上方下拉切換到已安裝的模型${installed}，或安裝它：`,
    modelMissingInstalled: (list: string[]) => (list.length ? `（${list.join("、")}）` : ""),
    readyNote: "講解將由本機模型產生，程式碼與紀錄不外傳。可按上方「講解全部」開始。",
    runtimeOwnership: "Web 版 DIT 只檢查連線，不會在背景啟動或停止 Ollama；離線時請複製上方指令自行啟動。",
  },

  cloud: {
    panelLabel: "OpenCode Cloud AI 設定",
    states: {
      checking: "探測中…",
      ready: "已就緒",
      offline: "未連線",
      "provider-missing": "Provider 未連接",
      "model-missing": "模型不可用",
      "agent-missing": "DIT agent 不存在",
    },
    defaultMsg: "正在檢查本機 OpenCode server…",
    recheck: "重新檢查",
    expand: "展開 OpenCode 設定",
    collapse: "收合 OpenCode 設定",
    endpoint: "Server",
    endpointPlaceholder: "http://127.0.0.1:4096",
    model: "Cloud 模型",
    timeout: "逾時",
    privacyPolicy: "外傳保護",
    privacyBalanced: "平衡（預設）",
    privacyStrict: "嚴格",
    sec: (seconds: number) => `${seconds} 秒`,
    copy: "複製",
    copied: "已複製",
    copyAria: "複製 OpenCode server 啟動指令",
    setupHint: "先在專案根目錄執行上方指令。供應商登入與金鑰由 OpenCode 管理，DIT 不儲存金鑰。",
    readyHint: "OpenCode 只在本機提供橋接，但講解內容仍會送到所選 Cloud AI；每次講解使用無工具的 dit-annotator agent。",
    runtimeOwnership: "Web 版 DIT 只檢查連線，不會執行或停止 OpenCode CLI；上方是固定、可檢查的啟動指令。",
  },

  privacy: {
    eyebrow: "外傳前檢查",
    title: "確認送往 OpenCode 的內容",
    body: "下方是本機去識別化後的實際送出文字。確認前不會建立 OpenCode session。",
    policy: "政策",
    expires: "預覽有效至",
    preview: "處理後預覽",
    note: "本次同意只適用目前 session、OpenCode endpoint／模型與隱私政策；疑似金鑰或密碼會直接阻擋，不能略過。",
    cancel: "取消",
    send: "送出去識別化內容",
  },

  storage: {
    degraded: (reason: string) => `講解儲存已降級為暫存記憶體；關閉頁面後不會保留。原因：${reason}`,
  },

  notice: {
    dismiss: "關閉提示",
  },

  export: {
    group: "匯出",
    json: "匯出 JSON",
    html: "匯出 HTML 快照",
    privacyNote: "匯出檔包含完整逐字內容，可能含密鑰，分享前請自行確認。",
    done: (size: string) => `已匯出，檔案大小 ${size}`,
    doneLarge: (size: string) => `已匯出，檔案大小 ${size}；檔案較大，開啟會較慢`,
    failed: (reason: string) => `匯出失敗：${reason}`,
    devUnavailable: "HTML 快照需要 production build（npm run build 後以 preview 開啟）",
    templateMissing: "找不到快照模板（snapshot.html），請確認已執行 production build",
  },

  subagent: {
    sectionLabel: "子代理局部分支",
    graphAria: (count: number) => `子代理分支，共 ${count} 個節點`,
    branch: (label: string, count: number) => `${label}（${count} 節點）`,
    workspaceHint: "選擇一個分支後，DIT 會切回閱讀工作區並定位完整內容。",
    empty: "此 Session 沒有子代理分支。",
    openBranch: (label: string, count: number) => `閱讀 ${label}，共 ${count} 個節點`,
    nodeCount: (count: number) => `${count} 節點`,
  },

  progress: {
    done: "講解完成",
    running: "講解中…",
    stopped: "已停止",
    count: (done: number, total: number, pct: number) => `${done} / ${total}（${pct}%）`,
    details: (cached: number, failed: number) => `快取 ${cached} · 失敗 ${failed}`,
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
    none: "不講解",
    ollama: "本地 AI",
    cloud: "雲端 AI",
  } as Record<ProviderId, string>,

  providerDisclaimer: {
    none: "不講解：僅做本地結構化與降噪，沒有任何資料離開你的裝置。",
    ollama:
      "本地 Ollama：講解由你機器上的模型產生，程式碼與紀錄不會外傳。連線狀態與模型設定見下方面板。",
    cloud:
      "OpenCode Cloud AI：DIT 先在本機去識別化並顯示實際送出預覽，確認後才透過 OpenCode 傳給所選雲端模型；疑似金鑰或密碼一律阻擋。",
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
    modeGroupLabel: "View mode",
    loadFile: "Load .jsonl",
    loadFolder: "Load session folder",
    loadFolderTitle: "Read the main transcript and subagents/*.jsonl together",
    reset: "Reset",
    resetTitle: "Return to the built-in sample and defaults",
    showAnnotations: "Show teaching notes",
    annotateAll: "Annotate all",
    annotateModeLabel: "Batch annotation mode",
    annotateModes: { missing: "Annotate missing", failed: "Retry failed", all: "Re-annotate all" },
    annotateCount: (mode: string, count: number) => `${mode === "missing" ? "Annotate missing" : mode === "failed" ? "Retry failed" : "Re-annotate all"} (${count})`,
    annotateDisabled: "Select local Ollama or OpenCode first",
    restored: (count: number) => `Restored ${count} previously generated notes from local cache — no AI call needed`,
    cachedAnnotationCount: (count: number) => `Cached notes: ${count}`,
    clearAnnotations: "Clear current view",
    clearAnnotationsTitle: "Clear notes from this view only; saved notes remain available for automatic restore",
    prevTitle: "Previous step",
    nextTitle: "Next step",
    replayControlsLabel: "Step-through controls",
    replay: "Step through",
    pause: "Pause",
    providerLabel: "Notes source",
    languageLabel: "Language",
    readFileFailed: (name: string) => `Failed to read file: ${name}`,
    loadFailed: (msg: string) => `Load failed: ${msg}`,
  },

  settings: {
    label: "Settings",
    open: "Settings",
    close: "Close settings",
    dialogTitle: "Settings",
    closeDialog: "Close",
    sessionGroup: "Session",
    teachingGroup: "Teaching notes",
    providerGroup: "Notes source",
    languageGroup: "Language",
    navigationGroup: "Navigation",
    showMinimap: "Show minimap",
    enableMapShortcut: "Enable M map shortcut",
    batchModeHint: "\"Missing\" only fills gaps; \"All\" overwrites existing notes.",
    cacheClearHint: "Clearing means the next note has to call the AI again — the local cache won't come back on its own.",
    mapShortcutHint: "When on, pressing M on the main screen quickly opens or closes the Session Map.",
  },

  workspace: {
    tablistLabel: "Primary workspace",
    tabs: {
      overview: "Overview",
      reader: "Reader",
      subagents: "Subagents",
    },
  },

  overview: {
    startTitle: "Start here",
    sampleBadge: "Built-in sample session",
    loadedBadge: "Loaded session",
    purpose: "DIT turns an agent execution trace into learnable steps. Confirm the task first, then read through the structure on the left.",
    sessionSummary: (title: string, source: string, itemCount: number, warningCount: number) =>
      `${title} · ${source} · ${itemCount} steps · ${warningCount} parsing warnings`,
    steps: {
      confirmTitle: "Confirm the session",
      readTitle: "Read the main path",
      readBody: "The structure on the left shows your current position; jump to any step or start stepping through.",
      extendTitle: "Build understanding",
      extendBody: "Expand why; open the map or subagents when you need the global shape or a branch.",
    },
    startSample: "Start sample",
    startReading: "Start reading",
    continueReading: "Continue reading",
    startBrowsing: "Start step-through browsing",
    loadFile: "Load .jsonl",
    loadFolder: "Load session folder",
    legend: {
      label: "Symbol guide",
      spanHeading: "Span layer · what happened in the transcript",
      skeletonHeading: "Skeleton layer · fishbone node/rib kinds",
    },
  },

  sessionLoad: {
    phases: {
      reading: "Reading files",
      parsing: "Parsing records",
      organizing: "Organizing structure",
      validating: "Validating document",
      ready: "Ready",
    } as Record<string, string>,
    progress: (phase: string, percent: number, loadedMiB: string, lines: number) =>
      `${phase} · ${percent}% · ${loadedMiB} MiB · ${lines} lines`,
    cancel: "Cancel load",
    dismiss: "Dismiss status",
    previousPreserved: "The current document stays available until the replacement passes full validation.",
  },

  structure: {
    label: "Session structure",
    position: (current: number | string, total: number) => `Position ${current} / ${total}`,
    openDrawer: "Structure",
    closeDrawer: "Close session structure",
    collapse: "Collapse session structure",
    expand: "Expand session structure",
  },

  map: {
    open: "Map",
    title: "Session map",
    close: "Close map",
    youAreHere: "You are here",
    currentOutOfView: "Your reading position is outside this view",
    anchoredAt: (label: string) => `This view is centred on ${label}`,
    anchorUnresolved: "Cannot locate the view anchor; cropping from station 1",
    currentPosition: (current: number | string, total: number) => `Position ${current} / ${total}`,
    levels: {
      global: "Overview",
      section: "Section",
      detail: "Detail",
    },
    landmarkList: "Map landmarks",
    selected: "Selected landmark",
    noSelection: "Select a landmark to preview it.",
    jump: "Go to this step",
    openCluster: "Explore this section",
    clusterLabel: (count: number, first: number, last: number) => `Cluster of ${count} · ${first}–${last}`,
    branchCount: (count: number) => `${count} branches`,
    subagentCount: (count: number) => `${count} subagents`,
    recenter: "Centre on this",
    empty: "This session has no mappable skeleton.",
    returnReader: "Return to Reader",
    invalidTarget: (id: string) => `The map target is no longer available: ${id}`,
    minimapLabel: "Open the session map; the minimap shows the current position and visible Reader range",
    viewport: "Visible Reader range",
    clusterKind: "Cluster",
  },

  sidebar: {
    heading: "Session structure",
    headingWithTree: "Session structure (Span Tree)",
    empty: "No session loaded yet.",
    skeleton: (nodes: number, ribs: number) => `Distilled skeleton: ${nodes} spine · ${ribs} ribs`,
    legendLabel: "Node symbol legend",
    legendSummary: "Legend",
    legendNote: "Important nodes are also marked with text labels (objective / decision / milestone / outcome) — see the Session Map.",
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
      'The raw transcript is parsed, normalized into a Span Tree, and deterministically denoised/grouped into the nodes above. Switch "Notes source" in the settings tray to add per-node teaching, or use step through to go through the whole task.',
    flow: "raw .jsonl → Adapter → Span Tree → denoise/group → [notes] → view",
  },

  card: {
    kindTag: "Group",
    paramsTitle: "Params",
    resultTitle: "Result",
    resultErrorTitle: "Result · Error",
    thinkingHead: "Reasoning",
    groupFolded: (steps: number, collapsed: boolean) => ` (${steps} steps ${collapsed ? "folded" : "expanded"})`,
    groupHint: (collapsed: boolean) => `Deterministic denoise · click to ${collapsed ? "expand" : "collapse"}`,
    collapsedSummary: (lineCount: number, firstLine: string) =>
      firstLine ? `${lineCount} line${lineCount === 1 ? "" : "s"} · ${firstLine}` : `${lineCount} line${lineCount === 1 ? "" : "s"}`,
    collapsedParamsSummary: (count: number, preview: string) =>
      preview ? `${count} field${count === 1 ? "" : "s"} · ${preview}` : `${count} field${count === 1 ? "" : "s"}`,
  },

  annotation: {
    via: (provider: string) => `via ${provider}`,
    generating: "Generating teaching notes…",
    failed: (msg: string) => `Notes failed: ${msg}`,
    retry: "Try again",
    generate: "Generate teaching notes",
    what: "What this step does",
    why: "Why it's done this way",
    lesson: "General takeaway",
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
    offlineHintPrefix: "↑ Shown for your detected OS. To persist it: on Windows, ",
    offlineHintMid: " then restart Ollama; on macOS/Linux, ",
    offlineHintEnd: ".",
    noModelGuide: "No model installed yet. Pull a lightweight model first (pick one):",
    noModelHint: 'After installing, press "Re-check". 7B needs a few GB; 3B is lighter.',
    modelMissingGuide: (model: string, installed: string) =>
      `The specified model "${model}" is not installed. Switch to an installed model in the dropdown above${installed}, or install it:`,
    modelMissingInstalled: (list: string[]) => (list.length ? ` (${list.join(", ")})` : ""),
    readyNote: 'Notes are generated by your local model; code and logs stay on device. Press "Annotate all" above to start.',
    runtimeOwnership: "The DIT web app only checks connectivity; it does not start or stop Ollama in the background. Copy the command above when Ollama is offline.",
  },

  cloud: {
    panelLabel: "OpenCode Cloud AI settings",
    states: {
      checking: "Checking…",
      ready: "Ready",
      offline: "Offline",
      "provider-missing": "Provider not connected",
      "model-missing": "Model unavailable",
      "agent-missing": "DIT agent missing",
    },
    defaultMsg: "Checking the local OpenCode server…",
    recheck: "Check again",
    expand: "Expand OpenCode settings",
    collapse: "Collapse OpenCode settings",
    endpoint: "Server",
    endpointPlaceholder: "http://127.0.0.1:4096",
    model: "Cloud model",
    timeout: "Timeout",
    privacyPolicy: "Egress protection",
    privacyBalanced: "Balanced (default)",
    privacyStrict: "Strict",
    sec: (seconds: number) => `${seconds}s`,
    copy: "Copy",
    copied: "Copied",
    copyAria: "Copy OpenCode server start command",
    setupHint: "Run the command above from the project root. OpenCode manages provider sign-in and credentials; DIT stores no API keys.",
    readyHint: "OpenCode provides a loopback bridge, but annotation content still goes to the selected cloud model. Each request uses the tool-free dit-annotator agent.",
    runtimeOwnership: "The DIT web app only checks connectivity; it never runs or stops the OpenCode CLI. The command above is fixed and inspectable.",
  },

  privacy: {
    eyebrow: "Pre-egress review",
    title: "Confirm what OpenCode will receive",
    body: "This is the exact locally de-identified text that will be sent. No OpenCode session is created before confirmation.",
    policy: "Policy",
    expires: "Preview expires",
    preview: "Sanitized preview",
    note: "Consent applies only to this session, OpenCode endpoint/model, and privacy policy. Suspected keys or passwords are always blocked.",
    cancel: "Cancel",
    send: "Send sanitized content",
  },

  storage: {
    degraded: (reason: string) => `Annotation storage fell back to memory and will not survive closing the page. Reason: ${reason}`,
  },

  notice: {
    dismiss: "Dismiss notice",
  },

  export: {
    group: "Export",
    json: "Export JSON",
    html: "Export HTML snapshot",
    privacyNote: "The exported file contains the full verbatim content and may include secrets — check before sharing.",
    done: (size: string) => `Exported, file size ${size}`,
    doneLarge: (size: string) => `Exported, file size ${size}; the file is large and may open slowly`,
    failed: (reason: string) => `Export failed: ${reason}`,
    devUnavailable: "The HTML snapshot needs a production build (run npm run build, then open it via preview)",
    templateMissing: "Snapshot template (snapshot.html) not found — make sure you ran a production build",
  },

  subagent: {
    sectionLabel: "Subagent branches",
    graphAria: (count: number) => `Subagent branch with ${count} nodes`,
    branch: (label: string, count: number) => `${label} (${count} nodes)`,
    workspaceHint: "Choose a branch to return to the Reader and open its complete content.",
    empty: "This session has no subagent branches.",
    openBranch: (label: string, count: number) => `Read ${label}, ${count} nodes`,
    nodeCount: (count: number) => `${count} nodes`,
  },

  progress: {
    done: "Notes complete",
    running: "Annotating…",
    stopped: "Stopped",
    count: (done: number, total: number, pct: number) => `${done} / ${total} (${pct}%)`,
    details: (cached: number, failed: number) => `cache ${cached} · failed ${failed}`,
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
    none: "No notes",
    ollama: "Local AI",
    cloud: "Cloud AI",
  },

  providerDisclaimer: {
    none: "No notes: local structuring and denoising only — nothing leaves your device.",
    ollama:
      "Local Ollama: notes come from a model on your machine; code and logs are not sent out. Connection status and model settings are in the panel below.",
    cloud:
      "OpenCode Cloud AI: DIT de-identifies content locally and previews the exact payload before OpenCode sends it to the selected cloud model. Suspected keys and passwords are always blocked.",
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
