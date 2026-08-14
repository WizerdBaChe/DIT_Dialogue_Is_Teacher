# R9 UAT 回報 — 根因分析與設計層調整方向 (RCA v1.0)

> 上游：[`UAT_R9_v1.0.md`](./UAT_R9_v1.0.md)（作者 2026-07-29 完成實測）
> 本文件**只做確認與根因**，不含任何 `src/` 改動；施工卡是下一段的產物。
> ops-relaxation：**L1**（邊界契約 + 決策憲章生效）。

---

## §0 邊界契約 (Boundary Contract)

**解讀分岔**
1. 作者要求「從設計層面調整而非單純改 bug」。本文件把它解讀為：**每一項回報都要指到一個結構性成因**（誰擁有這個狀態、這個值從哪裡推導、這個元件的尺寸契約是什麼），修法必須落在那一層；只有 B4 這種資料判準錯誤才會出現接近「改 bug」的修法，但它的判準來源本身就是設計問題。
2. 額外回報 2/3（入口優先序與文案）、7（Markdown/LaTeX 渲染）屬於 UX 語意與範圍變更，**本文件不自行決定**，列為待裁決分岔。翻轉點分別在 `SessionLoadActions.tsx`（入口層，不影響索引器）與「是否新增渲染依賴」（影響 `SpanCard` 與匯出快照兩處）。

**邊界輸入**
Chromium/Edge 為主要驗證瀏覽器；`~/.claude/projects/` 實測 218 檔 / 109 session；載入入口有兩個宿主（header 與 overview 空狀態），進度列有兩個宿主（header 與 settings dialog）。專案目前無任何 Markdown/LaTeX 依賴（`package.json` 已確認）。

**驗收**
(a) 額外 #0 必須有一個可觀察的失敗終點——任何資料夾流程的失敗都留下使用者看得到的痕跡；(b) B4 選 `subagents/` 底下的檔案必須落在具名的 `NO_MAIN_TRANSCRIPT`；(c) 三顆按鈕在 header / overview / settings 三處量到相同高度；(d) 壓縮標記不得成為主線 `outcome` 站；(e) `npm test` 與 `npm run build` 維持全綠。

**非目標與降級**
不做 e2e 測試框架、不做 Firefox/Safari 實機驗證（B5 仍為已知未驗）、不做 Codex 索引。
降級順序：**捨棄 Markdown/LaTeX 渲染 → 捨棄分類定義文件 → 捨棄 minimap 視覺語言重整 → 捨棄按鈕元件層全專案掃描（只補 `.btn` 尺寸契約）→ 保底：RC-A / RC-C / RC-D 三項正確性缺陷**。

---

## §1 根因分群

八個群組，涵蓋 1 項未通過、5 項回報、8 項額外回報。每一群都標了**證據行號**與**分類**。

---

### RC-A — 資料夾流程有一個「不可見的失敗終點」

**對應**：額外回報 #0（快取清空後第一次載入資料夾靜默失敗，第二次才正常）
**分類**：`[silent-exit]` — 失敗路徑收斂到一個 UI 上不存在的狀態。

阻斷面「想不想開」是從 `browseState` 推導的：

```
"session-browser": state.browseState !== "no_directory"    // surfaceSelectors.ts:17
```

也就是說 **`no_directory` 是唯一一個「瀏覽器整個消失」的值**。而 `pickAndIndexDirectory` 的取消分支會在還沒有任何條目時回到它：

```
if (error instanceof DirectoryPickCancelledError) {
  set({ browseState: get().indexEntries.length > 0 ? "indexed" : "no_directory" });   // sessionStore.ts:730
}
```

於是「使用者按取消」與「第一次流程失敗、還沒有任何條目」共用同一個不可見終點——**畫面上兩者完全一樣**。同一條路徑上還有三個空的 `catch {}`（`handleRepository.ts:17/27/36`）與一個 fire-and-forget 的 `saveDirectoryHandle(handle)`（`sessionStore.ts:726`，刻意不 await）。整條資料夾流程沒有任何一處保證留下痕跡。

另有一個**時序疑點**（高信心，未證實）：`resumeLastDirectory` 在開啟系統選擇器**之前** await 了一次 IndexedDB 開啟；快取清空後的第一次還要跑 v1→v2 的 schema 升級（`onboarding/repository.ts:24-29`），這把 `showDirectoryPicker()` 推離了使用者手勢的同一個 task。第二次時資料庫已建好、handle 已存在，路徑完全不同——**這正好解釋了「第一次失敗、第二次正常」**。

> 依「同一症狀第二次回報才禁止再猜」的規則，這是第一次回報，允許帶假說施工；但施工卡必須先做**最小診斷**（把資料夾流程每個終點都寫進 `indexDiagnostics`，並記錄 pick→index 的時間軸），讓症狀先自己說出是誰，再決定 A2 要不要做。

**設計調整方向**
- **A1｜失敗不得靜默退場**：`BrowseState` 明確區分「從未選過目錄」「使用者主動關閉」「失敗」。任何失敗一律停在 `index_failed` 且**瀏覽器保持開著**，帶具名診斷與重試鈕（該 UI 分支已經存在，`SessionBrowserDialog.tsx:125-130`，目前只是到不了）。
- **A2｜手勢與 I/O 解耦**：`showDirectoryPicker()` 必須是按鈕回呼裡的第一個 await；已存的 handle 在應用啟動時就預讀好，不放在點擊路徑上。
- **A3｜best-effort 不等於無聲**：`handleRepository` 的三個空 `catch` 改為回報一條 info 診斷（存不進去確實不該擋人，但也不該無人知曉）。

---

### RC-B — 降級通道被當成日誌用

**對應**：額外回報 #1（console 反覆出現 `[DIT fallback] sessionIndexer/pickTitle|no-title-signal`）
**分類**：`[channel-misuse]`

```
reportFallback("sessionIndexer/pickTitle", "no-title-signal", { path });   // sessionIndexer.ts:237
return { title: baseName(path)…, titleSource: "filename" };
```

專案規則「每個 `?? somethingElse` 都要 `reportFallback`」的目的是抓**無聲地指向錯目標**（本專案已經因此吃過一次虧）。但這一處不是錯目標：`titleSource: "filename"` 已經是 UI 上的一級值，清單上有 class、有 tooltip（`SessionBrowserDialog.tsx:172-174`），使用者本來就看得到「這是檔名不是標題」。它是**已經說出口的合法結果**，卻走了「無聲降級」的通道，於是每索引一次就洗一次版——真正的降級被淹在裡面。

**設計調整方向**
- 把兩件事分開命名：**靜默替代**（必須 `reportFallback`）vs **具名降級**（已經是回傳型別的一部分，不必再喊一次）。
- 索引層改在 `SessionIndex.diagnostics` 出一條聚合 info（例：`INDEX_TITLE_FROM_FILENAME`, count=N），逐檔 console 取消。
- 這條原則要回寫進 `CLAUDE.md` 的不變式，否則下一個人會照抄同樣的用法。

---

### RC-C — 子代理身分靠路徑字串推斷（**唯一「未通過」項**）

**對應**：B4；連鎖到同一則回報裡的 minimap 紅點與 session map 只剩開始/結束
**分類**：`[wrong-source-of-truth]`

判準只看路徑：

```
export function isSubagentPath(path: string): boolean {
  return /(^|\/)subagents\//i.test(path);        // classifySession.ts:61-63
}
```

而「載入 .jsonl」多選給進來的路徑是：

```
{ path: file.webkitRelativePath || file.name, blob: file }   // SessionLoadActions.tsx:24
```

**一般多檔選取不是 `webkitdirectory`，`webkitRelativePath` 是空字串**，所以 path 退化成 `agent-xxx.jsonl`——沒有 `subagents/` 前綴。於是：

1. `isSubagentPath` 回傳 false；
2. `pipeline.ts:131` 的 `parsedFiles.find(f => !isSubagentPath(f.path))` 命中第一個檔案，認定它是主檔；
3. `NO_MAIN_TRANSCRIPT` **永遠不會被丟出**——UAT 期待的那個具名錯誤在這條路徑上不可能出現。

連鎖效應也都跟著解釋得通：那份「假主檔」其實是一條子代理紀錄，蒸餾出來只有 `objective` 與 `outcome` 兩站（`distiller.ts:43-58`），所以 **session map 只有開始與結束**。而 minimap 的密度桶是用 projection targets 算的、紅點卻是用 `viewItems.findIndex(selectedId)` 算的（`ReaderMinimap.tsx:46-65`）——**兩個座標系不同源**，投影裡沒有的項目仍會在時間軸上有索引，紅點因此跑到線尾沒有節點的位置。

**設計調整方向**
- **C1｜身分由內容決定**：子代理判準改用紀錄自身的 `agentId` / `isSidechain`（adapter 早就在讀，`classifySession.ts:78-79` 也已經有這兩條規則，只是排在路徑規則之後）。路徑降級為**提示**，不是判準。
- **C2｜主檔選擇同步改判**：`pipeline` 選主檔改用同一個內容判準；選不到才丟 `NO_MAIN_TRANSCRIPT`，讓那段已經寫好的文案真的有機會出現。
- **C3｜minimap 單一投影來源**：「你在這裡」與密度必須由同一份 projection 推導，不得一個用 targets、一個用 viewItems。投影裡定位不到就**不畫紅點**（該檔案 63-65 行對「找不到就不畫」已有正確的處理，問題出在兩套座標系而不是有沒有防呆）。

---

### RC-D — 骨架的 `outcome` 是位置規則，不是語意規則

**對應**：A4 回報（壓縮標記出現在最後一張卡，且在 session map 中屬於「結束」）
**分類**：`[positional-rule]`

```
const last = spans[spans.length - 1];
if (last && !spineSpanIds.has(last.id)) {
  nodes.push({ spanId: last.id, kind: "outcome", … });    // distiller.ts:54-58
}
```

**無條件把最後一個 span 加冕為「結束」**。壓縮標記是 adapter 在原時序位置產生的 marker 事件（`claudeCodeJsonl.ts:49, 196-204`，`kind: "unknown"`）；那份 session 的壓縮剛好發生在最後，於是標記卡既是最後一張卡（**這部分是對的**——它忠實反映檔案裡的位置），又被當成了這段對話的「結果」（**這部分是錯的**——它不是結果，是一個結構事件）。

同一段程式還暴露一件事：`SkeletonNodeKind` 有四種，distiller 只產出 `objective` / `decision` / `outcome` 三種，**`milestone` 從未被產生**。而 `sessionMap.ts:359` 的章節邊界判定把 milestone 列為邊界之一——那條分支是死的。

**設計調整方向**
- **D1｜`outcome` 改為「最後一個有內容的 span」**，marker 類事件不得佔主線站位。
- **D2｜marker 應該有自己的身分**：它既不是節點也不是支線，而是「這裡發生過一件結構性的事」。要嘛給它一個獨立記號，要嘛明確掛成支線，不能靠位置意外取得語意。
- **D3｜`milestone` 二擇一**：補上產生規則，或從型別移除。留一個永遠為空的分類，會讓圖例說謊。（此項與 BACKLOG 的「蒸餾 preset v1 格式待定稿」是同一件事，正好一併處理。）

---

### RC-E — `.btn` 是裝飾 class，不是元件契約

**對應**：額外回報 #4（三顆按鈕大小不一；settings shell 同樣現象）
**分類**：`[missing-primitive]`

同一個 `.btn` 貼在三種不同的東西上：

| 使用點 | 元素 | 實際盒模型 |
|---|---|---|
| 「開始閱讀」 | `<button class="btn primary overview-primary-action">` | `min-height:40px; padding-inline:20px`（index.css:643） |
| 「載入 .jsonl」 | `<label class="btn file-btn">` | `<label>` 預設 **inline**，垂直 padding 不撐開行盒 |
| 「載入 Session 資料夾」 | `<button class="btn">` | inline-block，`padding:5px 12px`，**無 min-height** |

`.btn` 本身（index.css:344-348）只宣告了背景、框線、圓角、padding 與字級——**沒有 `display`、沒有 `min-height`、沒有 `line-height`、沒有 `box-sizing`**。三種高度是這個設計的必然結果，不是哪裡漏寫。settings shell 是同一個成因的第二現場。

回答作者的問題：**目前沒有共用的按鈕抽象層**，`.btn` 只是一個共用的外觀 class。

**設計調整方向**
- **E1｜補上尺寸契約**（成本低、風險低）：`.btn` 改為 `inline-flex; align-items:center; justify-content:center; min-height; line-height:1; box-sizing:border-box`，並用 `--btn-min-h` 之類的變體 token 取代散落的 per-site 覆寫。
- **E2｜真正的 primitive**（成本中）：`<Button as="button" | "label">` 元件，把「這是一顆按鈕」變成型別而不是約定。
- **E3｜全專案掃描**：`.btn` 使用點盤點一次，把 per-site 的尺寸覆寫收回 token 層。
- 建議：**E1 本輪必做，E3 本輪做盤點，E2 視盤點結果再決定**——先把不一致消除，再決定要不要為此建元件層。

---

### RC-F — 進度列的欄寬假設綁在第一個宿主上

**對應**：額外回報 #5（settings shell 裡「關閉狀態」非預期換行）
**分類**：`[host-assumption]`

```
grid-template-columns: minmax(220px, 1fr) minmax(120px, 320px) auto;   // index.css:658
```

文案欄有 220px 硬下限、進度條欄有 120px 硬下限，按鈕欄是 `auto`。三者相加超過 settings dialog 的可用寬度時，**唯一沒有下限保護的按鈕欄最先被壓爆**，文字就換行了。

作者的直覺是對的：該縮的是進度條，不是文字。但更根本的成因是——**這個元件被放進了第二個宿主（settings dialog），尺寸假設卻仍然綁在第一個宿主（全寬 header）上**。現有的窄版處理是 viewport media query（index.css:1040），它看的是視窗寬度，而 settings dialog 在寬視窗下一樣是窄容器，所以那條規則救不到。

**設計調整方向**
- 進度條改為唯一可壓縮欄（`minmax(40px, 1fr)`），按鈕欄 `white-space: nowrap` 且不可壓縮。
- 斷點改用 **container query** 而不是 viewport media query，讓元件對「我被放在多寬的容器裡」負責。
- 本專案已有 `cqw` 使用（`.sidebar` 的 `clamp(220px, 20cqw, 320px)`），容器查詢環境是現成的。

---

### RC-G — 地圖有兩套視覺語言，卻只有一份（且不完整的）圖例

**對應**：額外回報 #6（minimap 節點長短不一、跨 session 不一致；「決策」等分類沒有面向使用者的定義）
**分類**：`[unexplained-encoding]` + `[missing-definition]`

**前半——那些不是節點，是密度長條**：

```
const halfHeight = MIN_HALF_BAR + (count / peak) * (MAX_HALF_BAR - MIN_HALF_BAR);   // ReaderMinimap.tsx:77
const peak = Math.max(1, ...buckets);                                               // 68
```

minimap 畫的是把時間軸切成 57 桶後**每桶的地標數量**，高度在 2~11px 之間，而且是**以該 session 自己的最大值正規化**。所以：
- 「有些長有些短」＝那一段的地標密度不同（正確行為）；
- 「同分類在不同 session 長度不同」＝每份 session 各自正規化（也是正確行為）。

兩者都不是缺陷——但 **UI 上完全沒有說明**，而且 minimap 的視覺詞彙（一條線上的小方塊）和 session map 的節點詞彙長得一樣，被讀成節點是必然的。程式碼註解裡對這個設計有很完整的說明（該檔 37-41、70-73 行），**那些話從來沒有傳到使用者眼前**。

**後半——分類名稱只有名字，沒有定義**：`objective / decision / milestone / outcome` 與四種支線，判準全藏在 `distiller.ts` 與 denoiser 的規則裡。`legendNote` 只寫「重要節點也有文字標籤……見 Session Map」（locales.ts:746），Session Map 本身也沒有定義。以「決策」為例，實際判準是 `s.tags.includes("decision")`，而該標籤來自 denoiser 的**思考層**限縮規則——這件事使用者無從得知。

**設計調整方向**
- **G1｜minimap 明說自己是密度**：加一條基線與微標籤，或改用不會被誤讀成節點的形狀（例如面積填色而非離散方塊）。
- **G2｜單一定義來源**：產出一份分類定義表（每一類：一句話定義 ＋ 觸發判準 ＋ 一個真實例子），**同一份資料同時餵給圖例 tooltip、Session Map 說明與使用者指南**。定義散成三份，遲早會互相矛盾。
- **G3｜與 D3 綁在一起**：`milestone` 若不補產生規則，定義表就不能列它。

---

### RC-H — 沒有 Markdown / LaTeX 渲染（缺功能，非缺陷）

**對應**：額外回報 #7
`package.json` 確認：無 `marked` / `remark` / `katex` 或任何等價依賴；`src/` 內無 `dangerouslySetInnerHTML`。所有訊息文字都以純文字渲染，反引號與星號原樣顯示。

這是**範圍決策**，不是回歸。需要作者裁決，且要一併考慮：安全（必須經過淨化，不能直接注入 HTML）、匯出快照（`snapshotTemplate` 是另一條渲染路徑，兩邊必須同步）、bundle 體積（單檔快照有體積目標）。列為待裁決分岔 F3。

---

## §2 不需修改的回報（已確認，附理由）

| 項 | 判定 | 理由 |
|---|---|---|
| **B2** 取消載入 | 不修 | 作者已裁決：真實檔案太小來不及觸發，程式層轉移測試已足夠。 |
| **B3** 雙彈窗 | **改測試，不改程式** | 歡迎彈窗擋住背景按鈕正是它該做的事（真 `<dialog>` + `showModal()`）。是這條 UAT 步驟本身不可執行，不是缺陷。要驗排隊行為，應改用「載入時就帶 fatal 的檔案」而不是「開著彈窗時再點背景按鈕」。 |
| **B6** 重新授權提示 | **只改文案** | File System Access API 的 **handle 可持久化、權限不可持久化**——每次新的頁面載入都必須重新取得授權，這是規範行為，不是專案缺陷。紅色警告底色是 Chromium 自己的檔案存取提示樣式，DIT 無法也不應覆寫。DIT 能做的是**事先說明**（「瀏覽器每次重開都會再問一次是否允許讀取這個資料夾，這是瀏覽器的安全設計」），把驚訝變成預期。 |
| **A1 / A2 / A3 / B1 / B7** | 通過 | 無待辦。 |

---

## §3 未完成進度盤點

回答「是否還有未完成進度」：

**已知未驗（非本輪疏漏，但仍是缺口）**
- **B5 — Firefox / Safari 後備路徑**：完全沒有實跑過。UAT 自評「本輪最可能出問題的地方」，此判斷仍成立。需要作者實機或明確裁決放棄。
- **B6 — Chromium 跨分頁記憶目錄**：作者已實測，結論是「目錄有記住，但每次仍需重新授權」——功能成立，預期需修正（見 §2）。

**刻意不做（已有裁決紀錄）**
- Codex 索引（作者 2026-07-28 裁決）。
- DSM-7 / 8 / 9 / 10 四項狀態機既有債（已登 `docs/BACKLOG.md`）。
- `tests/e2e/` 渲染層行程內觀察者（已登 BACKLOG）。

**與本輪回報直接相撞的 BACKLOG 項**
- **「蒸餾 preset v1 格式待定稿」** ↔ RC-D（`outcome` 位置規則、`milestone` 從未產生）。這一項不再是純粹的未來工作，本輪已經有具體症狀推著它動。

**交付狀態**
- `main` 已含 R9 全部 7 個 commit（merge `b107843`）＋ UAT 文件 commit `83723ab`。
- **尚未 push GitHub、尚未建 PR、尚未打 release。**
- 分支 `feat/r9-session-browser-and-fsm` 保留未刪。

**結論**：除了 B5 這個驗證缺口，R9 本身沒有未完成的**施工**進度。剩下的全部是本文件列出的回報處理，以及作者對三個分岔的裁決。

---

## §4 作者裁決（2026-07-29，本段已結案）

| # | 分岔 | 裁決 |
|---|---|---|
| **F1** | 兩個載入入口的優先序與文案（額外 #2 / #3） | **資料夾升為主入口 ＋ 改文案**。「載入 Session 資料夾」移到左邊、改為 `.primary` 主按鈕；「載入 .jsonl」降為次要並改名為貼近新語意的說法（單一、已知路徑的特定檔案），tooltip 同步修正。 |
| **F2** | 按鈕整理的範圍（額外 #4） | **E1 ＋ E3**：補齊 `.btn` 尺寸契約並把 per-site 覆寫收回 token 層，同時盤點全專案 `.btn` 使用點並修正不一致。**不新建 `<Button>` 元件層**——先消除不一致，是否值得抽象留待盤點結果再判。 |
| **F3** | Markdown / LaTeX 渲染（額外 #7） | **本輪不施工，但要交付一份初步設計引導**。目的是避免下一輪在沒有上下文的情況下憑空推測：需寫下渲染範圍邊界、安全淨化立場、兩條渲染路徑（閱讀畫面與匯出快照）如何保持同步、體積取捨，以及選型的候選與判準。設計文件本身列入本輪交付，實作不列入。 |

裁決後的降級順序修正為：**捨棄 F3 設計文件 → 捨棄分類定義表（G2）→ 捨棄 minimap 視覺語言重整（G1）→ 捨棄全專案按鈕盤點（E3）→ 保底：RC-A / RC-C / RC-D 三項正確性缺陷 ＋ E1 尺寸契約 ＋ F1 入口調整**。
