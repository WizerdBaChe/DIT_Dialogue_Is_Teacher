# REVIEW R11.2 — 狀態機與設計/實作落差深度審查

- **日期**：2026-08-20　·　**分支**：`feat/r11.2-uat-repairs` @ `c2216c0` + 未提交的 UAT 填寫
- **模式**：Mode B（全專案健檢），以 §10 狀態機（state machine）與 §11 跨邊界契約（cross-boundary contract）為主軸
- **本輪只產出報告，未修改任何 `src/` 檔案**（使用者裁定）
- **機器可讀清單**：[`REVIEW_R11.2_STATE_AND_DESIGN_2026-08-20.findings.json`](REVIEW_R11.2_STATE_AND_DESIGN_2026-08-20.findings.json) ·
  [`.coverage.json`](REVIEW_R11.2_STATE_AND_DESIGN_2026-08-20.coverage.json)。**清單是正本，本文是投影**；兩者不一致以清單為準。

---

## 0　先講結論

三道靜態閘門在 HEAD 全綠（typecheck 乾淨、58 檔 / 508 測試通過），我實跑過，輸出附在 §7。
但這輪 UAT 的兩個「前提」失敗與 B1 未通過，**都落在綠測看不到的地方**，而且不是巧合——
它們共用同一個結構成因：

> **這個 codebase 把「狀態機」做得很好，把「狀態機的邊界」留白了。**
> 三台核心機器（DSM-1 載入、DSM-4 瀏覽、DSM-3 阻斷面）的**內部**轉移都有型別、有具名失敗、
> 有 transition test；但機器與外界相接的三個面——**Web Worker 邊界**、**掃描視窗邊界**、
> **遮蔽規則對「路徑」的定義**——都沒有觀察者，也都沒有降級路徑。UAT 的三個失敗各自坐在其中一個上面。

**「邊界」這個詞在這裡蓋了三件性質不同的事**（只有第一件真的是狀態機問題）：
D1 機器只模型化「答案」、沒模型化「回答的裝置會不在」；D2 量出來的常數沒有失效條件；
D3 同一份知識的第二份複本沒有派生關係。逐條診斷、以及為什麼六道閘門全部結構性看不見，
見 **[§12](#12方法論診斷為什麼這三件事會同時發生)**——那一節才是下一輪真正該修的東西。

| UAT 項 | 現象 | 本次查到的成因 | 狀態 |
|---|---|---|---|
| 前提1 | Codex 全部無法載入，`Session worker failed.` | **不是解析問題**。358 份真實檔案跑完整條資料路徑（含 streaming 與 structuredClone）全數通過。失敗在 Worker 開機邊界，而該邊界**沒有型別、沒有 fallback、沒有測試** | 成因定位到層級，**未定位到單一原因**；§2 給了唯一該跑的診斷 |
| 前提2 | 匯出遮蔽漏掉 `C--Users-gunda--claude` | 遮蔽規則只認 `C:\Users\`／`/home/`；而**同一個 codebase 的 `sessionIndexer.ts` 早就寫著**「目錄名是編碼過的，`: \ .` 全變成 `-`」。兩個模組對「什麼是使用者路徑」有兩份定義，只有一份是對的 | **已定位，可直接修** |
| B1 | 清單絕大多數仍是 `rollout-…`，另有 `<>`、`1. 混用` | **A2 的 59.8% 是真的，但答的是另一個問題**。清單按時間新→舊排序，而**最新 10 筆有 9 筆是檔名標題**；成因是 Codex 的 `developer` 系統提示已長到把第一則真人訊息擠出 128 KB 檔頭掃描視窗 | **已定位並量化** |

另外一個必須先講的更正：

> **UAT §A2 寫「剩下 144 份經三輪探針確認整份檔案沒有真人打的字」——這對其中 36 份是錯的。**
> 我用同一份判準逐檔讀**整個檔案**核對：144 份檔名標題裡，**108 份確實整份沒有真人文字**，
> 另外 **36 份有**，而且第一句就是好標題（例：「這個專案對於 codex 這邊的 session 解析一直存在問題…」）。
> 探針跟索引器用了同一個視窗，所以「沒看到」被記成了「不存在」。這正好回答你在 A2 欄位問的
> 「憑據是？」——憑據不足，數字要改。

---

## 1　方法與可複現性

所有數字都是本機實跑，不是推導。腳本留在 `.tmp/repro/`（`.gitignore` 已涵蓋，不進版控），
用專案自己的 `src/` 程式碼跑，不是重寫一份會走樣的複本：

```powershell
npx vitest run --config .tmp/vitest.repro.config.ts
```

| 探針 | 問的問題 | 用到的正式程式碼 |
|---|---|---|
| `codex.test.ts` | 整檔解析路徑會不會炸 | `detectAdapter` → `adapter.parse` → `buildSessionDocumentFromParsedFiles` → `structuredClone` |
| `worker.test.ts` | **Worker 走的 streaming 路徑**會不會炸 | `parseJsonlBlob`（`CodexJsonlAccumulator`）→ 同上 |
| `index.test.ts` | 清單「使用者實際看到的那一段」長什麼樣 | `buildSessionIndex` |
| `window.test.ts` | 第一則真人訊息落在哪個位元組 | `flattenTextBlocks` / `isAutoReviewDump` / `stripInjectedPreamble` |
| `join.test.ts` | 檔名標題列裡，哪些是「真的沒有」哪些是「沒看」 | `buildSessionIndex` ＋逐檔全檔核對 |

`scripts/measure-codex-index.mjs` 我也重跑了一次，數字與 UAT §A 完全一致（100.0% / 59.8%），
**所以 A1／A2 的量測本身沒有造假，問題出在它回答的是哪一個問題**——見 §4。

---

## 2　前提1：Codex 全部無法載入（`Session worker failed.`）

### 2.1 先排除的：不是 Codex 解析難

你問「codex 的 session 解析到底難在哪裡」。答案是：**這一次不難，而且沒壞。**

拿你機器上 358 份 rollout 的最新 15 份（149 KB ～ 34 MB），走**與 Worker 完全相同的那條路**
（`parseJsonlBlob` 的逐行 accumulator，不是整檔 `parse()`）：

```
15/15  stream=recognized   spans=2 … 5559   clone=ok
34189KB  stream=recognized lines=12920 spans=5559 clone=ok
```

`clone=ok` 那一欄是刻意加的：Worker 回傳結果要過 `postMessage` 的 structured clone，
不可複製的值會在那裡爆掉。**沒有一份不可複製。**

再看那一句錯誤字串本身。它只有一個產生點：

```
src/core/ingest/sessionLoader.ts:66
worker.onerror = (event) => { … reject(new PipelineFatalError("LOAD_FAILED", event.message || "Session worker failed.")); };
```

`"Session worker failed."` 是 `event.message` **為空**時的後備字串。Worker 內部的
`load()` 由頭到尾包在 `try/catch` 裡，任何解析／建構的例外都會走 `post({type:"error"})`
把**具名 code** 送回來——你看到的不是具名 code，代表這個例外**根本沒有進到 `load()`**。
在瀏覽器裡 `onerror` 帶空 message，典型只有兩種：**Worker 腳本沒載入成功**，或 **Worker 行程死了**。

### 2.2 為什麼「所有 Codex 項目」看起來像 Codex 專屬——其實不是

追一次入口就知道：

| UI 入口 | 走哪條 | 用不用 Worker |
|---|---|---|
| 「從對話集選擇」→ 挑一筆 | `loadIndexEntry` → `loadFromBlobs` | **是** |
| 「載入 .jsonl」單檔按鈕 | `SessionLoadActions.onFiles` → `loadFromBlobs` | **是** |
| 內建範例 | `loadFromText` | 否 |

**使用者發起的載入，一條不漏，全部經過 Worker。** 你這次是在 `~/.codex/sessions` 上操作，
所以「全部失敗」看起來像 Codex 專屬；但依這張表，**同一時刻去載 Claude Code 的 session 也會一樣失敗**。
這是本輪最該先確認的一件事，也是下面診斷的第 1 步。

### 2.3 這個邊界為什麼三道閘門都攔不到（本報告的核心發現）

`src/store/sessionStore.ts:735` 的 `loadFromFiles` 是一條**同步、不經 Worker、功能完整**的載入路徑。
它的生產端呼叫者是：**零個**。

```
loadFromFiles 呼叫點：sessionStore.ts 定義 1 處 + sessionStore.test.ts 18 處 + 生產端 0 處
```

也就是說：

- **store 測試裡有 18 個案例在測一條使用者永遠走不到的路**，而真正的那條（Worker）在 node 環境下
  `transitions.test.ts` 自己註明「沒有 Worker，所以只斷言機器的邊」，`sessionLoader.test.ts` 用的是假 worker。
  508 個綠測，**生產載入路徑的邊界一次都沒有被真的執行過**。
- 同時，**Worker 掛掉時沒有任何降級**：一條已經寫好、測過 18 次的同步路徑就躺在同一個 bundle 裡，
  但沒有人在 `catch` 裡回頭用它。單點故障 + 現成備援沒接上。

這一條同時解釋了「為什麼修了 R1～R7 之後，一個更基本的東西壞掉卻沒人發現」。

### 2.4 唯一該跑的診斷（**不要先改程式**）

依既有工作原則，同一症狀第二次出現前不得再猜。以下三步，跑完就能收斂到單一成因：

1. **同一次 preview、同一個瀏覽器，改去載一份 Claude Code 的 session**（`~/.claude/projects/…`）。
   - 也失敗 → 是 Worker 邊界，與 Codex 無關，往第 2 步。
   - 只有 Codex 失敗 → 我這邊 358 份的證據與現象矛盾，屆時把 DevTools 主控台整段給我，另立 RCA。
2. **開 DevTools → Network，篩 `session.worker`**，看那個請求的狀態碼與 MIME type。
   建置產物寫死的是絕對路徑 `new URL("/assets/session.worker-KykFupHx.js", import.meta.url)`
   （`dist/assets/index-BQzKs9dY.js` 內實測）。只要不是從網站根目錄提供服務——例如
   **直接用檔案總管開 `dist/index.html`（`file://`）**、或掛在子路徑下——這個請求就會 404，
   而 404 的 Worker 在 Chrome 正是「`onerror`、`message` 為空」。這是目前最合理的單一假設。
3. **DevTools → Console**，看有沒有紅字在 `session.worker-*.js` 這個檔名上。有的話那才是真正的例外。

回報時請附：第 1 步的結果（Claude Code 是否也失敗）、第 2 步的狀態碼、網址列的完整 URL。
這三樣就足以定案，不需要你找外援。

### 2.5 定案後該做的（本輪不做，先記著）

- `worker.onerror` 現在把 `event.filename` / `lineno` / `error` 全丟掉，只留一句無主的英文。
  這是 R9 RC-5「失敗必須具名」在 Worker 邊界的漏網之魚：**加一個 `WORKER_BOOT_FAILED` 具名 code
  並保留 filename/lineno**，比修任何一個 adapter 都值錢。
- **接上 `loadFromFiles` 當降級路徑**：Worker 起不來時退回同步解析（大檔會卡 UI，但「慢」遠勝過「全部讀不到」），
  並出一條 `warn` 說明為何變慢。

---

## 3　前提2：匿名化漏掉壓平後的專案路徑

**已定位，靜態可證。**

```
src/core/privacy/detectors.ts:29   /(?<=\b[A-Za-z]:\\Users\\)[^\\\s]+/g      ← 只認 C:\Users\
src/core/privacy/detectors.ts:30   /(?<=\/(?:home|Users)\/)[^/\s]+/g          ← 只認 /home/ /Users/
```

而**同一個 repo 的索引器早就知道還有第二種形狀**：

```
src/core/index/sessionIndexer.ts:387-389
// 專案路徑取自紀錄自報的 cwd。目錄名是編碼過的（`:` `\` `.` 全變成 `-`），
// 反解會猜錯，所以解不出來就留 null。
```

`C:\Users\gunda\.claude` 被 Claude Code 壓平成 `C--Users-gunda--claude`，
上面兩條規則一條都不匹配（沒有 `:`、沒有 `\`、沒有 `/`），於是**使用者名整段留在匯出檔裡**——
你數到的 6 處。

這是典型的 **ungated twin（沒有閘門的雙生實作）**：「什麼是使用者路徑」這件事在專案裡有兩份知識，
一份在索引器的註解裡、一份在偵測器的正則裡，兩份從來沒有互相對過，也沒有任何測試會在它們分岔時變紅。

修法有兩層，建議一起做：

1. **補規則**（治標，但必要）：加一條認 `[A-Za-z]--Users-<name>` 與 `-home-<name>` 的
   `user_path` 規則。注意壓平後 `.` 也變 `-`，所以 `.claude` → `-claude`，
   邊界不能只靠 `\b`。
2. **補閘門**（治本）：把「路徑的已知形狀」抽成一份共用常數，索引器與偵測器同時讀它，
   並加一個回歸測試：**同一個 cwd 的原形與壓平形，兩者都必須被遮**。
   沒有這一層，下一種變形（例如 WSL 的 `/mnt/c/Users/`）還會再漏一次。

> 這一條同時是 `sec.*` 的**發掘階段候選**（可分享產物洩漏 PII），信心低、無 receipts。
> 若要正式定級與追攻擊面，交給 `security-deep-checklist`，不在本報告的判定範圍。

---

## 4　B1：清單標題——量測是對的，答的是別的問題

### 4.1 你看到的和報告寫的，兩個都沒錯

用**正式的 `buildSessionIndex`** 跑你的 358 份，按它自己的排序（`endedAt` 新→舊，
也就是清單第一頁）逐段統計：

| 你捲到哪 | 檔名標題佔比 |
|---|---|
| 前 10 筆 | **9 / 10 = 90.0%** |
| 前 20 筆 | 17 / 20 = 85.0% |
| 前 30 筆 | **27 / 30 = 90.0%** |
| 前 40 筆 | 28 / 40 = 70.0% |
| 前 100 筆 | 49 / 100 = 49.0% |
| 全部 358 筆 | 144 / 358 = **40.2%**（＝ A2 的 59.8% 的補數） |

**A2 的 59.8% 是全語料平均；B1 這個驗收步驟的可視範圍是「最新的一螢幕」，那裡是 10%。**
兩個數字都對，但拿全語料平均去讓人驗證一個「打開來看第一頁」的步驟，
就是「報告了比率、沒報告尺規」——這正是本專案自己訂下的量測紀律要防的事。

### 4.2 為什麼偏偏是新的那些沒有標題

量第一則「可用真人訊息」（＝過了 `isAutoReviewDump` 與 `stripInjectedPreamble` 之後還剩文字）
落在檔案的第幾個位元組：

```
掃描視窗：檔頭 128 KB + 檔尾 128 KB（sessionIndexer.ts:25-26）
358 份中 260 份大於 256 KB，也就是中段完全不會被讀到

第一則可用真人訊息的位移（260 份大檔）：
  n=184  min=17,401  p25=20,396  median=26,655  p75=127,569  max=1,605,572
  超過 128 KB 檔頭視窗者：43 / 184 = 23.4%

最新 20 份逐筆：只有 2 份的第一則真人訊息落在檔頭視窗內
其餘落在 163 KB ～ 198 KB —— 剛好越過 128 KB 邊界一點點
```

成因很清楚：**Codex 的 `developer` 系統提示（AGENTS.md ＋ skills ＋ instructions）
在你這台機器上已經長到把第一則真人訊息推出 128 KB 之外**。
提示愈長 → session 愈新 → 標題愈可能掉。所以壞掉的正好是清單最上面那一段。

`scanFile` 有一條放大到 1 MB 的補救（`sessionIndexer.ts:246`），但觸發條件是
**「跨越邊界的那一行超過 32 KB」**——為截圖 base64 設計的。系統提示是**很多行、每行都不大**，
所以這條補救對這個形狀完全不會啟動。規則是為上一個病例寫的，這是新的病例。

### 4.3 「沒有真人打字」的 144 份，有 36 份是誤記

把索引器判為 `titleSource: "filename"` 的 144 列，逐檔用**同一套判準**讀完**整個檔案**：

```
filename 列                                        : 144
　其中整份檔案確實沒有真人文字                       : 108
　其中檔案裡有真人文字、只是掃描視窗沒讀到             :  36
```

那 36 份被丟掉的第一句話長這樣（節錄，都是很好的標題）：

```
588KB   「這個專案對於codex這邊的session解析一直存在問題，很容易出現噪音…」
1994KB  「先讀 phase log，再依 PSM 的 M0 開工，除非遇到使用者決策相關的問題再停下向我提問。」
16889KB 「權限L2自由發揮，提供我想法，然後寫成文件留下來給我。…」
34189KB 「你的權限L2全開，來進行本次對話的內容討論與執行。…」
6801KB  「按照這篇文章的指示依序進行任務。」
```

**這直接回答你在 A2 欄位問的三個問題**：

- **「應保留或去除？」** — 保留，而且 §F1 那個「要不要收緊成機器任務」的裁決**現在不該做**。
  母體是錯的：真正「整份沒有真人打字」的是 **108**，不是 144。拿含 36 個偽陽性的母體去裁決，
  會把 36 份真正的對話標成機器任務。
- **「憑據是？」** — 目前的憑據不足。探針與索引器共用同一個視窗，所以只證明了
  「視窗內沒有」，沒有證明「檔案裡沒有」。要裁決，先把探針改成全檔掃（我已跑過，數字在上面）。
- **「目前有沒有對內容的展示做調整？」** — 沒有。`kind` 與 `titleSource` 目前是普通的枚舉值，
  **不帶任何「這是在部分視窗下得到的結論」的標記**。`SessionIndexEntry` 只有 `countsExact`
  誠實標出「計數是下限」，但**標題與分類沒有對應的欄位**——這是 §5 的 F-03。

### 4.4 另一半：25 / 214 個「有標題」其實是雜訊

`stripInjectedPreamble` 的白名單（`src/core/text/preamble.ts:9-18`）是 Claude Code 形狀的，
而且正則寫死 `^<(tag)>`——**帶屬性的標籤即使列進白名單也匹配不到**。
於是這些東西直接變成 session 標題（實測 214 個 derived 標題裡有 25 個，11.7%）：

```
<codex_internal_context source="goal">        ← 帶屬性，白名單也救不了
<scheduled-task name="…" file="C:\Users\…">   ← 同上，還順便把路徑放進標題
<task-notification>   <turn_aborted>   <codex_delegation>
[external unsupported block: image]           ← 方括號，完全不在白名單語法裡
```
```
1. 混用          ← 清單第一行
```
（`` ``` ``、`ok`、`權限L1。` 這種太短的也在其中。）

`1. 混用` 與 `<>` 就是你在 B1 備註裡看到的那兩種。它們不是「標題挑錯」，
是**前言剝除規則沒有跟上 Codex 的注入形狀**——同一個 R1 卡片的另一半。

---

## 5　狀態機盤點：DSM 現況 vs `DIT_STATE_MACHINES.md`

`docs/design/DIT_STATE_MACHINES.md` 自稱「持續維護：動到任何一台機器就更新對應段落」。
`git log` 顯示它自 R9 之後**只被動過一次**（`414a171`，分類器修正），
而 R10、R10.1、R11、R11.2 都動過機器。逐條核對如下。

| ID | 文件說 | 實測 | 判定 |
|---|---|---|---|
| DSM-1 載入 | ✅ R9 修復 | 批次判定五狀態仍然正確；但**Worker 邊界不在圖上**，且它是唯一的生產路徑 | ⚠ 圖不完整（F-01/F-02） |
| DSM-2 診斷分級 | ✅ | `informational()` 已補上 info 的出口（R11.2 R3），文件未記 | ⚠ 文件落後 |
| DSM-3 阻斷面 | ✅ | 仲裁本身仍然乾淨、無新可變狀態 | ✅ 但見 F-07 |
| DSM-4 瀏覽 | ✅ R9 新增 | 新增 `browseGeneration` 世代守衛（R11.2 C6），**文件裡沒有這台機器** | ⚠ 文件落後（F-11） |
| DSM-7 同意閘門 | ⚠ resolver 不在 state | 未變，另新增 `pendingPrivacyScope`（R11 S-03），模組層變數從 1 個變 2 個 | ⚠ 債務擴大 |
| DSM-8 快取還原 | ⚠ `cacheReady` **3 個寫入點** | 實測 **6 個**（`sessionStore.ts` 357 / 377 / 385 / 468 / 774 / 950）＋初值 | ⚠ **債務翻倍，未更新** |
| DSM-9 逐步播放 | ⚠ timer 不在 state | 未變 | ⚠ 同前 |
| DSM-10 工作區檢視 | ⚠ 與 DSM-3 重疊 | 未變，且見 F-07 | ⚠ 同前 |

**趨勢指標（下次複審請重量一次）**：模組層可變狀態 9 個（`sessionStore.ts` 8 + `onboarding` 1）、
`cacheReady` 寫入點 6、`browseState` 寫入點 17（全在 store 內，單一擁有者成立）、
`primaryView` 寫入點 7。前兩個是上升的，後兩個健康。

### F-07　「誰把面板關掉」有五份互不一致的手寫清單

DSM-3 的設計要點是「仲裁不引入新的可變狀態，誰想開由既有狀態推導」。這一半做得很好。
但**推導所依據的那些 boolean，是被五個 action 各自手動清掉的，而且清的集合不一樣**：

| action | `mapOpen` | `settingsOpen` | `structureDrawerOpen` | `mapError` |
|---|---|---|---|---|
| `setPrimaryView` | ✔ | ✔ | ✘ | ✔ |
| `startReading` | ✔ | ✔ | ✘ | ✔ |
| `jumpToMapItem` | ✔ | ✘ | ✔ | ✔ |
| `setActive` | ✔ | ✔ | ✔ | ✔ |
| `gotoIndex` | ✔ | ✘ | ✘ | ✔ |

這正是 R9 RC-4 記載的「三個靠手動互清假裝互斥」——**表面（誰顯示）統一了，寫入（誰清除）沒有**。
目前不會爆，是因為優先序剛好掩護了差異；但這是「新增一個表面就會漏一格」的形狀，
而 F3 原則（修 leak 不可以用會 leak 的手段）在這裡沒有被貫徹到寫入端。

### F-08　DSM-4 `picking` 有一格未定義的轉移

`SessionBrowserDialog.onFallbackFiles`：

```tsx
const list = [...(files ?? [])].filter((file) => /\.jsonl$/i.test(file.name));
if (list.length === 0) return;          // ← 靜默
```

WebKit 後備路徑下，使用者選了一個沒有 `.jsonl` 的資料夾 → **什麼都不會發生**，
狀態永遠停在 `picking`，畫面上還寫著「等你選一個資料夾」。
`state × event` 表上這一格既不是轉移也不是明確拒絕，是空的。

### F-09　`loading` 不是互斥狀態

清單在 `browseState === "loading"` 期間仍然可點（`visible.length > 0` 不看狀態）。
連點兩筆時：後者 `loadFromBlobs` 開頭的 `activeSessionLoad?.cancel()` 取消前者 →
前者的 `finally` 把 `browseState` 寫回 `"indexed"`，**而後者還在載入中**。
另外 `loadIndexEntry` 只**讀** `browseGeneration` 不遞增（`sessionStore.ts:906`），
所以兩次併發載入共用同一個世代，世代守衛對它們之間無效。

### F-11　`browseGeneration` 是一台沒有登記的新機器

R11.2 C6 新增的世代計數器解掉了真正的競態（回歸測試也釘得漂亮），但：

- `DIT_STATE_MACHINES.md` §1 的機器清單裡沒有它；
- 認領（`++`）發生在 `pickAndIndexDirectory` / `indexFileList` / `resumeLastDirectory` / `closeBrowser`，
  但 `loadIndexEntry` 只讀不領 —— **不對稱，而不對稱處沒有寫下不變式**；
- `reset()` 與 `resetToSample()` 不動它。目前無害（它們不碰 `browseState`），但這是靠巧合成立的。

---

## 6　文件漂移（doc drift）

**F-12　`docs/BACKLOG.md` 開頭那三個「全部仍然存在」的 blocker，實測有三個已經修掉了。**

| 項 | 文件說 | 實測 |
|---|---|---|
| B1 放大檔頭後沒重新判定 adapter | 仍存在 | **已修**：`sessionIndexer.ts:252` 放大後重跑 `detectAdapter` |
| B2 Snapshot 仍會 fetch `dit.config.json` | 仍存在 | **已修**：`sessionStore.ts:1066` 有 snapshot guard，且 `snapshot.tsx` 在 `render()` **之前** hydrate，時序成立 |
| B3 WebKit 後備沒有失敗出口 | 仍存在 | **已修**：`indexFileList` 有 try/catch；`resumeLastDirectory` 非 FSA 走 `"picking"` |

文件寫著「2026-08-14 以現行程式碼逐行核對過，沒有一項被修掉」。**這句話現在是假的，而且它站在 backlog 最上面。**
一份宣稱核對過的清單比沒有清單更危險——它會讓下一輪跳過複核。

**F-04　量測與驗收步驟不同母體**（見 §4.1）。A1／A2 的數字本身可複現，
但放在 B1 這個「打開來看第一頁」的步驟旁邊時，讀者會拿它去對照一個它沒有測量的東西。
建議往後這類指標一律附「可視窗口」的分段值（前 10／前 30／全體），而不是只給全體平均。

---

## 7　閘門實測輸出

```
> tsc --noEmit
（無輸出，乾淨）

> vitest run
 Test Files  58 passed (58)
      Tests  508 passed (508)
   Duration  3.42s
```

與 UAT 卡宣稱一致。**但請注意 §2.3**：這 508 個綠燈裡，
生產載入路徑的 Worker 邊界一次都沒被執行過，而 store 測試有 18 個案例在測一條 UI 走不到的路。
綠測在這裡證明的東西比它看起來少。

---

## 8　依嚴重度排序的完整清單

### blocker

| ID | 標題 | 位置 |
|---|---|---|
| **F-01** | 生產唯一的載入路徑（Web Worker）沒有任何行程內觀察者；資料路徑已證清白，失敗必在未受測的邊界 | `src/core/ingest/sessionLoader.ts`、`src/store/transitions.test.ts` |
| **F-02** | Worker 邊界失敗無具名 code、丟棄 `filename`/`lineno`，且**沒有降級路徑**——現成的同步路徑 `loadFromFiles` 生產端零呼叫 | `sessionLoader.ts:66`、`sessionStore.ts:735` |
| **F-03** | 掃描視窗的截斷未編碼進 `SessionIndexEntry`：`countsExact` 只保護計數，`title`/`kind` 沒有對應標記，於是「沒看到」與「不存在」在型別上無法區分 | `src/core/index/contracts.ts`、`sessionIndexer.ts` |

### should-fix

| ID | 標題 | 位置 |
|---|---|---|
| **F-05** | `stripInjectedPreamble` 白名單是 Claude Code 形狀，且 `^<(tag)>` 無法匹配帶屬性的標籤；25/214 個 derived 標題是注入標記 | `src/core/text/preamble.ts:9-25` |
| **F-06** | 遮蔽器不認壓平後的專案路徑，而索引器的註解早就寫著那個形狀——ungated twin，使用者名外洩 | `src/core/privacy/detectors.ts:29-30` vs `sessionIndexer.ts:387` |
| **F-07** | 「誰關閉面板」有五份互不一致的手寫清單，RC-4 的形狀在寫入端存活 | `sessionStore.ts:1140/1145/1207/1229/1234` |
| **F-08** | DSM-4 `picking` 遇到「後備檔案清單沒有 .jsonl」是靜默的未定義轉移 | `SessionBrowserDialog.tsx:70` |
| **F-09** | `loading` 非互斥：清單載入中仍可點，且 `loadIndexEntry` 只讀不領世代 | `sessionStore.ts:897-924`、`SessionBrowserDialog.tsx:140` |
| **F-04** | 驗收指標與驗收步驟母體不同（全語料 59.8% vs 首頁 10%） | `UAT_R11.2_v1.0.md` §A2 / §B1 |
| **F-12** | BACKLOG 三個「仍然存在」的 blocker 已修，文件仍宣稱逐行核對過 | `docs/BACKLOG.md` |

### consider

| ID | 標題 | 位置 |
|---|---|---|
| **F-10** | `cacheReady` 寫入點由 3 增為 6，`DIT_STATE_MACHINES.md` 未更新（該文件自稱持續維護） | `sessionStore.ts` / `docs/design/DIT_STATE_MACHINES.md` |
| **F-11** | `browseGeneration` 未登記為機器；認領不對稱且無不變式 | `sessionStore.ts:406` |
| **F-13** | `useBlockingSurface` 的選擇器每次回傳新物件，zustand v4 預設 `Object.is` 永不相等 → **7 個 dialog 在每一次 `set()` 都重繪**，含載入進度的逐 chunk 更新 | `src/components/useBlockingSurface.ts:36` |
| **F-14** | `INDEX_MAX_FILES` 在排序**之前**截斷（`mains.slice(0, 500)` 用目錄順序），超過 500 份時拿到的不是最新的 500 | `sessionIndexer.ts:322` |
| **F-15** | 「已有另一則複核在等待」用了 `PRIVACY_DETECTOR_FAILED` 這個名不符實的 code | `sessionStore.ts:1304` |
| **F-16** | 取消隱私複核會被 `AnnotationJobController` 記成一次 `failed`，進度條顯示不存在的失敗 | `sessionStore.ts:1388` + `jobController.ts:51` |

---

## 9　建議的處理順序（含「先別做什麼」）

1. **先跑 §2.4 的三步診斷。** 在拿到 Network 面板那個狀態碼之前，不要動 `codexJsonl.ts` 一行——
   它是本次唯一被證明沒問題的部分。
2. **F-06 可以立刻修**，範圍小、可測、有明確回歸案例（原形＋壓平形都必須遮）。
3. **F-03 + F-05 + §4 是同一件事的三個面**，建議合成一張卡：
   讓 `SessionIndexEntry` 能說「我只看了一部分」，把前言剝除補上 Codex 形狀與屬性支援，
   並把檔頭視窗的放大條件從「單行 > 32 KB」改成也考慮「視窗內沒有任何真人訊息」。
4. **§F1 的裁決先擱置**（母體錯誤，見 §4.3）。要裁決請先用全檔探針重算，母體是 108 不是 144。
5. **F-01/F-02 的修法排在診斷之後**，但無論診斷結果如何，「具名 code + 保留 filename/lineno」都該做——
   它讓下一次同類回報可以一次定案。

### 明確不建議做的

- **不要為了讓 B1 好看而放寬標題推導**（例如「拿第一則 assistant 訊息當標題」）。
  問題是掃描視窗，不是推導規則；放寬只會把 §4.4 的雜訊標題變多。
- **不要回頭改 `resumeLastDirectory` 的 `"picking"`**。Phase 16 已經查明它是 WebKit 後備路徑的唯一入口，
  這個結論在本次複核中成立（`browseFailure.test.ts` 有對應的回歸測試釘住）。
- **不要現在重構 DSM-7/8/9 的模組層變數**。它們是既有債、行為正確、且與本次三個失敗無關；
  現在動它們只會把驗收面弄髒。F-10 要修的是**文件**，不是程式。

---

## 10　本次沒有覆蓋到的（由 coverage.json 產生，不是憑印象補的）

| 未覆蓋 | 原因 |
|---|---|
| `src/core/adapters/codexJsonl.ts` 第 200 行以後（約 460 行） | 只讀了註解與前段；本輪已用 358 份真實檔案的行為證據替代逐行閱讀，但**未做逐行審查** |
| `src/core/adapters/claudeCodeJsonl.ts` | 本輪焦點在 Codex 與狀態機，未讀 |
| `src/core/normalize` / `denoise` / `distill` / `view/*` | 未讀。**注意**：`docs/BACKLOG.md` 記載 R10-B（去噪與蒸餾寫死 Claude 工具名、不讀 `doc.session.source`）仍未處理，本輪未複核該項是否仍成立 |
| `src/core/export/*`（transcriptRedact 以外約 1,100 行） | 未讀。BACKLOG 已註明這批「從未被任何審查看過」，本輪只補了 `redact.ts` + `detectors.ts` |
| `src/core/llm/*`、`src/i18n/*`、多數 `src/components/*` | 未讀 |
| **所有外觀（appearance）判定** | 本次未取得瀏覽器分頁與伺服器啟動權限（兩次被權限層擋下），**沒有任何像素證據**。R5 的 tooltip、R3 展開後的樣子一律未驗，維持 UAT 卡上的 **[目視]** 標記 |
| 前提1 的單一根因 | 需要 §2.4 的診斷輸出；本報告只把它收斂到「Worker 邊界」並排除了資料路徑 |
| 相依套件的安全公告 | 屬易變外部事實，未重查（BACKLOG 的 esbuild/vite advisory 需要時再查證） |

---

## 11　可反駁性（refutability）

- **成立條件**：以上所有數字取自 2026-08-20 的 `feat/r11.2-uat-repairs` @ `c2216c0`
  與本機 `~/.codex/sessions` 的 358 份 rollout。換一台機器、換一個 Codex 版本，
  §4 的位移分布會變（系統提示長度是關鍵變數），但**視窗機制本身的缺陷不隨之改變**。
- **會被推翻的方式**：
  - §2 若診斷第 1 步顯示「Claude Code 可以載入、只有 Codex 不行」，
    則 F-01/F-02 的因果敘述要重寫（缺陷仍成立，但不是全域單點故障）。
  - §4.3 的 108 / 36 拆分若用了與索引器不同的「真人訊息」定義就會變動；
    我用的是索引器自己的那一套（`flattenTextBlocks` → `isAutoReviewDump` → `stripInjectedPreamble`），
    腳本在 `.tmp/repro/join.test.ts`，可逐行覆核。
- **證據層級**：§2.1、§4.1–4.3、§7 為**本機實跑輸出**；§3、§5、§6、§8 為**逐行原始碼核對**；
  §2.4 的 404 假設為**尚未驗證的推論**，已明確標示為假設而非結論。

---

## 12　方法論診斷：為什麼這三件事會同時發生

> 先更正 §0 的措辭。§0 說「把狀態機的邊界留白了」，用一個詞蓋了三件性質不同的事。
> **只有第一件是狀態機問題**，另外兩件根本不是。分開講才有辦法各自補。

### 12.1 三個缺陷類別

#### D1　機器模型化了「答案」，沒有模型化「回答的裝置會不在」

**這是狀態機問題，而且是很具體的一種。** DSM-1 的狀態表列的全是**內容的結局**——
`recognized` / `unrecognized` / `parsed` / `parse_failed`、`ok` / `ok_partial` / `no_main` /
`multi_session` / `empty`。整張表**沒有一格是「算出這些答案的東西起不來」**。

這個 codebase 完全知道該怎麼做，證據就在隔壁：

```
src/core/llm/endpointStatus.ts
"checking" | "ready" | "offline" | "cors-blocked" | "auth-missing" | "proxy-missing"
```

`EndpointState` 把「裝置不可達」列成一級狀態，`classifyUnreachable()` 還誠實寫下
「光看 error 分不出是 CORS 還是沒開，所以用 preset 的 kind 當先驗」。
`DIT_STATE_MACHINES.md` 自己把 DSM-5 稱為**房規範本**，§4 F1 拿它當
「這件事在本 codebase 裡做得到」的證明。

更貼身的對照在同一個功能內：

| 瀏覽器能力 | 能力偵測 | 降級路徑 | 具名失敗 |
|---|---|---|---|
| File System Access API | `isDirectoryPickerSupported()` | `webkitdirectory` 後備 | `index_failed` + `INDEX_*` codes |
| module Worker | **無** | **無** | **無**（只有 `LOAD_FAILED` 一個統包 code） |

差別不在能力，在於**FSA 的缺席被使用者回報過，Worker 的沒有**。
`sessionStore.ts:746` 的註解甚至明白寫著「建構 Worker 失敗（CSP、`file://`、瀏覽器不支援
module worker）」——**知道會失敗、寫在註解裡、沒有進型別、沒有進狀態、沒有降級**。

所以 F1 那句「我們把抵達好狀態這件事模型化了，然後就停手了」**只關掉了一半**：
R9 補的是**內容側**的失敗（部分成功、缺主檔、診斷分級），**裝置側**的失敗一格都沒補，
而文件把 F1 記成已解決。這是本報告要求把 F1 重新開啟的理由。

#### D2　量出來的常數沒有失效條件

**不是狀態機問題，是校準（calibration）的生命週期問題。**

```
grep -rn "實測\|量出來\|measured" src --include=*.ts | grep -v "\.test\."   →  17 處
```

每一處都做得很好：128 KB 視窗附著「83 個帶標題檔案、標題位置中位數距檔尾 7.5 KB、
頭尾各 64 KB 只涵蓋 81/83」；熵閾值附著「T=4.0 命中 10,706 / T=4.3 命中 2,950」；
exec 工具名附著「358 份 rollout、50,221 次出現」。

**17 個常數都蓋了「當初怎麼量出來」的章，0 個蓋了「什麼事件會讓它失效」的章。**

而 128 KB 所依據的事實——「別人家的 session 檔長什麼樣」——恰好是**唯一保證會變**的那一類。
Codex 的 `developer` 系統提示長大了，數字沒動，於是它從「量測過的參數」悄悄變成
「過期的猜測」，**而且外觀一模一樣**：註解還在、證據還在、只是不成立了。

`DIT_STATE_MACHINES.md` §4 F2 寫的是「對外部格式的假設，必須用外部資料驗證」——這件事做到了。
**缺的是下半句：驗證會過期。**

#### D3　同一個知識的第二份複本沒有派生關係

**也不是狀態機問題，是 §11 的 ungated twin。**「什麼是使用者路徑」在
`detectors.ts:29` 是正則、在 `sessionIndexer.ts:387` 是註解，兩份互不知道，
沒有任何測試會在它們分岔時變紅。

值得記下的是：**本輪的 R6 卡片剛好修掉了同型的一個實例**（圖例 vs 卡片標籤 →
一份來源 + 一個「少一個鍵就變紅」的測試，`satisfies` + 派生的 `GROUP_KINDS`）。
技術會了、用了一次、**當成症狀修，沒有當成一類推廣**。

### 12.2 為什麼每一道閘門都是結構性看不見（而不是「忘了」）

| 閘門 | 結構性盲點 |
|---|---|
| `tsc --noEmit` | 三件全是值層／執行期。天生無關 |
| 508 個單元測試 | **測試替身正好架在被問的那個邊界上**。`sessionLoader.test.ts` 用假 worker，測的是協定不是傳輸；`transitions.test.ts` 註解自承「node 沒有 Worker，只斷言機器的邊」。**盲區是自己寫下來的，卻從未被升級成風險**——一句「這裡測不到」是一條 finding，不是一則備註 |
| transition test | 表從程式碼推出來，**能抓已寫邊之間的不一致，抓不到沒被想到的狀態**。反例值得記：`browseFailure.test.ts` 抓到了真缺陷，因為它是**從不變式**寫的（「只有使用者的意思可以讓瀏覽器消失」）並對 6 個狀態做了 `it.each` **全稱**檢查。所以更精確的盲點是：**狀態空間被窮舉了，事件空間從來沒有**——全 repo 沒有任何一份 `EVENTS` 清單，於是 F-08 那格（`picking` × 選到沒有 `.jsonl` 的資料夾）永遠不會被點名 |
| 量測腳本 | 最需要說清楚的一個。`measure-codex-index.mjs` 刻意 boot Vite、載入**真正的** `buildSessionIndex`，「不是會走樣的複本」——**這個設計原則是對的，而正是它生出了盲點**：儀器與被測物共用同一個取樣視窗，於是**取樣本身的缺陷對它必然不可見**。A2 因此把 144 份報成「整份沒有真人打字」。缺的不是更好的腳本，是一個**用不同讀法讀同一份資料的外部對照** |
| 手動 UAT | **唯一抓到全部三件的閘門**。但抓到的是症狀、沒有歸因，發生在迴圈最貴的位置（本輪已宣告完工之後），而且**會被一個綠色指標蓋過去**——A2 的 59.8% 讓 B1 看起來像驗收卡寫錯，而不是產品有缺陷 |
| 文件（BACKLOG／DSM 冊） | 快照被當成現況主張。`BACKLOG.md` 寫「2026-08-14 逐行核對過，沒有一項被修掉」，實測三個全修了。**一份宣稱核對過、卻沒有重新核對觸發器的文件，會安靜地腐爛成假話**，而且沒有人會重跑散文 |

**貫穿所有閘門的一句話**：這個專案的每一道閘門，都是拿系統去對照**同一位作者、同一時間
寫下的模型**。沒有任何一道閘門負責「拿模型去對照世界」，而唯一真的碰到世界的那道
（手動 UAT）最晚、最貴、最少跑。所以流程層的解法不是「加更多測試」，
而是**把一道便宜的、會碰到世界的檢查往前搬**。

### 12.3 一類一個機制（寫成資產的性質，不是給未來編輯者的提醒）

| 針對 | 機制 | 成本 | 會擋掉本報告的哪幾條 |
|---|---|---|---|
| D1 | 每台機器的狀態表加一列「裝置不在」。第一步照 DSM-5 抄：`WORKER_BOOT_FAILED` 具名 code（保留 `filename`/`lineno`）+ 退回已測過 18 次的 `loadFromFiles` | 小，單一模組 | F-01、F-02 |
| D2 | 17 個 measured 常數各補一行 `review-when:`，寫**事件**不寫日期（例：「Codex 改動 developer 提示注入方式時」）。再加一個 canary：把觀測到**最壞**的前言長度做成 committed fixture，斷言視窗仍涵蓋得到——格式漂移時它會變紅，那正是要的 | 小，但需要一次盤點 | F-03、§4 全部 |
| D3 | 把 R6 的技巧從一個症狀升成一條規則：**任何知識一旦有第二份複本，就必須有一個會在兩份分岔時變紅的測試**。路徑形狀先做一份共用表 | 小 | F-06 |
| 事件空間 | 在 `browseFailure.test.ts` 既有的 `STATES` 旁邊補一份 `EVENTS`，做 states × events 全稱檢查，每格必須是轉移或明確拒絕 | 中 | F-08，且以後每新增一個事件都得表態 |

### 12.4 這一節的可反駁性

- D1／D3 為**逐行原始碼核對**，可直接覆核；D2 的「17 處」是一次 grep 的計數，
  同一段註解內的多行會各算一行，**數量級可信、精確值不必當作硬數字**。
- 12.2 對量測腳本的判斷是**結構性推論**（儀器與被測物共用取樣窗），
  已由 §4.3 的外部對照實測證實一次；若日後量測腳本改用獨立讀法，這條即失效。
- **會推翻本節的證據**：若 §2.4 的診斷顯示 Worker 邊界其實有第三方（例如瀏覽器擴充、
  安全政策）介入而非本專案的建模缺失，D1 的**因果**要改寫——但
  「狀態表沒有裝置側狀態」這個事實不受影響。
