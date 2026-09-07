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
import type { SourceId } from "@/types/spanTree";
import { profileFor, type ClassificationSignal } from "@/core/source/profiles";
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
   *
   * 這個欄位只讀 Claude Code 的頂層欄位名（`record.type === "user"`）——對 Codex 信封必定
   * 是 0，見下面 `codexHumanTurnCount` 為什麼要另開一個欄位而不是共用這個。
   */
  humanTurnCount: number;
  /** 上述回合中，淨化後文字剛好等於已知機器代打語句的則數。 */
  syntheticPromptCount: number;
  /**
   * R11.2 R1：Codex 自己的「真人出手」計數——讀 `response_item/message` 且 `role === "user"`，
   * 排除 `role === "developer"`（系統提示注入）與 auto-review 審查子代理轉述的歷史（那段文字
   * 掛著 `role: "user"` 信封，但是機器轉述，不是真人打的字，見 `isAutoReviewDump`）。
   *
   * 刻意跟 `humanTurnCount` 分開一個欄位，而不是「偵測到 Codex 信封就往同一個計數器加」：
   * 兩者的讀法（欄位路徑、要排除什麼）完全不同，共用一個名字容易讓未來的人以為兩條規則
   * 讀的是同一種資料，把某一邊的例外（例如 isMeta）誤用到另一邊。分開命名讓「這是 Codex
   * 自己的訊號」這件事在型別上就看得出來。
   */
  codexHumanTurnCount: number;
  /**
   * R11.2 R1：表頭＋表尾掃描視窗內，是否至少看到一筆 `response_item/message`
   * （`role` 為 `user` 或 `assistant`；不含被排除的 `developer` 系統提示，因為那幾乎每份
   * session 都有，若把它算進來，這個旗標就永遠是 true，起不了篩選作用）。
   *
   * `codexHumanTurnCount === 0` 只有在這裡是 true 時才可信——那才代表視窗內真的看到了對話
   * 結構、數出來的 0 是「數過，確實沒有」。如果視窗內完全沒看到任何訊息型記錄（例如整段都是
   * 工具呼叫／推理／系統事件），`codexHumanTurnCount` 是 0 的原因是「沒看到東西可數」，誠實的
   * 答案仍然是「無法判定」，不是「機器任務」。
   */
  codexSignalUsable: boolean;
  /**
   * 表頭掃描是否讀到了檔案開頭的紀錄。false 代表第一行大到塞不進掃描視窗
   * （夾帶截圖的 base64 就會這樣），此時所有計數都不可信，不得據以判定。
   */
  headScanUsable: boolean;
  /**
   * 認領此檔案的來源；沒有 adapter 認領就是 `undefined`。
   *
   * R11 WC-1.2：以前這裡只有 `isClaudeCode: boolean`，因為索引器只索引 Claude Code。R11 起
   * Codex 也會被索引，但 `hasAgentId` / `allSidechain` / `humanTurnCount` 這三個訊號全部是拿
   * Claude Code 的頂層欄位名去讀 (`record.agentId`、`record.isSidechain`、`record.type ===
   * "user"`)。Codex 的信封長得完全不同 (`type: "response_item"`，真正的角色與內容都在巢狀的
   * `payload` 裡)，這些檢查對 Codex 紀錄必定回報「沒有／不是」——不是那份 session 真的沒有子
   * 代理或真人發言，是讀法對不上格式。把「讀不到訊號」當成「訊號說沒有」，會把每一份 Codex
   * 對話都誤判成「機器任務・無真人訊息」，這正是本專案在別處已經吃過虧的無中生有降級。
   *
   * R11.2 R1：上面那條規則本身沒有錯——錯的是「所以非 Claude Code 一律回報無法判定」這個
   * 結論。R11 當時只有拒絕誤讀的那一半，沒有給 Codex 自己的讀法，於是把「這條規則不適用」
   * 變成了「Codex 永遠判不出來」，跟一開始要避免的無中生有降級殊途同歸——使用者看到的仍然是
   * 一個沒用的分類結果，只是誠實地沒用而已。修法是給 Codex 自己的訊號
   * (`codexHumanTurnCount` / `codexSignalUsable`，讀 `response_item/message` 自己的
   * `role`/`content`)，而不是讓 Claude Code 的欄位名越界去讀 Codex 的資料。三路判斷
   * （讀不到 / 讀得到但沒人認領 / 讀得到且被認領但規則讀不出東西）現在改成四路：認得出來源時，
   * 依來源分派到各自的規則；只有「認得出來源，但這個來源自己的規則也判不出東西」才落回
   * `codex-unclassified`。
   */
  source: SourceId | undefined;
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

  // 3 — 有把握地排除：讀得到完整的行，而且沒有任何 adapter 認領。
  if (!input.source) return { kind: "unknown", reason: "not-claude-code" };

  // 3.5 (R11.2 R1) — 有 adapter 認領：依來源分派到各自的規則，而不是共用一套讀法。
  // Claude Code 走 4–6，Codex 走它自己的兩條（見下）；兩邊的欄位路徑、要排除的雜訊都不同，
  // 混用任何一邊都會把「讀不到」誤讀成「訊號說沒有」。
  /*
   * R12 M6：哪些訊號適用於這個來源，由側寫說了算 (`discovery.classify.signals`)。
   *
   * 規則本身仍然各寫各的——Claude Code 四條、Codex 兩條形狀不同的，它們不是「同一組規則套
   * 不同訊號」，硬做成資料表驅動的 rule engine 成本遠大於收益（架構複核的判斷，已核對同意）。
   * 資料表化的只有「這條規則該不該對這個來源跑」，這讓「為什麼這份判不出來」變成可以從側寫
   * 回答的問題，而不是要去讀分類器才知道。
   */
  // `input.source` is narrowed by rule 3 above; capture it so the closure keeps the narrowing.
  const source = input.source;
  const supplies = (signal: ClassificationSignal): boolean =>
    profileFor(source).discovery.classify.signals.includes(signal);

  if (input.source === "claude-code") {
    // 4 — 其餘子代理硬訊號。
    if (supplies("agent-id-field") && input.hasAgentId) return { kind: "subagent", reason: "field-agentid" };
    if (supplies("all-sidechain") && input.allSidechain) return { kind: "subagent", reason: "all-sidechain" };

    // 5 — 硬訊號：從頭到尾沒有人出過手。
    if (supplies("human-turn-count") && input.humanTurnCount === 0) return { kind: "machine", reason: "no-human-prompt" };

    // 6 — 唯一的啟發式：有回合，但每一則都是機器代打的固定句。
    if (input.syntheticPromptCount === input.humanTurnCount) {
      return { kind: "machine", reason: "synthetic-prompts-only" };
    }

    // 7 — 有真人講過話。
    return { kind: "dialogue", reason: "has-human-prompt" };
  }

  if (input.source === "codex") {
    // Codex 沒有子代理／sidechain 的頂層訊號可讀（那是 Claude Code 的檔案佈局慣例），
    // 所以這裡只有兩條規則，不是偷懶少寫，是誠實地只寫「讀得到的」。
    //
    // 8 — 視窗內完全沒看到任何 response_item/message：沒東西可數，不是「數過是 0」。
    if (!input.codexSignalUsable) return { kind: "unknown", reason: "codex-unclassified" };

    // 9 — 看到了對話結構，但真人回合數是 0：跟規則 5 同一個事實，換一種訊號來源而已。
    //     側寫宣告 Codex 供得出 `human-turn-count`（用它自己的讀法），所以這條規則適用。
    if (supplies("human-turn-count") && input.codexHumanTurnCount === 0) {
      return { kind: "machine", reason: "no-human-prompt" };
    }

    // 10 — Codex 這邊沒有已知的機器代打固定句可比對（R9 那份清單是 Claude Code 自動續跑
    //      功能專屬的），所以看到真人回合就直接算對話，不硬套規則 6 的啟發式。
    return { kind: "dialogue", reason: "has-human-prompt" };
  }

  /*
   * 11 (R12 M6) — 窮舉檢查。
   *
   * 這一行是這條 round 對 INV-R12-1 的實際兌現：**加第三個 `SourceId` 時它編不過**。
   * 在此之前這裡是一個 catch-all，新來源會安靜地掉進去——而且被貼上 `codex-unclassified`，
   * 一個指名錯來源的原因碼。窮舉 `Record` 保護的是資料表，保護不到分支分派；這一行補的
   * 正是那個缺口（架構複核 2026-08-26）。
   *
   * 賦值給 `never` 只在編譯期作用；後面仍然保留一個回傳，執行期不拋例外。原因碼改用來源
   * 中性的 `insufficient-signal`——真的走到這裡代表我們沒有為這個來源寫規則，那確實就是
   * 「訊號不足以判定」，而不是「Codex 判不出來」。
   */
  const exhaustive: never = input.source;
  void exhaustive;
  return { kind: "unknown", reason: "insufficient-signal" };
}
