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
import { DEFAULT_PRIVACY_DETECTORS, secretDetector } from "./detectors";
import { exportRedactionPolicy } from "./policies";

export interface TextRedactorOptions {
  detectors?: PrivacyDetector[];
  policy?: PrivacyPolicy;
  /** 使用者自訂的專案敏感詞。 */
  customTerms?: string[];
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
}

/** 有狀態的遮蔽器：同一個實例處理過的所有文字共用一組佔位符編號。 */
export class TextRedactor {
  private readonly detectors: PrivacyDetector[];
  private readonly policy: PrivacyPolicy;
  private readonly context: DetectionContext;
  private readonly state: RedactionState = createRedactionState();
  private readonly totals = new Map<SensitiveKind, number>();
  private residual = 0;

  constructor(options: TextRedactorOptions = {}) {
    this.detectors = options.detectors ?? DEFAULT_PRIVACY_DETECTORS;
    this.policy = options.policy ?? exportRedactionPolicy;
    this.context = { customTerms: options.customTerms };
  }

  async redact(input: string): Promise<string> {
    if (!input) return input;

    const batches = await Promise.all(this.detectors.map((detector) => detector.detect(input, this.context)));
    const findings = batches.flat();
    if (findings.length === 0) return input;

    const applied = resolveOverlaps(findings.map((finding) => ({ ...finding, action: this.policy.decide(finding) })));
    const { text, summary } = applyFindings(input, applied, this.state);
    for (const [kind, count] of Object.entries(summary)) {
      this.totals.set(kind as SensitiveKind, (this.totals.get(kind as SensitiveKind) ?? 0) + (count ?? 0));
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
    };
  }
}
