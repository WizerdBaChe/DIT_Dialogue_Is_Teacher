# RESEARCH R12 M8 — 三塊零測試的區域，以及量測覆蓋率時我自己的儀器先出錯

> 開工前的確認。這一卡（M8）不是新功能，是把 2026-08-27 證據稽核點名的三處覆蓋缺口
> （DW-19／DW-20／DW-21）補起來。**卡片加在 R12 已經 checkpoint 之後**，這一點刻意寫明，
> 事後檢討讀到時序才不會以為它跟 M1–M7 同時規劃 —— 它來自 R12 自己的驗證，而 R12 尚未驗收。
>
> 量測方式：先用 grep 盤一次「哪些模組沒有任何測試 import」，**發現這個量測本身有偽陽性**
> （§2），改用精確判準；再對每個模組讀出「它到底欠什麼行為」（§3）。2026-08-27。

---

## 1　邊界契約 (boundary contract)

**前提 (premises)**

- (user) 「把 DW-19/20/21 排進去，補完那三塊測試，然後收完。」—— 範圍是這三塊，不是全面提升覆蓋率。
- (model, **已驗證**) 這三個模組沒有任何測試 import 它們。驗證方式與一個偽陽性見 §2。
- (model, **已驗證**) `directorySource.ts` 看起來像被測到了：`browseFailure.test.ts` 會 import
  `@/core/index`（載入這個模組），但把 `pickDirectory` 與 `directorySourceFromFileList` 換成 mock
  ——**被 stub 掉的正是它自己的邏輯**。行覆蓋率工具會把它算成「已載入」。
- (model) 這三處都是「壞掉時兩層測試仍然全綠」的形狀，所以價值不在數字，在**失敗會不會被看見**。

**解讀分歧 (interpretation forks)**

- 「補測試」可以只寫刻畫測試 (characterization test) 把現況釘住，也可以順著測試去修被測出來的
  缺陷。本卡採後者，理由：本輪已有 P-005 的教訓——**斷言「值」而不是「行為」的測試等於沒有測**，
  而只釘現況正是那個形狀。翻轉點：若作者要求零程式碼變更，回退的是 §4 的兩個 one-line 修正，
  測試本身可原封不動改成 `.fails()` 標記，不必重寫。

**邊界輸入**：`src/core/index/directorySource.ts`、`src/core/ingest/session.worker.ts`、
`src/store/sessionStore.ts` 的 M2 接線。三者皆不碰 UI，不需要瀏覽器驗收。

**驗收**：見 §5。核心不是「測試通過」，而是**測試會失敗**——每一組都要有正對照。

**非目標與降級**：不處理 §2 清單上其餘模組（多數是 UI 元件，該由別的手段涵蓋）；不引入
覆蓋率工具或門檻數字；不改 `tsconfig` 的 `lib` 目標。

---

## 2　先量覆蓋率，結果第一個出錯的是量尺

盤點命令（可重跑）：對每個非測試的 `src/**/*.ts(x)`，看是否有任何測試檔 import 它的檔名。

```git bash
for f in $(find src -name '*.ts' -o -name '*.tsx' | grep -v '\.test\.' | sort); do
  stem=$(basename "$f"); stem="${stem%.*}"
  hits=$(grep -rl "from \"[^\"]*/${stem}\"\|from \"\./${stem}\"\|from \"@/[^\"]*${stem}\"" \
    src --include='*.test.ts' --include='*.test.tsx' | wc -l)
  [ "$hits" -eq 0 ] && echo "$f"
done
```

輸出 39 個檔案。**但這份清單有偽陽性，不能直接當覆蓋率報告用。**

校正（負向對照）：清單裡有 `src/core/privacy/gateway.ts`，而 `gateway.test.ts` 明明存在且直接測它
——因為那支測試寫的是 `from "./index"`（走桶檔 barrel），檔名 `gateway` 沒有出現。**凡是經由桶檔
被測的模組，這個量尺都會誤報成零測試。**

所以本卡不引用那份清單當作結論。稽核點名的兩個模組改用**精確判準**確認：

| 判準 | 結果 |
|---|---|
| 有沒有任何測試檔提到 `directorySource`？ | **沒有**（唯一命中是一句無關斷言裡的字串 `"session.worker-abc.js"`） |
| 有沒有任何測試檔提到 `session.worker`？ | **沒有**（同上那一句） |
| 有沒有測試經由桶檔載入 `directorySource`？ | 有兩支（`browseFailure` / `transitions`），而 `browseFailure` **把它的函式 mock 掉了** |

第三列才是這一項排第一的真正理由：它不是「還沒測」，是**看起來測了**。這與 P-006 是同一個
形狀——摘要行說綠，不代表跑過。

> **這一段本身就是本卡最該記住的東西**：判斷覆蓋率的工具如果沒有先用一個「已知有測」的模組
> 做正對照，它報出來的每一個零都不可信。ops 規則說的「量測類的判決要先確認正對照真的會觸發」
> 在這裡真的救了一次。

---

## 3　三個模組各自欠什麼行為

### 3.1 `directorySource.ts`（DW-19）— 守著一條這個 repo 真的踩過的不變式

R9.1 RC-A：**只有 `pickDirectory()` 內部那一次選擇器呼叫可以產生「取消」**。拿到 handle 之後的
任何失敗都是失敗，即使瀏覽器丟的也是 `AbortError`——剛授權的 handle 上 `getFile()` 就會丟。
兩者曾經共用一個 catch，結果索引失敗披著「使用者按了取消」的外衣，而呼叫端對取消的正確反應是
安靜關掉，於是硬失敗變成靜默。這正是作者當時回報的「第一次靜默失敗、第二次才成功」。

要釘的行為，兩側都要：

- 選擇器自己的 `AbortError` → `DirectoryPickCancelledError`；
- **拿到 handle 之後的 `AbortError` → 原樣拋出，不得變成取消**；
- 非 Abort 的選擇器錯誤（`NotAllowedError`）→ 原樣拋出，也不是取消；
- 權限：已授權不得再問（多問一次會燒掉使用者手勢）、可要求時問一次、被拒 → 具名的
  `DirectoryPermissionError`；
- `walk` 的路徑語意：巢狀以 `/` 串接，**根目錄自己的名字不算一段**；
- 兩個後端的**路徑一致性**——`webkitRelativePath` 帶著使用者選的那層目錄名，FSA 的走訪沒有。
  沒剝乾淨，每條路徑就多一段幽靈；下游的 `subagents/` 判定、每來源檔名樣式全都讀 `path`，
  而且完全不知道自己拿到的是哪個後端產的。這是整個檔案最吃重的一條性質。

### 3.2 `session.worker.ts`（DW-20）— 逐檔隔離與跨檔進度累加

兩段真邏輯，而且都屬於「壞掉不會拋例外」那一類：一批檔案裡悄悄少一個，畫面照樣渲染得出東西；
位元組計數器中途歸零，進度條最後照樣會到 100%。

要釘的行為：

- **逐檔隔離 (DSM-1)**：一個檔案讀不動 → 具名 `FILE_PARSE_FAILED` 診斷帶著路徑，其餘照常；
- **隔離不等於壓抑**：全部讀不動 → 仍然是 fatal，而且回報 `FILE_PARSE_FAILED`（真正發生的事）
  而不是 `NO_MAIN_TRANSCRIPT`（它造成的後果）；
- 進度：整批一個 `totalBytes`（不是每檔重來）、單調不倒退、**讀不動的檔案的位元組照樣計入**
  （否則進度條會停在失敗那一格）；
- 錯誤跨執行緒是 typed 的，不是字串；
- 降級記錄逐次清空——worker 會被重複使用，否則第二場 session 會帶著第一場的記錄，而那些記錄
  只出現在 console 報告裡，沒有人會發現它們屬於一個已經關掉的檔案。

對照組是 `sessionLoader.test.ts`：它用注入假 worker 測邊界的**另一側**。這裡做鏡像——注入假的
worker **scope**。模組在載入時就把 `self` 抓進區域變數，所以 stub 必須早於 import。

### 3.3 M2 的每來源位置記憶（DW-21）— 兩端都測了，中間沒有

`handleRepository.test.ts` 證明 repository 依來源分鍵；`SessionLoadActions.test.tsx` 證明兩層入口
畫得出來。**中間那段沒有任何測試**：`sessionStore` 的模組層 `cachedDirectoryHandles`、模組載入時
的預抓取、以及依 `activeSource` 切換的讀寫。接線剪斷，上述兩支測試都會維持全綠，而功能是死的。

要釘的正是卡片自己寫的驗收走法：**選 A 套挑資料夾 → 選 B 套挑另一個 → 回到 A 套**，要回到 A 的
位置，不是 B 的。加上兩條邊界：沒挑過的來源要**開選擇器**而不是借用另一套的位置；權限掉了只丟
**那一個**來源的記憶。

分層刻意：這支測試擁有 **store 的編排**（讀哪個槽、寫哪個槽、丟哪個槽），repository 的分鍵仍歸
`handleRepository.test.ts`。它以下全是真的——`restoreDirectorySource` 的權限重查、
`directorySourceFromHandle`、走訪、`buildSessionIndex`。

---

## 4　寫測試的過程中量到的兩個缺陷（都不是推論，都有正對照）

兩個都是「今天踩不到、但失敗模式最糟」的形狀，跟 M7 那個無聲的 `?? "claude-code"` 同一類。

### D-1　worker 的位元組總和算在 try 之外 → 沉默的永久停擺

`session.worker.ts` 裡 `load()` 唯一能回報失敗的地方是那個 catch，而 `totalBytes` 的計算在 try
**之外**。請求裡若有一筆沒有 blob，`reduce` 就在所有處理器之外拋出：`void load(...)` 吞掉這個
rejection，**一則訊息都不會回主執行緒**，呼叫端的 promise 永遠停在那裡，進度條卡在「讀取中」。

正對照（先跑，才相信）：測試在未修版本上跑出

```
TypeError: Cannot read properties of undefined (reading 'size')
  ❯ src/core/ingest/session.worker.ts:21:74      ← Unhandled Rejection
Tests  1 failed | 12 passed (13)
```

——12 支通過代表 worker 既有行為是對的；那 1 支就是這個洞。修法是把 `reduce` 移進 try（`totalBytes`
改 `let`）。`src/` 裡目前沒有人組得出這種請求，所以是**補強不是修 bug**；但這種失敗沒有錯誤、
沒有逾時，使用者無從分辨「壞了」和「只是很慢」，這正是 RC-5 洩漏型態，本專案已經命名過兩次。

### D-2　啟動時讀回的位置會覆蓋掉使用者剛選的資料夾

`sessionStore` 模組載入時 `void readDirectoryHandles(...).then(({handles}) => { cachedDirectoryHandles = handles; })`
——**整包取代**。使用者若在這個 promise 落地之前就選好資料夾，剛選的 handle 會被上一輪存下的舊值
蓋掉，該來源在這個 session 剩下的時間都會「回到上一次的位置」或退化成開選擇器。

視窗很小，但它是**冷啟動的第一次互動**，而 IndexedDB 的第一次開啟還要跑 schema 升級，那是一趟
真的往返。而且它會**自己好**——選擇當下就已經寫進 IndexedDB 了，重載一次就正常——所以沒有人會
把它當成 bug 回報。

正對照：把啟動讀取握在手上不放，等使用者選完再放行，未修版本跑出

```
AssertionError: expected 'stale-from-last-session' to be 'just-picked'
Tests  1 failed | 8 passed (9)
```

修法是合併而非覆寫（`{ ...handles, ...cachedDirectoryHandles }`）：順序即優先權，這個 session 裡
剛選的一定比啟動時讀到的新。**反向也要測**——沒被選過的來源仍須照常採用存起來的位置，否則
「不要蓋掉剛選的」會悄悄變成「不理會儲存」。

---

## 5　驗收：測試會不會失敗，而不是會不會通過

一支從沒測過的模組第一次就 18/18 全綠，是儀器故障的訊號而不是好消息。三組都跑了正對照：

| 組別 | 正對照方式 | 結果 |
|---|---|---|
| `session.worker` | 天然：D-1 的洞讓 13 支裡的 1 支在未修版本上失敗 | 12 過 1 失 → 修完 13 過 |
| `directorySource` | 突變 (mutation) 三處：放寬取消判準、拿掉路徑剝除、跳過權限檢查 | **6 支失敗，且正好是該失敗的那 6 支**，其餘 12 支不動 |
| `sourceFolderMemory` | 天然：D-2 的洞讓 9 支裡的 1 支失敗；另突變「每來源槽 → 單一槽」 | 各 1 支失敗，且突變打中的是那支**驗收走法**測試 |

突變的鑑別度值得單獨記一筆：放寬取消判準（`error instanceof DOMException` 不再檢查 `name`）
**沒有**弄壞「選擇器自己的 AbortError → 取消」那一支——因為 AbortError 本來就是 DOMException。
只有「非 Abort 錯誤原樣拋出」那一支抓到它。這代表這組測試分得出兩件不同的事，不是靠一個大斷言
矇中。

閘門（未經 pipe，確認 exit code）：

```
typecheck    exit=0
test         exit=0 · 68 files / 649 tests   (M8 之前 65 / 609)
build        exit=0 · two-stage
check:rounds exit=0
```

`typecheck` 第一次跑就擋下兩個我自己的錯：`Array.prototype.at` 超出本專案的 `lib` 目標，
以及 mock 的參數型別。兩個都改程式，**沒有動 `tsconfig`**。
