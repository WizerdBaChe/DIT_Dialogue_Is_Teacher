/** 首次使用歡迎彈窗的「已看過」旗標。跟講解快取一樣走 IndexedDB (本專案不用 localStorage，
 *  見 annotation/repository.ts)；讀寫都是 best-effort，IndexedDB 不可用時退化成「每次都顯示」，
 *  不阻擋任何功能。 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const DATABASE_NAME = "dit-app-meta";
/** v2 (R9)：新增 `handles` store，存放 File System Access API 的目錄 handle。 */
const DATABASE_VERSION = 2;
const STORE_NAME = "flags";
const ONBOARDING_KEY = "onboardingCompletedAt";

export const HANDLE_STORE_NAME = "handles";

export interface AppMetaDatabase extends DBSchema {
  flags: { key: string; value: string };
  /** 目錄 handle 不是純資料，但可被 structured clone，因此可直接存。 */
  handles: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<AppMetaDatabase>> | null = null;

/** 兩個 store 共用同一個資料庫；升級時只建立還不存在的，舊使用者的旗標不受影響。 */
export function getAppMetaDb(): Promise<IDBPDatabase<AppMetaDatabase>> {
  dbPromise ??= openDB<AppMetaDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) db.createObjectStore(HANDLE_STORE_NAME);
    },
  });
  return dbPromise;
}

const getDb = getAppMetaDb;

export async function readOnboardingCompleted(): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  try {
    const db = await getDb();
    return typeof (await db.get(STORE_NAME, ONBOARDING_KEY)) === "string";
  } catch {
    return false;
  }
}

export async function writeOnboardingCompleted(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await getDb();
    await db.put(STORE_NAME, new Date().toISOString(), ONBOARDING_KEY);
  } catch {
    // best-effort：寫入失敗頂多下次重新整理再看到一次歡迎彈窗，不是致命錯誤。
  }
}
