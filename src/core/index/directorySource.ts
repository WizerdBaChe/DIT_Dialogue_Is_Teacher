/**
 * 目錄存取的兩個後端，收斂到同一個 `DirectorySource` 介面 (R9 D2)。
 *
 * - `fsa` — File System Access API。Chromium/Edge 可用，handle 可存進 IndexedDB，
 *   下次開啟直接列出上次的目錄，而且可以只讀被點到的那個檔案。
 * - `webkitdirectory` — 全瀏覽器可用的後備。一次交出整份 FileList，無法持久化。
 *
 * `isDirectoryPickerSupported()` 是唯一的分歧點；其餘程式碼只認介面。
 */
import type { DirectoryFile, DirectoryListing, DirectorySource } from "./contracts";

interface FileSystemDirectoryHandleLike {
  name: string;
  kind: "directory";
  values(): AsyncIterableIterator<FileSystemDirectoryHandleLike | FileSystemFileHandleLike>;
  queryPermission?(descriptor: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}

interface FileSystemFileHandleLike {
  name: string;
  kind: "file";
  getFile(): Promise<File>;
}

interface DirectoryPickerWindow {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite"; id?: string }) => Promise<FileSystemDirectoryHandleLike>;
}

export function isDirectoryPickerSupported(): boolean {
  return typeof window !== "undefined" && typeof (window as unknown as DirectoryPickerWindow).showDirectoryPicker === "function";
}

/**
 * 使用者按了取消。呼叫端據此回到 `closed`，而不是報錯。
 *
 * **不變式 (R9.1 RC-A)**：只有 `pickDirectory` 內部的選擇器呼叫可以產生這個錯誤。
 * 拿到 handle 之後的任何失敗（列目錄、讀檔、索引）都不是取消，即使瀏覽器丟的也是
 * `AbortError`——把兩者混為一談，會讓索引失敗偽裝成「使用者不想選了」而無聲退場。
 */
export class DirectoryPickCancelledError extends Error {
  constructor() {
    super("Directory selection was cancelled.");
    this.name = "DirectoryPickCancelledError";
  }
}

/** 權限被撤回（重開瀏覽器、清除網站資料）。呼叫端據此落到 `index_failed` 並提示重選。 */
export class DirectoryPermissionError extends Error {
  constructor() {
    super("Permission to read the stored directory is no longer granted.");
    this.name = "DirectoryPermissionError";
  }
}

function fileFromHandle(path: string, file: File): DirectoryFile {
  return {
    path,
    size: file.size,
    read: async (range) => (range ? file.slice(range.start, range.end) : file),
  };
}

function reasonOf(error: unknown): string {
  if (error instanceof DOMException) return `${error.name}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

/**
 * 一個項目失敗只影響那個項目 (AGENTS.md：one unreadable file must not fail a batch)。
 *
 * 原本這裡沒有任何 try：Windows 上完整路徑超過 MAX_PATH (260) 的檔案，`getFile()` 會拒絕，
 * 而那一個拒絕沿著 `walk` → `list()` → `buildSessionIndex` 一路上拋，整個資料夾落到
 * `index_failed`。索引器的逐檔 try/catch 在列目錄**之後**，保護不到這一步。
 *
 * 只有**根目錄本身**列不出來時才上拋——那時確實什麼都讀不到，而且 R9.1 RC-A 的測試釘住了
 * 「列目錄失敗是失敗、不是取消」這件事，它仍然成立。
 */
async function walk(
  handle: FileSystemDirectoryHandleLike,
  prefix: string,
  out: DirectoryListing,
): Promise<void> {
  const isRoot = prefix === "";
  try {
    for await (const entry of handle.values()) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === "directory") {
        await walk(entry, path, out);
        continue;
      }
      try {
        out.files.push(fileFromHandle(path, await (entry as FileSystemFileHandleLike).getFile()));
      } catch (error) {
        out.unreadable.push({ path, kind: "file", reason: reasonOf(error) });
      }
    }
  } catch (error) {
    if (isRoot) throw error;
    out.unreadable.push({ path: prefix, kind: "directory", reason: reasonOf(error) });
  }
}

export function directorySourceFromHandle(handle: FileSystemDirectoryHandleLike): DirectorySource {
  return {
    kind: "fsa",
    name: handle.name,
    list: async () => {
      const out: DirectoryListing = { files: [], unreadable: [] };
      await walk(handle, "", out);
      return out;
    },
  };
}

/**
 * 一次「取消」快到不可能是人做的（DW-24）。
 *
 * 背景：2026-08-27 在 Claude Code 內建瀏覽分頁實測，`showDirectoryPicker()` **立刻**
 * 以 `AbortError :: "The user aborted a request."` 拒絕——環境不肯開原生對話框，卻用
 * 「使用者取消了」的名義回報。DIT 依 R9.1 RC-A 把它判成取消並安靜關閉（對真的按取消的人
 * 這是對的行為），於是使用者按了按鈕之後什麼都沒發生、也沒有任何訊息。
 *
 * **API 層分不出這兩者**，兩邊都是 `AbortError`。唯一可量的差別是時間：環境拒絕是同步的，
 * 而真人要等對話框畫出來、移動滑鼠、按下取消，實體上做不到幾十毫秒。
 *
 * 這個門檻**只決定要不要印一行 console**，不改變任何行為——訂錯了最多是多印或少印一行，
 * 不會有人因此被擋住。真正的負向對照（真人在真 Chrome 裡取消要多久）只有作者驗收時量得到，
 * 在那之前不拿它做任何判定。
 */
const IMPLAUSIBLY_FAST_CANCEL_MS = 200;

export function isImplausiblyFastCancel(elapsedMs: number): boolean {
  return Number.isFinite(elapsedMs) && elapsedMs < IMPLAUSIBLY_FAST_CANCEL_MS;
}

/** 開啟系統目錄選擇器。取消 → DirectoryPickCancelledError。 */
export async function pickDirectory(): Promise<{ source: DirectorySource; handle: FileSystemDirectoryHandleLike }> {
  const picker = (window as unknown as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("The File System Access API is unavailable in this browser.");
  const startedAt = performance.now();
  try {
    const handle = await picker({ mode: "read", id: "dit-sessions" });
    return { source: directorySourceFromHandle(handle), handle };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      const elapsedMs = performance.now() - startedAt;
      if (isImplausiblyFastCancel(elapsedMs)) {
        // EX-INV-7：執行期失敗要自己出聲。行為不變（仍然當成取消、仍然安靜關閉），
        // 但一份 bug report 現在貼得出「我按了、它 3ms 就說我取消了」這件事。
        console.warn(
          `[DIT] the directory picker reported a cancellation after only ${Math.round(elapsedMs)}ms. ` +
            "A person cannot cancel that fast, so this browser most likely refused to open the native " +
            "folder dialog and reported it as the user's own cancellation. Try a standalone browser, " +
            "or use the file picker instead of the folder picker.",
        );
      }
      throw new DirectoryPickCancelledError();
    }
    throw error;
  }
}

/**
 * 還原先前存下的 handle。權限可能已被撤回，故一律先 query，需要時再 request——
 * request 必須發生在使用者手勢之內，所以呼叫端要從按鈕觸發。
 */
export async function restoreDirectorySource(handle: FileSystemDirectoryHandleLike): Promise<DirectorySource> {
  const granted = await handle.queryPermission?.({ mode: "read" });
  if (granted !== "granted") {
    const requested = await handle.requestPermission?.({ mode: "read" });
    if (requested !== "granted") throw new DirectoryPermissionError();
  }
  return directorySourceFromHandle(handle);
}

/** webkitdirectory 後備：一次拿到整份 FileList，之後只是切片。 */
export function directorySourceFromFileList(files: File[], name: string): DirectorySource {
  const entries = files.map((file) => {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    // webkitRelativePath 帶著使用者選的那層目錄名；把它剝掉，兩個後端的 path 語意才一致。
    const path = relative.includes("/") ? relative.slice(relative.indexOf("/") + 1) : relative;
    return fileFromHandle(path, file);
  });
  return {
    kind: "webkitdirectory",
    name,
    // The browser already enumerated the FileList; anything it could not reach is simply absent,
    // and a later read failure is counted by the indexer's own per-file catch.
    list: async () => ({ files: entries, unreadable: [] }),
  };
}
