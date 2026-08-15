/**
 * 文件層級的遮蔽器：把一份被拆成很多段的文件逐段遮蔽，但佔位符編號整份共用。
 *
 * 為什麼不直接用 LocalPrivacyGateway：gateway 是為「外傳前的同意流程」設計的——inspection
 * TTL、consent envelope、密鑰一律 block。匯出要的是另一回事（見 policies.ts 的
 * exportRedactionPolicy）：不能 block，而且要跨段落保持同一個值對到同一個佔位符。
 * 偵測與套用的實作仍然共用 detectors / apply，沒有第二份。
 */
import type { DetectionContext, PrivacyDetector, PrivacyPolicy, SensitiveKind } from "./contracts";
import { applyFindings, createRedactionState, isPlaceholder, resolveOverlaps, type RedactionState } from "./apply";
import { DEFAULT_PRIVACY_DETECTORS, highEntropyDetector, secretDetector } from "./detectors";
import { exportRedactionPolicy } from "./policies";

export interface TextRedactorOptions {
  detectors?: PrivacyDetector[];
  policy?: PrivacyPolicy;
  /** 使用者自訂的專案敏感詞。 */
  customTerms?: string[];
  /**
   * 高熵字串規則要不要**真的套用遮蔽**（M7 / D-006，預設 `false`）。
   *
   * 不管這個旗標開不開，高熵規則都會跑一次——見下方 `redact()` 的說明——差別只在
   * 「找到的算不算數」。關閉時找到的一律不動文字，只計入 `report.highEntropyNotRedacted`；
   * 開啟時併入一般遮蔽流程，跟其他類別一樣換成佔位符、計入 `report.summary.high_entropy`。
   */
  redactHighEntropy?: boolean;
}

export interface RedactionReport {
  /** 各類敏感資訊被處理的次數，整份文件累計。 */
  summary: Partial<Record<SensitiveKind, number>>;
  /**
   * 遮蔽後仍被密鑰偵測器命中的段落數。
   *
   * 正常情況恆為 0。不為 0 時**不拋錯**——檔案還是要給使用者，否則他只會關掉遮蔽——
   * 但呼叫端必須把這件事顯眼地講出來，讓使用者知道這份檔案分享前要自己再看一遍。
   */
  residualSecretBlocks: number;
  /**
   * 高熵規則**找到但沒有被遮蔽**的字串數，整份文件累計（M7 / D-006）。
   *
   * `redactHighEntropy` 關閉時，這是高熵規則命中的全部數量；開啟時恆為 0（因為找到的
   * 都已經被遮，計進 `summary.high_entropy` 了）。呼叫端必須把這個數字講出來——D-006
   * 選的是「預設不遮，但誠實揭露」，不揭露就等於這個缺口沒被補上。
   */
  highEntropyNotRedacted: number;
}

/**
 * 高熵規則命中、但實際上仍有字元原封不動留在輸出裡的筆數。
 *
 * 「已經被別的規則遮掉了」不算沒遮，否則揭露筆數會灌水；但判準必須是**涵蓋**
 * (containment) 而不是**重疊** (overlap)。資安複核 (SECREVIEW_R11_M7) 抓到的就是這一點：
 * 原本寫成「只要有任何重疊就整筆排除」，於是 `0912345678QXZKMBNVCF` 這種前 10 碼被電話
 * 規則吃掉、後 10 碼裸露在外的情形，會因為「有重疊」而整筆不計數——輸出裡留著沒遮的高熵
 * 字串，摘要卻一聲不吭。那正是這個計數存在要防的事。
 *
 * 因此這裡逐筆算「扣掉所有真正改寫過文字的區間之後，還剩幾個字元」，只要還有剩就計數。
 * 順帶處理兩段各遮一半、合起來才蓋滿的情況。`keep_review` 不改寫文字，不算覆蓋。
 */
function countUncovered(
  entropyFindings: ReadonlyArray<{ start: number; end: number }>,
  applied: ReadonlyArray<{ start: number; end: number; action: string }>,
): number {
  const covering = applied.filter((item) => item.action !== "keep_review");
  let count = 0;
  for (const finding of entropyFindings) {
    let uncovered = finding.end - finding.start;
    for (let position = finding.start; position < finding.end; position += 1) {
      if (covering.some((item) => position >= item.start && position < item.end)) uncovered -= 1;
    }
    if (uncovered > 0) count += 1;
  }
  return count;
}

/** 有狀態的遮蔽器：同一個實例處理過的所有文字共用一組佔位符編號。 */
export class TextRedactor {
  private readonly detectors: PrivacyDetector[];
  private readonly policy: PrivacyPolicy;
  private readonly context: DetectionContext;
  private readonly state: RedactionState = createRedactionState();
  private readonly totals = new Map<SensitiveKind, number>();
  private readonly highEntropyEnabled: boolean;
  private residual = 0;
  private highEntropyNotRedactedTotal = 0;

  constructor(options: TextRedactorOptions = {}) {
    this.detectors = options.detectors ?? DEFAULT_PRIVACY_DETECTORS;
    this.policy = options.policy ?? exportRedactionPolicy;
    this.context = { customTerms: options.customTerms };
    this.highEntropyEnabled = options.redactHighEntropy ?? false;
  }

  async redact(input: string): Promise<string> {
    if (!input) return input;

    const batches = await Promise.all(this.detectors.map((detector) => detector.detect(input, this.context)));
    const findings = batches.flat();

    // 高熵規則永遠先跑一次，不管 highEntropyEnabled 開不開——揭露（D-006 的實際修法）必須在
    // 規則關閉時也算得出數字。只有「要不要真的送進 apply 換成佔位符」看這個旗標。
    const entropyFindings = await highEntropyDetector.detect(input, this.context);
    const activeFindings = this.highEntropyEnabled ? [...findings, ...entropyFindings] : findings;

    if (activeFindings.length === 0) {
      if (!this.highEntropyEnabled) this.highEntropyNotRedactedTotal += entropyFindings.length;
      return input;
    }

    const applied = resolveOverlaps(activeFindings.map((finding) => ({ ...finding, action: this.policy.decide(finding) })));
    const { text, summary } = applyFindings(input, applied, this.state);
    for (const [kind, count] of Object.entries(summary)) {
      this.totals.set(kind as SensitiveKind, (this.totals.get(kind as SensitiveKind) ?? 0) + (count ?? 0));
    }

    if (!this.highEntropyEnabled) {
      this.highEntropyNotRedactedTotal += countUncovered(entropyFindings, applied);
    }

    // 與 gateway 同樣的事後複查：遮完再掃一次，確認沒有漏網的密鑰。
    // 但要排掉命中自己剛塞進去的佔位符的情況，否則這個警告會常態誤報 (見 isPlaceholder)。
    const residuals = (await secretDetector.detect(text, this.context))
      .filter((finding) => !isPlaceholder(text.slice(finding.start, finding.end)));
    if (residuals.length > 0) this.residual += 1;
    return text;
  }

  get report(): RedactionReport {
    return {
      summary: Object.fromEntries(this.totals) as Partial<Record<SensitiveKind, number>>,
      residualSecretBlocks: this.residual,
      highEntropyNotRedacted: this.highEntropyNotRedactedTotal,
    };
  }
}
