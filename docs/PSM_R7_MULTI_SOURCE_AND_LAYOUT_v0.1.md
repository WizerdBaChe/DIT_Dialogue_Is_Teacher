# PSM — R7 多來源接入 ＋ 版面收尾 v0.1

日期：2026-07-22

狀態：**Part A（R7A-00～07）已施工完成，2026-07-23 於分支 `feat/r7-layout-multisource`，
待使用者於 [ACCEPTANCE.md §21](ACCEPTANCE.md) 完成 UAT**；Part B build-ready，待 Part A UAT
通過後開工（D-R7-01～09 已於 2026-07-22 由使用者裁定）。

定位：本文件是 R7 輪的**唯一施工依據**（sole-source），涵蓋兩個爆炸半徑互不重疊的部分：

| 部分 | 範圍 | 爆炸半徑 | 可否獨立回滾 |
|---|---|---|---|
| **Part A — 版面收尾** | 2026-07-22 使用者 R6.5 UAT 後追加回報的四項 | 前端樣式／呈現層 | 可，與 Part B 無共用檔案交集除 `locales.ts` |
| **Part B — 多來源接入** | `SourceAdapter` accumulator、寬容收納、標題 fallback、Codex adapter | ingest／normalize 層 | 可 |

施工順序 **Part A → Part B**。Part A 是已驗收版面的收尾，先落地可讓 Part B 的 UAT 站在穩定版面上。

繼承且不得失守：[PSM_R5_GUIDED_NAVIGATION_v1.0.md](PSM_R5_GUIDED_NAVIGATION_v1.0.md) §11、
[PSM_R5.5_SEMANTIC_ALIGNMENT_v0.1.md](PSM_R5.5_SEMANTIC_ALIGNMENT_v0.1.md) SA-INV-1～5、
[PSM_R6_EXPORT_v0.1.md](PSM_R6_EXPORT_v0.1.md) EX-INV-1～4、
[PSM_R6.5_LAYOUT_SCALE_REMEDIATION_v0.1.md](PSM_R6.5_LAYOUT_SCALE_REMEDIATION_v0.1.md) LS-INV-1～8。
本輪新增規範以 **R7-INV** 編號。

> **本輪 Part A 的性質**：四個症狀中有 **兩個是 R6.5 自己造成的新缺陷**（RC-G、RC-I 的前置條件），
> 一個是 R6.5 修了三處卻漏掉第四處的同族復發（RC-F）。這不是「R6.5 沒做好」的補丁，而是
> **既有不變量（LS-INV-4／LS-INV-1）未貫徹到所有適用位置**。施工必須改掉機制，只調數值的 PR 一律退回。

---

## 0. 執行紀律（施工方必讀）

| 項目 | 規定 |
|---|---|
| 分支 | `feat/r7-layout-multisource`（自 `main` 開出）。**禁止**沿用 R6.5 的 `codex/r6-export`。 |
| commit 粒度 | **一張卡片一個 commit**，Conventional Commits。禁止把多張卡壓成一個 commit，也禁止把一張卡橫向拆成「只改 CSS／只改 store」兩個 commit。 |
| 觸碰範圍 | 只能改卡片「檔案」欄列出的檔案。順手重構、順手修別的問題一律**不做**——記進 BACKLOG。 |
| 順序 | R7A-00 → R7A-07 → R7B-00 → R7B-06。M0 型量測卡（R7A-00／R7B-00）是硬性前置，跳過即退回。 |
| 停工條件 | 卡片「錯誤路徑」寫明「停工回報」者，必須真的停下來問，**不得**自行調整方案或降低目標。 |
| 跨部相依 | **R7B-04 會修改 `src/components/parts.tsx`（`raw` 單鍵特化），該檔在 R7A-04 已被改過。R7B-04 必須在 R7A-04 合併之後施工**，否則會產生衝突或覆蓋。這是 Part A／Part B 之間**唯一**的檔案交集。 |
| 交付 | 每張卡片完成後貼出實際指令輸出（typecheck／test／build）；未貼輸出者不算完成。 |

---

# Part A — 版面收尾

## A1. 根因分析（Root Cause）

### A1.1 症狀 → 根因對照

| # | 使用者回報症狀（2026-07-22） | 根因 | 族系 |
|---|---|---|---|
| 1 | 設定匣每個 block 需求不同，卻用預切割且固定的 `settings-grid` ＋ 同一套 `settings-group`；「語言」佔大空間留白、「教學講解」擠成一團 | **RC-F** | RC-B（剛性軌道分配）同族第四次復發 |
| 2 | `.title-text` 只佔 `.layer-card` 約 55%，一行能顯示的文字被切成多行 | **RC-G** | RC-B(c)／LS-INV-4 未貫徹到卡片內部 |
| 3 | `io-head` 的「參數」摘要恆為第一行的 `{`，零資訊量 | **RC-H** | RC-C（值的性質與呈現策略脫鉤）同族 |
| 4 | header 的標題／大選項字級與內文同級，缺第一層視覺引導 | **RC-I** | RC-A 回退後未補回 chrome 層級 |

### A1.2 RC-F — 等分容器 × 單一群組樣板

**事實**（[index.css:140](../src/styles/index.css:140)、[Header.tsx:110](../src/components/Header.tsx:110)、
[ExportControls.tsx:74](../src/components/ExportControls.tsx:74)）：

```css
.settings-grid  { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); }
.settings-group { min-width: 0; padding: 0 12px 10px; border: 1px solid var(--rule); }   /* 五組共用 */
.settings-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }      /* 五組共用 */
```

**缺陷有兩層**：

**(a) 容器層——`auto-fit` + `1fr` 是等分演算法。** 它唯一認得的輸入是「最小 240px」，**完全不讀子項的固有寬度需求**。
五個群組的實際需求差距接近 3 倍：

| 群組 | 內容 | 固有寬需求（推算） |
|---|---|---|
| 語言 | label ＋ 一個 8ch select | ≈150px |
| 導航 | 兩個 toggle | ≈250px |
| Session | 三個按鈕（載入 .jsonl／載入資料夾／重置） | ≈290px |
| 匯出 | 兩個按鈕 ＋ 一行隱私說明 | ≈300px |
| **教學講解** | label＋select＋toggle＋批次 select＋批次按鈕＋快取筆數＋清除鈕 = **7 個控制項** | **≈480px** |

等分之後：語言拿到它需要的 3 倍寬（空白），教學講解拿到它需要的 1/2 寬（換行擠壓）。
**使用者的「太統一反而一堆空間浪費」在演算法層完全成立——這不是主觀感受。**

**(b) 群組層——五種內容形狀共用一個扁平 flex-wrap。**
教學講解的 7 個控制項被當成 7 顆等價 chip 塞進同一列去 wrap，於是「來源 → 顯示開關 → 批次執行 → 快取維護」
四段語意被換行位置隨機切斷；而語言組只有 1 個控制項，同一套規則對它是空轉。
**同一個樣板同時對高密度群組與低密度群組失效，方向相反。**

> RC-F 與 RC-B 是同一個病：**用固定切割取代需求協商**。R6.5 修了 header（六軌）、sidebar（`cqw`）、
> reader（移除讓位槽）三處，設定匣是第四處，當時不在回報範圍所以沒被掃到。

### A1.3 RC-G — badges 固定比例預留（LS-INV-4 未貫徹到卡片內部）

**事實**（[index.css:640](../src/styles/index.css:640)，**R6.5 LS-07 引入**）：

```css
.layer-card { grid-template-columns: minmax(0, 1fr) minmax(0, 45%); }
.badges     { grid-column: 2; grid-row: 1; }
```

badges 軌道被**無條件保留 45%**，與該卡實際有幾顆 badge 無關。使用者量到的「約 55%」正是這條規則的補數，
數值吻合到不需要另外量測即可定案。

**這是 R6.5 造成的新缺陷。** LS-07 把「絕對定位 badges ＋ `padding-right: 130px`」改成 grid，方向正確，
但只是把**固定 130px 的預留**換成**固定 45% 的預留**——LS-INV-4（浮動／次要元素不得在版面中預留等寬欄位）
只被套用在 minimap 上，沒有貫徹到卡片內部。

**解除點也失效**：`@container layer-card (max-width: 519px)`（[index.css:673](../src/styles/index.css:673)）
只在 390 窄版觸發；1280 下每張卡約 900px，永遠不會併排解除，所以 45% 一路生效到桌面。

實際 badge 數分佈（`Badges` = `span.tags` ＋ 可選 `span.tool`，[parts.tsx:7](../src/components/parts.tsx:7)）：
多數卡片 0～2 顆，每顆約 6～10ch。**保留 45% 對 90% 的卡片是純浪費。**

### A1.4 RC-H — 結構化值以其序列化文字摘要

**事實**：[SpanCard.tsx:31](../src/components/SpanCard.tsx:31)

```tsx
<IOBlock title={t.card.paramsTitle} text={JSON.stringify(span.tool.params, null, 2)} />
```

而 [parts.tsx:50](../src/components/parts.tsx:50) 的 `summarizeCollapsedIOText` 一律取 `lines[0]`：

```ts
const lines = text.split("\n");
const firstLine = lines[0];      // pretty-print JSON 的第 0 行恆為 "{"
```

於是收合標題永遠是「參數 · 12 行 · {」。

**根因不是「該取第二行」。** `IOBlock` 有兩種呼叫端：
- **參數**：值是 `Record<string, unknown>`，pretty-print 是**渲染產物**，行數與行序都不是資料事實；
- **結果**：值本來就是工具輸出的自由文字，首行規則正確（ACC §17 已驗收）。

同一個摘要函式被套用在性質相反的兩種值上。硬取第二行只會在單行 JSON、陣列參數、或結果區塊上再壞一次
——那是換症狀，不是修缺陷。

### A1.5 RC-I — chrome 尺度層在倍率回退時一併被移除

**事實**：R6.5 LS-01 刪除 GN-09 檔尾覆蓋區塊、全站回退 `--ui-scale: 1`，**這是使用者要求且已驗收的**
（ACC §20 項 1）。但回退是**全域一致的**，header 沒有保留任何獨立層級：

| header 元素 | 現行字級 | 對照 |
|---|---|---|
| `.brand h1`（[index.css:111](../src/styles/index.css:111)） | 18px | body 15px |
| `.workspace-tab`（[index.css:122](../src/styles/index.css:122)） | 12px | **小於 body** |
| `.btn`（播放／設定／結構，[index.css:171](../src/styles/index.css:171)） | 12.5px | **小於 body** |

主導覽的字級小於內文，第一層視覺引導不存在。這與 LS-INV-2（主導覽優先權高於所有其他控制）
在**空間分配**上已守住、在**視覺權重**上尚未表達，是同一條不變量的兩個面向。

**高度預算**（`min-height: 56px`、`padding: 8px 18px` → 可用高 **40px**）：

| 元素 | ×1.5 後字級 | 推算高度 | 40px 內是否可行 |
|---|---|---|---|
| `.brand h1` | 27px | 行高 1.4 → 37.8px | 零餘裕（需 `line-height: 1.2` → 32.4px） |
| `.workspace-tab` | 18px | 5+5 padding ＋ 25 → 35px | 需把 `min-height: 34px` 提到 40px |
| `.btn` | 18.75px | 5+5 padding ＋ 2 border ＋ 26 → 38px | 需把 header 內距壓到 4px |

**依 D-R7-03，高度硬守 56px**；上表三項配套即為達成手段。

### A1.6 附帶事實：`--fs-*` 階梯目前零引用

R6.5 LS-01 在 `:root` 建立了 `--fs-3xs`～`--fs-2xl` 九階（[index.css:47](../src/styles/index.css:47)），
但主體 CSS 的 113 處字級全部寫成 `calc(12.5px * var(--ui-scale))` 這類**行內字面值**——
`grep -c "var(--fs-" src/styles/index.css` 回傳 **0**。

LS-INV-1 的「單一旋鈕」有守住（`--ui-scale` 確實能全站生效），但「比例階梯」形同虛設：
目前全站有 20 種以上互不對齊的字級字面值，不是九階。

**裁定**：這是既有技術債，**不是本輪症狀的成因**。依「不要為了做而做」，本輪**只在觸及範圍內**
（header、settings、layer-card、io-head）改為引用 token，**不做全站清掃**；全站對齊另立卡片進 BACKLOG。

---

## A2. 決策紀錄（Decision Register）

| 編號 | 決策 | 狀態 | 決策者 | 日期 |
|---|---|---|---|---|
| D-R7-01 | 設定匣採**需求導向流式配置**：容器 flex-wrap，每組自行宣告 `--group-basis`／`--group-grow`；群組內部依內容形狀分「單控制項型」與「label/control 兩軌型」 | approved | 使用者 | 2026-07-22 |
| D-R7-02 | 收合「參數」摘要採**鍵: 值預覽**（由參數物件導出，計數單位改「項」）；「結果」維持首行規則但跳過空行與純結構符號行 | approved | 使用者 | 2026-07-22 |
| D-R7-03 | header ×1.5 後**高度硬守 56px**，以壓內距／收行高／提 tab `min-height` 達成；量測後若仍塞不下須回報，不得自行放寬 | approved | 使用者 | 2026-07-22 |
| D-R7-04 | R7 範圍＝BACKLOG 既定四項（Part B）＋本輪版面收尾（Part A），合為一份文件 | approved | 使用者 | 2026-07-22 |
| D-R7-05 | Codex 雙層事件去重採**型別白名單**（`response_item` 主幹；`event_msg` 只收白名單型別），不做內容比對 | approved | 使用者 | 2026-07-22 |
| D-R7-06 | `turn_id` **不分層**，只存 `raw`；`task_started`／`task_complete` 僅用於配對範圍與排序 | approved | 使用者 | 2026-07-22 |
| D-R7-07 | `patch_apply_end`／`mcp_tool_call_end`／`web_search_end` 以**既有 tool_use／tool_result 語彙**承接，零契約變更（實測後掛載點修正為「補既有 exec 呼叫」，見 §B1 F-2） | approved | 使用者 | 2026-07-22 |
| D-R7-08 | Codex 工具名以**正則抽取 `tools.<name>(`**（實測覆蓋 98.8%），失敗退回 `"exec"` 並記 warning | approved | 使用者 | 2026-07-22 |
| D-R7-09 | 生命週期事件（`thread_rolled_back`／`turn_aborted`／`context_compacted`）**保留內容 ＋ 插入標記事件**；`compacted.replacement_history` 略過 | approved | 使用者 | 2026-07-22 |
| D-R65-05 | 是否開放「文字大小 小／中／大」設定 | **pending**（主模型建議不做） | — | — |
| D-R65-06 | 390 窄版是否恢復 minimap | **pending**（主模型建議不做） | — | — |

> **pending 項目不得出現在任何施工卡片內。**

---

## A3. 不變量（R7-INV，Part A）

| 編號 | 不變量 |
|---|---|
| **R7-INV-1** | 容納「內容需求差異顯著」子區塊的容器，**禁止**等分配置（`repeat(auto-fit, minmax(X, 1fr))` 之類）。每個子區塊必須自行宣告寬度需求與伸展性；容器只負責流動與換行。 |
| **R7-INV-2** | 卡片內的次要標記（badges、kind chip 等）**不得**佔用固定寬或固定比例的軌道。主文軌道下限為 `--measure-min`；次要標記軌道一律 `minmax(0, auto)` 並自帶 `max-width` 上限。（LS-INV-4 延伸至卡片內部） |
| **R7-INV-3** | 摘要策略由**值的性質**決定，不由其序列化文字決定。結構化值（物件／陣列）必須由值本身導出摘要；自由文字才適用首行規則，且須跳過空行與純結構符號行。 |
| **R7-INV-4** | UI chrome（header 主導覽層）的字級由 `--chrome-scale` 單一旋鈕導出，**禁止**在選擇器內硬寫倍率。`.header` 的 `min-height: 56px` 為上限亦為下限，未經新決策不得變更。 |
| **R7-INV-5** | 本輪觸及的選擇器，字級一律改為引用 `--fs-*` 階梯；**禁止**新增行內 `calc(Npx * var(--ui-scale))` 字面值。未觸及者不在本輪範圍。 |

---

## A4. 技術方案（Part A）

### A4.1 設定匣：需求導向流式配置（D-R7-01，R7-INV-1，2026-07-23 依使用者 UAT 二次修訂）

> **本節第二次修訂。** 第一版（`--group-basis` ＋ `--group-grow` 手動猜寬度／伸展倍率）在 1280 下
> 通過驗收，但使用者在自己 1920px 寬螢幕環境回報：教學講解組視覺上仍吃掉不成比例的空間。根因是
> `flex-grow` 這個工具本身就選錯了——它的語意是「把剩餘列寬硬分給我」，但群組內的控制項
> （select、按鈕）是固定寬度，分到的空間沒東西可填，只是把死白從「組與組之間」搬到「組內部」。
> 第一次補丁（幫每組加 `max-width` 上限）仍是治標：使用者指出「setting grid 再怎麼調整、group 再
> 怎麼縮小，都只是局部問題」，要求找根本設計而非繼續調參數。改為**完全不 grow**，每組寬度就是它
> 自己內容的固有寬度（`max-content`），多餘列寬留白（跟卡片式畫廊最後一列沒填滿同一個道理，
> 不是缺陷）；`g-*` class 保留作語意標記（`Header.test.tsx` 仍斷言），但不再帶任何寬度數值。

```css
.settings-grid {
  display: flex; flex-wrap: wrap; align-items: flex-start;
  gap: 12px 14px; padding: 14px 18px;
}
.settings-group {
  flex: 0 1 auto;                        /* 不 grow：永遠不超出自己內容的固有寬度 */
  min-width: min(100%, max-content);      /* 塞得下就用固有寬度，塞不下就退化成單欄 (390) */
  max-width: 100%;
  min-height: 0; margin: 0; padding: 0 12px 10px; border: 1px solid var(--rule);
}
```

**演算法效果**：每組寬度由瀏覽器直接量測其內容決定，不需要任何手填的像素猜測值。1280 下四組
（Session／教學講解／語言／導航）擠進第一列（合計 1063＋42 gap＝1105＜1244），匯出換到第二列，
單獨一列時也**不會**被撐開填滿整列寬——它就是自己需要的寬度，跟第一列邏輯完全一致，沒有特例。

**群組內部分型**：

```css
/* 型 1：單控制項（語言、導航、Session、匯出）——維持現行橫向 wrap */
.settings-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding-top: 3px; }

/* 型 2：多控制項（教學講解）——label / control 兩軌，語意分段不被 wrap 切斷 */
.settings-actions.rows {
  display: grid; grid-template-columns: max-content minmax(0, max-content);
  gap: 8px 10px; align-items: center; padding-top: 3px;
}
.settings-actions.rows > .row-span { grid-column: 1 / -1; }
```

控制欄改 `minmax(0, max-content)` 而非 `minmax(0, 1fr)`：`1fr` 會撐到「群組最終寬度」，但群組寬度
現在本身就是內容決定的，兩者互相依賴會形成同一個死白問題换一層皮重演；`max-content` 讓控制欄只吃
它自己（跨所有列取最寬者）需要的寬度，教學講解組的最終寬度＝標籤欄＋控制欄＋間距，全部從內容反推，
不會再有任何一層是「先決定寬度、再看內容能不能填滿」。

教學講解的行結構（`Header.tsx` 對應調整）：

| 列 | 左軌（label） | 右軌（control） |
|---|---|---|
| 1 | 講解來源 | `select#hdr-provider` |
| 2 | *(span)* | 顯示教學講解 toggle |
| 3 | 批次講解 | `batch-control`（模式 select ＋ 執行按鈕） |
| 4 | *(span)* | 快取筆數 `cache-status` ＋ 清除按鈕（同列 flex） |

### A4.2 layer-card：badges 內容驅動（R7-INV-2）

```css
.layer-card {
  grid-template-columns: minmax(min(100%, var(--measure-min)), 1fr) minmax(0, auto);
  column-gap: 12px;
}
.badges { max-width: 22ch; }        /* 超過就自己 wrap 成兩列，不再吃標題的寬 */
```

行為：0 badge → 標題 100%；1～2 badge → 標題約 82～88%；badge 異常多 → badges 自行折行，
標題仍保有 `--measure-min`（32ch）下限。

**併排解除點重算**：目前 `519px` 是為「1fr + 45%」算的。新配置下，標題軌道需要
`32ch（≈272px @17px serif）＋ kind chip ≈60px ＋ gap 12px`，加上 badges 最小可接受寬 ≈100px
→ 解除點約 **444px**，取整為 **460px**：

```css
@container layer-card (max-width: 459px) { /* badges 落到標題下一列，單欄 */ }
```

> 此數字為推算，R7A-00 量測後若差距 >15% 須以量測值修訂。

### A4.3 IOBlock 摘要語意分流（D-R7-02，R7-INV-3）

`parts.tsx` 新增結構化摘要函式，`IOBlock` 新增 optional prop：

```ts
/** 結構化參數的收合摘要：由物件本身導出，不看序列化文字。 */
export function summarizeParams(params: Record<string, unknown>): { count: number; preview: string };
```

值格式化規則（逐條，不留施工期判斷）：

| 值型別 | 呈現 |
|---|---|
| `string` | 原文，>32 字元截斷加 `…`，**不加引號**，換行字元轉為空格 |
| `number` / `boolean` / `null` | `String(v)` |
| `Array` | `[n]`（n = length） |
| `object` | `{…}` |
| `undefined` / 函式等 | 略過該鍵 |

- 鍵序＝`Object.keys` 順序（即原 JSON 順序）。
- 逐鍵串接 `key: value`，以 `, ` 連接；**總長上限 60 字元**，超出即停止並附 `…`。
- `count` ＝ 頂層鍵數。

自由文字摘要（`結果` 區塊）修訂：

```ts
// 跳過空行與純結構符號行，取第一行有實質字元者
const MEANINGLESS = /^[\s{}\[\](),;:'"`\-=*_#|>]*$/;
```

若全部行皆無實質字元，`firstLine` 回傳 `""`（既有 `collapsedSummary` 已處理空字串分支，
只顯示行數，[locales.ts:188](../src/i18n/locales.ts:188)）。

locale 新增鍵（四字串）：

| key | zh-TW | en |
|---|---|---|
| `card.collapsedParamsSummary(count, preview)` | `{count} 項 · {preview}` / 無 preview 時 `{count} 項` | `{count} field(s) · {preview}` / `{count} field(s)` |

呼叫端（[SpanCard.tsx:31](../src/components/SpanCard.tsx:31)）改為：

```tsx
<IOBlock title={t.card.paramsTitle} text={JSON.stringify(span.tool.params, null, 2)} structured={span.tool.params} />
```

展開後的內容**完全不變**（仍是 pretty JSON）——本卡只改收合態標題，不改資料流、不改互動。

### A4.4 header chrome 尺度（D-R7-03，R7-INV-4，2026-07-23 依 R7A-00 實測修訂）

> **本節已被 R7A-00 量測推翻並修訂一次**，見 [docs/R7_BASELINE_2026-07-23.md](R7_BASELINE_2026-07-23.md)。
> 原案「單一常數 1.5、1280 English 為最緊情境」不成立：實測顯示 **740 寬**（header 從雙列切回單列的
> 邊界）與 **1000 寬**（品牌從短名切回長名的邊界）都比 1280 更緊，740 English 下 1.5 會讓 header 衝到
> 68px 並讓 `.workspace-tabs` 溢位 92px。使用者裁定：**不用單一常數，改用貼合既有專案斷點的分級旋鈕**
> （`@container dit-app` 已有 719/899/999 三個斷點在用，本節沿用其中兩個），每一級的值都是在該級
> **最窄邊界**、English（最長 tab 文案）下實測得出的安全上限，不是推算。

```css
:root { --chrome-scale: 1; }   /* <720：既有雙列 header 設計，不套用本旋鈕，維持 R6.5 基線 */

@container dit-app (min-width: 720px) and (max-width: 899px) {
  :root { --chrome-scale: 1.1; }   /* 720 寬實測上限；899 有餘裕但取最窄邊界值 */
}
@container dit-app (min-width: 900px) and (max-width: 1279px) {
  :root { --chrome-scale: 1.2; }   /* 1000 寬（品牌切回長名）實測上限，比 900 更緊，取該值 */
}
@container dit-app (min-width: 1280px) {
  :root { --chrome-scale: 1.5; }   /* 1280／1706 實測皆有餘裕，維持原案倍率 */
}

.header       { min-height: 56px; padding: 4px 18px; }
.brand h1     { font-size: calc(var(--fs-lg) * var(--chrome-scale)); line-height: 1.2; }
.workspace-tab{ font-size: calc(var(--fs-sm) * var(--chrome-scale)); min-height: 40px; }
.header .btn  { font-size: calc(var(--fs-sm) * var(--chrome-scale)); }
.compact-action { width: calc(30px * var(--chrome-scale)); }        /* ‹ › 不被壓扁 */
.compact-replay { min-width: calc(54px * var(--chrome-scale)); }
```

> `--fs-lg` = 17px、`--fs-sm` = 12.5px，同原案。720–899 與 900–1279 兩級刻意**不**再往下細分
> （例如不為 900–999 的短品牌子區間單獨給更高的值），因為那會讓字級隨寬度變化非單調（900 附近變大、
> 1000 又縮小），使用者體感是「越寬反而字變小」的跳動——寧可 900–999 少放大一點，換取全區間單調遞增。
> `--ui-scale` 与本旋鈕是兩個獨立軸線；`<720` 沿用 R6.5 既有雙列 header，不受本節約束
> （呼應 R7-INV-4 的既有措辭疑義：56px 上下限只在單列情境成立）。

**施工中發現的兩個 container query 陷阱（R7A-05 實作記錄，非量測，但值得記在契約旁）**：
1. 把自訂屬性覆寫設在查詢容器自己身上（`.app-shell { --chrome-scale: ... }`）或設在 `:root` 這種
   祖先，在實測瀏覽器中都不生效——只有設在**容器的子孫**（`.header`）才可靠生效，已改用此模式。
2. 成對的 `min-width`/`max-width`（如 720–899 配 900–1279）有真實縫隙：`.app-shell` 量到的
   `inline-size` 可能是小數（例如 899.33px），同時不滿足 `max-width:899px` 與 `min-width:900px`，
   靜默落回基準值。已改為三個遞增的 `min-width`-only 查詢（後面命中者靠源碼順序覆蓋前面），
   沒有縫隙。已用 `spawn_task` 提醒使用者這個模式可能也影響專案裡其他既有的成對 min/max 斷點
   （非本輪範圍，列入 BACKLOG 稽核）。

**R7A-00 實測驗證表**（English 最壞情境，見基線文件 §5 與後續追加量測）：

| 分級 | 測試寬度 | `--chrome-scale` | header 高度 | `.workspace-tabs` scrollWidth/clientWidth |
|---|---|---|---|---|
| 720–899 | 720（邊界） | 1.1 | 56 | 260/260 |
| 720–899 | 720（邊界） | 1.15（否決） | 59 | 268/268 |
| 900–1279 | 1000（品牌切長名，最緊點） | 1.2 | 56 | 276/276 |
| 900–1279 | 1000 | 1.25（否決） | 61 | 284/284 |
| ≥1280 | 1280 | 1.5 | 56 | 323/323 |

`.settings-tray` 內的控制項**不套用** `--chrome-scale`（使用者明示「其他字體不用動」）。

---

## A5. 施工卡片（Part A）

> 卡片順序即施工順序。**R7A-00 是硬性前置**，未完成不得進 R7A-01。

### R7A-00 — 量測基線（不改任何 production code）

- **檔案**：`docs/R7_BASELINE_<date>.md`（新檔）、`.tmp/`（量測腳本，Git 忽略）
- **契約**：量測項目＝下列五類 × 4 寬度 × 2 語言；**不得**以 devtools 目測代替 `getBoundingClientRect()` 數字。
- **做什麼**：`npm.cmd run build && npm.cmd run preview`，於 **390 / 740 / 1280 / 1706** × **zh / en** 記錄：
  1. 五個 `.settings-group` 各自的 `scrollWidth`（＝固有需求）與實得 `clientWidth`，驗證 A1.2 的需求表；
  2. `.layer-title` 與 `.badges` 的 `getBoundingClientRect().width`，驗證 55% / 45%；
  3. 取樣 10 張 `tool_use` 卡片的 `.io-head` 文字，記錄現況摘要字串；
  4. header 各元素現行高度與 `.header` 實得高度（作為 ×1.5 後的對照基準）；
  5. **模擬 ×1.5**：以 devtools 暫時套用 A4.4 的宣告，量 `.header` 高度與 `.workspace-tabs` 的
     `scrollWidth vs clientWidth`（en 1280 為關鍵情境）。
- **錯誤路徑**：
  - 第 5 項顯示 56px 內塞不下，或 `.workspace-tabs` 溢位 → **停工回報使用者**（D-R7-03 明示不得自行放寬）；
  - 第 1、2 項與 A1 推算差距 >20% → 回報後再決定是否修訂方案。
- **遷移／回滾**：不涉及 production code。
- **測試對應**：無（量測活動）。
- **驗收證據**：基線文件內含上述五類數字表 ＋ ×1.5 模擬截圖。

### R7A-01 — 設定匣需求導向配置（RC-F(a)，R7-INV-1，2026-07-23 二次修訂見 A4.1）

- **檔案**：`src/styles/index.css`、`src/components/Header.tsx`、`src/components/ExportControls.tsx`
- **契約**：A4.1（已修訂版）的 `flex: 0 1 auto` 容器規則，不再帶 `--group-basis` / `--group-grow` 數值。
- **做什麼**：`.settings-grid` 由 grid 改 flex-wrap；`.settings-group` 加 `flex: 0 1 auto` /
  `min-width: min(100%, max-content)`；四個 fieldset 加 `g-session` / `g-teaching` / `g-language` /
  `g-navigation` class（純語意標記，不帶寬度數值），`ExportControls` 的 fieldset 加 `g-export`。
- **錯誤路徑**：未帶 `g-*` class 的群組（未來新增者）不影響版面——寬度純由內容決定，class 只是
  語意標記，不是安全網的必要條件（與第一版不同：第一版靠預設值防呆，本版本質上沒有「忘記帶 class
  會破版」這個風險，因為沒有數值可以忘記帶）。
- **遷移／回滾**：純樣式＋class 名，`git revert` 單一 commit 完全回滾。
- **測試對應**：UNIT `Header.test.tsx` 新增：settings tray 展開後五個 `.settings-group` 各自帶到對應
  `g-*` class（防未來重構漏帶）。SIT 全量。UAT：§A7 項 1、2。
- **驗收證據**：390 / 740 / 1280 / 1920 四寬度 zh/en 實測：每組 `clientWidth` 等於其瀏覽器量測的
  `max-content` 固有寬度，同一組規則下 1920 教學講解組從第一版的 594px（撐大）收斂到 351px（內容
  實際需求）；1280 下語言組 144px、教學講解組 351px（比第一版驗收數字更小是預期的——第一版的
  ≥440px 本身就是「刻意撐大」的產物，不是內容真實需求）；390／740 皆無水平溢位。

### R7A-02 — 教學講解群組內部分層（RC-F(b)，R7-INV-1，2026-07-23 控制欄改 max-content 見 A4.1）

- **檔案**：`src/components/Header.tsx`、`src/styles/index.css`
- **契約**：A4.1（已修訂版）的 `.settings-actions.rows` 兩軌 grid 與四列結構表；控制欄
  `minmax(0, max-content)`，不是 `1fr`（原因見 A4.1 修訂說明）。
- **做什麼**：教學講解 fieldset 的 `.settings-actions` 加 `rows`；依四列結構表重排 JSX，
  toggle 與快取／清除列加 `row-span`。
- **錯誤路徑**：`providerId === "none"` 時清除按鈕本就不渲染（[Header.tsx:153](../src/components/Header.tsx:153)），
  第 4 列退化成只有快取筆數——`row-span` 為 grid item，空缺不影響其餘列對齊。
- **遷移／回滾**：純 UI 結構，revert。
- **測試對應**：UNIT `Header.test.tsx` 斷言 provider select 的 label 與 select 為同一 grid 的相鄰子項
  （以 DOM 順序斷言即可，不驗計算樣式）。UAT：§A7 項 2。
- **驗收證據**：1280 與 390 各一張教學講解群組截圖，四段語意各自成列、不互相擠壓。

### R7A-03 — layer-card badges 軌道內容驅動（RC-G，R7-INV-2）

- **檔案**：`src/styles/index.css`
- **契約**：A4.2 的 grid 軌道、`.badges { max-width: 22ch }`、容器解除點 460px。
- **做什麼**：`grid-template-columns` 第二軌由 `minmax(0, 45%)` 改 `minmax(0, auto)`，
  第一軌加 `min(100%, var(--measure-min))` 下限；`.badges` 加 `max-width`；
  `@container layer-card` 的 519px 改為 R7A-00 量測後確定的值（推算 459px）。
- **錯誤路徑**：badges 極多（tags ＋ 長工具名）時 badges 自行折行，標題仍保 32ch；
  若量測顯示標題被壓到 <32ch，代表 `max-width: 22ch` 太寬，收緊至 16ch 並記錄。
- **遷移／回滾**：純樣式，revert。
- **測試對應**：SIT 全量（含 `benchmark:r5`——卡片高度變動會影響 Reader 封閉 DOM 數，
  上限 320 不得回歸）。UAT：§A7 項 3。
- **驗收證據**：1280 下取樣 10 張卡，`.title-text` 寬 / `.layer-card` 寬 ≥ 0.80（0 badge 者 ≥0.95）；
  benchmark 維持 `18 passed / 0 failed`。

### R7A-04 — IOBlock 摘要語意分流（D-R7-02，R7-INV-3）

- **檔案**：`src/components/parts.tsx`、`src/components/SpanCard.tsx`、`src/i18n/locales.ts`
- **契約**：A4.3 的 `summarizeParams` 值格式化規則表、60 字元上限、`MEANINGLESS` 正則、四個新字串。
- **做什麼**：新增 `summarizeParams`；`summarizeCollapsedIOText` 加跳過無實質行的邏輯；
  `IOBlock` 新增 optional `structured?: Record<string, unknown>`，有值時走參數摘要；
  `SpanCard.SpanBody` 傳入 `structured={span.tool.params}`。
- **錯誤路徑**：`structured` 為空物件時上游已有 `Object.keys(...).length > 0` 守門
  （[SpanCard.tsx:30](../src/components/SpanCard.tsx:30)），不需重複判斷；
  值含換行（如多行程式碼參數）一律轉空格後截斷，**不得**讓摘要換行破壞 `io-head` 的單行省略。
- **遷移／回滾**：`structured` 為 optional prop，未傳者行為與現行完全相同——**向下相容，可安全 revert**。
- **測試對應**：UNIT `parts.test.ts` 新增六案例：
  (a) 三個純量鍵 → `count: 3` 且 preview 為 `k: v, k: v, k: v`；
  (b) 字串值 >32 字元 → 截斷加 `…`；
  (c) 陣列值 → `[n]`、物件值 → `{…}`；
  (d) preview 總長 >60 → 停止並附 `…`；
  (e) 值含 `\n` → 轉空格；
  (f) `summarizeCollapsedIOText("{\n  \"a\": 1\n}")` → `firstLine` 為 `"a": 1`（不是 `{`）。
  既有四案例（[parts.test.ts](../src/components/parts.test.ts)）**不得回歸**。UAT：§A7 項 4。
- **驗收證據**：Reader 中任一 `tool_use` 卡片收合態顯示 `參數 · N 項 · key: value…`；
  `結果` 區塊摘要語意不變。

### R7A-05 — header chrome 尺度分級旋鈕（D-R7-03，R7-INV-4，2026-07-23 依 R7A-00 實測修訂）

> R7A-00 實測發現 740／1000 寬（非原案假設的 1280）才是最緊情境，1.5 常數在這兩點會讓 header
> 超過 56px 且 `.workspace-tabs` 溢位。使用者裁定不採「降低單一倍率」，改採「依既有專案斷點分級」——
> 每級的值都是該級最窄邊界、English 下的實測安全上限。詳見 A4.4 已修訂版與
> [docs/R7_BASELINE_2026-07-23.md](R7_BASELINE_2026-07-23.md)。
- **檔案**：`src/styles/index.css`
- **契約**：A4.4（已修訂版）的四級 `--chrome-scale` container query 與五條套用宣告；
  `.header { min-height: 56px }` 在 `≥720px` 單列情境不得變更；`<720px` 雙列情境沿用 R6.5 基線，
  不受本卡約束。
- **做什麼**：`:root` 預設 `--chrome-scale: 1`（<720 雙列基線）；於 `@container dit-app` 三個既有斷點
  （720/900/1280）分別覆寫為 1.1／1.2／1.5；header padding 8px→4px；brand／tab／btn 字級改
  `calc(var(--fs-*) * var(--chrome-scale))`；brand 加 `line-height: 1.2`；tab `min-height` 34→40px；
  `.compact-action` / `.compact-replay` 尺寸隨旋鈕。
- **錯誤路徑**：若任一分級邊界（720／900→1000／1280）實測 header 超過 56px 或 `.workspace-tabs`
  溢位 → **停工回報**，不得自行降倍率或放寬高度（D-R7-03）。R7A-00 已在 740／1000 邊界做過此驗證，
  R7A-05 施工後須以真實 build 重跑同組邊界確認契約沒有漂移（例如字級 token 化四捨五入造成的誤差）。
- **遷移／回滾**：單檔單 commit，revert；或把 `--chrome-scale` 設回 `1` 即等同關閉本卡效果
  （**自證機制**：這個旋鈕能一鍵還原，證明 R7-INV-4 成立）。
- **測試對應**：SIT 全量。UAT：§A7 項 5、6。
- **驗收證據**：390 / 720 / 740 / 900 / 1000 / 1280 / 1706 × zh / en 共 14 張 header 截圖或量測記錄；
  `≥720px` 情境 `.header` 的 `getBoundingClientRect().height === 56`（`<720` 沿用既有雙列基線，
  不套此斷言）；`.workspace-tabs` 全部情境 `scrollWidth === clientWidth`。

### R7A-06 — 觸及範圍字級 token 化（R7-INV-5）

- **檔案**：`src/styles/index.css`
- **契約**：R7-INV-5。只收斂 R7A-01～05 觸及的選擇器，**不擴及其他**；`--fs-*` 九階值不得變動。
- **做什麼**：僅將 R7A-01～05 觸及的選擇器字級改引用 `--fs-*`；階梯外的值（如 9px、20px 符號字級）
  就近取最相近階並在該行加註；**不做全站清掃**。
- **錯誤路徑**：任何一處替換造成視覺可見差異 >1px 且非預期者，還原為原字面值並記錄於 PROGRESS。
- **遷移／回滾**：revert。
- **測試對應**：SIT 全量。UAT：併入 §A7 項 1～6 的截圖比對。
- **驗收證據**：`grep -c "var(--fs-" src/styles/index.css` > 0；施工前後同倍率截圖無可見差異。

### R7A-07 — 文件、驗收單與帳本

- **檔案**：`docs/ACCEPTANCE.md`（新增 §21）、`docs/PROGRESS.md`、`docs/BACKLOG.md`（登記全站字級階梯對齊）、本文件
- **契約**：ACCEPTANCE 新段落**只新增不覆寫**（既有 §1～§20 維持原狀）；PROGRESS 最新在上。
- **做什麼**：§A7 清單寫入 ACCEPTANCE §21；PROGRESS 補 R7 Part A 段落；A1.6 的全站清掃登記為 BACKLOG 項目。
- **錯誤路徑**：不適用（純文件）。
- **遷移／回滾**：revert。
- **測試對應**：無。
- **驗收證據**：`git diff --check` exit 0。

---

## A6. 驗收層級（Part A）

| 層級 | 範圍 | 通過條件 |
|---|---|---|
| UNIT | `parts.test.ts`（6 新案例）、`Header.test.tsx`（2 新案例） | `npm.cmd test` 全綠，既有 180 項零回歸 |
| SIT | `typecheck`、`build`（含快照 target）、`benchmark:r5`、`git diff --check` | 全部 exit 0；benchmark `18 passed / 0 failed` |
| UAT | §A7，由使用者在真實環境執行 | 全項通過 |

**LS-INV-8 延續**：UAT 主場景為**系統縮放 150%、瀏覽器縮放 100%（＝1280 CSS px）**；1706／740／390 為補充。

## A7. 使用者 UAT 清單（Part A，草案）

前置：`npm.cmd run build`、`npm.cmd run preview -- --host 127.0.0.1 --port 4173`，**瀏覽器縮放保持 100%**。

1. 設定匣中「語言」不再佔一大塊空白（寬度約只夠放下標籤與下拉），「教學講解」不再擠成一團。
2. 「教學講解」裡的四段（來源／顯示開關／批次講解／快取與清除）各自成列，不再被換行隨機切斷；
   390 與 1280 都讀得順。
3. Reader 卡片標題明顯變寬——沒有 badge 的卡幾乎佔滿整行；有 badge 的卡，標題仍佔約 8 成以上，
   不再出現「一行放得下卻被切成多行」。
4. 收合的「參數」區塊顯示得出實際內容（如「參數 · 3 項 · file_path: src/…, limit: 50」），
   不再只看到 `{`；展開後內容與以前完全一樣；「結果」區塊的摘要語意沒有改變。
5. header 的標題（DIT／Dialogue Is Teacher）、三個分頁、播放與設定按鈕明顯變大，
   一眼就看得出是第一層導覽，與內文有層級差。
6. **header 的高度沒有變**（與修改前肉眼一致）；三個分頁在 390／740／1280／1706 × zh／en 全部完整可見。
7. 既有能力零回歸：載入／取消、M 快捷鍵、Map Jump、cluster 不可跳、Privacy Review、Ollama 連線、
   逐步瀏覽、子代理排序與連結、匯出 JSON／HTML 快照。

---

# Part B — 多來源接入（Codex Adapter）

> **狀態：build-ready**（D-R7-05～09 已於 2026-07-22 拍板）。
> 設計背景見 [DESIGN_R7_MULTI_SOURCE_v0.1.md](DESIGN_R7_MULTI_SOURCE_v0.1.md)（pre-PSM 草稿）；
> **該文件的部分結論已被本節 §B1 的真實樣本實測推翻，以本節為準。**

## B1. 真實樣本實測（2026-07-22，推翻設計文件的三處）

樣本：`C:\Users\gunda\.codex\sessions\2026\07\19\rollout-2026-07-19T03-42-43-019f76c0-….jsonl`
（16.3 MB／1,912 行，使用者指定的複雜樣本）。頂層與 payload 型別普查結果：

| 型別 | 筆數 | 型別 | 筆數 |
|---|---|---|---|
| `event_msg/agent_reasoning` | 398 | `event_msg/patch_apply_end` | 49 |
| `response_item/reasoning` | 344 | `turn_context` | 14 |
| `event_msg/token_count` | 284 | `event_msg/task_started` | 11 |
| `response_item/custom_tool_call` | 258 | `event_msg/user_message` | 11 |
| `response_item/custom_tool_call_output` | 258 | `response_item/function_call(_output)` | 11 ／ 11 |
| `event_msg/mcp_tool_call_end` | 84 | `event_msg/task_complete` | 8 |
| `response_item/message` | 74 | `event_msg/web_search_end` | 7 |
| `event_msg/agent_message` | 56 | `session_meta` | 9 |
| `world_state` | 4 | `compacted` ／ `context_compacted` | 3 ／ 3 |
| `event_msg/thread_rolled_back` | 2 | `event_msg/turn_aborted` | 3 |

### F-1（推翻）`custom_tool_call.name` 恆為 `"exec"`

258/258 筆的 `name` 都是 `exec`；真實工具身分埋在 `input` 的 JS 字串中（`tools.<name>(…)`）。
以 `/tools\.([A-Za-z_][\w]*)\s*\(/` 抽取，**覆蓋 255/258 ＝ 98.8%**：

| 抽出名稱 | 筆數 | 抽出名稱 | 筆數 |
|---|---|---|---|
| `shell_command` | 104 | `update_plan` | 9 |
| `mcp__node_repl__js` | 83 | `web__run` | 6 |
| `apply_patch` | 49 | `codex_app__*` | 3 |
| （抽不到） | 3 | | |

若照設計文件直接對映 `name`，Codex 來源的**每一張操作卡工具 badge 都會是「exec」**，
Sidebar 地標、Map 語彙、依工具名分類的降噪規則全面失效。→ D-R7-08。

### F-2（推翻）`patch_apply_end` 不是「主幹無對應」，而是巢狀在 exec 內

`patch_apply_end.call_id` 為 `exec-<uuid>`、`custom_tool_call.call_id` 為 `call_XXXX`，
兩者命名空間不同，所以設計文件判定「主幹無對應」。但 F-1 顯示 exec 的 input 中
**`apply_patch` 恰好出現 49 次，與 `patch_apply_end` 的 49 筆數量一致**；
`mcp__node_repl__js`（83）與 `mcp_tool_call_end`（84）亦近乎一對一。

**若照原案為 `patch_apply_end` 另生一對 `tool_use + tool_result`，會雙重計數 49 次。**
D-R7-07 的語彙選擇（既有 tool 語彙、零契約變更）不變，**掛載點修正為補既有 exec 呼叫**，見 §B4.4。

### F-3（補漏）`mcp_tool_call_end` 必須進白名單

設計文件未列。84 筆，帶 `invocation.{server, tool, arguments}` 與完整 `result`，
是這些 MCP 呼叫**唯一的結構化來源**（主幹只有被 JS 包起來的 exec）。

### F-4（補漏）四種生命週期事件

`thread_rolled_back`（`num_turns: 1`，前 N 回合已被使用者撤回）、`turn_aborted`
（`reason: "interrupted"`）、`compacted`（`replacement_history` 為整段歷史替換，照收會與原事件重複）、
`context_compacted`。**這是正確性問題**：不處理會讓使用者看到已被撤回的步驟卻毫不知情，
或看到重複兩份的歷史。→ D-R7-09。

### F-5（良性）`session_meta` 重複 9 次但內容完全相同

同 `session_id` / `timestamp` / `cwd`（resume 造成）。取第一筆即可，無需衝突解析。

### F-6（沿用）思考層降級屬實

`response_item/reasoning` 344 筆為 `encrypted_content`；明文只存在於
`event_msg/agent_reasoning` 的 398 筆串流碎片。◇ 思考 span 在 Codex 來源必然稀疏且需相鄰合併。

## B2. 範圍（D-R7-04 核定四項 ＋ 實測追加一項）

| # | 項目 | 性質 |
|---|---|---|
| B-1 | `SourceAdapter` 補 `createAccumulator()`，`jsonlStream.ts` 改吃介面 | **blocker** |
| B-1b | **（實測追加）** streaming 路徑加入「先偵測、再建 accumulator」前置 | **blocker**，見 §B4.1 |
| B-2 | 未知型別寬容收納 ＋ 生命週期標記事件 | 韌性／正確性 |
| B-3 | Session 標題 fallback（規則式，**放在 normalizer，所有來源共用**） | Codex 前置條件 |
| B-4 | Codex jsonl adapter 本體 | 主目標 |

**非目標**（明確不做）：跨 session 統計層、Codex 以外的來源、`paste` adapter、
任何 view 層行為變更或新 UI（Codex 資料一律以現有卡片／Map 語彙呈現，降級處明示而非新設 UI）。

## B3. 不變量（R7-INV，Part B）

| 編號 | 不變量 |
|---|---|
| **R7-INV-6** | 下游（normalizer／view）只認 `RawEvent`。**禁止**為單一來源新增結構層、新 `SpanType` 或來源專屬 view 行為。來源特有概念（如 Codex `turn_id`）只能存於 `raw`。 |
| **R7-INV-7** | `event_msg` 類事件採**型別白名單**。白名單外一律不產生事件；未知型別落入寬容收納並聚合為 warning，**不得靜默丟棄，也不得與主幹重複產出**。 |
| **R7-INV-8** | 任何對來源內部慣例的**推測**（工具名正則、巢狀配對）必須具備明確退路與 warning。推測失敗時只能降級，**不得**產出看似正確的錯誤資料。 |
| **R7-INV-9** | streaming 路徑的 adapter 選擇必須由**偵測**決定。**禁止**預設任一來源；無 adapter 認領時須拋出可讀錯誤，不得默默退回 Claude adapter。 |
| **R7-INV-10** | 使用者已撤回／中斷／壓縮的內容**保留呈現**，但必須有可見標記說明其狀態（D-R7-09）。不得無聲呈現，也不得無聲刪除。 |

## B4. 技術方案（Part B）

### B4.1 accumulator 介面與 streaming 偵測（B-1／B-1b，R7-INV-9）

```ts
// src/core/adapters/types.ts
export interface LineAccumulator {
  pushLine(line: string): void;
  finish(): ParseResult;
}
export interface SourceAdapter {
  id: SourceId;
  canParse(raw: string): boolean;
  parse(raw: string): ParseResult;
  createAccumulator(): LineAccumulator;   // 新增
}
```

`jsonlStream.ts` 改名 `parseJsonlChunks`，流程：

```
緩衝 chunk → 取得第一個非空行 → detectAdapter(line)
  ├─ 命中 → adapter.createAccumulator()，把已緩衝的行 replay 進去，之後照舊逐行 push
  └─ 未命中 → throw UnknownSourceError（UI 顯示「無法辨識的 session 格式」）
```

**既有 `canParse` 可直接餵單行**：`claudeCodeJsonl.ts:169-172` 本來就是取第一個非空行做 `JSON.parse` 判斷，
單行輸入行為等價。Codex 的 `canParse` 條件：`type ∈ {session_meta, response_item, event_msg, turn_context}`
且 `payload` 為物件——與 Claude（頂層有 `sessionId`／`message`）**互斥**，已於樣本驗證。

`parseClaudeCodeJsonlChunks` 為**破壞性改名**，呼叫端須同 commit 改完（typecheck 會擋）。

### B4.2 型別白名單（D-R7-05，R7-INV-7）

| 層 | 型別 | 處置 |
|---|---|---|
| `response_item` | `message`(user／assistant) | 主幹 → `user_text`／`assistant_text` |
| `response_item` | `message`(developer) | 噪音，不出事件 |
| `response_item` | `reasoning` | `thinking`；`encrypted_content` 無法還原時只出 `summary`，空則不出事件 |
| `response_item` | `custom_tool_call`／`function_call` | `tool_use`（工具名見 §B4.3） |
| `response_item` | `custom_tool_call_output`／`function_call_output` | `tool_result`（`call_id` → `toolUseId`） |
| `event_msg` | `agent_reasoning` | **白名單**：`thinking`，相鄰碎片合併 |
| `event_msg` | `patch_apply_end`／`mcp_tool_call_end`／`web_search_end` | **白名單**：補既有 exec 呼叫（§B4.4） |
| `event_msg` | `turn_aborted`／`thread_rolled_back`／`context_compacted` | **白名單**：標記事件（§B4.5） |
| `event_msg` | `user_message`／`agent_message`／`task_started`／`task_complete`／`token_count`／`turn_context` | 與主幹重複或純噪音，**不出事件** |
| `event_msg` | `thread_settings_applied` | 不出事件；`thread_settings.model` 補進 `meta.model` |
| 頂層 | `session_meta` | 取**第一筆**（F-5）；後續重複忽略 |
| 頂層 | `compacted` | `replacement_history` **整段略過**（純重複）；只出一則標記事件 |
| 頂層 | `world_state` | 噪音，不出事件 |
| 任何 | 白名單外 | 寬容收納 → `unknown` ＋ warning 聚合「型別 ×N」 |

### B4.3 工具名與參數（D-R7-08，R7-INV-8）

```ts
const EXEC_TOOL_RE = /tools\.([A-Za-z_][\w]*)\s*\(/;
```

- `custom_tool_call`：以正則抽 `toolName`；抽不到 → `"exec"` ＋ warning
  `無法從 exec input 抽出工具名（行 N）`。
- `toolInput`：`custom_tool_call.input` 是 JS 程式碼，包裝為 `{ raw: input }`；
  `function_call.arguments` 是 JSON 字串，先 `JSON.parse`，失敗才 `{ raw: arguments }`。

**與 Part A R7A-04 的介面交會（主模型裁定）**：`summarizeParams` 對「**只有一個鍵且鍵名為 `raw`**」的情況特化——
直接顯示值本身、不顯示鍵名（否則每張 Codex 操作卡都顯示「1 項 · raw: …」，鍵名佔掉摘要預算卻零資訊）。
此特化實作於 R7B-04，測試補在 `parts.test.ts`。

### B4.4 巢狀子事件補既有 exec 呼叫（D-R7-07 修正案，R7-INV-8）

`patch_apply_end`／`mcp_tool_call_end`／`web_search_end` 的 `call_id` 與主幹不同命名空間，
改以 **(turn_id, 時序) 就近向前配對**到最近一個「工具名相容且尚未收到該類子事件」的 exec `tool_use`：

| 子事件 | 相容工具名 | 補到哪裡 |
|---|---|---|
| `patch_apply_end` | `apply_patch` | `changes` 全文（含 `unified_diff`）補進 **`toolInput.changes`**；`success`／`stderr` 併入該 exec 既有 `tool_result` 文字 |
| `mcp_tool_call_end` | `mcp__*` | `invocation.arguments` **取代** `toolInput`（結構化優於 JS 原文）；`toolName` 改 `mcp__<server>__<tool>`；`result.Ok.content` 併入 `tool_result` |
| `web_search_end` | `web__run` | query 補進 `toolInput.query` |

> **為何 diff 進參數而非結果**：`unified_diff` 是「這一步做了什麼」（意圖），`success`／`stdout` 才是
> 「結果如何」。exec 本來就有 `custom_tool_call_output` 作為結果（258 筆 1:1），把 diff 也塞進結果會產生
> 兩個「結果」區塊、語意重疊。此為主模型的實作層裁定（可逆、非價值分歧、不改 UX 語意）。

配對失敗 → 降級為獨立 `unknown` 事件 ＋ warning，**不得**猜測歸屬（R7-INV-8）。

### B4.5 生命週期標記事件（D-R7-09，R7-INV-10）

三類事件各產生一則 `unknown` 事件（沿用 B-2 的寬容收納卡片語彙，**零契約變更**），
文字自我解釋、插在原時序位置：

| 事件 | zh-TW 文字 | en |
|---|---|---|
| `turn_aborted` | `此回合被中斷（原因：{reason}）` | `This turn was interrupted ({reason})` |
| `thread_rolled_back` | `之前 {n} 個回合已被使用者撤回，以下內容仍保留供對照` | `{n} previous turn(s) were rolled back; kept here for reference` |
| `context_compacted` | `對話歷史在此處被壓縮，之後的上下文已重整` | `Conversation history was compacted here` |

被撤回／被中斷的原始步驟**照常呈現**（走錯路也是教材），但使用者看得到狀態。

### B4.6 Session 標題 fallback（B-3，R7-INV-6）

**放在 normalizer，不放 adapter**——所有來源共用（Claude Code 缺 `ai-title` 時同樣受益）：

1. 取第一個 `user_text` 事件的 `text`；
2. 剝除合成區塊：以 `#` 開頭的標頭行及其後續縮排／清單內容（Codex 的
   `# Files mentioned by the user` 附件展開）；
3. 取第一個非空行，空白正規化，截斷 48 字元（超出加 `…`）；
4. 結果為空 → 維持既有「未命名 session」。

## B5. 施工卡片（Part B）

> **R7B-00 是硬性前置。** 卡片順序即施工順序。

### R7B-00 — 樣本基線與型別普查

- **檔案**：`docs/R7_CODEX_SAMPLE_BASELINE_<date>.md`（新檔）、`.tmp/`（普查腳本，Git 忽略）
- **契約**：普查項目＝下列六類 × ≥5 檔；統計以程式輸出為準，**不得**以人工翻閱樣本得出的印象代替。
- **做什麼**：對 `C:\Users\gunda\.codex\sessions\2026\07\**\rollout-*.jsonl` 中**至少 5 個檔**
  （含 §B1 那個 16 MB 樣本與 17 MB／23,747 行的 `07/08` 樣本）重跑普查，記錄：
  頂層／payload 型別分佈、`tools.<name>` 抽取覆蓋率、`patch_apply_end` vs `apply_patch` 數量比、
  `mcp_tool_call_end` vs `mcp__*` 數量比、`session_meta` 是否恆等、生命週期事件出現率。
- **錯誤路徑**：
  - 工具名抽取覆蓋率 <90% → **停工回報**，D-R7-08 需重新裁定；
  - `patch_apply_end` 與 `apply_patch` 數量比偏離 1:1 超過 10% → §B4.4 的配對假設不成立，停工回報；
  - 出現 §B1 未列的新頂層型別且佔比 >1% → 回報後再決定歸類。
- **遷移／回滾**：不涉及 production code。
- **測試對應**：無（量測活動）。
- **驗收證據**：基線文件內含 ≥5 檔的型別分佈表與上述四項比率。

### R7B-01 — accumulator 介面與 streaming 偵測（B-1／B-1b，R7-INV-9）

- **檔案**：`src/core/adapters/types.ts`、`src/core/adapters/claudeCodeJsonl.ts`、
  `src/core/adapters/index.ts`、`src/core/ingest/jsonlStream.ts`、其呼叫端
- **契約**：§B4.1 的 `LineAccumulator` 介面與偵測流程；新增 `UnknownSourceError`。
- **做什麼**：`SourceAdapter` 補 `createAccumulator()`；Claude adapter 以既有
  `ClaudeCodeJsonlAccumulator` 實作；`parseClaudeCodeJsonlChunks` 改名 `parseJsonlChunks`
  並改為先偵測再建 accumulator，已緩衝行 replay。
- **錯誤路徑**：無 adapter 認領 → `UnknownSourceError`，UI 走既有 load failure 路徑（ACC §11 已驗收，
  不白屏）；首行損壞（無法 `JSON.parse`）→ 繼續讀下一行，連續 20 行皆無法判定才拋錯。
- **遷移／回滾**：函式改名屬**破壞性介面變更**，呼叫端須同 commit 改完；`git revert` 單一 commit 回滾。
- **測試對應**：UNIT 新增 `src/core/ingest/jsonlStream.test.ts`：
  (a) Claude 樣本 → 選中 Claude accumulator；(b) Codex 樣本 → 選中 Codex（本卡先以 stub adapter 驗）；
  (c) 亂數文字 → `UnknownSourceError`；(d) 首行為空／損壞但第 3 行有效 → 仍正確偵測；
  (e) 緩衝行不遺漏（總行數與 finish() 事件數相符）。
  SIT：50 MiB fixture 載入／取消行為不得回歸（`npm.cmd run benchmark:r5`）。
- **驗收證據**：benchmark 維持 `18 passed / 0 failed`；50 MiB Claude fixture 載入時間與 R6.5 同機數據
  差距 <10%。

### R7B-02 — 寬容收納與生命週期標記（B-2，D-R7-09，R7-INV-7／10）

- **檔案**：`src/core/adapters/`（共用工具）、`src/i18n/locales.ts`
- **契約**：§B4.2 白名單表、§B4.5 三則文案（兩語言共六字串）。
- **做什麼**：新增共用的「未知型別收納」helper——產生 `kind: "unknown"` 事件並把型別名累進
  warning 聚合器（輸出格式 `型別 xN`）；生命週期三事件走同一 helper 但帶自我解釋文案。
- **錯誤路徑**：warning 數量上限 200 則（避免 23,747 行的檔案產生同量 warning），
  超出後只累加計數不再新增字串。
- **遷移／回滾**：revert。
- **測試對應**：UNIT 新增案例：(a) 三個未知型別各 2 筆 → warning 為三則「型別 ×2」而非六則；
  (b) `turn_aborted` → 產生一則含 reason 的 unknown 事件；(c) `thread_rolled_back` 文字含 `n`；
  (d) warning 超過 200 則時不再增長。
- **驗收證據**：以 R7B-00 的樣本跑出的 warning 清單，長度 ≤200 且無重複型別。

### R7B-03 — Session 標題 fallback（B-3，R7-INV-6）

- **檔案**：`src/core/normalize/normalizer.ts`、`src/i18n/locales.ts`（若「未命名 session」文案需調整）
- **契約**：§B4.6 的四步規則。
- **做什麼**：normalizer 在 `meta.title` 為空時套用 fallback。**適用所有來源。**
- **錯誤路徑**：第一個 `user_text` 不存在（空 session）→ 維持既有「未命名 session」。
- **遷移／回滾**：revert。既有有 `ai-title` 的 Claude session **行為完全不變**（只在空值時介入）。
- **測試對應**：UNIT 新增五案例：(a) 純文字 → 截斷 48；(b) 含 `# Files mentioned by the user` 合成區塊
  → 剝除後取真正意圖；(c) 多行 → 取第一非空行；(d) 空 → 未命名；(e) 已有 `ai-title` → 不介入。
- **驗收證據**：載入 Codex 樣本後 Sidebar／Overview 顯示得出的標題來自使用者第一句話。

### R7B-04 — Codex adapter 本體（B-4，D-R7-05／06／07／08）

- **檔案**：`src/core/adapters/codexJsonl.ts`（新檔）、`src/core/adapters/index.ts`（註冊）、
  `src/components/parts.tsx`（§B4.3 的 `raw` 單鍵特化）
- **契約**：§B4.2 白名單表、§B4.3 工具名與參數、§B4.4 巢狀配對表。`turn_id` 只進 `raw`（D-R7-06）。
- **做什麼**：實作 `canParse`／`parse`／`createAccumulator`；型別白名單分派；`tools.<name>` 抽取；
  `agent_reasoning` 相鄰碎片合併；巢狀子事件就近配對；`summarizeParams` 的 `raw` 單鍵特化。
- **錯誤路徑**：
  - 工具名抽不到 → `"exec"` ＋ warning（R7-INV-8）；
  - 巢狀配對失敗 → 獨立 `unknown` 事件 ＋ warning，**不猜測歸屬**；
  - `reasoning` 僅有 `encrypted_content` 且 `summary` 空 → **不產生事件**（不得產出空的思考卡，
    那是偽造完整性）；
  - 單行損壞 → warning，不整體拋例外（既有 `SourceAdapter` 契約）。
- **遷移／回滾**：新檔 ＋ 一行註冊，revert 即完全移除 Codex 支援，Claude 路徑零影響。
- **測試對應**：UNIT 新增 `src/core/adapters/codexJsonl.test.ts`：
  (a) `canParse` 對 Codex 首行為 true、對 Claude 首行為 false（互斥）；
  (b) 九種工具名各抽出一例，抽不到者退回 `"exec"` 並記 warning；
  (c) `user_message`／`agent_message` 不產生與主幹重複的事件（白名單驗證）；
  (d) `patch_apply_end` 的 `changes` 落在對應 exec 的 `toolInput.changes`，且**未**新增第二個 tool_use；
  (e) `mcp_tool_call_end` 使 `toolName` 變為 `mcp__<server>__<tool>` 且 `toolInput` 為結構化 arguments；
  (f) 加密 reasoning 且 summary 空 → 零事件；
  (g) `turn_id` 不出現在 `RawEvent` 的任何具名欄位，只在 `raw` 內（R7-INV-6 的自動化守門）。
  `parts.test.ts` 補一案例：`{ raw: "…" }` 單鍵 → 摘要不顯示鍵名。
- **驗收證據**：以 §B1 的 16 MB 樣本解析，輸出事件數、九種工具名分佈、warning 清單、
  `tool_use`／`tool_result` 配對率，寫入 R7B-00 的基線文件作為前後對照。

### R7B-05 — 載入路徑整合與真實樣本回歸（B-4 收尾）

- **檔案**：`src/store/sessionStore.ts`（若載入路徑有來源假設）、`scripts/`（回歸腳本，Git 忽略輸出）
- **契約**：兩條載入路徑（單檔／資料夾）皆須經 `detectAdapter`（R7-INV-9）；資料夾混源時單一來源優先。
- **做什麼**：確認 `.jsonl` 單檔與資料夾兩條載入路徑都走 `detectAdapter`；
  資料夾路徑的 `subagents/*.jsonl` 假設為 Claude 專屬——Codex 無此概念，須確認**缺檔不報錯**。
- **錯誤路徑**：資料夾內混雜兩種來源的檔案 → 以第一個可辨識檔的來源為準，其餘不符者記 warning 跳過，
  **不得**混合解析（會產生語意不一致的 Span Tree）。
- **遷移／回滾**：revert。
- **測試對應**：SIT 以真實 Codex 樣本（≥2 檔，含 17 MB／23,747 行者）跑完整
  adapter→denoise→distill 管線，斷言無例外、無 NaN order、`viewItems.length > 0`。
  UAT：§B7 全項。
- **驗收證據**：管線輸出摘要（事件數／span 數／group 數／warning 數）＋ `benchmark:r5` 維持全綠。

### R7B-06 — 文件與帳本

- **檔案**：`docs/ACCEPTANCE.md`（§22）、`docs/PROGRESS.md`、`docs/BACKLOG.md`（R7 候選段標記完成）、
  `docs/DESIGN_R7_MULTI_SOURCE_v0.1.md`（標註 §2／§6 已被本文件 §B1 實測修訂）、本文件
- **契約**：ACCEPTANCE 新段落**只新增不覆寫**；DESIGN_R7 原文不刪改，只在標題下加一行「部分結論已被
  PSM §B1 實測修訂」的指向。
- **做什麼**：§B7 清單寫入 ACCEPTANCE §22；PROGRESS 補 R7 Part B 段落；BACKLOG 的「2026-07-21 R7 候選」
  段標記完成並移入已完成區；本文件狀態改為已施工。
- **錯誤路徑**：不適用（純文件）。
- **遷移／回滾**：revert。
- **測試對應**：無。
- **驗收證據**：`git diff --check` exit 0。

## B6. 驗收層級（Part B）

| 層級 | 範圍 | 通過條件 |
|---|---|---|
| UNIT | `jsonlStream`（5）、寬容收納（4）、標題 fallback（5）、`codexJsonl`（7）、`parts`（1） | `npm.cmd test` 全綠，既有零回歸 |
| SIT | `typecheck`、`build`、`benchmark:r5`、真實 Codex 樣本管線回歸（≥2 檔） | 全部 exit 0；benchmark `18 passed / 0 failed` |
| UAT | §B7 | 全項通過 |

## B7. 使用者 UAT 清單（Part B，草案）

1. 用「載入 .jsonl」選一個 Codex 的 `rollout-*.jsonl`，能正常載入並直接進入閱讀頁，不報錯、不白屏。
2. 操作卡的工具名稱是**看得懂的真實名稱**（shell_command／apply_patch／mcp__node_repl__js 等），
   不是清一色的「exec」。
3. 改檔案的步驟，展開「參數」看得到完整 diff；「結果」看得到成功與否。
4. 同一句話**不會出現兩張卡**（模型層與 UI 層去重生效）。
5. 思考（◇）在 Codex session 明顯較少且較零碎——**這是資料源限制，不是 bug**；
   確認沒有出現空白的思考卡。
6. 被中斷或被撤回的回合，附近看得到一則說明卡（「此回合被中斷」「之前 n 個回合已被撤回」），
   而原本的步驟仍然看得到。
7. Session 標題不是「未命名 session」，而是你當初第一句話的濃縮。
8. 載入一個 17 MB 的大型 Codex session 不當掉，載入中可取消；Map、Minimap、M 快捷鍵、
   逐步瀏覽、匯出都正常。
9. Claude Code 的 session **完全沒有回歸**：載入、subagent 排序與連結、50 MiB 大檔、
   標題（原本就有 ai-title 者不變）。
10. 隨便丟一個不是 session 的 `.jsonl`（或純文字檔）→ 出現看得懂的「無法辨識格式」訊息，不白屏。

---

## 9. 交接

### 9.1 待使用者回答的開放問題

1. **D-R65-05／06**：R6.5 遺留的兩個 pending，主模型仍建議兩者皆不做。
2. **A4.2 的 460px 解除點與 A4.4 的高度預算**皆為推算；R7A-00 量測若差距超標會回報，不逕自調整。
3. **§B4.4 的巢狀配對假設**（`apply_patch` ↔ `patch_apply_end` 1:1）目前只在**一個**樣本上成立；
   R7B-00 要求擴到 ≥5 檔驗證，偏離 >10% 即停工回報。

### 9.2 完整度自評

- **Part A build-ready**：R7A-00～07 具備七項欄位（檔案／契約／做什麼／錯誤路徑／遷移回滾／測試對應／驗收證據）。
- **Part B build-ready**：R7B-00～06 同上；D-R7-05～09 已全數拍板。
- **已知薄弱處**：
  - (a) A1.2 的固有寬需求表為推算（R7A-00 即為此設）；
  - (b) R7A-05 是「放大不可壓縮軌道」，與 LS-INV-2 天然對立——R7A-00 第 5 項模擬量測是唯一的
    事前防線，若該項失敗，D-R7-03 的「硬守 56px」與「×1.5」必有一項要重新裁定，屆時回報使用者；
  - (c) A1.6 的 `--fs-*` 零引用是既有債，本輪只在觸及範圍收斂，全站對齊留 BACKLOG——
    這代表 LS-INV-1 的「比例階梯」在本輪結束後仍未真正成立，僅「單一旋鈕」成立；
  - (d) §B1 的實測只涵蓋 Codex **一個版本、一台機器**的輸出慣例。`tools.<name>(` 是 Codex 內部
    包裝格式，非公開契約，未來版本可能改變——R7-INV-8 的退路（降級為 `"exec"` ＋ warning）
    是唯一防線，這代表 D-R7-08 的成果**本質上會隨上游版本衰減**，須在 PROGRESS 明記；
  - (e) `event_msg` 白名單是**封閉式**設計：Codex 新增高價值型別時 DIT 不會自動採用，只會落入
    寬容收納。這是刻意的（R7-INV-7 的確定性優於覆蓋率），代價是需要定期回頭普查。

### 9.3 下一步

本文件簽核後即可施工，順序 **Part A（R7A-00 → 07）→ Part B（R7B-00 → 06）**。
Part A 完成、Part B 開工前建議做一次 workflow-checkpoint。
