/**
 * 一段文字適不適合當標題（作者裁決 2026-08-27：「只要確認名稱不髒就可以擴」）。
 *
 * **這是文字的性質，不是來源的性質**，所以它不住在側寫裡，也對每個來源一視同仁。
 * `derived` 那一階拿的是「第一則真人發言」——而真人的第一句話常常不是在描述工作，
 * 是一個排程注入、一句「ok」、或一個斜線指令。把那種字串端到清單上，使用者看到的是
 * 雜訊而不是標題，這正是作者在 R11.2 B1 回報的東西。
 *
 * **判準來自量測，不是想像**（`node scripts/measure-corpus.mjs titles` / `titles-claude`，
 * 2026-08-27，本機 358 份 Codex ＋ 303 份 Claude Code）：
 *
 *   - 仍以 `<` 開頭：2 份，全是 `<scheduled-task name=… file=…>`。白名單剝除器沒認出它，
 *     因為它帶屬性而舊的比對要求 `<tag>` 完全相符——那一半在 `preamble.ts` 一併修好，
 *     這裡是**認不出來的注入**的兜底。
 *   - 以 `/` 開頭：0 份。留著是因為它是同一類東西（機器指令不是標題），而且成本為零。
 *   - 文字字元少於 4 個：Codex 6 份、Claude Code 1 份。實際長相是 `ok`、`權限L2`、
 *     ` ``` `、`1. 混用`——作者原話裡的「1.混用」就是這一條抓的。
 *
 * **門檻 4 是量出來的，不是猜的**，而且刻意訂得低：這一階被跳過之後，下一階往往是檔名
 * （Codex 是 `rollout-…`），所以誤殺一個短但真實的標題，代價是使用者看到雜湊。寧可放過
 * 一個髒的，也不要把一個真的標題換成檔名——與本專案「偏誤方向固定」的規矩同向。
 *
 * 阻擋範圍實測（applied to both corpora before shipping）：Claude Code 303 份裡只有 **1 份**
 * 會改變，而那一份的標題字面就是 `ok`。所以這道閘門對 Claude Code 是純改善，不是回歸。
 */

/** 標題只取第一行——後面的內容在清單上本來就看不到。 */
function headline(text: string): string {
  return text.split("\n")[0]?.trim() ?? "";
}

/**
 * 至少要有幾個「文字」字元才算得上一個標題。標點、空白、數字與符號不算——
 * `1. ` 與 ` ``` ` 這種前綴會讓一個沒有內容的字串看起來有長度。
 */
const MIN_WORD_CHARS = 4;

const countWordChars = (text: string): number => text.replace(/[\s\p{P}\p{S}\d]/gu, "").length;

/**
 * 這段文字可以當標題嗎？
 *
 * 回傳 false 的意思是「跳過這一階」，**不是**「這份 session 有問題」——階梯會往下走，
 * 而每一階都是具名降級（`titleSource` 是回傳型別的一部分，畫面上有自己的徽章）。
 * 因此這裡不呼叫 `reportFallback`：使用者看得見發生了什麼。
 */
export function isUsableTitle(text: string | null | undefined): boolean {
  if (!text) return false;
  const head = headline(text);
  if (!head) return false;
  // 剝除器沒認出來的注入區塊。使用者自己貼的 XML 也會被擋，但那同樣不是一個好標題。
  if (head.startsWith("<")) return false;
  // 斜線指令是對機器下的令，不是對這段對話的描述。
  if (head.startsWith("/")) return false;
  return countWordChars(head) >= MIN_WORD_CHARS;
}
