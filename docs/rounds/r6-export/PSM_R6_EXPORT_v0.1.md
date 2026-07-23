# PSM — R6 匯出（FR-8）與 SessionLibrary 型別保鮮 v0.1

狀態：**已簽核，可施工**（使用者 2026-07-21 核可 D-R6-01～07 與本文件卡片結構）。
定位：本文件是 [PSM_DIT_v1.0.md](../../PSM_DIT_v1.0.md) §3.2「R6 — 匯出（FR-8）與多 session」與 **ADR-013**（匯出格式＝JSON＋靜態 HTML 快照，2026-07-04 使用者拍板）的施工合約，
且為本輪**唯一施工依據**（sole-source）。[PSM_R5_GUIDED_NAVIGATION_v1.0.md](../r5-guided-navigation/PSM_R5_GUIDED_NAVIGATION_v1.0.md) §11 既有契約與
[PSM_R5.5_SEMANTIC_ALIGNMENT_v0.1.md](../r5.5-semantic-alignment/PSM_R5.5_SEMANTIC_ALIGNMENT_v0.1.md) 的 SA-INV-1～5 全部繼續有效；本輪新增規範以 **EX-INV** 編號。

---

## 1. 範圍

**做**（僅此三項）：

1. 把處理後的 `SessionDocument` 匯出為 JSON（帶 export 包裝層）。
2. 匯出**可獨立開啟**的靜態 HTML 快照——雙擊 `file://` 開啟即重現視圖，不需要 dev server、不需要任何網路。
3. `SessionLibrary` 型別保鮮：確保 D-5 預留的型別沒有隨 `SessionDocument` 演進而腐化。**D-5 本身維持凍結**。

**明確不做**（任何一項若被要求「順手做一下」，停下來問，不得自行納入）：

| 項目 | 去向 |
|---|---|
| 真正的多 session UI、session 切換、技能庫 | RPD D-5 凍結中 |
| 跨 session 統計／agent 行為分析 | RPD D-5 凍結中 |
| Adapter 未知型別寬容收納、Session 標題 fallback | R5.5 §5 已裁定 → R7（見 BACKLOG 2026-07-21 段） |
| Sidebar 連續同類操作聚合、timeline scrubber、操作卡壓縮模式 | R5.5 §5 → BACKLOG，未排程 |
| 匯入（import）快照或 JSON 回 DIT | 本輪不做。export 包裝層預留了辨識欄位，但不寫讀取端 |
| PDF／Markdown／圖片等其他匯出格式 | ADR-013 只拍板 JSON＋HTML |

---

## 2. 決策紀錄（Decision Register）

| 編號 | 決策 | 狀態 | 決策者 | 日期 |
|---|---|---|---|---|
| D-R6-01 | 快照忠實度＝**A 完整互動快照**：重用主應用本體（單檔內聯 build），非另寫唯讀渲染器 | approved | 使用者 | 2026-07-21 |
| D-R6-02 | JSON 匯出**加 export 包裝層**（`ditExport` / `exportVersion` / `exportedAt` / `document`） | approved | 使用者 | 2026-07-21 |
| D-R6-03 | 型別保鮮＝**編譯期型別斷言＋一個純函式 `toSessionLibrary()`**，關在 `src/core/export/` 內，零 UI 入口 | approved | 使用者授權主模型判定 | 2026-07-21 |
| D-R6-04 | 匯出入口放在**設定匣（settings tray）新增的「匯出」fieldset** | approved | 使用者 | 2026-07-21 |
| D-R6-05 | 匯出內容**包含講解（annotations）** | approved | 使用者 | 2026-07-21 |
| D-R6-06 | 快照著陸頁＝**Overview** | approved | 使用者 | 2026-07-21 |
| D-R6-07 | 選型：採用 `vite-plugin-singlefile`（MIT）而非自寫內聯腳本 | approved | 使用者 | 2026-07-21 |

> 本表無 pending 項；EX-01～EX-05 全部可依此施工。理由記錄見 §4.1（選型）、§4.6、§4.7。

---

## 3. 繼承的不變量與本輪新增

### 3.1 繼承（不得失守）

- **R5 §11 全部既有契約**（載入管線、虛擬化、選取／播放優先權、子代理群組、Provider／annotation／IndexedDB fallback、
  Privacy Gateway fail-closed、settings tray 各寬度預設收合、zh-TW 預設與 editorial 版面）。
- **SA-INV-1～4**：圖例只描述所在表面、分層規則、文案不得引用不存在位置且無死鍵、不修改 `PrimaryView`／Map 狀態機／
  Jump／cluster 語意／快捷鍵守門／載入管線／annotation／Privacy Gateway。
- **SA-INV-5（本輪關鍵）**：圖例與符號必須由渲染同源常數導出。SA-INV-5 原文已預先寫明「此條同時服務 R6 靜態 HTML 快照——
  快照渲染器屆時重用同一組常數，不得複製字串」。**D-R6-01 選 A 的直接後果就是這條由架構本身保證**：快照渲染的就是主應用，
  不存在第二份可漂移的符號表。這也是 BACKLOG 2026-07-21 註記中「R6 不得破壞 R7 Codex adapter 依賴」的唯一實質要求。
- **GN-07／GN-10 效能上限**：Reader 封閉 DOM ≤250、Map DOM ≤500、projection caps。快照跑的是同一份虛擬化 UI，
  因此上限**由建構本身承襲**，不是重新量測出來的宣稱。

### 3.2 本輪新增（EX-INV）

- **EX-INV-1**：匯出與快照為純本地行為。匯出流程不得發出任何跨來源網路請求；快照 HTML 內含 CSP `<meta>`，
  `default-src 'none'`，禁止快照在他人機器上把逐字內容送出去。
- **EX-INV-2**：快照渲染器**必須是主應用本體**。不得存在第二份手寫渲染器，不得複製任何符號、標籤或 span 型別清單字串（SA-INV-5 延伸）。
- **EX-INV-3**：快照必須能以 `file://` 直接開啟。產物不得依賴 `<script type="module">`、外部資產檔或任何 `fetch`
  （瀏覽器對 `file://` 的 origin 為 `null`，module script 一律被 CORS 擋掉——這是硬性平台事實，不是偏好）。
- **EX-INV-4**：`snapshotMode` 只做兩件事——隱藏不適用的入口（載入／講解／Provider／匯出）、跳過 IndexedDB 快取還原。
  不得改變任何既有狀態機轉移、選取語意或投影規則。
- **EX-INV-5**：JSON 匯出必帶 `ditExport` 標記與 `exportVersion`；資料本體維持原封不動的 `SessionDocument`。
  export 層版本與 `SCHEMA_VERSION` 各自獨立演進，互不綁定。
- **EX-INV-6**：注入 HTML 的 JSON 一律把 `<` 轉義為 `\u003c`（JSON 合法轉義，可阻斷 `</script>` 與 `<!--` 破格）。
  不得以字串拼接產生任何未轉義的使用者內容。
- **EX-INV-7**：匯出失敗必須有**可見**提示（重用 R5.5+ 的 `NoticeBanner`）與 console 記錄，不得靜默失敗——
  包含「dev 模式下 HTML 快照不可用」這個已知情況。

---

## 4. 技術方案

### 4.1 Prior art 與選型（D-R6-07）

**硬性平台事實（已實查，非憑記憶）**：`file://` 開啟的 HTML，其 origin 為 `null`；
`<script type="module">` 以 `mode: "cors"` 抓取，必然被擋。因此「可獨立開啟」的唯一解是**全部 JS/CSS 內聯的 IIFE 單檔**。
（[whatwg/html#8121](https://github.com/whatwg/html/issues/8121)、[xjavascript](https://www.xjavascript.com/blog/importing-script-with-type-module-from-local-folder-causes-a-cors-issue/)）

**OSS 盤點**：

| 候選 | 版本／維護 | 授權 | 適配度 | 整合成本 |
|---|---|---|---|---|
| `vite-plugin-singlefile`（richardtallent）**← 已採用** | v2.3.3，2026-04-17 發布 | MIT | 直擊：內聯 JS/CSS、IIFE loader、明確支援 file:// | 低：新增一個 build config |
| 自寫 post-build 內聯腳本 | — | — | 可行 | 中高：要自己處理 chunk 順序、CSS、asset URL、worker |

peer 需求 `vite ^5.4.21 \|\| ^6 \|\| ^7 \|\| ^8`；**本專案實裝 `vite 5.4.21`，剛好滿足**（`package.json` 寫 `^5.4.10`，
EX-03 會把它提升為 `^5.4.21` 以免他人 `npm install` 解析到不相容版本）。

**已裁定：採用 `vite-plugin-singlefile`**（D-R6-07，使用者 2026-07-21 拍板）。理由用白話講：這件事（把一個網頁的所有零件塞回同一個檔案）是有標準解法的，
自己寫等於重造一個維護了四年的輪子，而且踩到的坑（腳本順序、CSS、資產路徑）別人都已經填過。授權是 MIT，可自由使用。

### 4.2 匯出資料契約

```ts
// src/core/export/contracts.ts
export const EXPORT_VERSION = "1" as const;

export interface SessionExport {
  /** 固定字串，用來辨識「這是 DIT 匯出檔」而不是任意 JSON。 */
  ditExport: "session";
  /** export 包裝層版本，與資料本體的 SCHEMA_VERSION 獨立演進 (EX-INV-5)。 */
  exportVersion: typeof EXPORT_VERSION;
  /** ISO 8601；由呼叫端注入，核心函式保持純函式可測 (不在函式內叫 Date.now)。 */
  exportedAt: string;
  /** 產生此檔的應用版本，取自 package.json version。 */
  appVersion: string;
  document: SessionDocument;
  /** 講解快取，一併匯出 (D-R6-05)。無講解時為空物件，不省略欄位。 */
  annotations: Record<string, Annotation>;
}
```

`buildSessionExport(doc, { exportedAt, appVersion, annotations })` 是純函式，不碰 store、不碰 DOM、不碰時鐘。

### 4.3 快照 build target

```
snapshot.html                 ← 第二個 Vite entry（root）
src/snapshot.tsx              ← 快照專用進入點
vite.snapshot.config.ts       ← 只多掛 viteSingleFile()，outDir 同 dist、emptyOutDir: false
```

`snapshot.html` 內含一個 payload 佔位：

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:">
<script type="application/json" id="dit-snapshot">/*DIT_SNAPSHOT_PAYLOAD*/null</script>
```

`src/snapshot.tsx` 的責任只有三件：讀取並 `JSON.parse` 該 script 的內容 → 驗 `ditExport` 標記 →
呼叫 store 的 `hydrateSessionExport(payload)` 後渲染 `<App />`。任何一步失敗就渲染一個純文字錯誤區塊
並 `console.error`（EX-INV-7）——絕不留白畫面。

npm script：`build` 改為 `tsc && vite build && vite build --config vite.snapshot.config.ts`。

**已知風險（誠實揭露）**：`src/core/ingest/sessionLoader.ts:26` 有 `new Worker(new URL("./session.worker.ts", import.meta.url))`。
store 匯入了 ingest，快照又匯入 store，因此 bundler **仍會為 worker 產生獨立 chunk**，即使快照永遠不會呼叫它。
若 `vite-plugin-singlefile` 無法內聯它而留下外部檔，快照就不是單檔。
**應對（EX-03 卡內必須實測二選一並記錄結果）**：(a) 實測發現 worker chunk 未被引用即不影響單檔完整性 → 保持現狀；
(b) 若產出多檔或 file:// 開啟報錯 → 在 `vite.snapshot.config.ts` 以 alias 把 `sessionLoader` 指向一個會 throw 的 stub，
主應用完全不動。**不得**為此修改主應用的載入管線（違反 SA-INV-4／R5 §11）。

### 4.4 匯出流程（主應用）

1. **JSON**：`buildSessionExport()` → `JSON.stringify` → `Blob` → `URL.createObjectURL` → 觸發下載 → 立刻 `revokeObjectURL`。
2. **HTML 快照**：`fetch("./snapshot.html")`（同源，靜態檔）取得模板 →
   以 `template.replace("/*DIT_SNAPSHOT_PAYLOAD*/null", escaped)` 注入，`escaped = JSON.stringify(payload).replaceAll("<", "\\u003c")`（EX-INV-6）→ Blob 下載。
3. **dev 模式**：`import.meta.env.DEV` 為真時，`snapshot.html` 尚未經過內聯 build，產出的檔案在 `file://` 下必壞。
   因此 dev 模式**不產檔**，直接顯示提示：「HTML 快照需要 production build（`npm.cmd run build` 後以 preview 開啟）」。這是 EX-INV-7 的具體案例。
4. **檔名**：`dit-session-<sessionId 前 8 碼>-<yyyyMMdd-HHmm>.json` ／ `.html`。
5. **大小回報**：匯出後以 `NoticeBanner` 回報實際位元組數；超過 25 MB 改用 warn 色調並註明「檔案較大，開啟會較慢」。
   **不阻擋、不新增確認對話框**——不引入新的互動語意。

### 4.5 store 變更（僅加法）

```ts
snapshotMode: boolean;                              // 預設 false
hydrateSessionExport: (payload: SessionExport) => void;
```

`hydrateSessionExport` 重用既有的 `loadPipeline(() => ({ doc, warnings: [] }), origin)` 路徑發布文件，
再設定 `annotations` 與 `snapshotMode: true`，並依 D-R6-06 把 `primaryView` 定在 `overview`。快取還原（IndexedDB）在 `snapshotMode` 下跳過——
`file://` 的 `null` origin 在部分瀏覽器會直接拒絕 IndexedDB，雖然 `FallbackAnnotationRepository` 會降級到記憶體並記錄，
但那會在快照裡冒出一則無意義的降級提示。**既有的載入／取消／發布邏輯一行不改。**

### 4.6 D-R6-05（已裁定）：匯出包含 annotations

**已裁定包含**。理由：講解是本產品的核心價值，使用者跑完 Ollama 講解後匯出，若快照裡沒有講解，
「重現視圖」就少了他最花時間產生的那一層。技術上這只是包裝層多一個欄位、hydrate 多一行。
（若日後要收回，改動就是刪掉該欄位與該行，成本對稱。）

### 4.7 D-R6-06（已裁定）：快照著陸頁＝Overview

**已裁定落在 Overview**。理由：快照是拿來「給人看／自己日後回顧」的成品，Overview 提供 session 摘要與符號說明，
是比一頭栽進逐字卡片更好的入口；而主應用裡「使用者自行載入 → 直接進 Reader」的規則，服務的是「我剛丟進來要馬上看」的情境，兩者情境不同。

### 4.8 威脅模型（lite）

- **資產**：匯出檔包含**完整逐字內容**，可能含 API key、路徑、專案內部資訊。
- **入口**：(a) 使用者自己的 session 資料（已在管線內）；(b) 別人給的快照 HTML（開啟＝執行任意 HTML，這是檔案本身的性質，非本設計引入）。
- **最壞情況**：使用者把含密鑰的快照傳給別人。**對策**：匯出區塊常駐一行明示「匯出檔包含完整逐字內容，可能含密鑰，分享前請自行確認」，
  且快照內含 CSP 禁止對外連線（EX-INV-1），使快照即使被開啟也無法把內容送出。
- **注入面**：JSON 注入 HTML 的轉義（EX-INV-6）；渲染仍走 React 文字節點，無 `innerHTML`（沿用 INV-17）。

---

## 5. 施工卡片

規則：**一卡一 commit**，垂直切片，不得 squash、不得切成 store-only／CSS-only，不得順手重構卡片未列出的檔案。
每卡跑完自己的 Acceptance 並貼上真實輸出後，才能開下一卡。

---

### EX-01 — 匯出核心與 JSON 匯出

**Objects**
- 新增 `src/core/export/contracts.ts`、`src/core/export/buildExport.ts`、`src/core/export/download.ts`、`src/core/export/buildExport.test.ts`
- 新增 `src/components/ExportControls.tsx`
- 修改 `src/components/Header.tsx`（設定匣新增「匯出」fieldset）
- 修改 `src/i18n/locales.ts`（zh-TW＋EN 同卡落地）
- 修改 `src/styles/index.css`（匯出區塊樣式）

**Change**
1. 定義 `SessionExport` 與 `EXPORT_VERSION`（§4.2）。
2. `buildSessionExport(doc, options)` 純函式：不呼叫 `Date.now()`、不讀 store，時間與版本由呼叫端注入。
3. `downloadText(filename, mimeType, text)`：Blob → object URL → 觸發 `<a download>` → `revokeObjectURL`。
4. `ExportControls`：設定匣內的 fieldset，含「匯出 JSON」按鈕、一行隱私提示、匯出後的大小回報（走 `NoticeBanner` 語彙）。
   無文件時按鈕 disabled。`snapshotMode` 為真時整個 fieldset 不渲染（EX-INV-4）。
5. i18n 新鍵：`export.group` / `export.json` / `export.privacyNote` / `export.done(size)` / `export.failed(reason)`，zh-TW 與 EN 同卡補齊。

**Acceptance**
- `npm.cmd test` 全綠，且新增測試涵蓋：包裝層欄位齊全、`document` 與輸入 deep-equal（未被改寫）、
  `exportVersion` 與 `SCHEMA_VERSION` 為兩個獨立值、JSON round-trip 後 `spans.length` 與 `skeleton` 不變。
- `npm.cmd run typecheck`、`npm.cmd run build`、`git diff --check` 皆 exit 0。
- `rg -n "匯出|Export" src/i18n/locales.ts` 顯示 zh-TW 與 EN 鍵數一致；`rg` 確認元件內無硬編中文。

**Rollback**：`git revert` 該 commit。新增檔案為獨立模組，`Header` 的改動僅為一個 fieldset 的插入，無資料遷移。

**Commit**：`feat(export): add session json export with a versioned wrapper`

---

### EX-02 — SessionLibrary 型別保鮮

**Objects**
- 新增 `src/core/export/library.ts`、`src/core/export/library.test.ts`

**Change**
1. `toSessionLibrary(documents: SessionDocument[]): SessionLibrary` —— 純函式，僅組裝 `{ schemaVersion, documents }`。
   **不接進任何 UI、不進 store、不被 EX-01 的匯出流程呼叫**（D-5 仍凍結）。
2. 編譯期斷言：以型別層級測試確認 `SessionLibrary["documents"][number]` 與目前 `SessionDocument` 相容，
   且兩者 `schemaVersion` 同源於 `SCHEMA_VERSION`——`SessionDocument` 日後增刪必填欄位時，這裡會編譯失敗，這正是「保鮮」的作用。
3. 檔頭註解寫明：本模組存在的唯一理由是 RPD D-5 的架構預留，解凍前不得長出 runtime 行為。

**Acceptance**
- `npm.cmd test` 全綠；新增測試至少涵蓋：空陣列、多份文件、`schemaVersion` 一致。
- `npm.cmd run typecheck`、`npm.cmd run build`、`git diff --check` 皆 exit 0。
- `rg -n "toSessionLibrary" src --glob '!src/core/export/**'` **無輸出**（證明零 UI 牽扯，這是 D-R6-03 的驗收重點）。

**Rollback**：`git revert`。此卡為純新增，無任何既有行為相依。

**Commit**：`test(export): keep SessionLibrary type fresh against SessionDocument`

---

### EX-03 — 快照 build target

**Objects**
- 新增 `snapshot.html`、`src/snapshot.tsx`、`vite.snapshot.config.ts`
- 修改 `package.json`（新增 `vite-plugin-singlefile` devDependency、`vite` 提升為 `^5.4.21`、`build` script 串接第二次 build）
- 修改 `src/store/sessionStore.ts`（新增 `snapshotMode` 與 `hydrateSessionExport`，僅加法，§4.5）
- 修改 `src/store/sessionStore.test.ts`
- 修改 `src/components/Header.tsx`（`snapshotMode` 下隱藏載入／講解／Provider／匯出入口）

**Change**
1. 依 §4.3 建立三個新檔；CSP meta 與 payload 佔位一併寫入 `snapshot.html`。
2. store 加入 `snapshotMode` 與 `hydrateSessionExport`；快取還原在 `snapshotMode` 下跳過；著陸頁固定 `overview`（D-R6-06）。
3. `Header` 依 `snapshotMode` 隱藏不適用入口；語言切換、逐步瀏覽、Map 入口保留。
4. **實測 §4.3 的 worker 風險並把結果寫進卡片證據**；若需 stub alias，只改 `vite.snapshot.config.ts`。

**Acceptance**
- `npm.cmd run build` 兩段皆成功；`dist/snapshot.html` 產生，且 `rg -c 'type="module"' dist/snapshot.html` 為 0。
- 列出 `dist/` 內容，證明快照所需資產已全部內聯（若有殘留 worker chunk，明確說明它未被快照引用並附證據）。
- **file:// 硬性驗收**：手動把一份 fixture payload 注入 `dist/snapshot.html` 另存後，在**沒有任何 dev server 執行**的情況下
  以 `file://` 開啟，Reader／Map／Overview 皆可操作，console 無錯誤。貼上實際步驟與 console 輸出。
- `npm.cmd test`（既有 store 測試必須全綠，證明既有載入語意未回歸）、`npm.cmd run typecheck`、`git diff --check` 皆 exit 0。

**Rollback**：`git revert`。第二段 build 失敗不影響主 build（`emptyOutDir: false`，且主 build 先跑）。

**Commit**：`feat(export): add a self-contained snapshot build target`

---

### EX-04 — 由應用內匯出 HTML 快照

**Objects**
- 新增 `src/core/export/snapshotTemplate.ts`、`src/core/export/snapshotTemplate.test.ts`
- 修改 `src/components/ExportControls.tsx`、`src/i18n/locales.ts`

**Change**
1. `injectSnapshotPayload(template, payload)` 純函式：轉義 `<` → `\u003c`（EX-INV-6），取代佔位符；
   佔位符不存在時 throw 具名錯誤（模板與程式碼脫節必須爆，不得產出壞檔）。
2. `ExportControls` 新增「匯出 HTML 快照」：`fetch("./snapshot.html")` → 注入 → 下載；
   dev 模式改為顯示提示不產檔（§4.4.3）；fetch 失敗顯示可見錯誤（EX-INV-7）。
3. i18n 新鍵：`export.html` / `export.devUnavailable` / `export.templateMissing`，zh-TW＋EN 同卡落地。

**Acceptance**
- `npm.cmd test` 全綠；新增測試涵蓋：含 `</script>` 與 `<!--` 的惡意字串經注入後，模板不被提前關閉且 round-trip 解析回原值；
  佔位符缺失時 throw。
- `npm.cmd run typecheck`、`npm.cmd run build`、`git diff --check` 皆 exit 0。
- **file:// 硬性驗收（本輪的核心驗收點）**：`npm.cmd run build` 後以 preview 開啟應用，載入真實 session，
  由設定匣按「匯出 HTML 快照」下載檔案；**關閉 preview／確認無任何 dev server 執行**後，雙擊該檔以 `file://` 開啟，
  確認 Reader／Map／Overview／子代理與（若 D-R6-05 為是）講解皆重現，console 無錯誤、Network 無任何外部請求。貼上實際步驟與輸出。

**Rollback**：`git revert`。

**Commit**：`feat(export): export a self-contained html snapshot from the app`

---

### EX-05 — 文件與帳本

**Objects**
- 修改 `docs/PROGRESS.md`、`docs/ACCEPTANCE.md`、`docs/USER_GUIDE.md`、`references/DIT-tickets.md`、`docs/BACKLOG.md`

**Change**
1. PROGRESS 新增 R6 段落，逐卡記錄 commit hash 與證據。
2. ACCEPTANCE 新增 R6 UAT 章節（§7 清單）。
3. USER_GUIDE 說明匯出兩種格式的用途與差異、快照的隱私注意事項。
4. `references/DIT-tickets.md` 新增 T-007（R6），acceptance 引用本文件卡片。
5. BACKLOG 確認 R7 段落未被本輪動到。

**Acceptance**：`git diff --check` exit 0；`npm.cmd test`／`typecheck`／`build` 全綠（回歸確認）。

**Commit**：`docs(r6): record export round evidence and acceptance`

---

## 6. 驗收層級

| 層 | 內容 |
|---|---|
| UNIT | `buildExport`、`library`、`snapshotTemplate` 三組純函式測試（含惡意字串注入案例） |
| SIT | store `hydrateSessionExport` 與既有載入語意的非回歸；兩段 build 皆成功且快照無 module script |
| UAT | §7 清單，由使用者在真實瀏覽器完成；**「無 dev server 可開啟」由 file:// 實測把關，但視覺與互動最終仍由使用者簽核** |

---

## 7. 使用者 UAT 清單（R6，草案）

> 開工後每卡完成再定稿；此處先列出可預期項目，讓你在簽核時就知道最後要驗什麼。

1. 設定匣可見「匯出」區塊，含隱私提示一行；390／740／1280 皆不水平溢位。
2. 無 session 時兩個匯出按鈕皆為 disabled，不會產生空檔。
3. 匯出 JSON：檔案可用文字編輯器開啟，最外層看得到 `ditExport` / `exportVersion` / `exportedAt`。
4. 匯出 HTML 快照後**完全關閉 dev server／preview**，雙擊檔案開啟：Reader 可捲動、Map 可開可縮放、Overview 可見。
5. 快照內看不到載入／講解／Provider／匯出入口；語言切換仍可用。
6. 快照的瀏覽器 console 無錯誤，Network 分頁無任何對外請求。
7. dev 模式按「匯出 HTML 快照」時，出現明確提示而非產出壞檔。
8. 匯出大型 session（50 MiB fixture）時，大小回報正確且提示檔案較大；瀏覽器未當掉。
9. 既有能力無回歸：載入／取消、M 快捷鍵、Map Jump、cluster 不可跳、雙語切換、講解流程。

---

## 8. 交接

- **決策全部到齊**：D-R6-01～07 皆 approved（2026-07-21），無 pending 閘門。
- **本文件簽核後**才進入 Phase 1 逐卡施工。
- 卡片順序固定 EX-01 → EX-02 → EX-03 → EX-04 → EX-05；EX-03 的 worker 風險是唯一已知技術不確定點，
  已預先寫好應對方案與「不得改主應用管線」的邊界。
