# PSM — R6.5 版面與尺度系統修正 v0.1

狀態：**施工完成，待使用者 UAT**（D-R65-01～04 已由使用者於 2026-07-22 裁定；D-R65-05～06 pending）。
LS-00～LS-11 已依 §5 順序完成，證據見 [R6.5_BASELINE_2026-07-22.md](R6.5_BASELINE_2026-07-22.md)、
[PROGRESS.md](../../PROGRESS.md) R6.5 段落、[ACCEPTANCE.md](../../ACCEPTANCE.md) §20。
定位：本文件是 R5 UAT（[ACCEPTANCE.md](../../ACCEPTANCE.md) §1／§4／§13／§15／§19 標記「有問題」者）與使用者
2026-07-22 追加回報的**唯一施工依據**（sole-source）。

繼承且不得失守：[PSM_R5_GUIDED_NAVIGATION_v1.0.md](../r5-guided-navigation/PSM_R5_GUIDED_NAVIGATION_v1.0.md) §11 既有契約、
[PSM_R5.5_SEMANTIC_ALIGNMENT_v0.1.md](../r5.5-semantic-alignment/PSM_R5.5_SEMANTIC_ALIGNMENT_v0.1.md) SA-INV-1～5、
[PSM_R6_EXPORT_v0.1.md](../r6-export/PSM_R6_EXPORT_v0.1.md) EX-INV-1～4。本輪新增規範以 **LS-INV** 編號。

> **本輪的性質**：這不是「調整幾個數值」。使用者明確要求「從根本思考設計上的缺陷來統一調整，
> 針對不同狀態的排版要完全重排而不是微調」。下列 11 個症狀收斂到 **3 個上游設計缺陷 + 2 個孤立缺陷**，
> 施工必須改掉缺陷本身，只改症狀的 PR 一律退回。

---

## 1. 根因分析（Root Cause）

### 1.1 症狀 → 根因對照

| # | 使用者回報症狀 | 根因 |
|---|---|---|
| 1 | 740／1280 下總覽・閱讀・子代理分頁被擠壓遮擋 | RC-A + RC-B |
| 2 | 非 mobile 比例下文字「一個字母一個字母」顯示 | RC-A + RC-B |
| 3 | 「講解來源」非「不講解」時文字與下拉箭頭重疊 | RC-D |
| 4 | 閱讀欄過窄，右側被 minimap 讓位槽吃掉 | RC-B |
| 5 | minimap 需放大 1.5 倍 | —（純參數，隨 RC-B 一起改） |
| 6 | 「已還原 n 則」重整後仍在，且看不懂在講什麼 | RC-C |
| 7 | sidebar 圖例＋SESSION 名稱佔掉近一半空間 | RC-A |
| 8 | sidebar 橫向佔 25% 太多 | RC-A + RC-B |
| ACC §4 | 窄版「位置」字樣干擾「結構」 | RC-A |
| ACC §13 | 切成 English 後 header 排版完全跑掉 | RC-A + RC-B（**不是 i18n 缺陷**，見 §1.4） |
| ACC §19 | 快照內仍看得到並可點「載入 Session／載入 .jsonl」 | RC-E |

### 1.2 RC-A — 尺度與容器脫鉤（scale／container decoupling）

**事實**：[index.css:951-995](../src/styles/index.css:951) 是一個檔尾的**扁平絕對 px 覆蓋區塊**，
註解寫著 `GN-09 readability scale: existing type grows 1.25x; option labels grow 1.5x`。它把全站約 60 個
選擇器的字級硬寫成放大後的絕對值（`body { font-size: 18.75px }`、`.layer-title { 21.25px }`、
`.overview-card h2 { clamp(37.5px, 6.25vw, 67.5px) }` …）。

**缺陷**：字級放大 1.25×／1.5× 之後，**斷點（719px／899px）與所有固定軌道寬完全沒有重算**：

- `.sidebar { width: clamp(280px, 24vw, 380px) }`（[index.css:496](../src/styles/index.css:496)）
- `.dense-scroll.reader-with-minimap { padding-right: 196px }`（[index.css:598](../src/styles/index.css:598)）
- `.layer-title { padding-right: 130px }`（[index.css:648](../src/styles/index.css:648)）
- `.teaching-control select { max-width: 140px }`（[index.css:118](../src/styles/index.css:118)）

結果是**內容需求膨脹約 1.25 倍、容器完全沒變**，等於每個尺寸帶都「短了一級」。
整個版面的固有寬度需求被推到約 **1700 CSS px**。

**這就是使用者「系統 150% 很怪、瀏覽器縮到 75% 才正常」的完整解釋**（見 §1.3）。

### 1.3 關於顯示縮放的關鍵澄清（推翻常見說法）

使用者問：「是因為每個項目都用像素設計導致的？能完全改成比例來避免嗎？」

**答：不是，而且改成 rem／比例單位本身一行都不會改善。**

依 [MDN devicePixelRatio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio)：
作業系統層級的顯示縮放**不會改變 `1rem` 的意義**（root font-size 在瀏覽器裡仍是 16 CSS px）。
它改變的是 `devicePixelRatio` 與 **CSS 像素視窗寬**：

| 使用者環境 | 實體解析度 | 系統縮放 | 瀏覽器縮放 | **實際 CSS px 視窗寬** |
|---|---|---|---|---|
| 使用者預設（回報為「很怪」） | 1920 | 150% | 100% | **1280** |
| 使用者手動調整（回報為「比較正常」） | 1920 | 150% | 75% | **≈1706** |

把 px 全部換成 rem，在這兩種情境下算出來的結果**完全一樣**（因為 root font-size 兩邊都是 16px）。
真正成立的因果是：**版面的固有寬度需求 ≈1700，而使用者平常只有 1280**。

> **對使用者的直接回答**：不需要你自行調整適應，也不是換單位就能解決。要修的是把固有寬度需求
> 壓回 1280 以下（RC-A 的倍率回退 + RC-B 的軌道重排）。單位制度的改造（§4.1 的 `--ui-scale`）
> 的價值不在於「自動適應 DPI」，而在於**日後調整字級時只有一個旋鈕，不會再發生這次
> 「字級改了、容器沒改」的脫鉤**。

### 1.4 RC-B — 用視窗寬決定元件版面 + 剛性軌道分配

三處具體缺陷：

**(a) Header：單列剛性 grid，唯一可壓縮的軌道正好是主導覽。**
[index.css:89](../src/styles/index.css:89) `grid-template-columns: auto minmax(0, 1fr) auto auto auto`，
其中 `minmax(0, 1fr)` 是 `.workspace-tabs`，其餘四項（brand／講解控制／播放／設定）都是 `auto` 且內部
`white-space: nowrap`，**完全不可壓縮**。配合 `.workspace-tabs { overflow-x: auto }`，空間不足時
被截掉的必定是分頁。

1280 寬的推算（放大後字級）：

| 軌道 | 推算寬 |
|---|---|
| brand「Dialogue Is Teacher」22.5px nowrap | ≈210 |
| teaching-control（標籤＋select 140＋toggle＋batch select 132＋按鈕＋cache-status＋清除） | ≈520 |
| replay-control（3 按鈕） | ≈150 |
| settings 按鈕 | ≈130 |
| gap 4×12 | 48 |
| **剩給 workspace-tabs** | **≈222** |
| 三分頁需求（zh：總覽／閱讀／子代理，18px） | ≈234 → **溢位** |
| 三分頁需求（en：Overview／Reading／Subagents） | ≈300 → **嚴重溢位** |

**這同時解釋 ACC §13**：切 English 後「header 排版完全跑掉」不是 i18n 缺陷、也不是漏用通用層，
而是英文字串較長，把本來就已經吃緊的剛性版面推爆。**這是排版缺陷，不是翻譯缺陷。**
（旁證：匯出的 HTML 快照顯示正常——快照模式下 `teaching-control` 整組不渲染，
[Header.tsx:87](../src/components/Header.tsx:87)，header 剛好夠寬。這反過來證明擁擠源自講解控制。）

**(b) Sidebar：下限 280px 在窄容器等於霸佔。** 740 寬時 `24vw = 177.6` 被 `clamp` 下限拉回 **280px = 38%**。

**(c) Reader：用靜態 padding 幫一個浮動元件預留整欄。**
`.dense-scroll.reader-with-minimap { padding-right: 196px; padding-bottom: 132px }` ——
為了一個 176×112 的浮動 minimap，在版面中**永久挖掉一整條 196px 的欄位**。使用者的評語
「本末倒置」在架構上完全正確：防重疊被實作成了版面分配。

**(a)(b)(c) 合流 → 症狀 2「逐字換行」的完整算式**（740 寬、閱讀頁、minimap 開啟）：

```
740  − 280 (sidebar 下限)
     −  80 (main-content padding 30/40)
     − 164 (minimap 讓位槽，720–899 帶)
     =  216  內容欄
     −  24 (layer-card padding 20+4)
     = 192
     − 130 (layer-title padding-right，為絕對定位的 badges 讓位)
     =  62 px  ← 標題文字可用寬，字級 21.25px
```

62px 放不下兩個中文字。而 `.layer-title .title-text { overflow-wrap: anywhere }`
（[index.css:653](../src/styles/index.css:653)）允許在**任意字元間**斷行，
於是 min-content 寬退化成 1 個字元 → grid 軌道可以一路縮到一個字母寬 →
**「一個 alphabet 一個 alphabet 展現」**。

> `overflow-wrap: anywhere` 與 `break-word` 的差別正是本症狀的技術核心：
> `anywhere` 會把容器的 min-content 寬算成 1 字元，因此**允許**版面把容器壓到無法閱讀；
> `break-word` 的 min-content 是最長單字寬，容器壓不下去時會產生可見的溢位（一個會被抓到的錯誤），
> 而不是安靜地降級成逐字。**目前的寫法讓版面失效以「看似正常」的方式發生**，這正是它通過了
> 「無文件級水平溢位」驗收卻依然不可讀的原因。

**(d) 斷點重複層已經實際漂移。** `@container dit-app` 的每一條規則都被複製了一份 `@media`
（[index.css:820-949](../src/styles/index.css:820)，約 220 行）。兩份已經不同步：
`@media (min-width:720px) and (max-width:899px)` 有 `.session-map-dialog { width: 92vw; height: 88dvh }`
（[index.css:915](../src/styles/index.css:915)），而對應的 `@container` 區塊
（[index.css:933](../src/styles/index.css:933)）**沒有這條**。這不是假想風險，是已發生的事實。

### 1.5 RC-C — 持久衍生狀態被當成瞬時事件通知

[sessionStore.ts:249-255](../src/store/sessionStore.ts:249)：每次 session 發布都會從 IndexedDB
重讀快取並把 `restoredAnnotationCount` 設成命中筆數。Header
（[Header.tsx:116](../src/components/Header.tsx:116)）用它渲染「已還原 n 則」。

**因此 Ctrl+R 之後它一定還在，而且數字一模一樣——它不是「沒被刷新掉」，它是被正確重算了。**
缺陷在語意層：「快取裡有 n 筆」是**持久衍生狀態**，「這次載入從快取取回了 n 筆」是**瞬時事件**，
兩者被同一個值渲染成同一個元件，於是這個提示沒有任何結束條件。

附帶缺陷：文案「已還原 n 則」未說明還原的是什麼、從哪來、有什麼好處。使用者原話：
「我自己看都不知道快取還原到底在幹嘛」。

### 1.6 RC-D — 原生 select 未預留箭頭空間

`.teaching-control select { max-width: 140px }` + `select { padding: 5px 9px }`（左右對稱、
右側未預留箭頭寬）+ 字級被 RC-A 放大到 15.625px + 選項文案長
（`本地 Ollama（離線）`、`OpenCode Cloud AI（需外傳）`，[locales.ts:353](../src/i18n/locales.ts:353)）。
原生 `<select>` 關閉態不支援 `text-overflow: ellipsis`，超出就直接壓到箭頭底下。
「不講解（純結構，零外傳）」較短所以看起來沒事——這解釋了為何只有非「不講解」會重疊。

### 1.7 RC-E — 快照守門散落在呼叫端

`Header` 有 `!snapshotMode &&` 守門，`OverviewView` 沒有——它在
[OverviewView.tsx:32](../src/components/OverviewView.tsx:32) 與 :84 無條件渲染 `<SessionLoadActions />`。
缺陷在於守門責任放在**每一個呼叫端**，只要漏一處就破功。

---

## 2. 決策紀錄（Decision Register）

| 編號 | 決策 | 狀態 | 決策者 | 日期 |
|---|---|---|---|---|
| D-R65-01 | 「講解來源」採**短標籤＋沿用既有 Disclaimer 說明列**；不引入自訂 listbox、不加新依賴 | approved | 使用者 | 2026-07-22 |
| D-R65-02 | Header 重排＝**講解控制整組移入設定匣**；header 只留 品牌／分頁／播放／設定 | approved | 使用者 | 2026-07-22 |
| D-R65-03 | Sidebar 圖例改為**預設收合的摺疊區**（留在 sidebar，不外移） | approved | 使用者 | 2026-07-22 |
| D-R65-04 | 還原提示：**留在 header 原位置**、文案重寫到自我解釋、**加叉叉可隱藏**；另把「快取幾筆」的持久狀態分離到設定匣 | approved | 使用者 | 2026-07-22 |
| D-R65-05 | 是否對使用者開放「文字大小 小／中／大」設定（`--ui-scale` 的 UI 入口） | **pending** | 使用者 | — |
| D-R65-06 | 390 窄版是否恢復顯示 minimap（目前 `display:none`） | **pending** | 使用者 | — |

> **D-R65-05／06 為 pending，不得出現在任何施工卡片內。**
> 主模型建議：D-R65-05 **不做**（核心痛點是倍率選錯，不是缺少調節器；`--ui-scale` 架構讓它日後一行可加，
> 符合「不要為了做而做」）；D-R65-06 **不做**（本輪範圍是修缺陷，不是加能力）。

---

## 3. 不變量（LS-INV）

| 編號 | 不變量 |
|---|---|
| **LS-INV-1** | 全站字級一律由 `:root` 的 `--ui-scale` 與 `--fs-*` token 導出。**禁止**任何形式的「檔尾扁平絕對 px 覆蓋區塊」。字級調整只能改 token 值。 |
| **LS-INV-2** | 主導覽（總覽／閱讀／子代理）在任何寬度、任何語言下都必須**完整可見且可直接點擊**，不得需要水平捲動才能觸及。版面空間分配中，主導覽的優先權高於所有講解／設定類控制。 |
| **LS-INV-3** | 任何顯示自然語言長文的容器，內容欄寬不得小於 `--measure-min`（32ch）。無法滿足時必須**改變版面**（收 sidebar／收 minimap／切窄版排法），**不得**讓文字以逐字斷行降級。自然語言容器一律 `overflow-wrap: break-word`；`anywhere` 僅限機器文字（路徑、URL、`.io-body`、`code`）。 |
| **LS-INV-4** | 浮動於閱讀區之上的元件（minimap、map launcher）只能遮蔽角落，**不得**以 padding／margin 在版面中預留等寬欄位。防重疊改由「捲動區末端的 padding-bottom／scroll-margin」與角落定位達成。 |
| **LS-INV-5** | 元件版面決策一律以 `@container` 針對**自身可用寬度**判定。`@media` 僅保留給真正的頁面級決策（如列印、`prefers-reduced-motion`）。**禁止**為同一決策同時維護 `@container` 與 `@media` 兩份規則。 |
| **LS-INV-6** | 持久衍生狀態與瞬時事件通知不得共用同一個 store 欄位或同一個 UI 元件。事件通知必須具備明確的結束條件（可關閉／session 切換即清除）。 |
| **LS-INV-7** | `snapshotMode` 下不應存在的入口，其守門必須實作在**元件自身**（自我判定後 `return null`），呼叫端不得各自判斷。 |
| **LS-INV-8** | 驗收必須在**使用者的真實預設環境**（系統縮放 150%、瀏覽器縮放 100%、即 1280 CSS px）執行，並涵蓋 zh-TW 與 English 兩種語言。devtools 尺寸模擬只能作為補充，不能取代。 |

---

## 4. 技術方案

### 4.1 尺度 token（LS-INV-1）

於 `:root` 建立單一比例階梯，取代檔尾覆蓋區塊：

```css
:root {
  --ui-scale: 1;                                  /* 唯一旋鈕；1 = R5 GN-09 之前的倍率 */
  --fs-base: calc(15px * var(--ui-scale));        /* body */
  --fs-3xs: calc(9.5px  * var(--ui-scale));
  --fs-2xs: calc(10.5px * var(--ui-scale));
  --fs-xs:  calc(11px   * var(--ui-scale));
  --fs-sm:  calc(12.5px * var(--ui-scale));
  --fs-md:  calc(14px   * var(--ui-scale));
  --fs-lg:  calc(17px   * var(--ui-scale));
  --fs-xl:  calc(19px   * var(--ui-scale));
  --fs-2xl: calc(22px   * var(--ui-scale));
}
```

基準值取自 [index.css:1-950](../src/styles/index.css:1) 主體區塊**現有的原始值**（即 GN-09 覆蓋之前的值）。
施工方式＝刪除 951–995 覆蓋區塊、主體區塊的字級改引用 token。刪除後全站字級即回到 GN-09 之前，
滿足 ACC §15 使用者要求「全部調回之前的倍率」。

**自證機制**：把 `--ui-scale` 改成 `1.25` 必須能重現 GN-09 的外觀。這是 LS-INV-1 是否真的成立的檢驗。

### 4.2 Header 版面（D-R65-02，LS-INV-2）

```
grid-template-columns: auto auto max-content 1fr auto auto;
                       │    │    │          │   │    └ 設定
                       │    │    │          │   └ 播放控制
                       │    │    │          └ 彈性空白（唯一可壓縮者）
                       │    │    └ 分頁（max-content，不可壓縮）
                       │    └ 結構抽屜鈕（僅窄版）
                       └ 品牌
```

- `.workspace-tabs` 改 `flex: 0 0 auto; overflow: visible;`（移除 `overflow-x: auto`）——
  分頁不再是壓縮的受害者。
- `.teaching-control` 整組（provider select／顯示講解 toggle／批次講解／清除講解／還原提示除外）
  移入 settings tray 新增的 `講解` fieldset。
- 品牌在容器 < 1000px 時切 `.brand-short`（目前只在 < 720px 切）。
- **還原提示留在 header**（D-R65-04），改為獨立的可關閉元件，不再屬於 teaching-control。

### 4.3 Reader 版面與 minimap（LS-INV-4，回報 4／5）

```css
:root { --minimap-w: 264px; --minimap-h: 168px; }   /* 176×112 的 1.5× */
.reader-minimap { width: var(--minimap-w); height: var(--minimap-h); }

/* LS-INV-4：不再預留欄位，只在捲動區末端留出角落高度 */
.dense-scroll.reader-with-minimap { padding-right: 0; scroll-padding-right: 0; }
.dense-scroll.reader-with-minimap > .info-box { padding-bottom: calc(var(--minimap-h) + 24px); }
```

`ReaderMinimap.tsx` 的 `WIDTH`／`HEIGHT` 常數是 **viewBox 座標系**，配合
`preserveAspectRatio="none"`（[ReaderMinimap.tsx:94](../src/components/ReaderMinimap.tsx:94)）
會自動填滿 CSS 尺寸，**不需要改**。唯一需要改的是 `BUCKETS`：原註解言明「一桶約 4px」
（[ReaderMinimap.tsx:17](../src/components/ReaderMinimap.tsx:17)），寬度 ×1.5 後應由 `38` 提到 `57`
以維持設計意圖。

閱讀欄寬效果（1280 寬推算）：`1280 − 256(新 sidebar) − 80 = 944`，較目前的 697 增加 **+35%**。

### 4.4 Sidebar（D-R65-03，回報 7／8）

- `.sidebar { width: clamp(220px, 20cqw, 320px) }`（`cqw` 對 `dit-app` 容器；1280 → 256px = 20%）。
- `StructureLegend` 改為 `<details>`（預設 `open=false`），summary 一行「符號說明」。
- `.structure-position` 併入 `.structure-heading` 同列，省一個區塊。
- `.session-meta` 的 `word-break: break-all` 依 LS-INV-3 改 `break-word`。

靜態區高度目標：1280×720 下 ≤120px（目前推算 ≈260px），樹狀節點可見列數 ≥11。

### 4.5 還原提示（D-R65-04，LS-INV-6）

store 拆成兩個欄位（`restoredAnnotationCount` 移除）：

| 欄位 | 性質 | 生命週期 | 呈現位置 |
|---|---|---|---|
| `cachedAnnotationCount: number` | 持久衍生 | 每次 session 發布重算 | 設定匣「講解」fieldset 常駐一行 |
| `restoreNotice: { count: number } \| null` | 瞬時事件 | 本次載入首次還原且 count>0 時設定；`dismissRestoreNotice()` 或切換 session 時清為 `null` | header 原位置，帶 × |

文案重寫（自我解釋，回應使用者「我自己看都不知道在幹嘛」）：

| locale | 文案 |
|---|---|
| zh-TW | `已從本機快取取回 {n} 則先前產生的講解，這次不用重新呼叫 AI` |
| en | `Restored {n} previously generated notes from local cache — no AI call needed` |

### 4.6 講解來源標籤（D-R65-01，RC-D）

| ProviderId | 現行 zh | **新 zh** | 現行 en | **新 en** |
|---|---|---|---|---|
| `none` | 不講解（純結構，零外傳） | **不講解** | No notes (structure only, zero egress) | **No notes** |
| `ollama` | 本地 Ollama（離線） | **本地 AI** | Local Ollama (offline) | **Local AI** |
| `cloud` | OpenCode Cloud AI（需外傳） | **雲端 AI** | OpenCode Cloud AI (sends data out) | **Cloud AI** |

完整語意（含「零外傳」「需外傳」等**隱私關鍵資訊**）由既有的 `providerDisclaimer` 承擔——
`Disclaimer` 元件本來就會顯示整句，且以左規顏色區分責任層級
（[index.css:174-185](../src/styles/index.css:174)）。**資訊沒有遺失，只是移到更顯眼、更完整的位置。**

配套：`select` 右側 padding 至少 `2rem` 預留箭頭，`max-width` 改用 `ch` 單位隨字級走。

### 4.7 斷點層（LS-INV-5）

移除 [index.css:867-912](../src/styles/index.css:867) 與 :1009-1014 的 `@media` 重複層（約 220 行）。
Container query size 自 2023 起已 Baseline（Chrome 105+／Firefox 110+／Safari 16+），
且 `.app-shell` 已宣告 `container-type: inline-size; container-name: dit-app`
（[index.css:69](../src/styles/index.css:69)），`@container dit-app` 必定生效。

移除前必須把 `@media` 版本獨有的規則（已知：`.session-map-dialog { width:92vw; height:88dvh }`）
補回 `@container` 版本——這條漏補會造成 Map dialog 在 740–899 帶尺寸回歸。

---

## 5. 施工卡片

> 卡片順序即施工順序。**M0 是硬性前置**：本文件 §1 的所有寬度數字都是**推算**，不是量測。
> 未完成 M0 就進 M1 的 PR 一律退回。

### M0 — 量測基線（不改任何 production code）

#### LS-00 — 建立量測基線
- **檔案**：`docs/R6.5_BASELINE_<date>.md`（新檔）、`.tmp/`（量測腳本，Git 忽略）
- **做什麼**：`npm.cmd run build && npm.cmd run preview`，在 **390 / 740 / 1280 / 1706** 四個 CSS 寬度 ×
  **zh-TW / English** 兩語言 × **總覽／閱讀／子代理** 三頁，記錄：
  (a) `.workspace-tabs` 的 `scrollWidth` vs `clientWidth`（>0 差值即 LS-INV-2 違反）；
  (b) `.layer-title .title-text` 的 `getBoundingClientRect().width`（<32ch 即 LS-INV-3 違反）；
  (c) `.sidebar` 寬度佔 `.app-shell` 比例；
  (d) `.sidebar-static` 高度佔 `.sidebar` 比例；
  (e) `.dense-scroll` 的 `clientWidth`。
- **錯誤路徑**：任一數字與 §1 推算差距 >20% → **停止施工，回報使用者修訂根因分析**，不得逕自調整方案。
- **回滾**：不涉及 production code。
- **測試對應**：無（量測活動）。
- **驗收證據**：基線文件內含 24 組（4×2×3）數字表。

### M1 — 尺度系統

#### LS-01 — 尺度 token 化與倍率回退（RC-A，LS-INV-1）
- **檔案**：`src/styles/index.css`
- **契約**：§4.1 的 `--ui-scale` + `--fs-*` 階梯。
- **做什麼**：(1) 刪除 951–995 覆蓋區塊；(2) `:root` 加入 token；(3) 主體區塊字級改引用 token。
- **錯誤路徑**：不適用（純樣式）。
- **遷移／回滾**：單檔、單一 commit，`git revert` 即完全回滾。
- **測試對應**：UNIT 無（純 CSS）。SIT：`npm.cmd test` 131 項不得回歸。UAT：§7 項 1、2。
- **驗收證據**：把 `--ui-scale` 暫改 `1.25` 的截圖須與 R5 GN-09 版外觀一致（證明旋鈕成立），
  改回 `1` 後再截一次。

#### LS-02 — 移除 `@media` 重複層（LS-INV-5）
- **檔案**：`src/styles/index.css`
- **做什麼**：先把 `@media` 獨有規則補進 `@container`（已知一條，施工時須逐條 diff 比對兩區塊），
  再刪除 867–912 與 1009–1014。
- **錯誤路徑**：不適用。
- **遷移／回滾**：`git revert`。
- **測試對應**：SIT 全量測試。UAT：§7 項 8（Map dialog 在 740 帶的尺寸）。
- **驗收證據**：施工前後的 `@container` 規則清單 diff，須證明兩區塊規則集合相等後才刪。

### M2 — 版面重排

#### LS-03 — Header 重排：講解控制移入設定匣（D-R65-02，LS-INV-2）
- **檔案**：`src/components/Header.tsx`、`src/styles/index.css`、`src/i18n/locales.ts`
- **契約**：§4.2 的 grid 軌道定義。settings tray 新增 `講解 / Notes` fieldset，
  順序置於既有 `session` 之後、`language` 之前。
- **做什麼**：teaching-control 的 provider select／showAnnotations toggle／batch-control／
  clearAnnotations 按鈕移入新 fieldset；`.workspace-tabs` 改 `flex: 0 0 auto; overflow: visible`；
  header grid 改 6 軌；brand-short 切換點提到容器 <1000px。
- **錯誤路徑**：`snapshotMode` 下新 fieldset 整組不渲染（沿用 Header 既有的 `!snapshotMode` 守門）。
- **遷移／回滾**：純 UI 位置搬移，無資料遷移。回滾＝revert 單一 commit。
- **測試對應**：UNIT 新增 `src/components/Header.test.tsx`——斷言 header 元素內不含 provider select，
  且 settings tray 展開後含之。SIT：全量。UAT：§7 項 3、4。
- **驗收證據**：390／740／1280／1706 × zh／en 共 8 張 header 截圖，三個分頁完整可見；
  `.workspace-tabs` 的 `scrollWidth === clientWidth`。

#### LS-04 — 講解來源短標籤（D-R65-01，RC-D）
- **檔案**：`src/i18n/locales.ts`、`src/styles/index.css`
- **契約**：§4.6 的六個字串。`select` 右 padding ≥2rem，`max-width` 改 `ch`。
- **做什麼**：改 `provider.{none,ollama,cloud}` 兩語言共六字串；調整 select 樣式。
  **`providerDisclaimer` 全句不得縮短**——隱私語意由它承擔。
- **錯誤路徑**：不適用。
- **遷移／回滾**：revert。
- **測試對應**：UNIT 新增斷言：`provider` 三個標籤在兩語言下長度皆 ≤10 字元（防未來有人改回長句）。
  UAT：§7 項 5。
- **驗收證據**：三種 provider 各截一張，文字不觸及箭頭。

#### LS-05 — Reader 版面與 minimap 放大（LS-INV-4，回報 4／5）
- **檔案**：`src/styles/index.css`、`src/components/ReaderMinimap.tsx`
- **契約**：§4.3。`--minimap-w: 264px; --minimap-h: 168px`；720–899 帶 `216px / 144px`。
- **做什麼**：移除 `.dense-scroll.reader-with-minimap` 的 `padding-right`／`scroll-padding-right`；
  `padding-bottom` 改掛到 `.info-box`；minimap 尺寸改 token；`BUCKETS` 38 → 57。
- **錯誤路徑**：minimap 在 `viewItems.length === 0` 時既有的 `return null` 行為不變。
- **遷移／回滾**：revert。
- **測試對應**：SIT：GN-07／GN-09 效能上限（Reader 封閉 DOM ≤250）不得回歸——
  欄寬變大會使每張卡變矮、可見卡片數上升，**必須重跑 `npm.cmd run benchmark:r5`**。
  UAT：§7 項 6、7。
- **驗收證據**：benchmark 輸出須維持 `18 passed / 0 failed`；1280 下 `.dense-scroll` clientWidth ≥900。

#### LS-06 — Sidebar 重排（D-R65-03，回報 7／8）
- **檔案**：`src/styles/index.css`、`src/components/StructureLegend.tsx`、`src/components/Sidebar.tsx`
- **契約**：§4.4。`.sidebar { width: clamp(220px, 20cqw, 320px) }`；圖例 `<details>` 預設收合。
- **做什麼**：sidebar 寬度改 `cqw`；`StructureLegend` 改 `<details>`；`.structure-position` 併入 heading 列。
- **錯誤路徑**：`<details>` 的開合狀態**不需**持久化（不進 store，避免新增狀態機）；
  drawer 變體與 desktop 變體共用同一元件，收合狀態各自獨立即可。
- **遷移／回滾**：revert。
- **測試對應**：UNIT 新增 `StructureLegend.test.tsx`——斷言預設 `open` 為 false 且 summary 可見。
  SA-INV-5（圖例由渲染同源常數導出）**不得失守**：仍讀 `SPAN_DOT`／`SPAN_LEGEND_ORDER`。
  UAT：§7 項 9。
- **驗收證據**：1280×720 下 `.sidebar-static` 高度 ≤120px，樹狀可見列 ≥11。

#### LS-07 — 最小行長防護（LS-INV-3，回報 2）
- **檔案**：`src/styles/index.css`
- **契約**：`:root { --measure-min: 32ch }`。自然語言容器一律 `overflow-wrap: break-word`；
  `anywhere` 僅保留於 `.io-body`、`code`、`.flow`、`.session-meta` 等機器文字。
- **做什麼**：(1) 依下表改判全部 11 處 `overflow-wrap: anywhere`／`word-break: break-all`；
  (2) `.layer-title` 的 `padding-right: 130px` 改為 grid 兩軌（標題／badges）；
  (3) 新增 `@container` 規則：容器 <520px 時 badges 落到標題下一列、`.layer-title` 不留右側 padding。

  **11 處逐一裁定**（★＝症狀 2 的直接肇因）：

  | 行 | 選擇器 | 內容性質 | 裁定 |
  |---|---|---|---|
  | 214 | `.ol-cmd code` | 機器（shell 指令） | 保留 `anywhere` |
  | 372 | `.map-legend` | 自然語言 | → `break-word` |
  | 462 | `.overview-steps p` | 自然語言 | → `break-word` |
  | 471 | `.overview-legend-list li` | 自然語言 | → `break-word` |
  | 521 | `.session-meta` | 機器（session id／路徑） | `word-break: break-all` → `overflow-wrap: anywhere`（break-all 會連中文都亂斷） |
  | 531 | `.tree-legend-item` | 自然語言 | → `break-word` |
  | 653 | `.layer-title .title-text` ★ | 自然語言 | → `break-word` |
  | 655 | `.layer-desc` ★ | 自然語言 | → `break-word` |
  | 663 | `.thinking-body` | 自然語言 | → `break-word` |
  | 677 | `.io-body` | 機器（工具輸出） | 保留 `anywhere` |
  | 703 | `.flow` | 機器（資料流字串） | 保留 `anywhere` |
- **錯誤路徑**：極長無空白字串（檔案路徑、base64）落在自然語言容器時會產生溢位——
  這是**刻意的**：依 LS-INV-3，溢位是可被驗收抓到的錯誤，逐字降級不是。若實測發現常態性溢位，
  代表該容器其實是機器文字，改列入 `anywhere` 白名單並記錄。
- **遷移／回滾**：revert。
- **測試對應**：UAT：§7 項 10（本輪最關鍵的一項）。
- **驗收證據**：390／740／1280／1706 × zh／en，`.title-text` 與 `.layer-desc` 的
  `getBoundingClientRect().width` 皆 ≥32ch 對應像素值。

#### LS-08 — 移除窄版 drawer trigger 的「位置」（ACC §4）
- **檔案**：`src/components/Header.tsx`、`src/styles/index.css`
- **做什麼**：移除 `.structure-trigger-position` span 與其樣式。
- **錯誤路徑**：390 窄版沒有 minimap，位置資訊改由**打開 drawer 後 sidebar 內的
  `.structure-position` 承擔**（該元素已存在，[Sidebar.tsx:87](../src/components/Sidebar.tsx:87)）。
  位置資訊並未消失，只是不再擠壓「結構」按鈕。
- **遷移／回滾**：revert。
- **測試對應**：UAT：§7 項 11。
- **驗收證據**：390 下「結構」按鈕文字完整不截斷。

### M3 — 狀態語意與守門

#### LS-09 — 還原提示語意與生命週期（D-R65-04，LS-INV-6）
- **檔案**：`src/store/sessionStore.ts`、`src/components/Header.tsx`、`src/i18n/locales.ts`、
  `src/styles/index.css`
- **契約**：§4.5 的兩欄位表與文案表。新增 action `dismissRestoreNotice(): void`。
- **做什麼**：移除 `restoredAnnotationCount`；新增 `cachedAnnotationCount` 與 `restoreNotice`；
  header 渲染可關閉的 `restoreNotice`；設定匣「講解」fieldset 常駐顯示 `cachedAnnotationCount`。
- **錯誤路徑**：IndexedDB 還原失敗時既有的 `storageNotice` 路徑不變
  （[sessionStore.ts:257-260](../src/store/sessionStore.ts:257)）；`snapshotMode` 下不做還原
  （EX-INV-4），故 `restoreNotice` 恆為 `null`，不需額外守門。
- **遷移／回滾**：store 欄位改名屬**破壞性介面變更**——`restoredAnnotationCount` 的所有引用
  （目前僅 Header 一處）必須同 commit 改完，typecheck 會擋住漏改。回滾＝revert 單一 commit。
- **測試對應**：UNIT 於 `src/store/sessionStore.test.ts` 新增三案例：
  (a) 還原命中 >0 → `restoreNotice.count` 正確且 `cachedAnnotationCount` 相符；
  (b) `dismissRestoreNotice()` 後 `restoreNotice === null` 而 `cachedAnnotationCount` 不變；
  (c) 重新 publish session 後 `restoreNotice` 重置。UAT：§7 項 12。
- **驗收證據**：講解後 Ctrl+R，提示出現一次、按 × 後消失；再 Ctrl+R 會再出現一次（符合
  「這次載入從快取取回」的語意），設定匣的常駐數字始終正確。

#### LS-10 — 快照守門單點化（LS-INV-7，ACC §19）
- **檔案**：`src/components/SessionLoadActions.tsx`、`src/components/OverviewView.tsx`、
  `src/components/Header.tsx`
- **做什麼**：`SessionLoadActions` 自身讀 `snapshotMode` 並 `return null`；移除 `OverviewView`
  與 `Header` 呼叫端的各自判斷。Overview 在快照模式下對應的 CTA 文案改為不引用載入動作
  （避免出現指向不存在按鈕的死文案，SA-INV-3）。
- **錯誤路徑**：快照模式下 Overview 的主 CTA 改為「開始逐步瀏覽」。
- **遷移／回滾**：revert。
- **測試對應**：UNIT 新增 `SessionLoadActions.test.tsx`——`snapshotMode: true` 時 render 結果為空。
  UAT：§7 項 13。
- **驗收證據**：重新 build 快照、關閉所有 server、`file://` 開啟，Overview 無任何載入入口。

### M4 — 文件與帳本

#### LS-11 — 文件、驗收單與帳本
- **檔案**：`docs/ACCEPTANCE.md`（新增 §20 R6.5 UAT 段）、`docs/PROGRESS.md`、本文件（狀態改已簽核）
- **做什麼**：把 §7 清單寫入 ACCEPTANCE §20；PROGRESS 補 R6.5 段落；ACC §1／§4／§13／§15／§19 的
  「有問題」標記改為指向 §20。
- **測試對應**：無。
- **驗收證據**：`git diff --check` exit 0。

---

## 6. 驗收層級

| 層級 | 範圍 | 通過條件 |
|---|---|---|
| UNIT | `sessionStore`（3 新案例）、`Header`（新檔）、`StructureLegend`（新檔）、`SessionLoadActions`（新檔）、locales 標籤長度 | `npm.cmd test` 全綠，且既有 131 項零回歸 |
| SIT | `npm.cmd run typecheck`、`npm.cmd run build`（含快照 target）、`npm.cmd run benchmark:r5`、`git diff --check` | 全部 exit 0；benchmark `18 passed / 0 failed` |
| UAT | §7，由使用者在真實環境執行 | 全項通過 |

**LS-INV-8 的執行細則**：UAT 主場景是**系統縮放 150%、瀏覽器縮放 100%（＝1280 CSS px）**，
即使用者的日常環境。1706（瀏覽器 75%）、740、390 為補充場景。
**R5 那輪的驗收之所以放行了這些缺陷，正是因為只在 devtools 模擬尺寸下驗過。**

---

## 7. 使用者 UAT 清單（R6.5，草案）

前置：`npm.cmd run build`、`npm.cmd run preview -- --host 127.0.0.1 --port 4173`，
**瀏覽器縮放保持 100%**（不要為了好看而縮放——那正是要驗的東西）。

1. 字級回到 R5 GN-09 之前的大小；全站無文字互相覆蓋。
2. 1280（你的預設環境）下整體版面不再有「東西太大、擠成一團」的感覺，不需要縮到 75% 才能用。
3. 總覽／閱讀／子代理三個分頁在 390／740／1280 都**完整可見**，不需要橫向拖動才點得到。
4. 切換到 English 後，header 三個分頁仍完整可見、版面不錯亂（與 zh-TW 只有文字不同）。
5. 「講解來源」改到設定匣，三個選項（不講解／本地 AI／雲端 AI）文字都不與箭頭重疊；
   下方說明列仍完整顯示「零外傳／需外傳」等隱私語意。
6. 閱讀區明顯變寬，右側不再有一整條空白；minimap 只遮住右下角，不擋到閱讀中的卡片。
7. minimap 比之前大約 1.5 倍，內容仍可辨識；點它仍只開 Session 地圖，不直接跳轉。
8. 740 寬開啟 Session 地圖，dialog 尺寸與 R5 一致（不是全螢幕、不是過小）。
9. Sidebar 變窄（約佔 20%）；圖例預設收合成一行「符號說明」，點開才展開；
   樹狀節點區至少看得到 11 列。
10. **（本輪最關鍵）** 390／740／1280／1706 四個寬度 × zh／en，任何一段文字都**不會**出現
    「一個字母一行」或「一個中文字一行」的情況。若寬度真的不夠，應該是版面換排法或出現可見溢位，
    而不是文字降級。
11. 390 下 header 的「結構」按鈕文字完整、不被「位置」擠掉；打開 drawer 後在 sidebar 內仍看得到位置。
12. 講解任一項目後 Ctrl+R：出現一則**看得懂**的提示（說明從本機快取取回幾則、這次不用再呼叫 AI），
    按 × 後消失；設定匣「講解」區塊常駐顯示快取筆數。再 Ctrl+R 提示會再出現一次（這是正確的）。
13. 重新匯出 HTML 快照 → 關閉所有 server → `file://` 開啟：總覽頁**看不到也點不到**
    「載入 Session」「載入 .jsonl」。
14. 既有能力零回歸：載入／取消、M 快捷鍵、Map Jump、cluster 不可跳、Privacy Review、
    Ollama 連線、逐步瀏覽、子代理排序與連結。

---

## 8. 交接

### 8.1 待使用者回答的開放問題

1. **D-R65-05**：要不要在設定匣開放「文字大小 小／中／大」？主模型建議**不做**（見 §2 註）。
2. **D-R65-06**：390 窄版要不要恢復 minimap？主模型建議**不做**。
3. **§1.2 的推算數字**：本文件所有寬度算式皆為**推算**，M0 的量測若與推算差 >20%，
   代表根因分析需要修訂——屆時會回報而非逕自調整。

### 8.2 本文件的完整度自評

- **build-ready**：LS-00～LS-11 全部具備「檔案／契約／做什麼／錯誤路徑／遷移回滾／測試對應／驗收證據」七項。
- **未達 build-ready 者**：無。LS-07 的 11 處 `overflow-wrap` 已逐一裁定，不留施工期判斷。
- **已知薄弱處**：§1 所有寬度算式為推算而非量測（M0 即為此設）；LS-02 刪除 `@media` 重複層前需要一次
  人工 diff 比對兩區塊規則集合，本文件只點名了已知的一條差異（`.session-map-dialog`），
  不保證是唯一一條——LS-02 的驗收證據要求施工方提出完整 diff。

### 8.3 下一步

本文件簽核後即可施工。建議在 M0 完成、M1 開工前做一次 workflow-checkpoint。
