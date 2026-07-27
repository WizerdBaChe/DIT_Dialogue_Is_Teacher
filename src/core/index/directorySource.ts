/**
 * 目錄存取的兩個後端，收斂到同一個 `DirectorySource` 介面 (R9 D2)。
 *
 * - `fsa` — File System Access API。Chromium/Edge 可用，handle 可存進 IndexedDB，
 *   下次開啟直接列出上次的目錄，而且可以只讀被點到的那個檔案。
 * - `webkitdirectory` — 全瀏覽器可用的後備。一次交出整份 FileList，無法持久化。
 *
 * `isDirectoryPickerSupported()` 是唯一的分歧點；其餘程式碼只認介面。
 */
import type { DirectoryFile, DirectorySource } from "./contracts";

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

/** 使用者按了取消。呼叫端據此回到 `no_directory`，而不是報錯。 */
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

async function walk(
  handle: FileSystemDirectoryHandleLike,
  prefix: string,
  out: DirectoryFile[],
): Promise<void> {
  for await (const entry of handle.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "directory") await walk(entry, path, out);
    else out.push(fileFromHandle(path, await (entry as FileSystemFileHandleLike).getFile()));
  }
}

export function directorySourceFromHandle(handle: FileSystemDirectoryHandleLike): DirectorySource {
  return {
    kind: "fsa",
    name: handle.name,
    list: async () => {
      const out: DirectoryFile[] = [];
      await walk(handle, "", out);
      return out;
    },
  };
}

/** 開啟系統目錄選擇器。取消 → DirectoryPickCancelledError。 */
export async function pickDirectory(): Promise<{ source: DirectorySource; handle: FileSystemDirectoryHandleLike }> {
  const picker = (window as unknown as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("The File System Access API is unavailable in this browser.");
  try {
    const handle = await picker({ mode: "read", id: "dit-sessions" });
    return { source: directorySourceFromHandle(handle), handle };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new DirectoryPickCancelledError();
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
    list: async () => entries,
  };
}
