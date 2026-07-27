/**
 * 記住上次挑選的目錄 (R9 D2)。
 *
 * `FileSystemDirectoryHandle` 可被 structured clone，所以能直接放進 IndexedDB。存的是
 * 「指向哪裡」而不是內容，權限仍由瀏覽器管——還原時必須重新確認 (見 restoreDirectorySource)。
 * 全程 best-effort：存不進去頂多下次要重選一次目錄，不阻擋任何功能。
 */
import { getAppMetaDb, HANDLE_STORE_NAME } from "@/core/onboarding/repository";

const LAST_DIRECTORY_KEY = "lastSessionDirectory";

export async function saveDirectoryHandle(handle: unknown): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await getAppMetaDb();
    await db.put(HANDLE_STORE_NAME, handle, LAST_DIRECTORY_KEY);
  } catch {
    // best-effort，見檔頭。
  }
}

export async function readDirectoryHandle(): Promise<unknown | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await getAppMetaDb();
    return (await db.get(HANDLE_STORE_NAME, LAST_DIRECTORY_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function clearDirectoryHandle(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await getAppMetaDb();
    await db.delete(HANDLE_STORE_NAME, LAST_DIRECTORY_KEY);
  } catch {
    // best-effort，見檔頭。
  }
}
