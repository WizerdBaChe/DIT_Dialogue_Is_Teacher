/**
 * The one and only place a DiagnosticCode becomes a sentence (R9 D5, SM-12 rule 2).
 *
 * Rules:
 * - Every code has a `line` (used in the banner and the detail list).
 * - Every `fatal` code additionally has `title` + `body`, because a blocking surface that
 *   does not name the cause **and** the next action is a dead end (Prism SM-5's lesson).
 * - An unmapped code degrades to generic copy plus the raw code. It never degrades to an
 *   exception message — that is exactly what R9 RC-3 set out to remove.
 */
import type { Diagnostic, DiagnosticCode } from "@/core/diagnostics";
import type { Locale } from "./locales";

interface CopyEntry {
  line: (d: Diagnostic) => string;
  title?: string;
  body?: (d: Diagnostic) => string;
}

type CopyTable = Record<DiagnosticCode, CopyEntry>;

const n = (d: Diagnostic): number => d.count ?? 1;
const at = (d: Diagnostic): string => (d.path ? `${d.path}：` : "");

const zhTW: CopyTable = {
  LINE_PARSE_FAILED: { line: (d) => `${at(d)}${n(d)} 行 JSON 無法解析，已略過。` },
  UNKNOWN_RECORD_TYPE: { line: (d) => `${at(d)}尚未支援的紀錄型別 "${d.detail}" ×${n(d)}，已寬容收納。` },
  UNKNOWN_SYSTEM_SUBTYPE: { line: (d) => `${at(d)}系統事件 "${d.detail}" ×${n(d)} 是新的子型別，已標示為一般系統事件。` },
  NOISE_SKIPPED: { line: (d) => `${at(d)}略過 ${n(d)} 筆無呈現內容的系統紀錄（hook 摘要、耗時統計等）。` },
  MARKERS_EMITTED: { line: (d) => `${at(d)}標示了 ${n(d)} 個系統事件（對話壓縮、API 錯誤等），已插在原本的時間位置。` },
  NO_EVENTS: { line: (d) => `${at(d)}這個檔案沒有可呈現的內容。` },

  CODEX_EXEC_TOOL_NAME_UNRESOLVED: { line: (d) => `${at(d)}有 ${n(d)} 次無法從 exec 參數判斷真正的工具名（沒有線索，或線索彼此矛盾），卡片標示為「未命名操作」。` },
  CODEX_EVENT_UNPAIRED: {
    line: (d) =>
      `${at(d)}${d.detail} ×${n(d)} 找不到對應的原始呼叫——匯出檔沒有提供可驗證的關聯；`
      + "可能原因包含歷史壓縮、記錄邊界或未支援的包裝，已降級為獨立事件呈現。",
  },
  CODEX_COORDINATION_SKIPPED: { line: (d) => `${at(d)}略過 ${n(d)} 筆子代理協調事件（無可呈現內容）。` },
  CODEX_AUTO_REVIEW_CONDENSED: {
    line: (d) => `${at(d)}偵測到 ${n(d)} 筆 Codex 自動核准審查紀錄，已在原位置精簡為標記卡，原始資料未刪除。`,
  },

  LARGE_INPUT: { line: (d) => `輸入較大（${d.detail}），渲染可能變慢。` },
  SELF_CHECK_ISSUE: { line: (d) => `自檢：${d.detail}` },

  FILE_UNRECOGNIZED: {
    line: (d) => `略過 ${n(d)} 個無法辨識格式的檔案（${d.detail}），其餘檔案已正常載入。`,
  },
  FILE_PARSE_FAILED: { line: (d) => `略過 ${n(d)} 個讀取失敗的檔案（${d.detail}）。` },

  NO_MAIN_TRANSCRIPT: {
    line: () => "這個資料夾裡只有子代理紀錄，沒有主檔。",
    title: "這個資料夾少了主檔",
    body: () =>
      "你選到的是某個 session 的子代理資料夾。Claude Code 把主檔放在它的「同層兄弟」位置——"
      + "也就是 <session-id>.jsonl 和 <session-id>/ 資料夾並排在同一個專案目錄下，主檔並不在資料夾裡面。"
      + "請改選上一層的專案目錄，或直接用 Session 瀏覽器挑選，它會自動把主檔與子代理配成一組。",
  },
  MULTIPLE_SESSIONS: {
    line: (d) => `這批檔案包含 ${d.detail} 個不同的 session。`,
    title: "一次只能載入一個 session",
    body: (d) =>
      `選取範圍裡有 ${d.detail} 個不同的 session（例如選到了整包 projects/ 目錄）。`
      + "請改用 Session 瀏覽器挑選單一 session，或只選取一個 session 的檔案。",
  },
  NO_RENDERABLE_CONTENT: {
    line: () => "解析後沒有任何可呈現的節點。",
    title: "這份檔案沒有可呈現的內容",
    body: () =>
      "檔案讀得到，但裡面沒有任何訊息、思考或工具步驟——常見於剛開啟就結束的空 session。"
      + "請換一個 session 試試，或用 Session 瀏覽器看看哪些 session 有實際內容（清單會顯示步驟數）。",
  },
  EMPTY_INPUT: {
    line: () => "沒有可讀的輸入。",
    title: "沒有讀到任何內容",
    body: () => "選取的檔案是空的，或副檔名符合但內容為空。請確認選到的是 Claude Code 的 .jsonl transcript。",
  },
  LOAD_FAILED: {
    line: (d) => `載入失敗：${d.detail}`,
    title: "載入沒有完成",
    body: (d) => `讀取過程中發生預期外的問題（${d.detail}）。上一份 session 未被更動，可以直接重試或換一個檔案。`,
  },
  WORKER_BOOT_FAILED: {
    line: (d) => `背景解析執行緒沒有啟動，主執行緒接手也失敗（${d.detail}）。`,
    title: "背景解析執行緒沒有啟動",
    body: (d) => `瀏覽器沒能建立背景解析執行緒，改用主執行緒重試也失敗了（${d.detail}）。這通常不是檔案的問題，而是「怎麼開啟」的問題：請確認是從網站根目錄提供服務（例如 \`npm run preview\`），而不是直接開啟 \`dist/index.html\`；若目前的瀏覽器不支援 module worker，換 Chrome 或 Edge 再試一次。上一份 session 未被更動。`,
  },
  WORKER_FALLBACK_SYNC: {
    line: (d) => `背景解析執行緒沒有啟動，這份 session 改在主執行緒解析（${d.detail}）。大檔案會讓畫面短暫沒有反應。`,
  },

  INDEX_TRUNCATED: { line: (d) => `這個目錄的檔案較多，只掃描了前 ${d.detail} 個，其餘 ${n(d)} 個未列入清單。` },
  INDEX_FILE_UNREADABLE: { line: (d) => `${n(d)} 個檔案無法讀取，未列入清單（${d.detail}）。` },
  INDEX_PERMISSION_LOST: {
    line: () => "已失去對上次資料夾的存取權限。",
    title: "需要重新授權資料夾",
    body: () => "瀏覽器已收回對上次選擇之資料夾的存取權限（重開瀏覽器或清除網站資料都會造成這個結果）。請重新選擇一次資料夾。",
  },
  // R12：挑了系統就講那個系統的名字。寫死「Claude Code」會對著 Codex 使用者講錯話。
  INDEX_EMPTY: { line: (d) => (d.detail ? `這個目錄裡沒有找到 ${d.detail} 的 session 檔案。` : "這個目錄裡沒有找到 session 檔案。") },
  INDEX_EMPTY_WRONG_SOURCE: {
    line: (d) => `這個目錄裡有 ${n(d)} 個 .jsonl，但沒有一個是 ${d.detail} 的紀錄檔——很可能是選錯了 agent 系統。回上一層換一套再試。`,
  },
  INDEX_DIRECTORY_UNREADABLE: {
    line: (d) => `這個資料夾讀不起來（${d.detail}）。`,
    title: "資料夾讀取失敗",
    body: (d) => `已取得資料夾，但讀取內容時失敗（${d.detail}）。上一份 session 未被更動。請重試一次，或改選另一個資料夾。`,
  },
  INDEX_TITLE_FROM_FILENAME: { line: (d) => `${n(d)} 筆沒有可用的標題訊號，清單上以檔名顯示。` },
  INDEX_HANDLE_NOT_PERSISTED: { line: (d) => `這次無法記住所選資料夾，下次要重新選一次（${d.detail}）。` },
  INDEX_HANDLE_SOURCE_SPLIT: {
    line: () => "資料夾改為「每套系統各記一個」，之前只記住的那一個因為分不出屬於哪一套，已清除；請重選一次。",
  },
  INDEX_SOURCE_MISMATCH: { line: (d) => `這個資料夾裡有 ${n(d)} 筆不屬於你選的那套系統，已略過。` },
  INDEX_SIDECAR_OUT_OF_REACH: {
    line: (d) => `Session 清單讀得到，但這套系統把 session 目的存在另一個檔案裡，而它在你所選資料夾的上一層——瀏覽器讀不到上一層。改選 ${d.detail} 就能一併讀到。`,
  },
  INDEX_NOT_TRANSCRIPT: { line: (d) => `另有 ${n(d)} 個 .jsonl 的檔名不符合這套系統的紀錄命名，沒有掃描。` },
  LOAD_SOURCE_MISMATCH: {
    line: (d) => `這個檔案實際上是 ${d.detail} 的紀錄，跟你選的那套系統不同。內容以檔案本身為準，已照它原本的樣子解讀。`,
  },
};

const en: CopyTable = {
  LINE_PARSE_FAILED: { line: (d) => `${at(d)}${n(d)} line(s) of JSON could not be parsed and were skipped.` },
  UNKNOWN_RECORD_TYPE: { line: (d) => `${at(d)}Unsupported record type "${d.detail}" ×${n(d)}; kept leniently.` },
  UNKNOWN_SYSTEM_SUBTYPE: { line: (d) => `${at(d)}System event "${d.detail}" ×${n(d)} is a new subtype; shown as a generic system event.` },
  NOISE_SKIPPED: { line: (d) => `${at(d)}Skipped ${n(d)} system record(s) with nothing to render (hook summaries, timing stats).` },
  MARKERS_EMITTED: { line: (d) => `${at(d)}Marked ${n(d)} system event(s) (compaction, API errors) in place.` },
  NO_EVENTS: { line: (d) => `${at(d)}This file has no renderable content.` },

  CODEX_EXEC_TOOL_NAME_UNRESOLVED: {
    line: (d) => `${at(d)}${n(d)} exec call(s) had no resolvable tool name (no evidence, or conflicting evidence); shown as an unnamed operation.`,
  },
  CODEX_EVENT_UNPAIRED: {
    line: (d) =>
      `${at(d)}${d.detail} ×${n(d)} had no matching call — the export does not provide a verifiable link back `
      + "to the original call; possible reasons include history compaction, record boundaries, or unsupported "
      + "wrappers. Shown as a standalone event.",
  },
  CODEX_COORDINATION_SKIPPED: { line: (d) => `${at(d)}Skipped ${n(d)} subagent coordination event(s) with nothing to render.` },
  CODEX_AUTO_REVIEW_CONDENSED: {
    line: (d) => `${at(d)}Found ${n(d)} Codex auto-review record(s); condensed in place, nothing deleted.`,
  },

  LARGE_INPUT: { line: (d) => `Large input (${d.detail}); rendering may be slower.` },
  SELF_CHECK_ISSUE: { line: (d) => `Self-check: ${d.detail}` },

  FILE_UNRECOGNIZED: { line: (d) => `Skipped ${n(d)} file(s) in an unrecognized format (${d.detail}); the rest loaded normally.` },
  FILE_PARSE_FAILED: { line: (d) => `Skipped ${n(d)} unreadable file(s) (${d.detail}).` },

  NO_MAIN_TRANSCRIPT: {
    line: () => "This folder contains only subagent transcripts, no main file.",
    title: "This folder is missing its main transcript",
    body: () =>
      "You picked a session's subagent folder. Claude Code stores the main transcript as a sibling — "
      + "<session-id>.jsonl sits next to the <session-id>/ folder in the same project directory, not inside it. "
      + "Pick the parent project directory, or use the Session browser, which pairs the main file with its subagents for you.",
  },
  MULTIPLE_SESSIONS: {
    line: (d) => `This selection spans ${d.detail} different sessions.`,
    title: "One session at a time",
    body: (d) =>
      `The selection contains ${d.detail} distinct sessions (for example, the whole projects/ directory). `
      + "Use the Session browser to pick one, or select the files of a single session.",
  },
  NO_RENDERABLE_CONTENT: {
    line: () => "Nothing renderable after parsing.",
    title: "This file has no content to show",
    body: () =>
      "The file was readable but contains no messages, thinking, or tool steps — common for a session that ended right after opening. "
      + "Try another session, or use the Session browser, which shows each session's step count.",
  },
  EMPTY_INPUT: {
    line: () => "No readable input.",
    title: "Nothing was read",
    body: () => "The selected file is empty. Check that it is a Claude Code .jsonl transcript.",
  },
  LOAD_FAILED: {
    line: (d) => `Load failed: ${d.detail}`,
    title: "The load did not finish",
    body: (d) => `Something unexpected happened while reading (${d.detail}). The previous session is untouched; retry or pick another file.`,
  },
  WORKER_BOOT_FAILED: {
    line: (d) => `The background parsing worker never started, and the main-thread retry failed too (${d.detail}).`,
    title: "The background parser never started",
    body: (d) => `The browser could not create the background parsing worker, and parsing on the main thread failed as well (${d.detail}). This usually points at how the app is being served rather than at the file: check that it is served from the site root (for example \`npm run preview\`) rather than opened as \`dist/index.html\`, and try Chrome or Edge if this browser has no module-worker support. The previous session is untouched.`,
  },
  WORKER_FALLBACK_SYNC: {
    line: (d) => `The background parsing worker never started, so this session was parsed on the main thread (${d.detail}). Large files will briefly freeze the view.`,
  },

  INDEX_TRUNCATED: { line: (d) => `This directory is large; only the first ${d.detail} files were scanned, ${n(d)} were not listed.` },
  INDEX_FILE_UNREADABLE: { line: (d) => `${n(d)} file(s) could not be read and were not listed (${d.detail}).` },
  INDEX_PERMISSION_LOST: {
    line: () => "Access to the previous folder was lost.",
    title: "The folder needs re-authorizing",
    body: () => "The browser revoked access to the folder you picked last time (restarting the browser or clearing site data does this). Please pick the folder again.",
  },
  INDEX_EMPTY: { line: (d) => (d.detail ? `No ${d.detail} session files were found in this directory.` : "No session files were found in this directory.") },
  INDEX_EMPTY_WRONG_SOURCE: {
    line: (d) => `This directory holds ${n(d)} .jsonl file(s), but none of them is a ${d.detail} record — the wrong agent system was probably chosen. Go back and switch systems.`,
  },
  INDEX_DIRECTORY_UNREADABLE: {
    line: (d) => `This folder could not be read (${d.detail}).`,
    title: "The folder could not be read",
    body: (d) => `The folder was granted, but reading its contents failed (${d.detail}). Your previous session is untouched. Try again, or pick a different folder.`,
  },
  INDEX_TITLE_FROM_FILENAME: { line: (d) => `${n(d)} session(s) had no usable title signal and are listed by file name.` },
  INDEX_HANDLE_NOT_PERSISTED: { line: (d) => `This folder could not be remembered; you will have to pick it again next time (${d.detail}).` },
  INDEX_HANDLE_SOURCE_SPLIT: {
    line: () => "Folders are now remembered per agent system. The single folder remembered before could not be attributed to one, so it was cleared — please pick it again.",
  },
  INDEX_SOURCE_MISMATCH: { line: (d) => `${n(d)} file(s) in this folder do not belong to the agent system you chose and were skipped.` },
  INDEX_SIDECAR_OUT_OF_REACH: {
    line: (d) => `The session list is readable, but this system keeps session purposes in a separate file one level above the folder you picked — a browser cannot read the parent of a picked folder. Pick ${d.detail} instead to include it.`,
  },
  INDEX_NOT_TRANSCRIPT: { line: (d) => `${n(d)} other .jsonl file(s) are not named the way this system names its records, and were not scanned.` },
  LOAD_SOURCE_MISMATCH: {
    line: (d) => `This file is actually a ${d.detail} record, not the system you chose. The file itself is authoritative, so it was read as what it is.`,
  },
};

const TABLES: Record<Locale, CopyTable> = { "zh-TW": zhTW, en };

const GENERIC_LINE: Record<Locale, (code: string) => string> = {
  "zh-TW": (code) => `發生了一個未列在說明表裡的狀況（代號 ${code}）。`,
  en: (code) => `An unlisted condition occurred (code ${code}).`,
};

const GENERIC_TITLE: Record<Locale, string> = {
  "zh-TW": "發生未預期的狀況",
  en: "Unexpected condition",
};

const GENERIC_BODY: Record<Locale, (code: string) => string> = {
  "zh-TW": (code) => `代號 ${code}。這個狀況還沒有對應的說明文字，請把代號回報給開發者。上一份 session 未被更動。`,
  en: (code) => `Code ${code}. This condition has no copy yet; please report the code. The previous session is untouched.`,
};

/** One-line description, for the banner and the detail list. */
export function diagnosticLine(locale: Locale, diagnostic: Diagnostic): string {
  const entry = TABLES[locale][diagnostic.code];
  return entry ? entry.line(diagnostic) : GENERIC_LINE[locale](diagnostic.code);
}

/** Title + body for a blocking surface. Defined for every fatal code; generic otherwise. */
export function diagnosticFatalCopy(locale: Locale, diagnostic: Diagnostic): { title: string; body: string } {
  const entry = TABLES[locale][diagnostic.code];
  if (!entry?.title || !entry.body) {
    return { title: GENERIC_TITLE[locale], body: GENERIC_BODY[locale](diagnostic.code) };
  }
  return { title: entry.title, body: entry.body(diagnostic) };
}

/** Test hook: lets the suite assert every code is mapped in every locale. */
export const __copyTables = TABLES;
