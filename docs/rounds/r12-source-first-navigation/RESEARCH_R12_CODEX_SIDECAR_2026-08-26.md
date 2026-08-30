# RESEARCH R12 M5 — Codex 的 session 目的存在哪裡，以及一個會安靜出錯的接法

> 開工前的確認。M1 刻意留了一個沒驗的假設（sidecar 的內層是物件還是 JSON 字串），本文先把它
> 關掉；然後在量測過程中發現一件卡片沒寫、而且**照直覺做會安靜地錯 129 次**的事。
>
> 量測腳本：`scan-sidecar.mjs` / `idcheck.mjs` / `joincheck.mjs`（scratchpad，未入庫；作法寫在
> §2、§4，可重跑複查）。語料：作者本機 `~/.codex`，2026-08-26，358 份 rollout。

---

## 1　邊界契約 (boundary contract)

**前提 (premises)**
- (user) 17% 覆蓋率已被接受為足夠——「沒定義好大多是 session 本身的鍋」。**本文重測為 17.0%，
  前提成立**（§3）。
- (user) Codex 是順便，Claude 優先 —— M5 因此是預算不足時第一張被砍的卡。
- (model, 已驗證) sidecar 在 `~/.codex` 而不是 `~/.codex/sessions`，M3 已接好可達性診斷。

**解讀分歧 (interpretation forks)**
- 「session id」在 Codex 有**兩個**欄位（`payload.id` 與 `payload.session_id`），358 份裡有
  135 份兩者不同。挑錯一個會讓覆蓋率從 17% 跳到 53%——**而多出來的全是錯的**（§4）。
  本文採 `payload.id`。翻轉點是側寫的 `SidecarSpec.joinKey` 一行。

**邊界輸入**：`~/.codex/.codex-global-state.json`（196 KB）與 `~/.codex/sessions/**/rollout-*.jsonl`。只讀。

**驗收**：見 §6。

**非目標與降級**：不實作「fork 繼承母對話描述」那條路（§4 末，需作者裁定）；
sidecar 不存在／壞掉一律降級成今天的行為 + 具名診斷，**絕不讓索引失敗**。

---

## 2　M1 留的那個問號：關掉了，而且是簡單的那一邊

M1 在側寫裡寫下 `recordsAt: ["electron-persisted-atom-state", "thread-descriptions-v1"]`，
並註明「**尚未驗證**：`electron-persisted-atom-state` 是物件、還是需要再解析一次的 JSON 字串」。

實測：

```
sidecar top-level type            = object
electron-persisted-atom-state type = object      ← 不是字串，不需要二次解析
thread-descriptions-v1 type        = object
  entry count = 61
  value types = string:61                        ← 值直接就是描述字串，不是物件
```

**兩層都是純物件，值是純字串。** M1 的 `recordsAt` 路徑正確，不需要修。
另外量到值**不是**帶 `.description` 欄位的物件——這點卡片沒寫，讀取程式如果先去拿
`.description` 會全部拿到 `undefined`。

---

## 3　覆蓋率：卡片說 61 / 297，實測完全一致

| | |
|---|---|
| rollout 檔案 | **358** |
| 有描述 | **61（17.0%）** |
| 沒有描述 | **297** |
| 有描述卻找不到對應 rollout（孤兒） | **0** |

描述本身的品質（這是計數回答不了、但決定這張卡值不值得做的部分）：

| | |
|---|---|
| 長度 | min 23 / 中位 46 / max 98 字元 |
| 去空白後為空 | **0** |
| 含換行 | **0** |

實際樣本（作者自己的語料）：

- 「將 Claude 規則內容移植到 Codex 環境並調整 CLAUDE.MD 與 hook 相關字眼」
- 「檢視強化搜尋論文與擷取錄入資料的 SKILL，找出缺漏與可新增相關 skill」
- 「ShareForge phase-log, 底部 Pause here/Resume/Next step 截圖與配色驗證」

這些是**真正的目的敘述**，不是第一句話的節錄。這正是 B1 當初要修的東西。
`TITLE_MAX_LENGTH` 是 64，所以中位數以上的描述會被截斷加「…」——與其他階梯一致，不特別處理。

---

## 4　⚠️ 本卡最重要的發現：接錯欄位會安靜地錯 129 次

`session_meta.payload` 上有**兩個** id 欄位，兩個都 358 筆全有：

```
id-ish fields on session_meta.payload: session_id(358) id(358) parent_thread_id(135) forked_from_id(25)
```

而且 **135 份的 `id` 與 `session_id` 不相等**——數字與 `parent_thread_id(135)` 完全吻合：
那些是**分叉／續接的執行緒**，`id` 是這一份自己的 thread id，`session_id` 指向母對話。

兩種接法的實測結果：

| 接法 | 命中 | 其中錯的 |
|---|---|---|
| `payload.id`（本文採用） | **61** | **0** |
| `payload.session_id` | **190** | **129 筆接到母對話的描述** |
| 分叉執行緒**自己**有描述的 | **0** | — |

**陷阱的形狀**：`session_id` 看起來好得多——覆蓋率從 17% 跳到 53%。如果拿「覆蓋率」當最佳化
目標，會直接選它，然後對 129 個分叉 session 顯示母對話的目的，而且**看起來完全正常**：
標題是通順的中文、跟內容也沾得上邊，沒有任何一眼可見的破綻。這就是本專案已經吃過虧的
「指向錯目標」，只是這次偽裝成一個更漂亮的數字。

**作者已接受的 17% 才是對的那個數字。** 較高的那個是假的。

> **留給作者裁定，本輪不做**：分叉執行緒要不要顯示母對話的描述？技術上可行，覆蓋率
> 17% → 53%。但它必須是**自己的一階**（例如 `titleSource: "sidecar-inherited"`）並在畫面上
> 講明「承接自母對話」，否則就是上面那個錯誤本身。這是產品裁定不是技術判斷，而且超出 M5
> 卡片範圍，所以只記不做。

---

## 5　設計決定

**A　join key 從側寫來，不寫死。** M1 的 `SidecarSpec.joinKey = ["session_meta","payload","id"]`
經實測正確，維持不動。這一行就是 §1 那個解讀分歧的翻轉點。

**B　`titleSource` 加 `"sidecar"` 一階，而且加了會編不過直到補完文案。** 實測過這個機制會
動作：先前把 `TitleSource` 搬家時，`SessionBrowserDialog.tsx` 立刻報
`TS7053: expression of type 'TitleSource' can't be used to index type '{custom; ai; derived; filename}'`。
文案表是純物件字面量（不是 `as Record`，沒有 M4 複核抓到的那個斷言問題），所以窮舉是真的。

**C　`pickTitle` 走 `discovery.titleLadder`，不再是一條寫死的階梯。** 這是這張卡在
「來源分歧經由側寫」上的份額。

**D　同時關掉 DW-18。** 目前 `absorb()` 只讀 Claude 的 `record.sessionId`，Codex 的 `entry.id`
因此退化成檔名——而 join 需要的正是 Codex 的 `payload.id`。M3 的施工筆記說「在 M5 跟 join
一起修」，就是這裡。

**E　sidecar 讀不到不得讓索引失敗。** 檔案不存在（使用者選了 `sessions/`）已由 M3 的
`INDEX_SIDECAR_OUT_OF_REACH` 涵蓋；檔案存在但**壞掉或結構不符**是新的一種，要有自己的具名
診斷，然後整個索引照常完成、標題退回下一階。

---

## 6　驗收 (acceptance)

1. 以 Codex 根目錄索引，印出實際數字並與**預期 61 / 297** 並列（卡片要求兩邊都印）。
2. 沒有描述的 session 落到下一階，**不得報錯**。
3. sidecar 不存在／壞掉 → 具名診斷 + 索引照常完成。
4. **兩側對照**：`payload.id` 接得到 61；用 `session_id` 接會多出 129 筆錯的——測試要把這件事
   釘住，否則未來有人「順手改成覆蓋率比較高的那個」不會有任何東西擋他。
5. `tsc` / `vitest` / `build` / `check:rounds` 全綠。

---

## 7　只登記、本輪不做

| 項目 | 依據 |
|---|---|
| 分叉執行緒繼承母對話描述（17% → 53%） | §4 末，需作者產品裁定，且要自己的一階與畫面說明 |
| `forked_from_id`（25 筆）與 `parent_thread_id`（135 筆）本身的呈現 | 與 T-008／DW-16（壓縮鏈接合）是同一族「對話關係」問題，該一起做 |

<!--
review-when: the Codex desktop app changes where it stores thread descriptions, or the
`electron-persisted-atom-state` shape changes. Every number here is from a full scan on
2026-08-26: 358 rollouts, 61 descriptions, 135 forked threads. Re-run before trusting either
reading if a later measurement disagrees.
-->
