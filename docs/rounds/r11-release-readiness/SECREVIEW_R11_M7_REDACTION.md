# SECREVIEW R11 — M7 高熵遮蔽 (high-entropy redaction) 資安複核

- **日期**：2026-08-15　·　分支：`feat/r11-release-readiness`　·　受審對象：commit `acce089`（R11 卡片 M7）
- **性質**：唯讀防禦性複核 (read-only defensive review)。審查者非作者，不改動程式碼。
- **依據**：PSM_R11 M7 指名此複核為該卡的後續步驟；作者裁決 **D-006**（預設關閉、以揭露而非遮蔽補洞）。
- **落檔說明**：執行複核的 session 沒有寫檔工具，報告內容由調度端 (dispatcher) 原樣落檔，並補上「後續處理」欄。

## 0　結論

| 嚴重度 | 數量 | 狀態 |
|---|---|---|
| **BLOCKER** | 1 | **已修復**（commit `3cbde1f`） |
| SUGGESTION | 3 | 未處理，見各項「後續處理」 |
| NIT | 1 | 不修，理由記於該項 |
| 無發現 | 4 個檢查面向 | — |

## 1　BLOCKER — 高熵揭露計數在「部分重疊」時整筆靜默漏記

- **位置**：`src/core/privacy/redact.ts`，`TextRedactor.redact()` 的 `stillUnredacted` 過濾。
- **問題**：判準寫成 `finding.start < item.end && finding.end > item.start`，也就是**只要有任何重疊就整筆排除**，而不是「整段被涵蓋才排除」。既有測試只驗過**完全重合**的情境。
- **具體失效情境**：文字 `"Token: 0912345678QXZKMBNVCF"`。電話規則命中前 10 碼換成 `<PHONE_1>`；高熵 token 規則命中整段 20 碼（Shannon entropy 約 4.32 bits/char，超過 4.3 門檻）。輸出變成 `"Token: <PHONE_1>QXZKMBNVCF"`——後 10 碼原封不動留在匯出檔裡，但因為「有重疊」，這筆 finding 被整筆排除在 `highEntropyNotRedacted` 之外，摘要那行**不會提到它**。
- **為什麼這是 BLOCKER**：使用者信任摘要「凡是沒遮的都會誠實列出」，於是把匯出檔分享出去。這正是 D-006 設計這個計數要防的事。
- **後續處理（已完成）**：commit `3cbde1f` 改為逐筆扣除「真正改寫過文字的區間」所覆蓋的字元，只要有剩餘字元就計數；順帶正確處理「兩段各遮一半、合起來才蓋滿」的情況，且 `keep_review`（不改寫文字）不再算作覆蓋。新增測試釘住部分重疊，並先斷言重疊確實發生，避免測試無意義地通過。

## 2　SUGGESTION — 主開關關閉時，高熵 checkbox 是靜默的無效開關

- **位置**：`src/components/ExportControls.tsx`（`currentTranscript()` 與新增的 checkbox）。
- **問題**：`currentTranscript()` 只在 `redactSensitive` 為真時才呼叫 `redactTranscript`，而高熵 checkbox 沒有綁定 `disabled`。使用者若只勾「同時遮蔽高熵字串」而不勾主開關「遮蔽敏感資訊」，`redactHighEntropy` 完全被忽略——不但沒遮，連 D-006 要求「不管開不開都要揭露」的那行也不會出現（`transcript.redaction` 整個是 `undefined`）。介面上沒有任何提示。
- **後續處理**：**未處理，等作者裁示方向**。三種修法各自改變互動語意：(a) 主開關關閉時把高熵 checkbox 設為 `disabled`；(b) 勾選高熵時自動連帶勾選主開關；(c) 讓揭露邏輯獨立於主開關。屬 UX 語意變更，不由實作端自行決定。

## 3　SUGGESTION — 單檔 HTML 快照匯出不經過遮蔽管線，也沒有揭露句

- **位置**：`src/components/ExportControls.tsx` 的 `exportHtml()` → `src/core/export/snapshotTemplate.ts`。
- **問題**：快照匯出全程沒有引用 `TextRedactor` / `redactTranscript` / `highEntropyDetector`，只有固定文案的隱私提醒，沒有任何計數式揭露。這與逐字稿匯出是兩條不同的程式碼路徑。
- **判定**：**pre-existing**，不是 M7 造成的回歸；但正是「兩條 render 路徑會靜默分岔」這個本專案已知風險的實例。
- **後續處理**：未處理。兩條路可選：把計數式揭露延伸到快照匯出，或在 D-006／PSM 明文寫下「Session 存檔匯出不在遮蔽與揭露範圍內」，讓缺口成為**被記錄的設計決定**而不是靠複核才發現的隱性落差。建議後者至少要做。

## 4　SUGGESTION — 同一原值可能對到兩個不同佔位符

- **位置**：`src/core/privacy/apply.ts` 的 `mappingKey`（鍵為 `kind + 原文`）× M7 的高熵規則。
- **問題**：既有密鑰規則是**上下文相關**的（要有 `password:` 這類標籤才命中），高熵規則則是**上下文無關**的。同一個值一次帶標籤被判 `secret`、一次裸露被判 `high_entropy`，兩者鍵不同、各自編號，讀者看不出 `<SECRET_1>` 與 `<HIGH_ENTROPY_1>` 其實是同一個值。兩者都有被遮，**不構成洩漏**，但違反 `apply.ts` 檔頭自述的「同一個值永遠對到同一個編號」。
- **判定**：**amplified**——kind-scoped 的鍵是既有設計，M7 是第一個上下文無關的規則，才讓這個結構性限制變得可以踩到。
- **後續處理**：未處理，建議 R12。修法方向是把快取鍵改成只用原文值。

## 5　NIT — 高熵候選沒有長度上限（防禦性建議，非確認漏洞）

三個新正則（`UUID_PATTERN`、`HEX_RUN_PATTERN`、`TOKEN_RUN_PATTERN`）都是單一、無巢狀、無歧義的字元類別配 `{n,}` 量詞，**沒有 catastrophic backtracking 構造**。132 KB 單行的極端輸入下，最壞情況是整行成為一筆 match 再做一次線性熵計算，成本 O(n)，不構成阻斷式風險。不修。

## 6　無發現的檢查面向

- **預設是否全鏈關閉**：`DEFAULT_PRIVACY_DETECTORS` 不含高熵偵測器（且有測試斷言）、`TextRedactor` 建構子預設 false、`ExportControls` state 預設 false、外傳用的 `gateway.ts` 完全沒引用它。四處一致，沒有「型別上關閉、某條路徑上打開」的情形。
- **偵測值本身是否外洩**：`PrivacyFinding.id` 只含 `detectorId:kind:start:end`，不含原文；`console.error` 只傳 error 物件與固定字串；locale 的揭露句只吃數字。沒有把偵測到的值寫進診斷、console 或摘要的路徑。
- **是否新增網路呼叫**：`src/core/privacy/*` 與 `transcriptRedact.ts` 全文無 `fetch`／`XMLHttpRequest`。`ExportControls` 唯一的 `fetch` 抓的是同源打包的本機模板，與 M7 無關。
- **是否有硬編碼 UI 文案**：新增字串全部經 `src/i18n/locales.ts`，沒有繞過 i18n。

## 7　可反駁性 (refutability)

- BLOCKER 與 §4 屬 **Hypothesis 等級**：由完整閱讀程式碼與手算熵值構造出具體輸入，複核當下未執行測試（該 session 無 Bash 工具）。BLOCKER 已由調度端以新增測試實證並修復；§4 尚未實證。
- §2、§3、§6 屬 **Confirmed 等級**：純靜態控制流追蹤，無執行歧義。
- 本複核**無法逐行比對 diff**（無 git 工具），attribution（introduced／pre-existing／amplified）部分依賴檔案註解與 PSM 卡片交叉推論。若某項 attribution 有疑義，以 `git show acce089` 為準。
