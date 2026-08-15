import type { DetectionContext, PrivacyDetector, PrivacyFinding, SensitiveKind } from "./contracts";

interface PatternRule {
  kind: SensitiveKind;
  action: PrivacyFinding["suggestedAction"];
  confidence: number;
  pattern: RegExp;
  capture?: number;
}

const SECRET_RULES: PatternRule[] = [
  { kind: "secret", action: "block", confidence: 1, pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { kind: "secret", action: "block", confidence: 0.99, pattern: /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/g },
  { kind: "secret", action: "block", confidence: 0.98, pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { kind: "secret", action: "block", confidence: 0.96, pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  {
    kind: "secret",
    action: "block",
    confidence: 0.95,
    pattern: /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd)\s*[:=]\s*["']?([^\s"';]{8,})/gi,
    capture: 1,
  },
  { kind: "secret", action: "block", confidence: 0.95, pattern: /\b(?:https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s/:]+:([^\s/@]+)@[^\s]+/gi, capture: 1 },
];

const IDENTIFIER_RULES: PatternRule[] = [
  { kind: "email", action: "replace", confidence: 0.98, pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { kind: "phone", action: "replace", confidence: 0.88, pattern: /(?<![\w.])(?:\+?886[-\s]?)?0?9\d{2}[-\s]?\d{3}[-\s]?\d{3}(?!\d)/g },
  { kind: "user_path", action: "replace", confidence: 0.97, pattern: /(?<=\b[A-Za-z]:\\Users\\)[^\\\s]+/g },
  { kind: "user_path", action: "replace", confidence: 0.97, pattern: /(?<=\/(?:home|Users)\/)[^/\s]+/g },
  { kind: "ip_address", action: "replace", confidence: 0.9, pattern: /\b(?!(?:127\.0\.0\.1|0\.0\.0\.0)\b)(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g },
];

/**
 * Rules are module-level constants, so each scan gets its own RegExp rather
 * than mutating shared `lastIndex`. `d` is added so capture offsets come from
 * the engine instead of being guessed — see findingsForRules.
 */
function withIndices(pattern: RegExp): RegExp {
  const flags = new Set(pattern.flags.split(""));
  flags.add("g");
  flags.add("d");
  return new RegExp(pattern.source, [...flags].join(""));
}

function findingsForRules(detectorId: string, input: string, rules: PatternRule[]): PrivacyFinding[] {
  const findings: PrivacyFinding[] = [];
  for (const rule of rules) {
    const pattern = withIndices(rule.pattern);
    for (const match of input.matchAll(pattern)) {
      if (match.index === undefined) continue;
      const value = rule.capture ? match[rule.capture] : match[0];
      if (!value) continue;
      /**
       * The capture's position must come from match.indices, not from
       * match[0].indexOf(value): indexOf finds the FIRST occurrence inside the
       * match, which is the wrong one whenever the captured text also appears
       * earlier. "password:password" located the label at offset 0 instead of
       * the value at 9 — and a caller that masks a finding by its offsets
       * would then have masked the label and shipped the secret.
       */
      const indices = (match as RegExpMatchArray & { indices?: Array<[number, number] | undefined> }).indices;
      const captured = rule.capture ? indices?.[rule.capture] : undefined;
      const start = captured
        ? captured[0]
        : match.index + Math.max(0, rule.capture ? match[0].indexOf(value) : 0);
      findings.push({
        id: `${detectorId}:${rule.kind}:${start}:${start + value.length}`,
        detectorId,
        kind: rule.kind,
        start,
        end: start + value.length,
        confidence: rule.confidence,
        suggestedAction: rule.action,
      });
    }
  }
  return findings;
}

export const secretDetector: PrivacyDetector = {
  id: "secrets",
  version: "1.0.0",
  async detect(input): Promise<PrivacyFinding[]> {
    return findingsForRules(this.id, input, SECRET_RULES);
  },
};

export const directIdentifierDetector: PrivacyDetector = {
  id: "direct-identifiers",
  version: "1.0.0",
  async detect(input): Promise<PrivacyFinding[]> {
    return findingsForRules(this.id, input, IDENTIFIER_RULES);
  },
};

/**
 * 高熵字串偵測（M7 / D-006）。
 *
 * 這是唯一一條**不靠已知前綴**辨識的規則。其餘規則靠 `sk-`、`ghp_`、`eyJ`、
 * `-----BEGIN…` 這類固定字首；這條規則要抓的正是「沒有字首的長亂碼」——未加註記的 API
 * token、session UUID、git commit SHA。判準是「這段文字的字元分布長得像亂數，不像英文
 * 散文或程式識別碼」，分三個子規則：
 *
 * 1. **UUID**（8-4-4-4-12 十六進位分段）：結構本身已經是隨機識別碼，不需要另外算熵。
 * 2. **連續 ≥32 碼的十六進位**（SHA-1/SHA-256、git commit hash 常見長度）：16 進位字母表
 *    選擇少，真正隨機的雜湊幾乎必然涵蓋多種不同字元；要求至少 6 種不同字元，濾掉
 *    `aaaa…a`／`0000…0` 這類退化重複值。
 * 3. **其餘不含分隔符（`-`／`_`）的連續英數字，長度 ≥20，且 Shannon entropy ≥4.3 bits/char。**
 *    先用非英數字元把候選字串斷開、只在斷開後仍 ≥20 碼的片段裡算熵，是為了不誤擋
 *    `scientific-research-guide-domain-sync` 這類 kebab-case 識別碼／分支名——斷開後
 *    每個英文單字都不到 20 碼，天然被濾掉，不需要另外維護一份英文字典。
 *
 * ── 閾值怎麼調出來的（2026-08-15，量測腳本未進版控，數字記在這裡供之後的人爭論）──
 * 對本機兩個真實語料庫（`~/.claude/projects` 205 份、`~/.codex/sessions` 358 份，共
 * 191,534 段訊息文字，只取會實際出現在逐字稿裡的 `text`／`content` 欄位，不含原始 JSON
 * 結構）跑同一套規則：
 * - 未過濾的候選字串（≥20 碼、不含分隔符）有 111,056 筆；改成「先斷開再量長度」之前，
 *   純小寫、無數字、非駝峰的 kebab/snake 識別碼佔了 274,685 筆（56%）——這正是上面第 3
 *   點要濾掉的東西，斷開後降到 582 筆。
 * - entropy 閾值掃描：T=4.0 命中 10,706 筆、T=4.3 命中 2,950 筆、T=4.5 命中 1,858 筆。
 *   T=4.0 附近仍會抓到程式碼識別碼（`dangerouslySetInnerHTML` entropy 4.02、
 *   `agentPushNotificationsEnabled` entropy 4.01）與內部工具呼叫 id（`toolu_01…` 這類
 *   24 碼 id，entropy 約 4.2–4.3）；T=4.3 把這兩類的大部分濾掉，同時仍抓到明顯的隨機
 *   blob（量到最長 203 碼、entropy 5.69 的一筆）。故取 4.3。
 * - hex 子規則：14,716 筆命中中，僅 43 筆（0.29%）是退化重複值，其餘字元分布正常。
 *
 * ── 已知會誤擋、刻意不排除 ──
 * git commit SHA（40 碼十六進位）與內部工具呼叫 id 這類結構隨機但通常無害的字串一樣會
 * 中。這正是 D-006 選「預設關閉＋揭露」而不是「自動遮蔽」的理由：不用猜哪些隨機字串是
 * 機密、哪些不是，把判斷交回使用者；預設關閉時，這條規則完全不套用遮蔽，只計數並在
 * 摘要裡誠實報告「另偵測到 N 筆疑似高熵字串（未遮）」。commit SHA 要不要整類排除是
 * R11-Q1，交由作者依實際輸出裁定，此處不預先決定。
 *
 * confidence 刻意低於所有已知前綴規則（現有最低是 phone 的 0.88），這樣 `resolveOverlaps`
 * 在兩者命中同一段文字時，既有規則的判定不會被這條猜測性更高的規則蓋掉。
 */
const HIGH_ENTROPY_DETECTOR_ID = "high-entropy";
export const HIGH_ENTROPY_MIN_TOKEN_LENGTH = 20;
export const HIGH_ENTROPY_THRESHOLD_BITS_PER_CHAR = 4.3;
const HEX_RUN_MIN_LENGTH = 32;
const HEX_RUN_MIN_DISTINCT_DIGITS = 6;

const UUID_PATTERN = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;
const HEX_RUN_PATTERN = new RegExp(`\\b[0-9a-fA-F]{${HEX_RUN_MIN_LENGTH},}\\b`, "g");
// 不含分隔符：先讓 `-`／`_` 斷開候選字串，等同「只在斷開後的片段裡找」。
const TOKEN_RUN_PATTERN = new RegExp(`(?<![A-Za-z0-9])[A-Za-z0-9]{${HIGH_ENTROPY_MIN_TOKEN_LENGTH},}(?![A-Za-z0-9])`, "g");

/** Shannon entropy，單位 bits/char。字元分布越平均（越像亂數）值越高。 */
function shannonEntropyBitsPerChar(value: string): number {
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function highEntropyFinding(start: number, length: number, confidence: number): PrivacyFinding {
  const end = start + length;
  return {
    id: `${HIGH_ENTROPY_DETECTOR_ID}:high_entropy:${start}:${end}`,
    detectorId: HIGH_ENTROPY_DETECTOR_ID,
    kind: "high_entropy",
    start,
    end,
    confidence,
    suggestedAction: "replace",
  };
}

export const highEntropyDetector: PrivacyDetector = {
  id: HIGH_ENTROPY_DETECTOR_ID,
  version: "1.0.0",
  async detect(input): Promise<PrivacyFinding[]> {
    const findings: PrivacyFinding[] = [];

    for (const match of input.matchAll(UUID_PATTERN)) {
      if (match.index === undefined) continue;
      findings.push(highEntropyFinding(match.index, match[0].length, 0.6));
    }
    for (const match of input.matchAll(HEX_RUN_PATTERN)) {
      if (match.index === undefined) continue;
      const value = match[0];
      if (new Set(value.toLowerCase()).size < HEX_RUN_MIN_DISTINCT_DIGITS) continue;
      findings.push(highEntropyFinding(match.index, value.length, 0.55));
    }
    for (const match of input.matchAll(TOKEN_RUN_PATTERN)) {
      if (match.index === undefined) continue;
      const value = match[0];
      if (shannonEntropyBitsPerChar(value) < HIGH_ENTROPY_THRESHOLD_BITS_PER_CHAR) continue;
      findings.push(highEntropyFinding(match.index, value.length, 0.5));
    }
    return findings;
  },
};

export const customTermDetector: PrivacyDetector = {
  id: "custom-terms",
  version: "1.0.0",
  async detect(input: string, context: DetectionContext): Promise<PrivacyFinding[]> {
    const findings: PrivacyFinding[] = [];
    for (const term of context.customTerms ?? []) {
      const value = term.trim();
      if (value.length < 2) continue;
      let from = 0;
      while (from < input.length) {
        const start = input.indexOf(value, from);
        if (start < 0) break;
        findings.push({
          id: `${this.id}:project_term:${start}:${start + value.length}`,
          detectorId: this.id,
          kind: "project_term",
          start,
          end: start + value.length,
          confidence: 1,
          suggestedAction: "replace",
        });
        from = start + value.length;
      }
    }
    return findings;
  },
};

export const DEFAULT_PRIVACY_DETECTORS: PrivacyDetector[] = [secretDetector, directIdentifierDetector, customTermDetector];
