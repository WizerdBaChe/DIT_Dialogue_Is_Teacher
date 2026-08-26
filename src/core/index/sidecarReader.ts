/**
 * 讀取來源的 sidecar：住在 transcript 之外、必須用 id 接回來的 session 中繼資料 (R12 M5)。
 *
 * Codex 是命名這個概念的案例——它的 session 目的不在 rollout 檔裡，而在
 * `~/.codex/.codex-global-state.json` 的
 * `electron-persisted-atom-state["thread-descriptions-v1"]`，以 thread id 為鍵。
 *
 * 這個模組**不認得 Codex**：路徑、屬性鏈、join key 全部由 `SidecarSpec` 給（側寫表宣告），
 * 這裡只負責「照著走、走不通就誠實回報」。
 *
 * 全程 best-effort，但不無聲：讀不到、解不開、結構不符都回傳具名診斷交給呼叫端，
 * **永不拋例外**——一份壞掉的 sidecar 不得讓整個索引失敗（一個 session 沒有標題，
 * 比一個資料夾打不開好得多）。
 */
import type { Diagnostic } from "@/core/diagnostics/contracts";
import type { SidecarSpec } from "@/core/source/profiles";
import type { DirectoryFile } from "./contracts";

export interface SidecarLookup {
  /** id → 描述字串。找不到就是找不到，不代填。 */
  descriptions: ReadonlyMap<string, string>;
  diagnostics: readonly Diagnostic[];
}

const EMPTY: SidecarLookup = { descriptions: new Map(), diagnostics: [] };

/** 沿屬性鏈往下走。任何一節不是物件就停下——回傳 undefined，由呼叫端決定怎麼說。 */
function walk(value: unknown, chain: readonly string[]): unknown {
  let current = value;
  for (const key of chain) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * 讀出這個來源所有 sidecar 的描述表。
 *
 * `files` 是使用者所選目錄的完整清單（`DirectorySource.list()` 的輸出）。sidecar 不在裡面
 * 就代表**選的層級碰不到它**，那是 M3 的 `INDEX_SIDECAR_OUT_OF_REACH` 已經在講的事，
 * 這裡不重複報一次——同一個事實講兩遍會讓使用者以為是兩個問題。
 */
export async function readSidecars(
  specs: readonly SidecarSpec[],
  files: readonly DirectoryFile[],
): Promise<SidecarLookup> {
  if (specs.length === 0) return EMPTY;

  const descriptions = new Map<string, string>();
  const diagnostics: Diagnostic[] = [];
  const byPath = new Map(files.map((file) => [file.path, file]));

  for (const spec of specs) {
    const file = byPath.get(spec.path);
    if (!file) continue; // 碰不到——M3 已經具名報過，見上方註解。

    let parsed: unknown;
    try {
      parsed = JSON.parse(await (await file.read()).text());
    } catch (error) {
      // 檔案在、但打不開或不是 JSON。這是「壞掉」，跟「碰不到」不是同一件事。
      diagnostics.push({
        tier: "warn",
        code: "INDEX_SIDECAR_UNREADABLE",
        detail: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const records = walk(parsed, spec.recordsAt);
    if (records === null || typeof records !== "object" || Array.isArray(records)) {
      /*
       * 檔案讀得開，但預期的屬性鏈不在。最可能的成因是上游改了儲存結構——那是側寫該更新的
       * 事實，不是使用者做錯了什麼，所以講清楚是「這個版本的結構對不上」而不是「檔案壞了」。
       */
      diagnostics.push({
        tier: "warn",
        code: "INDEX_SIDECAR_SHAPE_CHANGED",
        detail: spec.recordsAt.join("."),
      });
      continue;
    }

    let skipped = 0;
    for (const [id, value] of Object.entries(records as Record<string, unknown>)) {
      // 實測 61/61 的值都是純字串。非字串代表遇到量測沒看過的形狀——略過並計數，不硬轉。
      if (typeof value === "string" && value.trim()) descriptions.set(id, value);
      else skipped += 1;
    }
    if (skipped > 0) {
      diagnostics.push({ tier: "info", code: "INDEX_SIDECAR_ENTRY_SKIPPED", count: skipped });
    }
  }

  return { descriptions, diagnostics };
}
