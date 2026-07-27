/**
 * 「這是人機對話，還是機器自己的執行紀錄？」(R9 問題 3)
 *
 * 規則有序，先命中者勝。前兩條與最後一條是硬訊號（路徑、欄位存在與否、計數為零）；
 * **只有第 3 條是啟發式**，也只有它會誤判。這就是 D4 選「全部顯示 + 徽章 + 可切換篩選」
 * 而不是「預設隱藏機器紀錄」的理由：分類錯了，使用者仍然看得到、點得到。
 *
 * 作者實測的反例 `68466cc1`（200 行、其中 2 行 stop_hook_summary、0 sidechain、27 則 user）
 * 是純對話，被誤讀成機器任務——實際上那個提示根本不是分類器，是解析警告 (RC-3)。
 * 這裡用同樣形狀的資料當負向對照測試，釘住它必須是 `dialogue`。
 */
import type { SessionKind, SessionKindReason } from "./contracts";

/**
 * 由排程／自動續跑機制送出的固定提示句。這些是「使用者位置上的機器發言」，
 * 不是真人在打字。列表刻意保守：寧可把機器 session 判成對話，也不要反過來。
 */
const SYNTHETIC_PROMPTS = [
  "Continue from where you left off.",
  "<<autonomous-loop>>",
  "<<autonomous-loop-dynamic>>",
];

/**
 * 精確比對，不做前綴比對。「Continue from where you left off. 另外順便…」是真人在打字，
 * 前綴比對會把他判成機器。分類的偏誤方向必須固定：寧可漏判機器，不可誤判真人。
 */
export function isSyntheticPrompt(text: string): boolean {
  const trimmed = text.trim();
  return SYNTHETIC_PROMPTS.includes(trimmed);
}

export interface ClassificationInput {
  path: string;
  /** 任何一筆紀錄帶有 agentId。 */
  hasAgentId: boolean;
  /** 至少有一筆紀錄，且每一筆都是 isSidechain。 */
  allSidechain: boolean;
  /** 真人 prompt：type=user、字串／text 內容、非 isMeta、非 tool_result、非壓縮摘要。 */
  humanPromptCount: number;
  /** 上述真人 prompt 中，內容命中 SYNTHETIC_PROMPTS 的則數。 */
  syntheticPromptCount: number;
  /** 這份檔案是否被任一 adapter 認領為 Claude Code。 */
  isClaudeCode: boolean;
}

export function isSubagentPath(path: string): boolean {
  return /(^|\/)subagents\//i.test(path);
}

export function classifySession(input: ClassificationInput): { kind: SessionKind; reason: SessionKindReason } {
  if (!input.isClaudeCode) return { kind: "unknown", reason: "not-claude-code" };

  // 1 — 硬訊號：這是子代理的紀錄。
  if (isSubagentPath(input.path)) return { kind: "subagent", reason: "path-subagents" };
  if (input.hasAgentId) return { kind: "subagent", reason: "field-agentid" };
  if (input.allSidechain) return { kind: "subagent", reason: "all-sidechain" };

  // 2 — 硬訊號：從頭到尾沒有人說過話。表頭掃描一定從第 0 byte 開始，
  //     所以「真的有真人第一則」不可能被截斷掉。
  if (input.humanPromptCount === 0) return { kind: "machine", reason: "no-human-prompt" };

  // 3 — 唯一的啟發式：有 prompt，但每一則都是機器代打的固定句。
  if (input.syntheticPromptCount === input.humanPromptCount) {
    return { kind: "machine", reason: "synthetic-prompts-only" };
  }

  // 4 — 有真人講過話。
  return { kind: "dialogue", reason: "has-human-prompt" };
}
