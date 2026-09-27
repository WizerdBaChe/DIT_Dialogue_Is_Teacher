/** 內建範例 session，供首次載入展示 (不需使用者準備檔案)。 */
import sampleSession from "./sampleSession.jsonl?raw";
/** 測試用 fixture：含 subagent(isSidechain)/長輸出/多任務分界，見 PSM R1。 */
import subagentSession from "./subagentSession.jsonl?raw";
import r4MainSession from "./r4/main.jsonl?raw";
import r4SubagentSession from "./r4/subagents/agent-1.jsonl?raw";

/*
 * 2026-09-compact-chain (T-008): a compacted chain shaped after a real Desktop resume
 * (`7d074bf8` → `7fed77ca`, 2026-09-03; content replaced, uuids shortened, record shapes kept).
 *  - parent:  compaction mid-file (boundary B1 after p-hook), then its own post-boundary turn.
 *  - child:   B1 at the head, the summary, the preserved copies (p-a2, p-hook), the parent's
 *             post-boundary turn again, then two records of its own (c-u4, c-a4).
 *  - sibling: another resume of the same B1 with its own turns (s-u4, s-a4).
 *  - infile:  the AppData shape — a boundary near the head whose logical parent (x-att) sits
 *             in the same file BEFORE it. An in-file compaction, not a continuation.
 */
/*
 * 2026-09 UX 走查 F6 的 fixture。閱讀頁標題是單行 nowrap + ellipsis，長標題只靠 `title`
 * 屬性補回全文——而 `title` 需要 hover，觸控裝置上沒有 hover。要判斷「這樣夠不夠分辨」，
 * 需要兩份**共用長前綴、只在尾端不同**的 session：截斷之後它們看起來會是同一個東西。
 * 示範 session 的標題很短，永遠不會截斷，所以走查當時觀察不到這件事。
 *
 * 這兩份是 fixture，不是內建範例：它們不會自己出現在畫面上。人工驗收 B2 的用法是用
 * 「選擇一則對話」載入 `src/fixtures/longTitle/` 底下這兩個檔，各看一次閱讀頁的標題列。
 */
import longTitleAttemptOne from "./longTitle/attempt-one.jsonl?raw";
import longTitleAttemptTwo from "./longTitle/attempt-two.jsonl?raw";
import chainParentSession from "./chain/parent.jsonl?raw";
import chainChildSession from "./chain/child.jsonl?raw";
import chainSiblingSession from "./chain/sibling.jsonl?raw";
import chainInFileSession from "./chain/infile.jsonl?raw";

export {
  sampleSession,
  subagentSession,
  r4MainSession,
  r4SubagentSession,
  longTitleAttemptOne,
  longTitleAttemptTwo,
  chainParentSession,
  chainChildSession,
  chainSiblingSession,
  chainInFileSession,
};
