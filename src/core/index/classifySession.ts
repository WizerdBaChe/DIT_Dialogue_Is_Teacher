/**
 * 「這是人機對話，還是機器自己的執行紀錄？」(R9 問題 3)
 *
 * 規則有序，先命中者勝。除了第 6 條以外全是硬訊號（路徑、欄位存在與否、計數為零）；
 * **只有第 6 條是啟發式**，也只有它會誤判。這就是 D4 選「全部顯示 + 徽章 + 可切換篩選」
 * 而不是「預設隱藏機器紀錄」的理由：分類錯了，使用者仍然看得到、點得到。
 *
 * 偏誤方向是固定的，三處都往同一邊倒：機器語句用精確比對而非前綴比對；斜線指令算「人出手」
 * 而不是看淨化後還剩幾個字；掃描讀不到東西就回報「無法判定」而不是「沒有真人訊息」。
 * 實測 109 個真實 session 時，後兩者各抓回一個被誤判成機器任務的真人對話。
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
  /**
   * 真人**出手**的次數：type=user、非 isMeta、非 tool_result、非壓縮摘要。
   *
   * 注意這裡數的是「回合」而不是「有文字的 prompt」。`/doctor` 這種斜線指令在淨化後
   * 文字會整段消失，但那確確實實是一個人按下去的——用文字長度當判準會把它算成機器。
   */
  humanTurnCount: number;
  /** 上述回合中，淨化後文字剛好等於已知機器代打語句的則數。 */
  syntheticPromptCount: number;
  /**
   * 表頭掃描是否讀到了檔案開頭的紀錄。false 代表第一行大到塞不進掃描視窗
   * （夾帶截圖的 base64 就會這樣），此時所有計數都不可信，不得據以判定。
   */
  headScanUsable: boolean;
  /** 這份檔案是否被任一 adapter 認領為 Claude Code。 */
  isClaudeCode: boolean;
}

export function isSubagentPath(path: string): boolean {
  return /(^|\/)subagents\//i.test(path);
}

export function classifySession(input: ClassificationInput): { kind: SessionKind; reason: SessionKindReason } {
  // 1 — 路徑是唯一不依賴掃描結果的訊號，所以排在最前面。
  if (isSubagentPath(input.path)) return { kind: "subagent", reason: "path-subagents" };

  // 2 — 掃描不可信就什麼都別判，連來源都別判：第一行大到讀不完時，adapter 也認不出它。
  //     寧可說「不知道」，也不要把一份真人對話標成機器任務或悄悄排除掉——偏誤方向必須固定，
  //     而「無法判定」是使用者看得懂、也不會被藏起來的答案。
  if (!input.headScanUsable) return { kind: "unknown", reason: "insufficient-signal" };

  // 3 — 有把握地排除：讀得到完整的行，而且沒有 adapter 認領。
  if (!input.isClaudeCode) return { kind: "unknown", reason: "not-claude-code" };

  // 4 — 其餘子代理硬訊號。
  if (input.hasAgentId) return { kind: "subagent", reason: "field-agentid" };
  if (input.allSidechain) return { kind: "subagent", reason: "all-sidechain" };

  // 5 — 硬訊號：從頭到尾沒有人出過手。
  if (input.humanTurnCount === 0) return { kind: "machine", reason: "no-human-prompt" };

  // 6 — 唯一的啟發式：有回合，但每一則都是機器代打的固定句。
  if (input.syntheticPromptCount === input.humanTurnCount) {
    return { kind: "machine", reason: "synthetic-prompts-only" };
  }

  // 7 — 有真人講過話。
  return { kind: "dialogue", reason: "has-human-prompt" };
}
