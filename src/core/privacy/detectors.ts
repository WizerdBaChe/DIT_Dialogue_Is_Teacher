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
