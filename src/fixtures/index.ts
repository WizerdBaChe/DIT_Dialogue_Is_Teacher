/** 內建範例 session，供首次載入展示 (不需使用者準備檔案)。 */
import sampleSession from "./sampleSession.jsonl?raw";
/** 測試用 fixture：含 subagent(isSidechain)/長輸出/多任務分界，見 PSM R1。 */
import subagentSession from "./subagentSession.jsonl?raw";
import r4MainSession from "./r4/main.jsonl?raw";
import r4SubagentSession from "./r4/subagents/agent-1.jsonl?raw";

export { sampleSession, subagentSession, r4MainSession, r4SubagentSession };
