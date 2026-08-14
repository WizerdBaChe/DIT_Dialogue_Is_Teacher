/**
 * Codex rollout 掃描 / 分類器（R9-A 前置調查工具）
 *
 * 用途：在**本機**掃描 `~/.codex/sessions/**\/rollout-*.jsonl`，回答三個 R9-A 卡住的問題：
 *   1. 每份 session 是 Legacy 還是 Paginated 歷史模式？（決定 DIT 現行 adapter 會不會整批失效）
 *   2. `event_msg/item_completed` 的 `payload.item` 實際 JSON 形狀是什麼？（TurnItem 的真實欄位名）
 *   3. 有多少行會落進 DIT 目前的「寬容收納」？（量化影響面）
 *
 * ── 隱私設計（重要，請先讀再決定要不要把報告給別人）─────────────────────────
 * 本腳本**只記錄結構，不記錄內容**：
 *   - 記「哪些 key 出現過」（key path，如 `payload.item.type`），不記任何 key 的值……
 *   - ……除非該 key 在下方 `SAFE_VALUE_KEYS` 白名單內（type/role/name/cli_version 這類列舉值），
 *     且值是布林、數字，或長度 ≤64 且只含 `A-Za-z0-9_.:@/-` 的字串。任何自由文字都不會被記下。
 *   - 訊息內容、思考內容、指令字串、檔案內容、檔案路徑、cwd 一律**不進報告**。
 * 產出兩個檔：
 *   - `codex-scan-report.json`  ← 可分享。不含檔案路徑，檔案以 file-001 編號代稱。
 *   - `codex-scan-files.json`   ← **僅供本機對照**，含真實檔案路徑，請勿外傳。
 * 兩個檔都是純文字 JSON，給出去之前請自己先打開看過。
 *
 * 用法：
 *   node scripts/scan-codex-sessions.mjs "C:\\Users\\<you>\\.codex\\sessions\\2026"
 *   node scripts/scan-codex-sessions.mjs <dir> --out=. --max-lines=0
 *
 * 選項：
 *   --out=<dir>       報告輸出目錄（預設：目前工作目錄）
 *   --max-lines=<n>   每檔最多掃描行數，0 = 不限（預設 0）。被截斷的檔案會在報告中誠實標記。
 *   --quiet           不逐檔印進度
 */
import { createReadStream, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline";

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const entry = process.argv.find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const rootDir = positional[0];
if (!rootDir) {
  console.error("用法：node scripts/scan-codex-sessions.mjs <sessions 資料夾> [--out=.] [--max-lines=0]");
  process.exit(1);
}
const outDir = resolve(readArg("out", process.cwd()));
const maxLines = Number(readArg("max-lines", "0"));
const quiet = process.argv.includes("--quiet");

// ── DIT 目前 codexJsonl.ts 實際處理的型別（改 adapter 時必須同步這三張表）──────
const DIT_TOP_LEVEL = new Set([
  "session_meta", "compacted", "world_state", "turn_context",
  "response_item", "event_msg", "inter_agent_communication_metadata",
]);
const DIT_RESPONSE_ITEM = new Set([
  "message", "reasoning", "custom_tool_call", "function_call",
  "custom_tool_call_output", "function_call_output", "agent_message",
]);
const DIT_EVENT_MSG = new Set([
  "agent_reasoning", "thread_settings_applied", "patch_apply_end", "mcp_tool_call_end",
  "web_search_end", "turn_aborted", "thread_rolled_back", "context_compacted",
  "sub_agent_activity", "user_message", "agent_message", "task_started", "task_complete",
  "token_count", "turn_context",
]);

/**
 * 只在 Legacy 模式持久化的 event_msg（來源：codex-rs/rollout/src/policy.rs 的
 * should_persist_event_msg）。出現任一即代表這份檔案是 Legacy 模式寫的。
 */
const LEGACY_ONLY_EVENTS = new Set([
  "user_message", "agent_message", "agent_reasoning", "agent_reasoning_raw_content",
  "entered_review_mode", "exited_review_mode", "patch_apply_end", "context_compacted",
  "mcp_tool_call_end", "web_search_end", "image_generation_end", "sub_agent_activity",
]);

/**
 * Legacy 模式也會寫 item_completed，但**只寫** TurnItem::Plan 與 Extension(Sleep)。
 * 所以只有「非 plan/sleep 的 item_completed」才是 Paginated 的確證。
 * item 的判別欄位名未知（這正是要查的），故對多個候選鍵都試。
 */
const LEGACY_ALLOWED_ITEM_KINDS = new Set(["plan", "sleep", "Plan", "Sleep"]);

// ── 形狀擷取（只取 key path，不取值）──────────────────────────────────────
const SAFE_VALUE_KEYS = new Set([
  "type", "role", "name", "kind", "status", "outcome", "reason", "phase", "mode",
  "originator", "cli_version", "model", "model_provider", "source", "thread_source",
  "agent_role", "success", "server", "tool",
]);
const SAFE_VALUE_RE = /^[A-Za-z0-9_.:@/-]+$/;
const MAX_DEPTH = 4;
const MAX_KEYS_PER_NODE = 40;
const MAX_DISTINCT_VALUES = 25;

function isSafeValue(key, value) {
  if (!SAFE_VALUE_KEYS.has(key)) return false;
  if (typeof value === "boolean" || typeof value === "number") return true;
  return typeof value === "string" && value.length <= 64 && SAFE_VALUE_RE.test(value);
}

/** 把物件走一遍，把 key path 累加進 shape；值一律不記，除非通過 isSafeValue。 */
function collectShape(shape, node, prefix = "", depth = 0) {
  if (depth > MAX_DEPTH || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    if (node.length > 0) collectShape(shape, node[0], `${prefix}[]`, depth + 1);
    return;
  }
  let seen = 0;
  for (const [key, value] of Object.entries(node)) {
    if (seen++ >= MAX_KEYS_PER_NODE) break;
    const path = prefix ? `${prefix}.${key}` : key;
    const entry = shape[path] ?? (shape[path] = { count: 0, jsType: new Set(), values: new Set() });
    entry.count += 1;
    entry.jsType.add(Array.isArray(value) ? "array" : value === null ? "null" : typeof value);
    if (isSafeValue(key, value) && entry.values.size < MAX_DISTINCT_VALUES) entry.values.add(String(value));
    collectShape(shape, value, path, depth + 1);
  }
}

function serializeShape(shape) {
  const out = {};
  for (const [path, entry] of Object.entries(shape)) {
    out[path] = { count: entry.count, jsType: [...entry.jsType].sort() };
    if (entry.values.size > 0) out[path].values = [...entry.values].sort();
  }
  return out;
}

// ── 檔案走訪 ──────────────────────────────────────────────────────────
function walk(dir, found = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    console.warn(`跳過無法讀取的資料夾 ${dir}：${error.message}`);
    return found;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) found.push(full);
  }
  return found;
}

/** 讀一份 rollout，回傳結構統計。串流逐行，支援 GB 級檔案。 */
async function scanFile(path) {
  const stat = statSync(path);
  const typeCounts = new Map();
  const itemKinds = new Map();
  const sessionMetaShape = {};
  const itemCompletedShape = {};
  const unknownShapes = {};
  let lines = 0;
  let parseErrors = 0;
  let truncated = false;
  let legacySignals = 0;
  let paginatedSignals = 0;
  let firstLineType = null;
  let ditRecognizes = false;

  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    if (maxLines > 0 && lines >= maxLines) { truncated = true; rl.close(); break; }
    lines += 1;

    let record;
    try {
      record = JSON.parse(line);
    } catch {
      parseErrors += 1;
      continue;
    }

    const top = typeof record?.type === "string" ? record.type : "(no type)";
    const payload = record?.payload;
    const sub = payload && typeof payload === "object" && typeof payload.type === "string" ? payload.type : null;
    const key = sub ? `${top}/${sub}` : top;
    typeCounts.set(key, (typeCounts.get(key) ?? 0) + 1);

    if (firstLineType === null) {
      firstLineType = key;
      // 複製 DIT detectAdapter/canParse 的判定，確認這份檔案還會被認出來是 Codex。
      ditRecognizes = ["session_meta", "response_item", "event_msg", "turn_context"].includes(top)
        && payload !== null && typeof payload === "object";
    }

    if (top === "session_meta") collectShape(sessionMetaShape, payload);

    if (top === "event_msg" && sub === "item_completed") {
      collectShape(itemCompletedShape, payload);
      const item = payload.item;
      // TurnItem 的判別欄位名未知：對幾個候選鍵都試，並記下哪個有值。
      const kind = item && typeof item === "object"
        ? (item.type ?? item.kind ?? item.item_type ?? Object.keys(item)[0] ?? "(empty)")
        : `(item is ${item === undefined ? "missing" : typeof item})`;
      const kindStr = String(kind);
      itemKinds.set(kindStr, (itemKinds.get(kindStr) ?? 0) + 1);
      if (!LEGACY_ALLOWED_ITEM_KINDS.has(kindStr)) paginatedSignals += 1;
    }

    if (top === "event_msg" && sub && LEGACY_ONLY_EVENTS.has(sub)) legacySignals += 1;

    // DIT 會不會把這行丟進「未知型別」？會的話記形狀，供補實作時參考。
    const handled = top === "response_item"
      ? (sub !== null && DIT_RESPONSE_ITEM.has(sub))
      : top === "event_msg"
        ? (sub !== null && DIT_EVENT_MSG.has(sub))
        : DIT_TOP_LEVEL.has(top);
    if (!handled) {
      const bucket = unknownShapes[key] ?? (unknownShapes[key] = {});
      collectShape(bucket, payload);
    }
  }

  const mode = legacySignals > 0 && paginatedSignals > 0 ? "MIXED"
    : paginatedSignals > 0 ? "PAGINATED"
      : legacySignals > 0 ? "LEGACY"
        : "INDETERMINATE";

  const unknownLines = [...typeCounts.entries()].reduce((sum, [key, count]) => {
    const [top, sub] = key.includes("/") ? key.split("/") : [key, null];
    const handled = top === "response_item"
      ? (sub !== null && DIT_RESPONSE_ITEM.has(sub))
      : top === "event_msg"
        ? (sub !== null && DIT_EVENT_MSG.has(sub))
        : DIT_TOP_LEVEL.has(top);
    return handled ? sum : sum + count;
  }, 0);

  return {
    bytes: stat.size,
    mtime: stat.mtime.toISOString(),
    lines,
    parseErrors,
    truncated,
    mode,
    legacySignals,
    paginatedSignals,
    ditRecognizes,
    firstLineType,
    unknownLines,
    unknownRatio: lines > 0 ? Number((unknownLines / lines).toFixed(4)) : 0,
    typeCounts: Object.fromEntries([...typeCounts.entries()].sort((a, b) => b[1] - a[1])),
    itemKinds: Object.fromEntries([...itemKinds.entries()].sort((a, b) => b[1] - a[1])),
    sessionMetaShape: serializeShape(sessionMetaShape),
    itemCompletedShape: serializeShape(itemCompletedShape),
    unknownShapes: Object.fromEntries(Object.entries(unknownShapes).map(([k, v]) => [k, serializeShape(v)])),
  };
}

// ── 主流程 ────────────────────────────────────────────────────────────
const files = walk(resolve(rootDir)).sort();
if (files.length === 0) {
  console.error(`在 ${rootDir} 底下找不到任何 .jsonl 檔。`);
  process.exit(1);
}
console.log(`找到 ${files.length} 份 .jsonl，開始掃描…\n`);

const report = { generatedAt: new Date().toISOString(), rootScanned: "(omitted)", fileCount: files.length, files: {}, aggregate: {} };
const fileMap = {};
const modeTally = new Map();
const globalTypes = new Map();
const globalItemKinds = new Map();
const globalUnknownShapes = {};

for (let i = 0; i < files.length; i += 1) {
  const id = `file-${String(i + 1).padStart(3, "0")}`;
  const path = files[i];
  fileMap[id] = path;
  if (!quiet) process.stdout.write(`[${i + 1}/${files.length}] ${basename(path)} … `);
  let result;
  try {
    result = await scanFile(path);
  } catch (error) {
    if (!quiet) console.log(`讀取失敗：${error.message}`);
    report.files[id] = { error: String(error.message) };
    continue;
  }
  report.files[id] = result;
  modeTally.set(result.mode, (modeTally.get(result.mode) ?? 0) + 1);
  for (const [k, v] of Object.entries(result.typeCounts)) globalTypes.set(k, (globalTypes.get(k) ?? 0) + v);
  for (const [k, v] of Object.entries(result.itemKinds)) globalItemKinds.set(k, (globalItemKinds.get(k) ?? 0) + v);
  for (const [k, shape] of Object.entries(result.unknownShapes)) {
    const bucket = globalUnknownShapes[k] ?? (globalUnknownShapes[k] = {});
    for (const [path2, entry] of Object.entries(shape)) {
      const prev = bucket[path2];
      if (!prev) bucket[path2] = { ...entry, jsType: [...entry.jsType], values: entry.values ? [...entry.values] : undefined };
      else {
        prev.count += entry.count;
        prev.jsType = [...new Set([...prev.jsType, ...entry.jsType])].sort();
        if (entry.values) prev.values = [...new Set([...(prev.values ?? []), ...entry.values])].slice(0, MAX_DISTINCT_VALUES).sort();
      }
    }
  }
  if (!quiet) console.log(`${result.mode}｜${result.lines} 行｜未知 ${(result.unknownRatio * 100).toFixed(1)}%`);
}

report.aggregate = {
  modeTally: Object.fromEntries([...modeTally.entries()].sort((a, b) => b[1] - a[1])),
  typeCounts: Object.fromEntries([...globalTypes.entries()].sort((a, b) => b[1] - a[1])),
  itemCompletedKinds: Object.fromEntries([...globalItemKinds.entries()].sort((a, b) => b[1] - a[1])),
  unknownShapes: globalUnknownShapes,
};

mkdirSync(outDir, { recursive: true });
const reportPath = join(outDir, "codex-scan-report.json");
const mapPath = join(outDir, "codex-scan-files.json");
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
writeFileSync(mapPath, JSON.stringify({ note: "本機對照用，含真實路徑，請勿外傳。", files: fileMap }, null, 2), "utf8");

console.log("\n══════════ 摘要 ══════════");
console.log("歷史模式分佈：", Object.entries(report.aggregate.modeTally).map(([k, v]) => `${k}=${v}`).join("  ") || "(無)");
const notRecognized = Object.entries(report.files).filter(([, f]) => f.ditRecognizes === false).length;
console.log(`DIT canParse 認不出來的檔案：${notRecognized} 份`);
const kinds = Object.keys(report.aggregate.itemCompletedKinds);
console.log(`item_completed 的 item 種類：${kinds.length > 0 ? kinds.join(", ") : "(這批樣本沒有 item_completed)"}`);
const unknownTypes = Object.keys(report.aggregate.unknownShapes);
console.log(`DIT 目前會落進「寬容收納」的型別：${unknownTypes.length > 0 ? unknownTypes.join(", ") : "(無)"}`);
console.log(`\n可分享報告：${reportPath}`);
console.log(`本機對照表（勿外傳）：${mapPath}`);
console.log("\n報告只含結構與列舉值，不含任何訊息內容／指令／檔案路徑。給出去前請自行開檔確認。");
