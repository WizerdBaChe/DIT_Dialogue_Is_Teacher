/**
 * 快照模板注入：純函式，把 SessionExport payload 塞進 snapshot.html 的佔位符 (EX-04)。
 * 轉義 `<` → `<` (合法 JSON 轉義)，可阻斷 `</script>` 與 `<!--` 破格 (EX-INV-6)。
 *
 * 注意：不可只比對佔位符文字本身做字串取代——快照 bundle 內聯了整個主應用，
 * 而本模組原始碼裡就含有這段佔位符文字的字面值，會被一起打包進 bundle。
 * 若只找純文字，`.replace()` 會命中 bundle 內那份字面值 (排在 payload script 之前)，
 * 而不是真正的 payload script 標籤，導致佔位符沒換到、bundle 反而被撐壞。
 * 因此改成錨定完整的 `<script type="application/json" id="dit-snapshot">...</script>` 結構。
 */
import type { SessionExport } from "./contracts";

const PLACEHOLDER_TAG = /(<script type="application\/json" id="dit-snapshot">)\/\*DIT_SNAPSHOT_PAYLOAD\*\/null(<\/script>)/;

export class SnapshotTemplateError extends Error {}

export function injectSnapshotPayload(template: string, payload: SessionExport): string {
  if (!PLACEHOLDER_TAG.test(template)) {
    throw new SnapshotTemplateError("Snapshot template placeholder is missing; the template and code are out of sync.");
  }
  const escaped = JSON.stringify(payload).replaceAll("<", "\\u003c");
  return template.replace(PLACEHOLDER_TAG, (_match, open: string, close: string) => `${open}${escaped}${close}`);
}
