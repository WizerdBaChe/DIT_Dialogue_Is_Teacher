# DIT 分析執行層設計 PSM v0.1

> 狀態：設計基線（2026-07-18）
> 範圍：Ollama／OpenCode 同級分析 Provider、全域批次講解、講解快取、本機 runtime 控制
> 隱私邊界：引用 [PSM_PRIVACY_GATEWAY_v0.1.md](PSM_PRIVACY_GATEWAY_v0.1.md)，本文件不重複實作去識別化規則。

## 1. 已確認現況

| 項目 | 本次證據 | 結論 |
|---|---|---|
| Ollama 連線 | DIT 只以 HTTP 探測 `127.0.0.1:11434`；本機檢查時 `ollama.exe` 正在監聽 11434 | DIT 目前**沒有**在背景啟動 Ollama |
| 關閉工作列 UI 後仍連線 | Ollama Windows 官方行為是安裝後在背景執行並提供 localhost API | 關閉視窗／部分 tray UI 不等於停止 server；工作管理員終止 `ollama.exe` 才使探測失敗符合預期 |
| 斷線／恢復 | 使用者已實機確認：終止 `ollama.exe` 有正常錯誤，重啟後重新檢查恢復 | R2 錯誤 UX 驗收完成 |
| OpenCode 面板 | 使用者實機確認正常；server 從專案根目錄且不帶 `--pure` 時可載入 `opencode.json` 的 `dit-annotator` | OpenCode 是與 Ollama 同級的分析 Provider，不是開發 worker |
| 全域講解 | `Header.tsx` 仍有「講解全部」，`sessionStore.annotateAll()` 仍循序處理所有 view item；實機選 Ollama 後按鈕可見 | 功能未消失；`providerId === "none"` 時整顆隱藏是可發現性缺陷 |
| 講解保存 | store 載入新檔時把 `annotations` 清空；專案沒有 localStorage／IndexedDB persistence | 重開相同對話必須重跑，確有重複時間與模型成本 |

官方依據：

- [Ollama for Windows](https://docs.ollama.com/windows)
- [Tauri Shell plugin](https://tauri.app/plugin/shell/)
- [MDN IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [MDN Storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [`idb` repository](https://github.com/jakearchibald/idb)

## 2. 決策摘要

1. 「講解全部」永遠顯示；未選 Provider 時 disabled 並直接說明原因，不再隱藏。
2. 主要批次動作改為「講解未處理（N）」；同一選單另有「重試失敗」與需確認的「全部重新講解」。
3. 每個節點完成後立即寫入 IndexedDB；重開同一 session 自動還原，內容／模型／prompt／隱私政策任一改變時只失效受影響項目。
4. OpenCode 與 Ollama 共用 `AnalysisProvider`／批次工作／快取；只有外傳 Provider 必須先通過 Privacy Gateway 和預覽同意。
5. 一鍵啟動 Ollama 值得提供，但純瀏覽器不能安全地直接執行本機 CLI。先定義 `RuntimeController`；Web adapter 僅探測與複製命令，選配 Tauri desktop adapter 才顯示「啟動 Ollama」。
6. DIT 只停止自己啟動的 child process，不得停止使用者或其他應用程式啟動的 Ollama。

## 3. 使用者流程

### 3.1 載入與還原

1. 解析 session、建立 view items。
2. 產生 session 與 item fingerprints。
3. 從 Annotation Repository 查詢可用結果。
4. 立即顯示「已還原 X／Y；待講解 N；過期 M」。
5. 使用者可直接閱讀已還原講解，或選 Provider 補齊缺少項目。

原始 `.jsonl` 永遠唯讀；講解存入瀏覽器資料庫，未來 R6 可另匯出 sidecar `*.dit-annotations.json`，不修改來源檔。

### 3.2 批次講解

Header 固定呈現：

```text
[顯示教學講解] [講解未處理 (17) ▾]
                   ├─ 講解未處理 (17)   default
                   ├─ 重試失敗 (2)
                   └─ 全部重新講解 (41) confirmation required
```

- Provider 未選：按鈕保留但 disabled，title／旁文為「請先選擇本機 Ollama 或 OpenCode」。
- Provider 離線：按下後聚焦對應面板，不建立 job。
- 已有快取：預設略過，不重新收費／耗時。
- 每完成一項即持久化；停止、重新整理、關閉頁面後可續跑。
- 進度顯示 `完成 / 快取命中 / 失敗 / 待處理 / 當前節點`，而非只有 done/total。
- 初版 Ollama 與 OpenCode 都維持 concurrency=1，先確保限流、順序與取消一致；未來 Cloud 並發是獨立調校，不改 UX。

### 3.3 OpenCode 外傳

首次 Cloud job：

```text
select provider/model
  -> build minimal per-item analysis input
  -> PrivacyGateway.inspect
  -> preview sanitized payload + findings summary
  -> user consents for this session/policy/provider
  -> enqueue job
```

同一 job 的後續節點可沿用 consent，但每一項仍需實際通過 gateway。Secret finding 會停止該項並標記 blocked，不會因已有 consent 而送出。不得提供全域永久「永遠傳原文」。

## 4. 分層與介面

```text
React UI
  -> Session Store (presentation state only)
     -> AnnotationJobController
        -> AnnotationRepository (IndexedDB)
        -> AnalysisProvider
           -> Ollama transport
           -> PrivacyGateway -> OpenCode transport
     -> RuntimeController
        -> WebRuntimeController
        -> TauriRuntimeController (optional desktop build)
```

Store 不再自行編排 network loop；既有 `annotateItem`／`annotateAll` 逐步下移到 controller，使批次、恢復與快取可在無 React 的測試中驗證。

```ts
export type AnalysisProviderId = "ollama" | "opencode";
export type AnnotationRunMode = "missing" | "failed" | "all";

export interface AnalysisRequest {
  itemId: string;
  span: Span;
  context: AnnotateContext;
  locale: "zh-TW" | "en";
}

export interface AnalysisProvider {
  readonly id: AnalysisProviderId;
  readonly sendsDataOut: boolean;
  check(): Promise<ProviderStatus>;
  annotate(request: AnalysisRequest): Promise<Annotation>;
}

export interface AnnotationJobController {
  start(spec: AnnotationJobSpec): Promise<string>;
  cancel(jobId: string): Promise<void>;
  resume(jobId: string): Promise<void>;
  subscribe(jobId: string, listener: JobListener): () => void;
}
```

`ProviderId` 對使用者顯示應從 `cloud` 改成 `opencode`；若為維持舊 Annotation 相容性，可在 persistence adapter 將舊值 `cloud` 映射到 `opencode`，而不是讓 UI 繼續使用模糊名稱。

## 5. 講解儲存契約

### 5.1 技術選型

採 IndexedDB：它是非同步、具 transaction、可存結構化物件且適合比 Web Storage 更大量的資料。建議採用小型 ISC 授權的 `idb` wrapper，主要理由是 typed schema、upgrade／blocked／terminated callback 與 transaction completion 比直接手寫 IndexedDB 更容易正確測試；這是一項新增 dependency，實作 PR 必須附 bundle 差異與 license 紀錄。

瀏覽器儲存仍可能因使用者清除資料、私密模式或 quota／eviction 消失，因此它是可恢復快取，不是唯一備份。成功載入後可呼叫 `navigator.storage.persist()` 請求持久儲存；若未獲准，UI 只顯示非阻斷提示。

### 5.2 Database schema

```ts
interface AnnotationRecord {
  cacheKey: string;
  sessionFingerprint: string;
  itemFingerprint: string;
  itemId: string;
  annotation: Annotation;
  provenance: {
    providerId: "ollama" | "opencode";
    modelId: string;
    promptVersion: string;
    locale: "zh-TW" | "en";
    privacyPolicyId: string | null;
    privacyPolicyVersion: string | null;
    createdAt: string;
  };
}

interface AnnotationJobRecord {
  jobId: string;
  sessionFingerprint: string;
  mode: "missing" | "failed" | "all";
  providerId: "ollama" | "opencode";
  status: "queued" | "running" | "cancelling" | "stopped" | "completed" | "failed";
  pendingItemIds: string[];
  completedItemIds: string[];
  failedItems: Record<string, string>;
  updatedAt: string;
}
```

Object stores：

- `annotations`，keyPath=`cacheKey`，indexes=`sessionFingerprint`、`itemId`、`createdAt`；
- `jobs`，keyPath=`jobId`，indexes=`sessionFingerprint`、`status`；
- `meta`，保存 db schema／migration 狀態，不放原始 session。

### 5.3 Fingerprint 與失效

使用 Web Crypto `SHA-256` 對 canonical UTF-8 JSON 做內容識別；fingerprint 用於快取一致性，不當成密碼雜湊或匿名化手段。

```text
sessionFingerprint = sha256(sourceId + canonicalSessionIdentity + orderedItemFingerprints)
itemFingerprint    = sha256(primarySpanLearningInput + previousSummary)
cacheKey           = sha256(
  itemFingerprint + providerId + modelId + promptVersion + locale +
  privacyPolicyId + privacyPolicyVersion + annotationSchemaVersion
)
```

- canonicalization 必須排序 object keys、保留 array order、把 `undefined` 正規化為缺欄，不納入 `raw` 的無關噪音。
- Prompt 文案任何語意改動必須提升 `PROMPT_VERSION`。
- OpenCode 的 agent prompt／版本也要進 `promptVersion`，否則 `opencode.json` 改動後可能錯用舊結果。
- 同 session 只改一個節點時，只讓該節點與依賴其 `previousSummary` 的下一節點失效。
- UI 語言切換不刪除另一語言結果；兩份 cache 可並存。

### 5.4 清除語意

- `從畫面隱藏講解`：只改 UI，不刪 cache。
- `清除本次顯示`：卸載 store 中結果，不刪 cache；下次載入仍可還原。
- `刪除此對話的已存講解`：明確確認後刪該 sessionFingerprint 的 records。
- `清除所有本機講解資料`：設定頁的獨立危險動作，顯示筆數與預估容量。

這能避免既有「清除講解」到底是隱藏、重設或永久刪除的語意混淆。

## 6. Job state machine

```text
idle -> preparing -> awaiting_privacy_consent -> queued -> running
                                  |                         |
                                  v                         v
                              cancelled             cancelling
                                                          |
                                    completed <- running <-+-> stopped
                                                  |
                                                  v
                                                failed
```

- Ollama job 不經 `awaiting_privacy_consent`。
- cancel 是協作式取消：不破壞已完成寫入；在途 request 完成或 timeout 後進 stopped。
- 頁面重載時，`running` 一律復原為 `stopped`，避免假裝背景仍在執行；使用者可按續跑。
- 單項錯誤預設記錄後繼續下一項；Provider 整體 offline／unauthorized／privacy detector failure 則中止 job，避免 41 次相同錯誤。

## 7. Ollama runtime 控制

### 7.1 為何目前關掉 UI 還能連

Ollama Windows 安裝版會在背景執行並於 `localhost:11434` 提供 API。DIT 的 `checkOllama()` 只判斷 API 是否可達，不能也不應把「視窗是否開著」當成 server 狀態。因此使用者看到的行為正常，且終止 `ollama.exe` 後 DIT 顯示 offline 證明探測路徑正確。

### 7.2 Capability contract

```ts
export interface RuntimeController {
  capabilities(): RuntimeCapabilities;
  status(service: "ollama" | "opencode"): Promise<RuntimeStatus>;
  start(service: "ollama" | "opencode"): Promise<RuntimeStartResult>;
  stopOwned(service: "ollama" | "opencode"): Promise<void>;
}
```

`WebRuntimeController.start()` 回傳 `RUNTIME_START_UNSUPPORTED`，UI 顯示可複製的 `ollama serve`；不可用 custom URL scheme、下載腳本或瀏覽器擴充繞過權限。

`TauriRuntimeController` 才能使用 allowlisted shell command。Tauri Shell 的危險 command 預設封鎖，因此 capability 只允許固定 executable 與固定參數，不給前端任意 command／args：

```json
{
  "identifier": "shell:allow-spawn",
  "allow": [
    { "name": "ollama-serve", "cmd": "ollama", "args": ["serve"] }
  ]
}
```

實作規則：

1. start 前先探測；ready 則回傳 `already-running`。
2. spawn 後輪詢 11434，最多 15 秒；成功才顯示 ready。
3. 記錄 child handle 於 desktop process memory；只讓 `stopOwned()` 終止這個 handle。
4. DIT 關閉時預設提示「Ollama 由 DIT 啟動，是否一併停止？」；這是桌面版實作前仍需使用者拍板的 UX 語意。
5. 不自動啟動、不建立開機服務、不修改系統環境變數。

### 7.3 分階段交付

- Web 版立即改善：離線面板提供「重新檢查」與「複製 `ollama serve`」，並明示 DIT 沒有啟動它。
- Desktop spike：在獨立 branch 包一層 Tauri，僅驗證 allowlisted `ollama serve`、status、owned stop；不與批次／隱私改動混在同一 PR。
- spike 經 Windows 實機驗收後，才決定是否把 Desktop 版納入正式發佈；現有 Web 版保持可用。

## 8. 實作切片與檔案責任

### A — 批次可發現性與工作控制

- `src/components/Header.tsx`：按鈕永遠可見、模式選單與計數。
- `src/core/annotation/jobController.ts`：從 store 抽出 loop／cancel／resume。
- `src/store/sessionStore.ts`：只持 UI snapshot 與 dispatch actions。
- `src/i18n/locales.ts`：新增 disabled reason、cache/job 狀態字串。

驗收：未選 Provider 仍看得到按鈕；選 Provider 後一鍵補齊所有 missing；停止後 reload 可續跑。

### B — Annotation Repository

- `src/core/annotation/contracts.ts`
- `src/core/annotation/fingerprint.ts`
- `src/core/annotation/indexedDbRepository.ts`
- `src/core/annotation/memoryRepository.ts`（IndexedDB 不可用時降級）
- 導入 `idb` 前鎖定版本、記錄 ISC license 與 bundle 增量。

驗收：同檔重開零 model request 還原結果；改一節點只失效相依項；quota／blocked／migration failure 有可讀提示且可降級 memory。

### C — Privacy Gateway + OpenCode

- 先完成獨立 [PSM_PRIVACY_GATEWAY_v0.1.md](PSM_PRIVACY_GATEWAY_v0.1.md) P0。
- `src/adapters/dit/privacyAdapter.ts` 組最小必要內容。
- `src/core/llm/cloud.ts` transport 只接受 `PrivacyEnvelope`，禁止 raw `Span` overload。
- `src/components/CloudPanel.tsx` 加 policy、preview、consent 與 blocked 狀態。

驗收：測試可證明所有 OpenCode request 都經 gateway；secret canary 不會出現在 request mock 或 logs；使用者取消時 request count=0。

### D — RuntimeController

- `src/core/runtime/contracts.ts`
- `src/core/runtime/webRuntimeController.ts`
- 可選 `src-tauri/` desktop shell，獨立 spike。

驗收：Web 不嘗試執行 CLI；Desktop offline 時可一鍵啟動並在 15 秒內轉 ready；只能停止 DIT-owned process。

## 9. 測試矩陣

| 層 | 必測案例 |
|---|---|
| Unit | canonical hash、cache key 版本失效、job mode 篩選、cancel、provider-level fatal classification |
| Repository | schema create/upgrade、transaction commit、blocked/terminated、quota failure、session delete |
| Provider contract | Ollama 不經 privacy；OpenCode 無 envelope 無法編譯／呼叫；timeout/unauthorized/offline 可讀 |
| Privacy | 依獨立 PSM corpus、secret fail-closed、preview TOCTOU、log capture |
| Integration | 載入→restore→missing batch→逐項 write→reload→resume；兩種 locale／兩種 Provider cache 不互蓋 |
| UAT | Header 可發現性、全域講解、重開零重跑、清除語意、Ollama desktop start（若採 desktop） |

## 10. 里程碑排序與通過條件

1. **R2 關閉**：錯誤 UX 已由使用者確認，文件改為完成。
2. **R3a — Privacy Gateway P0 + OpenCode opt-in**：先阻斷資料外傳風險，再做真實 Cloud UAT。
3. **R3b — Batch controller + Repository**：讓 Ollama／OpenCode 共用一鍵補齊、快取與續跑。
4. **R3c — RuntimeController web adapter**：釐清狀態與複製命令；Tauri 另開 spike，不阻擋 R4。
5. **R4**：依既有 PSM 進入 subagent 跨檔串接與局部分支圖。

R3a／R3b 完成且實機驗收後，核心需求已滿足；若使用者不要求桌面安裝包，建議停止在 Web adapter，不為單一按鈕擴張整個發佈面。

## 11. 仍需拍板的單一產品分岔

是否正式發佈 Tauri 桌面版屬於安裝體積、維護面與便利性的價值分岔。施工可先完成 `RuntimeController` 邊界與 Web fallback；**建立 desktop wrapper 前再請使用者決定**。除此之外，批次可發現性、missing-first、逐項持久化、去識別化預覽與 Secret fail-closed 已由本輪方向確定，可直接進入實作。

## 12. 需求追溯與語意缺口

### 12.1 使用者需求追溯

| 使用者需求 | 規格落點 | 可驗收結果 |
|---|---|---|
| OpenCode 不是 worker，而是與 Ollama 同級分析 | §2、§4、§8 C | Provider contract 與 UI 以 `ollama/opencode` 呈現 |
| 去識別化可供其他專案引用 | 獨立 Privacy Gateway PSM | 純核心零 DIT import；DIT 只在 adapter 整合 |
| 不必開 terminal 就能啟動 Ollama | §7 | Web 有誠實 fallback；Desktop capability 可一鍵 start |
| 一次處理全部教學講解 | §3.2、§6、§8 A | Header 永遠可見，missing/retry/all 三模式 |
| 重開相同對話不用重跑 | §3.1、§5、§8 B | IndexedDB 自動還原，cache hit 不呼叫模型 |
| 進入後續任務 | §10 | R3a → R3b → R3c → R4 有明確 gate |

### 12.2 Current-to-target gap register

| 接縫 | Current | Target | 關閉證據 |
|---|---|---|---|
| Provider identity | 型別與 UI 仍以 `cloud` 表示 OpenCode | 使用者面向與 persistence 使用 `opencode`；讀取舊 `cloud` 記錄時 migration | 型別測試＋舊 record fixture |
| Cloud transport | 可由 `Span` 直接組 request | transport 只接受 `PrivacyEnvelope` | compile-time contract test＋request mock |
| Batch ownership | Zustand action 直接跑循序 loop | 無 React 的 JobController | controller unit/integration tests |
| Batch discovery | Provider=`none` 時按鈕整顆隱藏 | 永遠可見、disabled reason | UI UAT |
| Persistence | `loadFromText` 清空全部 annotations | Repository restore＋逐項 write | reload E2E |
| Cache validity | 無 prompt／model／policy 版本 | 完整 cache key | invalidation matrix |
| Runtime start | 只能人工開 Ollama | capability-gated Web/Desktop adapters | Web negative test＋Desktop UAT |
| Storage failure | 無 repository，無失敗面 | quota／blocked／migration 可見並降級 memory | fault-injection tests |

本次 fresh-pass 檢查未發現 Privacy PSM 與 DIT PSM 的責任重疊：前者只產生 envelope，後者只負責何時呼叫、如何排程與保存 Annotation。唯一尚未決定的產品分岔是正式 Desktop 發佈；已隔離在 `RuntimeController` 後，不阻擋其餘施工。
