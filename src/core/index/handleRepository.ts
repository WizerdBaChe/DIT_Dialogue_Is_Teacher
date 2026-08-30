/**
 * 記住上次挑選的目錄 (R9 D2)，**每個來源各記一個** (R12 M2，作者裁決 2026-08-26)。
 *
 * `FileSystemDirectoryHandle` 可被 structured clone，所以能直接放進 IndexedDB。存的是
 * 「指向哪裡」而不是內容，權限仍由瀏覽器管——還原時必須重新確認 (見 restoreDirectorySource)。
 *
 * **為什麼要分來源存**：Claude Code 的 session 在 `~/.claude/projects`，Codex 的在 `~/.codex`，
 * 兩個位置永遠不同。只記「上次那個資料夾」的話，兩套系統會互相覆蓋——選過 Codex 之後再選
 * Claude Code，記住的位置是 Codex 的，一級選單等於只記錄了選擇、沒有幫上忙。分開存之後，
 * 選哪一套就回到那一套上次的位置，選單本身成為定位的一部分。
 *
 * 全程 best-effort：存不進去頂多下次要重選一次目錄，不阻擋任何功能。但 **best-effort 不等於
 * 無聲** (R9.1 RC-A step 5)：原本三個空的 `catch {}` 讓「記不住目錄」這件事完全沒有出口，
 * 使用者只會看到「明明選過了卻每次都要重選」而無從得知原因。改為交給呼叫端一條診斷，
 * 由呼叫端決定顯示與否——這裡仍然永不拋出、永不阻擋。
 */
import { getAppMetaDb, HANDLE_STORE_NAME } from "@/core/onboarding/repository";
import type { Diagnostic } from "@/core/diagnostics/contracts";
import type { SourceId } from "@/types/spanTree";

/**
 * R12 M2 之前的單一鍵。**不遷移，也不猜**：這個 handle 沒有記錄它是哪一套系統的目錄，而
 * R11 WC-1.2 之後兩種來源都可能出現在同一個資料夾清單裡，所以無從判定該掛到哪一邊。
 * 猜錯的代價是「按了 Claude Code 卻跳到 Codex 的資料夾」——比要求重選一次糟得多。
 * 因此：刪掉，並且**說出來**（`INDEX_HANDLE_SOURCE_SPLIT`）。這是具名降級，不是無聲替代。
 */
const LEGACY_KEY = "lastSessionDirectory";

const keyFor = (source: SourceId): string => `${LEGACY_KEY}:${source}`;

/** 存取失敗時交出的診斷；成功時為 null。 */
export type HandleStoreNotice = Diagnostic | null;

function notice(error: unknown): Diagnostic {
  return {
    tier: "warn",
    code: "INDEX_HANDLE_NOT_PERSISTED",
    detail: error instanceof Error ? error.message : String(error),
  };
}

export async function saveDirectoryHandle(source: SourceId, handle: unknown): Promise<HandleStoreNotice> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await getAppMetaDb();
    await db.put(HANDLE_STORE_NAME, handle, keyFor(source));
    return null;
  } catch (error) {
    return notice(error);
  }
}

export interface StoredDirectoryHandles {
  /** 缺鍵代表那一套系統還沒被選過，跟「存不進去」是兩件事。 */
  handles: Partial<Record<SourceId, unknown>>;
  /** 需要讓使用者看到的事，目前只有舊鍵被清掉這一件。呼叫端決定何時顯示。 */
  notices: Diagnostic[];
}

/**
 * 一次讀齊所有來源的 handle。分開讀會讓呼叫端在點擊路徑上多跑幾趟 IndexedDB——而那條路徑
 * 必須留在使用者手勢裡（見 sessionStore 的 cachedDirectoryHandles）。
 */
export async function readDirectoryHandles(sources: readonly SourceId[]): Promise<StoredDirectoryHandles> {
  if (typeof indexedDB === "undefined") return { handles: {}, notices: [] };
  try {
    const db = await getAppMetaDb();
    const handles: Partial<Record<SourceId, unknown>> = {};
    for (const source of sources) {
      const stored = await db.get(HANDLE_STORE_NAME, keyFor(source));
      if (stored) handles[source] = stored;
    }

    const notices: Diagnostic[] = [];
    if (await db.get(HANDLE_STORE_NAME, LEGACY_KEY)) {
      await db.delete(HANDLE_STORE_NAME, LEGACY_KEY);
      notices.push({ tier: "warn", code: "INDEX_HANDLE_SOURCE_SPLIT" });
    }
    return { handles, notices };
  } catch {
    // 讀不到就是「沒有記住的目錄」，這條路徑本來就有可見的下一步（開選擇器），不需再報一次。
    return { handles: {}, notices: [] };
  }
}

export async function clearDirectoryHandle(source: SourceId): Promise<HandleStoreNotice> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await getAppMetaDb();
    await db.delete(HANDLE_STORE_NAME, keyFor(source));
    return null;
  } catch (error) {
    return notice(error);
  }
}
