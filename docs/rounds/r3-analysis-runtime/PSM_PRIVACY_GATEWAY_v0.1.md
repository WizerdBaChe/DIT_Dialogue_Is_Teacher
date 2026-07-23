# 可重用去識別化閘道 PSM v0.1

> 狀態：設計基線（2026-07-18）
> 適用範圍：任何在本機整理文字、再選擇性送往外部分析服務的專案
> DIT 僅是第一個整合端；本規格不得依賴 DIT 的 Span Tree、Zustand 或 Provider 型別。

## 1. 問題與目標

外部大型語言模型（LLM）能補足本機小模型的分析品質，但原始對話可能含姓名、電子郵件、機器路徑、專案代號、原始碼片段、API token 或其他祕密。這條管線的目的不是宣稱資料已「完全匿名」，而是在資料離開本機前，以可檢視、可阻擋、可追蹤的方式降低暴露風險。

### 1.1 必須成立的不變條件

1. **先處理、後傳送**：外部 Provider 永遠只收到 `PrivacyEnvelope.sanitizedText`。
2. **祕密一律阻擋**：偵測到 credential／token／private key 時，不得以「仍要傳送」略過；使用者必須先修改內容。
3. **預覽先於同意**：首次外傳與每次政策升級後，必須顯示送出內容、命中類別與替換數量。
4. **原文與對照表不落地**：去識別化對照只存於當次記憶體工作階段；不得寫入 IndexedDB、log 或匯出檔。
5. **Provider 無關**：Ollama、OpenCode 或未來 Provider 皆走同一介面；本機 Provider 可套用但不強制。
6. **失敗必須可見**：偵測器故障、政策版本不相容、轉換後仍命中祕密，都要 fail closed 並回傳結構化錯誤。

### 1.2 非目標

- 不保證不可重新識別；自由文字的語境、罕見事件與程式內容仍可能形成間接識別。
- 不在 v0.1 引入雲端 DLP、帳號系統、集中政策伺服器或可逆加密。
- 不將整份原始檔送到偵測服務；預設偵測與轉換必須在本機完成。
- 不取代法律、合規或人工審查。

## 2. 先例查核與採用決策

| 來源／方案 | 查核到的能力 | v0.1 決策 |
|---|---|---|
| NIST IR 8053 | 去識別化可降低分享與處理個資的風險，但部分資料仍可能被重新識別 | 採用「降低風險而非保證匿名」的產品用語 |
| Microsoft Presidio | 將流程分成偵測與匿名化，支援 replace／redact／hash／encrypt／custom；官方亦明示自動偵測不能保證找出全部敏感資訊 | 採用兩階段介面與可插拔偵測器；不在瀏覽器 MVP 直接引入 Python／Docker runtime，保留未來本機服務 adapter |
| Gitleaks | 以規則、熵與 allowlist 偵測 credential 類祕密 | 參考規則分類與測試語料；不嵌入 Go binary，也不直接複製其規則實作 |
| OWASP Logging Cheat Sheet | 敏感事件資料應移除、遮罩、清理或加密，避免二次暴露 | 將 log 安全列為核心不變條件；報告只能含類別、位置與計數 |

參考資料：

- [NIST IR 8053 — De-Identification of Personal Information](https://csrc.nist.gov/pubs/ir/8053/final)
- [Presidio Text Anonymization](https://microsoft.github.io/presidio/text_anonymization/)
- [Presidio Anonymizer](https://microsoft.github.io/presidio/anonymizer/)
- [Gitleaks](https://github.com/gitleaks/gitleaks)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)

## 3. 名詞與資料分類

| 名詞 | 定義 |
|---|---|
| Secret | 可直接取得權限的祕密，例如 API token、password、private key、連線字串 |
| Direct identifier | 可直接指向自然人的資料，例如電子郵件、電話、身分證號、姓名 |
| Contextual identifier | 在特定專案中可能識別人或組織的資料，例如使用者目錄、內網主機、專案代號、客戶名稱 |
| Content-sensitive | 不一定識別個人，但不應外傳的內容，例如未公開原始碼、合約、內部架構 |
| Finding | 偵測器輸出的敏感片段座標、類別、信心值與建議動作；不得攜帶原始值到 log |
| Policy | 將 finding 映射為 block／replace／redact／keep-review 的版本化規則 |
| Envelope | 唯一可交給外部 Provider 的已處理資料與稽核摘要 |

## 4. 純核心架構

```text
Raw text
  -> normalize
  -> detect (multiple local detectors)
  -> resolve overlaps
  -> evaluate policy
  -> block OR transform
  -> post-scan validation
  -> human preview / consent
  -> PrivacyEnvelope
  -> external provider
```

建議的 package-shaped 目錄；`adapters/dit` 位於 DIT 專案，不屬本核心：

```text
src/core/privacy/
  contracts.ts
  normalize.ts
  detectorRegistry.ts
  overlapResolver.ts
  policyEngine.ts
  transformer.ts
  postScan.ts
  preview.ts
  errors.ts
  detectors/
    secrets.ts
    directIdentifiers.ts
    filesystem.ts
    network.ts
    customTerms.ts
  policies/
    balanced.ts
    strict.ts
src/adapters/dit/privacyAdapter.ts
```

核心只能依賴 Web 標準 API 與自己的 contracts。未來抽成獨立 package 時，移動 `src/core/privacy/` 不應需要修改內容。

## 5. 型別合約

下列為語意合約；實作檔與測試名稱使用英文。

```ts
export type SensitiveKind =
  | "secret"
  | "email"
  | "phone"
  | "person"
  | "user_path"
  | "ip_address"
  | "hostname"
  | "project_term"
  | "content_sensitive";

export type PrivacyAction = "block" | "replace" | "redact" | "keep_review";

export interface PrivacyFinding {
  id: string;
  detectorId: string;
  kind: SensitiveKind;
  start: number;
  end: number;
  confidence: number;
  suggestedAction: PrivacyAction;
}

export interface PrivacyDetector {
  readonly id: string;
  readonly version: string;
  detect(input: string, context: DetectionContext): Promise<PrivacyFinding[]>;
}

export interface PrivacyPolicy {
  readonly id: "balanced" | "strict" | string;
  readonly version: string;
  decide(finding: PrivacyFinding): PrivacyAction;
}

export interface PrivacyEnvelope {
  sanitizedText: string;
  policy: { id: string; version: string };
  detectorVersions: Record<string, string>;
  summary: Record<SensitiveKind, number>;
  consentId: string;
  createdAt: string;
}

export interface PrivacyGateway {
  inspect(input: string, request: PrivacyRequest): Promise<PrivacyInspection>;
  authorize(inspectionId: string, consent: PrivacyConsent): Promise<PrivacyEnvelope>;
}
```

`PrivacyInspection` 可讓 UI 顯示 sanitized preview 與安全摘要，但其原始 finding 與 ephemeral replacement map 只存在核心記憶體。`authorize()` 必須驗證 inspection 尚未過期、輸入雜湊未變、政策版本未變，避免預覽後置換攻擊（TOCTOU）。

## 6. 偵測、衝突與轉換規則

### 6.1 v0.1 偵測順序

1. **Secret detector**：高優先，涵蓋常見 token prefix、JWT、private key block、credential assignment、帶密碼的 URL／connection string，加上最低熵與上下文條件降低誤判。
2. **直接識別符**：email、電話、台灣身分識別格式（搭配 checksum 時才提高信心）、明確姓名欄位。
3. **機器與網路識別符**：Windows／POSIX 使用者路徑、UNC path、IP、內網 hostname。
4. **專案字典**：由整合端傳入的客戶名、專案代號、私有 domain；字典本身僅存記憶體。
5. **內容敏感標記**：整合端可把程式區塊、合約段落或特定欄位標為 `content_sensitive`。

### 6.2 重疊處理

排序鍵依序為：`block` 優先、範圍較長優先、信心較高優先、detector 註冊順序。被完整包含的較低優先 finding 移入 `suppressedFindings`，只保留統計，不重複轉換。部分交疊且無法確定者一律提升為人工檢視，不自行拼接片段。

### 6.3 政策預設

| 類別 | Balanced（Cloud 預設） | Strict |
|---|---|---|
| Secret | block | block |
| Email／phone／person | replace with typed token | replace with typed token |
| User path | 保留結構，使用者名稱替換為 `<USER_1>` | 整段替換為 `<USER_PATH_1>` |
| IP／hostname | replace | replace |
| Project term | replace with `<PROJECT_1>` | replace |
| Content-sensitive | keep_review，預覽明示 | block，除非整合端先摘要 |

相同值在一次 inspection 內必須得到同一 token，以保留因果關係；使用記憶體字典即可，不將原值或 salt 寫入 envelope。跨 session 不要求 token 穩定，以降低連結風險。

### 6.4 後掃描

轉換後重新執行 Secret detector 與高信心直接識別符 detector。任何殘留 secret、座標越界、非預期空字串或輸出大小異常都回傳 `PRIVACY_POST_SCAN_FAILED`，不得建立 envelope。

## 7. UX 合約

外傳前的預覽面板至少包含：

- Provider、模型、endpoint host 與「資料將離開本機」；
- 原文字數／送出字數、各敏感類別替換數、阻擋原因；
- **預設只顯示已處理後文字**；若要對照原文，使用者需在本機 UI 主動展開，且不得寫入 log；
- `送出去識別化內容` 為主要動作；`取消` 永遠可用；
- `傳送原文` 不出現在 Balanced／Strict。若未來產品確有需求，只能新增獨立 `raw-explicit` 政策，逐 session 同意且仍不得略過 Secret block。

## 8. 錯誤與診斷

| 錯誤碼 | 使用者訊息方向 | 是否可重試 |
|---|---|---|
| `PRIVACY_SECRET_BLOCKED` | 找到疑似金鑰／密碼，請先移除或替換 | 修改內容後可重試 |
| `PRIVACY_AMBIGUOUS_OVERLAP` | 敏感片段互相重疊，需人工確認 | 可 |
| `PRIVACY_DETECTOR_FAILED` | 本機去識別化檢查未完成，資料沒有送出 | 可 |
| `PRIVACY_POST_SCAN_FAILED` | 處理後仍可能含敏感資料，資料沒有送出 | 修改政策／內容後可 |
| `PRIVACY_INSPECTION_EXPIRED` | 預覽已過期，請重新檢查 | 可 |
| `PRIVACY_POLICY_MISMATCH` | 政策已變更，請重新預覽 | 可 |

結構化診斷只能記錄 `errorCode`、detector id/version、finding kind/count、耗時與 request id；不得記錄原文、sanitized text、matched value 或 replacement map。

## 9. 測試與評估門檻

### 9.1 單元與性質測試

- 每個 detector：真陽性、近似但非祕密、Unicode、換行、重疊、超長輸入。
- Transformer：輸出不含被替換原值；相同值同 inspection token 一致；座標從尾端套用不位移。
- Policy：Secret 永遠 block，任何自訂政策不得降級。
- Log capture test：所有錯誤路徑的 log 不含 canary secret／email／path。
- Property test：任意輸入不得使 transformer throw 未包裝例外或產生 `undefined` 文字。

### 9.2 語料評估

建立不含真實個資的合成 corpus，分成 credentials、zh-TW/EN PII、程式碼、檔案路徑、內網位址、專案字典與 hard-negative。v0.1 發佈門檻：

- canary secrets recall = 100%；任何漏接阻擋發佈。
- 高信心 direct identifier recall ≥ 95%，precision ≥ 90%。
- 100% Cloud request 經由 `PrivacyEnvelope`；測試中禁止直接呼叫 Provider transport。
- 10 MB 文字必須回報進度或在整合端先切 chunk；不得造成 UI 無回應。

這些數字是產品驗收門檻，不是對所有自然語言資料的匿名保證。

## 10. 版本、相容與里程碑

### P0 — 純核心 MVP

- contracts、registry、secret/direct/path/network detectors、Balanced/Strict policy、transformer、post-scan。
- 純合成語料測試；無 UI、無 Provider import。

### P1 — DIT adapter

- 將 `Span + AnnotateContext` 組成最小必要文字，呼叫 gateway，再建立 OpenCode request。
- 預覽與逐 session consent；任何取消／失敗都不呼叫 OpenCode。

### P2 — 可抽取套件

- 移除 DIT path alias，加入 package exports、版本化 JSON schema 與獨立 README。
- Presidio local-service adapter 只作 optional detector；核心在服務不存在時仍可運作或明確 fail closed。

相容規則：detector／policy 版本必須進 envelope 與講解快取鍵；只要版本改變，舊 consent 失效，但既有本機講解結果可讀，不可直接拿舊 sanitized payload 重送。

## 11. 已知風險與後續決策點

- 自由文字中的間接識別無法只靠 regex 解決；Strict 模式未來可接本機 NER，但不可把偵測本身外包給 Cloud。
- 原始碼可能同時是學習所需資訊與商業機密；應由整合端標記 `content_sensitive`，而不是由通用核心猜測授權。
- 若未來要求跨 session 可逆對照，將引入 key lifecycle 與安全儲存，屬新的隱私／便利價值分岔，必須另行決策，不得沿用 v0.1 記憶體字典。
