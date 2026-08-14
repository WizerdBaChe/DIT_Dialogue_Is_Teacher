import type { PrivacyFinding, PrivacyPolicy } from "./contracts";

function invariantAction(finding: PrivacyFinding): "block" | null {
  return finding.kind === "secret" ? "block" : null;
}

export const balancedPrivacyPolicy: PrivacyPolicy = {
  id: "balanced",
  version: "1.0.0",
  decide(finding) {
    return invariantAction(finding) ?? finding.suggestedAction;
  },
};

export const strictPrivacyPolicy: PrivacyPolicy = {
  id: "strict",
  version: "1.0.0",
  decide(finding) {
    const invariant = invariantAction(finding);
    if (invariant) return invariant;
    if (finding.kind === "content_sensitive") return "block";
    return finding.suggestedAction === "keep_review" ? "redact" : finding.suggestedAction;
  },
};

/**
 * 匯出遮蔽專用政策。
 *
 * 與外傳政策的關鍵差異：**不 block**。外傳時擋下來是對的——資料還沒離開機器，擋住就沒事；
 * 但匯出是寫到使用者自己的磁碟，擋住只會讓整份檔案匯不出來，使用者的反應會是直接關掉遮蔽，
 * 結果反而拿到一份完全沒遮的檔案。所以這裡把密鑰降級成替換成佔位符：檔案照樣拿得到，
 * 密鑰不在裡面。
 *
 * `keep_review`（保留原文、請人工複查）同樣升級成替換：匯出檔的用途就是貼給別人看，
 * 「留著等你自己檢查」不是一個安全的預設。
 */
export const exportRedactionPolicy: PrivacyPolicy = {
  id: "export-redact",
  version: "1.0.0",
  decide(finding) {
    if (finding.kind === "secret") return "replace";
    return finding.suggestedAction === "block" || finding.suggestedAction === "keep_review"
      ? "replace"
      : finding.suggestedAction;
  },
};

export const PRIVACY_POLICIES: Record<"balanced" | "strict", PrivacyPolicy> = {
  balanced: balancedPrivacyPolicy,
  strict: strictPrivacyPolicy,
};
