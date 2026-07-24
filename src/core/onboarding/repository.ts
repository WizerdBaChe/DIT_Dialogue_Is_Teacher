/** 首次使用歡迎彈窗的「已看過」旗標。跟講解快取一樣走 IndexedDB (本專案不用 localStorage，
 *  見 annotation/repository.ts)；讀寫都是 best-effort，IndexedDB 不可用時退化成「每次都顯示」，
 *  不阻擋任何功能。 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const DATABASE_NAME = "dit-app-meta";
const DATABASE_VERSION = 1;
const STORE_NAME = "flags";
const ONBOARDING_KEY = "onboardingCompletedAt";

interface AppMetaDatabase extends DBSchema {
  flags: { key: string; value: string };
}

let dbPromise: Promise<IDBPDatabase<AppMetaDatabase>> | null = null;

function getDb(): Promise<IDBPDatabase<AppMetaDatabase>> {
  dbPromise ??= openDB<AppMetaDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME);
    },
  });
  return dbPromise;
}

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
