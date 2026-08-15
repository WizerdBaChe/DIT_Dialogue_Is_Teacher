# REVIEW R11 — 2026-08-03 兩份深層審查的盲區複核（M9）

- **日期**：2026-08-15（feat/r11-release-readiness）
- **範圍**：PSM_R11 §3 M9——兩份 2026-08-03 review（`REVIEW_2026-08-03_DEEP_PROJECT_HEALTH.md` 的 F/B/WC 系列與 `REVIEW_2026-08-03_DEEP_PROJECT_HEALTH_MAIN.md` 的 S/C 系列）中，封版時**只複核過 3 個 blocker**、其餘未逐項重驗的 should-fix。本檔對每個 should-fix 給出：**仍存在**（附現行 file:line）／**已修復**（註明由哪一輪）／**不再適用**（理由）。
- **方法**：唯讀複核現行工作樹程式碼＋對應單元測試；不改動任何檔案、不 commit。F 系列與 S 系列多為同一問題的兩次編號，下表以 S-# 為主軸、括號標示對應的 F-# 與 WC-#。
- **判定等級**：`STILL PRESENT`（現行程式碼仍符合原 finding 描述，附全新 file:line）／`FIXED`（由某 round 修掉，附修復處）／`PARTIAL / RESOLVED`（主問題已收斂、殘留 cosmetic）。

## 1　結論先行

| 判定 | 項目 |
|---|---|
| **STILL PRESENT（10 項應該修）** | S-01/F-12、S-02、S-03、S-04/F-05、S-05/F-06、S-06/F-07、S-08/F-04、S-09/F-11、S-10、S-11、S-12/F-08 |
| **FIXED by R10.1／R11（4 項）** | 3 個 blocker（B-01/B-02/B-03 = F-01/F-02/F-03 → R11 **M1/M2/M3**）、F-14/C-02（→ M1）、F-10/WC-09（→ R10.1 categoryDefinitions） |
| **RESOLVED（1 項，殘留為文字級）** | S-07/F-09（contract 已單一化，D-003 移除 milestone；殘留死 CSS＋文件標籤） |
| **PARTIAL（1 項）** | S-13（整合帳本已成立，但 DEV_README／PROGRESS／ACCEPTANCE 仍是舊真相） |

> 3 個 2026-08-14 blocker 在封版後已由 R11 的 M1/M2/M3 關閉（commit `d5ef020`、`397d2ac`）；本複核即時確認其已入樹（見 §3.1）。因此 R11 合併閘門所依賴的三個物件都已落在 branch 上。

## 2　STILL PRESENT——應該修、現行程式碼仍符合 finding

### S-01 / F-12 — streaming source detection 一次失敗就丟棄後續可辨識行　[Should-fix]
- **證據**：`src/core/ingest/jsonlStream.ts:52` 設 `detectionFailed = true`；`:55` 之後所有行直接 `return`；`:66-68` 第一個非空行 `detectAdapter` 失敗即永久停止，不再重試。
- **現況**：行為與 2026-08-03 完全一致。review 要求的「二選一」決定（寫成明確 input contract，或有限窗口重試＋前導壞行進 diagnostics）**兩者皆未做**；PSM／測試／UX 均未記載「只認第一筆 signature」的限制。`jsonlStream.test.ts` 只釘住「首次偵測失敗 → unrecognized」，沒有「前導壞行＋後續 valid signature」的相容性測試（與審查 table `OUTSTANDING` 相符）。
- **影響**：一行前導雜訊會讓整份合法檔案變成 unrecognized，資料流上等同丟整檔。

### S-02 — 同步多檔 pipeline 沒有檔案級 parse isolation　[Should-fix]
- **證據**：`src/core/pipeline.ts:110` `adapter.parse(file.content)` 直接呼叫、無 try/catch；`buildSessionDocumentFromFiles`（:104-114）的 per-file map 任一個 parse throw 就讓整批 throw。worker 路徑有隔離（`src/core/ingest/session.worker.ts:53-69`）。
- **現況**：**程式上仍存在**，但**runtime 暴露度已下降**——UI 的多檔載入目前都走 worker：`SessionLoadActions.tsx:24` → `loadFromBlobs`、`SessionBrowserDialog.tsx:140` → `loadIndexEntry` → `loadFromBlobs`（`sessionStore.ts:855`）。`loadFromFiles`（`sessionStore.ts:697`）未接到任何 component，只有測試使用。測試也只養 DSM-1 batch machine 的 `parse_failed` outcome（`pipeline.test.ts:112-119`），沒有「sync 路徑 parse 拋 throw、其餘檔案仍完成」的測試。
- **結論**：仍是一份「worker 與 sync 呼叫端容錯語意不同」的契約缺口，現行 UI 未踩到；R12 至少補測試。

### S-03 — privacy consent scope 寫入格式和 reviewer scope 不相容　[Should-fix，高影響]
- **證據**：
  - 寫入端 `approvePrivacyReview` — `sessionStore.ts:1044`：`scope = session.id \0 cloudConfig.baseUrl \0 cloudConfig.providerID \0 cloudConfig.modelID \0 policyId`（**無 provider 前綴**；且對 anthropic／generic 也固定讀 `cloudConfig`）。
  - 比對端 — 三個 reviewer scope 全帶 provider 前綴：cloud `cloud\0…`（:1254）、anthropic `anthropic-byok\0…`（:1264）、generic `providerId\0…`（:1276）。
  - 重用檢查 `sessionStore.ts:1242`：`dataOutConsent?.scope === scope`。
- **現況**：兩種格式**永遠不相等**（首段 `cloud`/`anthropic-byok`/`<id>` vs session id），因此 `approve once per scope` **從未生效**——每一則 annotation 都會重新觸發 privacy review（過度打擾，但無資料外洩方向）。此外非 cloud provider 通過後，紀錄的 consent 持有的是 cloudConfig 的 endpoint/model（錯誤的 scope 內容）。
- **影響**：可觀察、每次 annotation 都發生；比運作正常更差的是「同意紀錄記錯 endpoint/model」屬於資料正確性問題。

### S-04 / F-05 — raw exception、檔案路徑與 provider response body 直接進入使用者畫面　[Should-fix]
- **證據**：
  - `sessionStore.ts:397-420` `toFatalDiagnostic`／`toIndexDiagnostic` 以 `error.message`／`String(error)` 填 `detail`。
  - `src/core/diagnostics/diagnosticCopy.ts`：`LOAD_FAILED`（:76/:147）、`INDEX_FILE_UNREADABLE`（:82/:153）、`INDEX_DIRECTORY_UNREADABLE`（:90/:161）、`INDEX_HANDLE_NOT_PERSISTED`（:95/:166）把 `d.detail` 原樣插進使用者可見文字。
  - worker 把非 PipelineFatalError 一律映射成 `LOAD_FAILED`＋原始 message（`session.worker.ts:83-86`）。
- **現況**：未改。路徑含 DOMException 描述語（「A requested file or directory could not be found at the time an operation was requested」）或系統路徑時，該段原文直接上畫面。
- **附帶**：`AnnotationBlock` 錯誤列也直接秀 `annotationErrors[id]` 的原始 message（`parts.tsx:165`，store 於 `sessionStore.ts:1328` 存 `error.message`）——同族成員。

### S-05 / F-06 — showModal catch 對真實瀏覽器錯誤也會靜默降級成非模態 dialog　[Should-fix]
- **證據**：`src/components/useBlockingSurface.ts:44-53` 的 catch 沒有環境／能力判定（不檢查 `"showModal" in HTMLDialogElement.prototype`、不看 error 型別）：任何真實錯誤（如重複呼叫的 `InvalidStateError`）都被當成「jsdom 缺 showModal」，靜默以 `open` 屬性降級，**無 Diagnostic**。
- **測試缺口**：`blockingSurfaces.test.tsx:26-29` 在 prototype 上 stub 出「會成功」的 showModal，catch 分支沒有測試。

### S-06 / F-07 — Settings focus restore 會在其他 blocking surface 活躍時搶走 focus　[Should-fix]
- **證據**：`src/components/SettingsDialog.tsx:58-61` 只有 `if (surface.isActive) return;`，其餘一律在下一 frame return focus 到 `settings-toggle-btn`，**不檢查目前 active surface**。
- **觸發路徑存在**：privacy review 開啟時會關閉 settings（`sessionStore.ts:1248` `settingsOpen: false`）→ Settings 的 `isActive` 變 false → effect 把 focus 拉回背景按鈕。對照組 `StructureDrawer.tsx:35`、`SessionMapDialog.tsx:165` 至少檢查 `privacyReview` 才 restore；Settings 連這層都沒有。

### S-08 / F-04 — adapter 收到的 pr-link 在 normalize 階段遺失　[Should-fix]
- **證據**：解析在 `claudeCodeJsonl.ts:171-174`（存進 `meta.prLinks`）；型別已宣告 `spanTree.ts:139-140`（「R9 起收集，尚無消費端」）；但 `normalizer.ts:86-94` 的 `finalizeMeta` 以顯式物件重建 `SessionMeta`，**只帶 id/source/tool/title/projectPath/startedAt/model，完全不複製 `meta.prLinks`**。
- **現況**：仍存在；因目前無消費端，屬資料保全性（preservation）欠債，不是可見 bug。建議 R12 補 `prLinks` 進 `finalizeMeta`（一行）並加測試，或正式宣告「normalize 階段丟棄」並記錄決定。

### S-09 / F-11 — fishbone／map／distiller 仍有未回報的 silent first-target fallback　[Should-fix]
- **證據**（無回報、且回傳值可觀察）：
  - `src/core/view/fishbone.ts:71`：`?? stations[0]` —— rib 早於首站或掛載節點被丟棄時，靜默掛首站；與檔頭 :49「絕不可退回 viewItems[0]」的自述原則同族。
  - `src/core/distill/distiller.ts:72-73`：`?? nodes[0]?.spanId ?? ""` —— empty-skeleton 時 `attachTo = ""`。
  - `src/core/view/sessionMap.ts:453`：`?? stations[focusStationIndex]?.landmark ?? null` 站本位替代。
  - `src/core/view/sessionMap.ts:214`：`let parentStationIndex = 0` 子代理靜默預設掛第一站。
- **已可辨識的部分**：`fishbone.ts:63/75`（對不到 → 丟棄，有回報）、`sessionMap.ts:211/219/264`（有回報、`focusResolved` 在回傳型別可辨識）——這些審查後已加 `reportFallback`。**缺口是上述 4 個站**。
- **測試**：審查要求的 `rib-before-first-station`／`missing-cluster`／`empty-skeleton` fixtures 仍不存在；現有 `sessionMap.test.ts:357` 是正向測試（斷言 focus 降級「有」進 fallback report），未覆蓋 fishbone:71／distiller:73。

### S-10 — validator 只做基本 span/group 檢查，攔不住 malformed skeleton 與 parent cycle　[Should-fix]
- **證據**：`src/core/validate/spanTreeSchema.ts`（全 42 行）只做：schemaVersion 比對（:16-18）、重複 span id＋order（:20-25）、parentId 存在（:28-32）、group.spanIds 存在（:35-39）。**無 cycle 檢查、完全不檢查 `doc.skeleton`（nodes/ribs/`attachTo`）、不查 group id 重複**。唯一呼叫點 `pipeline.ts:58`。

### S-11 — FSA walk 先完整遞迴與 materialize 所有檔案，之後才套 500 檔上限　[Should-fix]
- **證據**：上限於 `src/core/index/sessionIndexer.ts:276/:280` `mains.slice(0, maxFiles)`（`INDEX_MAX_FILES = 500`，:34）在 `source.list()` **全量結果之後**才套用；`src/core/index/directorySource.ts:64-74` 的 `walk` 無同步上限、逐檔 `await getFile()` 物化 Blob；`webkitdirectory` 後端（:115-127）一次交出整份 FileList。**遍歷階段無 early-stop**。

### S-12 / F-08 — collapse controls 是 clickable div，沒有 keyboard／ARIA semantics　[Should-fix]
- **證據**：`.group-head`（`src/components/GroupCard.tsx:53`）、`.thinking-head`（`src/components/parts.tsx:27`）、`.io-head`（`src/components/parts.tsx:137`）全是 `<div onClick>`，無 `role`／`tabIndex`／keyboard handler。
- **現況**：R11 M6（`0941ee3`）只把 StructureLegend 的 `<details>` 表單化縮排改成 focus/disabled 可交談；**GroupCard／ThinkingBlock／IOBlock 三處未動**。

## 3　FIXED／RESOLVED

### 3.1　三個 blocker（B-01/B-02/B-03 = F-01/F-02/F-03）→ 已由 R11 M1/M2/M3 關閉
- **P2-1 / B-02 / F-02**（檔頭放大後未重判 adapter）：`sessionIndexer.ts:204-211` 放大視窗後 `source = detectAdapter(headText)?.id;` 重判；迴歸測試 `sessionIndexer.test.ts:268`。
- **P2-2 / B-03 / F-03**（snapshot 仍 fetch `dit.config.json`）：`sessionStore.ts:1004` `if (get().snapshotMode) return;` snapshot guard；測試 `sessionStore.test.ts:333-351`。
- **P2-3 / B-01 / F-01**（WebKit 後備無入口／無失敗出口）：`sessionStore.ts:784-788` `try { await runIndex(...) } catch { set({ browseState: "index_failed", … }) }`；Kiosk fallback 入口存在；測試 `browseFailure.test.ts:116`。

### 3.2　F-14 / C-02 — unknown／insufficient-signal entry 硬填 source=claude-code　→ FIXED（M1）
- `sessionIndexer.ts:345` `source: source ?? null`；`classifySession.ts:84` 讀不出來回 `kind:"unknown", reason:"insufficient-signal"`；`core/index/contracts.ts:52-57` 註解釘住「honestly unresolved, not claude-code」；`profiles.ts:101-102` 未知來源回 PASTE。
- 註：`normalizer.ts:88` 仍 `source: meta.source ?? "claude-code"`，那是 SessionDocument meta 通道、非 index entry，不屬本 finding（但與 S-08 同屬「normalize 階段丟 metadata」的家族問題）。

### 3.3　F-10 / WC-09 — Session Map 顯示分類名卻未 consume 分類定義 source　→ FIXED（R10.1）
- `src/core/view/categoryDefinitions.ts` 提供單一 Category 定義結構，i18n `categoryDefinition` 提供各語言文字；完整性契約測試 `categoryDefinitions.test.ts:25`（「no orphans, no gaps」跨語言逐一核對）。

### 3.4　S-07 / F-09 — schema version／marker／milestone 三份契約矛盾　→ RESOLVED（殘留文字級）
- 版本：定義鏈已收斂——`POEM` 授權 `src/types/spanTree.ts` 現行內容為權威（`docs/PSM_DIT_v1.0.md:38`、`:49` 演進規則），`spanTree.ts:77/:106` 註明 `SCHEMA_VERSION` 不動。**殘留**：文件標籤「v0.2」與資料值 `0.1`（`spanTree.ts:11`）字面仍對不上（已非靜默矛盾、有 authority 鏈）。
- marker：已成 `SpanType` 正式成員（`spanTree.ts:30`），normalizer 製造（`normalizer.ts:24/:153`）、distiller 明文排除出 outcome（`distiller.ts:64/:84`）；跨分支衝突有記錄（`OUTSTANDING_2026-08-14.md:32-34`）。
- milestone：已定案移除——`spanTree.ts:156` `SkeletonNodeKind = objective|decision|outcome`，map 全篇無 milestone，`sessionMap.ts:65` 同步；作者裁定 D-003＋`OUTSTANDING` Part 3-3 維持移除。**殘留**：死 CSS `styles/index.css:605` `.map-target.map-kind-milestone`、`:1063-1064` `.fb-node.milestone`；PSM §2.2(a) 過時開放候選。

### 3.5　S-13 — 文件／UAT／runtime／lockfile 多組矛盾真相　→ PARTIAL（已收斂一半）
- 整合已成立：`docs/OUTSTANDING_2026-08-14.md`（**在 docs 根，不在 `docs/misc/`**）自我封版為唯一當日帳本；r11 PSM 自 :17 以 24 項 UAT 結果起手、traceability 表把每項對到單一 work card；`references/DIT-phase-log.md:349` 同源引用。package / lock root version 已一致 `0.4.0`。
- **仍矛盾（可見）**：`DEV_README.md:130-144` 仍宣稱 cloud provider「是樁、annotate 尚未打出去」「尚未實作」——程式已有真實 OpenCode transport（`sessionStore.ts:1256-1260`），R3 UAT 已實機產出真講解（`references/DIT-tickets.md:11`）；`DEV_README.md:166/:183` 仍宣稱「無自動化測試」——實際 462/462（PSM_R11:69）；`docs/PROGRESS.md`、`docs/ACCEPTANCE.md` 停在 R7 Part B（2026-07-23），R8–R11 未記載。

## 4　Consider 級 spot-check（M9 非正式範圍，僅記錄現況）

| # | 現況 |
|---|---|
| C-01 / F-13 | **仍存在**：`sessionIndexer.ts:156-157` 註解宣稱「用 uuid 去重」、實作只取 `trimmed.slice(0, 200)`，`feed` 從不讀 `record.uuid`。 |
| C-03（denoiser erroredTool 單態） | 未在本輪複核。 |
| C-04（cache match provenance） | 未在本輪複核。 |
| C-05 | **仍存在**：`configFile.ts:35` `raw.activePreset as PresetId` 直接斷言、無 allow-list；`sessionStore.ts:1023-1024` 只排除 `local-proxy`。壞值落進 `setProvider` 後走 `getProvider` 回 `noneProvider`，**靜默 no-op、無 Diagnostic**。 |
| C-06 | **仍存在**：`resetToSample`（`sessionStore.ts:1060-1067`）未清 `snapshotMode`。 |
| C-07 | **仍存在**：無可重現 dependency audit gate（package.json scripts 無 audit 步驟、無 INVENTORY 檔）；vite 5.4.21／esbuild 0.21.5／vitest 4.1.9 未動；`OUTSTANDING_2026-08-14.md:60-68` 記錄 5 vulnerabilities（1 moderate, 4 high）。 |

## 5　R12 候選排序（依使用者影響）

1. **S-03**（consent scope 永不重用：每次 annotation 都重複 review，且同意紀錄記錯 endpoint/model）——現行即發生的功能缺陷，優先級最高。
2. **S-01/F-12**（一面前導壞行靜默捨棄整份合法檔）——資料保全性。
3. **S-04/F-05**（raw exception／路徑原文直上使用者畫面）。
4. **S-09/F-11**（fishbone:71／distiller:73／map 兩處 silent wrong-target，缺 fixtures）。
5. **S-12/F-08**（三處 collapse 缺 keyboard/ARIA）＋ **S-05/F-06**（modal 靜默降級，catch 無測試）＋ **S-06/F-07**（Settings focus 搶走）。
6. **S-10**（validator 缺口）＋ **S-11**（FSA 上限套用時機）＋ **S-02**（sync 路徑補 catch＋測試）。
7. **S-08/F-04**＋**C-01/F-13**＋**C-06**：低成本、資料正確性/一致性修復。
8. **C-05**（activePreset 驗證）、**C-07**（audit gate）、S-13 殘留文件對齊、S-07 死 CSS：治理級，可並行。

## 6　不可誤讀

- 本複核是 **M9 report-only**：不開 PR、不改碼。上表 R12 候選應另開 round。
- 「STILL PRESENT」僅表示現行程式碼仍符合原 finding 描述，**不代表有新增缺陷**；其中 S-02、S-08、S-11 的現行影響已較 2026-08-03 低（分別：UI 全走 worker／無消費端／一般語料規模觸不到 500 檔），判斷時請分開看待「程式仍存在」與「影響已變」，受審查 §7 Wave 分層影響的部分已在表中標注對應的修法屬性。
