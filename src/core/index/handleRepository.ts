/**
 * 記住上次挑選的目錄 (R9 D2)。
 *
 * `FileSystemDirectoryHandle` 可被 structured clone，所以能直接放進 IndexedDB。存的是
 * 「指向哪裡」而不是內容，權限仍由瀏覽器管——還原時必須重新確認 (見 restoreDirectorySource)。
 *
 * 全程 best-effort：存不進去頂多下次要重選一次目錄，不阻擋任何功能。但 **best-effort 不等於
 * 無聲** (R9.1 RC-A step 5)：原本三個空的 `catch {}` 讓「記不住目錄」這件事完全沒有出口，
 * 使用者只會看到「明明選過了卻每次都要重選」而無從得知原因。改為交給呼叫端一條診斷，
 * 由呼叫端決定顯示與否——這裡仍然永不拋出、永不阻擋。
 */
import { getAppMetaDb, HANDLE_STORE_NAME } from "@/core/onboarding/repository";
import type { Diagnostic } from "@/core/diagnostics/contracts";

const LAST_DIRECTORY_KEY = "lastSessionDirectory";

/** 存取失敗時交出的診斷；成功時為 null。 */
export type HandleStoreNotice = Diagnostic | null;

function notice(error: unknown): Diagnostic {
  return {
    tier: "warn",
    code: "INDEX_HANDLE_NOT_PERSISTED",
    detail: error instanceof Error ? error.message : String(error),
  };
}

export async function saveDirectoryHandle(handle: unknown): Promise<HandleStoreNotice> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await getAppMetaDb();
    await db.put(HANDLE_STORE_NAME, handle, LAST_DIRECTORY_KEY);
    return null;
  } catch (error) {
    return notice(error);
  }
}

export async function readDirectoryHandle(): Promise<unknown | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await getAppMetaDb();
    return (await db.get(HANDLE_STORE_NAME, LAST_DIRECTORY_KEY)) ?? null;
  } catch {
    // 讀不到就是「沒有記住的目錄」，這條路徑本來就有可見的下一步（開選擇器），不需再報一次。
    return null;
  }
}

export async function clearDirectoryHandle(): Promise<HandleStoreNotice> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await getAppMetaDb();
    await db.delete(HANDLE_STORE_NAME, LAST_DIRECTORY_KEY);
    return null;
  } catch (error) {
    return notice(error);
  }
}
