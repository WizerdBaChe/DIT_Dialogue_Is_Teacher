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
import chainParentSession from "./chain/parent.jsonl?raw";
import chainChildSession from "./chain/child.jsonl?raw";
import chainSiblingSession from "./chain/sibling.jsonl?raw";
import chainInFileSession from "./chain/infile.jsonl?raw";

export {
  sampleSession,
  subagentSession,
  r4MainSession,
  r4SubagentSession,
  chainParentSession,
  chainChildSession,
  chainSiblingSession,
  chainInFileSession,
};
