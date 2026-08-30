# RESEARCH R12 M6 — 分類訊號的宣告與實作對不上，而卡片的前提已經過期

> 開工前的確認。這次的結論比較尷尬：**M6 卡片建立在一個已經不成立的前提上**，而 M1 寫進側寫
> 的一行宣告是**假的**。兩件事都是這次量測才看出來的，不是讀程式碼推出來的。
>
> 量測方式：用**出貨的 indexer** 跑兩份真實語料（`~/.claude/projects` 與 `~/.codex`），
> 記錄 `kind` / `kindReason` 的完整分布，作為改動前的基準線。2026-08-26。

---

## 1　邊界契約 (boundary contract)

**前提 (premises)**
- (user) Claude 優先、Codex 順便 —— 不影響本卡，兩邊都要正確。
- (model, **已推翻**) 卡片假設 Codex 會有一批 `無法判定` 需要解釋。**實測是 0 筆**（§2）。
- (model, **已推翻**) M1 宣告 Codex 的 `classify.signals` 是空陣列。**實作讀了兩個**（§3）。

**解讀分歧 (interpretation forks)**
- 「讀 `discovery.classify` 取代寫死欄位名」可以做到兩種深度：把**規則分派**整個資料表化，
  或只把**哪些訊號適用**資料表化。本文採後者，理由見 §4-A。翻轉點是 `classifySession` 的
  簽章——若日後要走前者，改的是那裡，側寫的資料形狀不用動。

**邊界輸入**：兩份本機語料，唯讀。

**驗收**：見 §5。核心是**零回歸**——分布必須逐格相同。

**非目標與降級**：不合併兩套規則（架構複核明確建議不要，理由 §4-A）；不改
`SessionKindReason` 的既有代碼名。

---

## 2　基準線：`codex-unclassified` 一次都沒有出現

以出貨的 indexer 跑兩份語料：

| 語料 | 條目 | kind | reason |
|---|---|---|---|
| `~/.claude/projects` | **287** | `dialogue` 287 | `has-human-prompt` 287 |
| `~/.codex` | **346** | `dialogue` 344 · `machine` 2 | `has-human-prompt` 344 · `no-human-prompt` 2 |

> 註：Codex 這裡是 346 而非 M5 的 358，因為本次量測加了 8 MB 上限（12 份超過）。分母不同，
> 不是行為變了。

**卡片的前提過期了。** M6 卡片寫「`無法判定` 的數量要能從側寫解釋」——但 R11.2 R1 給了 Codex
自己的讀法之後，那個數字已經是 **0**。沒有東西需要解釋。

這不代表 M6 沒有價值，而是**它的價值換了位置**：不再是「解釋一批壞掉的判定」，而是
「讓宣告與實作對得上，並讓第三個來源出現時編譯失敗」（§3、§4-B）。

另外兩個順帶確認的事實，都與預期一致、不需處理：
- Claude Code 側 `path-subagents` / `field-agentid` / `all-sidechain` 皆為 0 —— 因為
  `buildSessionIndex` 在分類**之前**就把 `subagents/` 路徑濾進配對用的陣列，主檔本來就不會
  整份都是 sidechain。規則沒壞，是那些路徑走不到分類器。
- 兩份語料都沒有 `insufficient-signal` / `not-claude-code`。

---

## 3　⚠️ M1 寫進側寫的那一行是假的

`profiles.ts` 目前宣告：

```ts
// CODEX
classify: { signals: [] },   // 「Empty, and measured.」
```

但 `classifySession.ts` 的 Codex 分支實際讀了**兩個**訊號：

```
:148   if (!input.codexSignalUsable)          → unknown / codex-unclassified
:151   if (input.codexHumanTurnCount === 0)   → machine / no-human-prompt
```

而且它們有效——346 份全部分類成功。

**錯在哪**：M1 的註解說「`human-turn-count` 沒有列出來，因為 R11.2 R1 量到它對這個來源
幾乎不帶資訊（356/358 都是 dialogue，其中 108 份完全沒有真人打的字）」。那句話講的是這個訊號的
**資訊量低**，不是它**不存在**。兩件事被寫成同一件了。

後果不只是文件不準：如果 M6 照卡片說的「讓分類讀 `discovery.classify`」，空陣列會讓 Codex
**一筆都分不出來**——把一個 0 回歸的模組改成全滅。這正是先量測再動工要擋的東西。

**修法**：`signals` 誠實列出**這個來源供得出來的**訊號。Codex 供得出 `human-turn-count`
（用它自己的讀法），供不出 `agent-id-field` / `all-sidechain` / `subagent-path`。
資訊量低這件事另外記在註解，不靠假裝欄位不存在來表達。

---

## 4　設計決定

### A　不把規則分派整個資料表化

架構複核的判斷（我核對後同意）：Claude Code 走 4 條規則、Codex 走 2 條**形狀不同**的規則，
不是同一組規則套不同訊號。硬做成 rule engine 是小型設計題，成本遠大於收益。

本卡只把「**哪些訊號適用於這個來源**」資料表化：分類器讀側寫的 `signals`，沒宣告的訊號就
不跑那條規則。這讓「為什麼這份是 unknown」變成可以從側寫回答的問題，而規則本身仍然各自寫。

### B　加窮舉斷言，讓第三個來源編不過

目前 `classifySession` 的第 11 條是 catch-all，回傳 `codex-unclassified`——一個**指名錯來源**
的原因碼。加第三個 `SourceId` 不會編譯失敗，只會安靜掉進去。

```ts
const exhaustive: never = input.source;   // ← 加第三個來源時這行編不過
```

賦值給 `never` 產生編譯期錯誤，後面仍保留一個 return 供執行期安全（不拋例外）。這一行就是
架構複核說「INV-R12-1 第三次被宣告成立、卻仍然不是結構性的」那個缺口的補丁。

### C　catch-all 不再借用 `codex-unclassified`

第 8 條用它是對的（那份**真的**是 Codex）。第 11 條借用它是錯的——一個未知的第三來源被貼上
「codex 無法判定」。加了斷言之後第 11 條理論上到不了，但仍保留 return，改用來源中性的
`insufficient-signal`。`SessionKindReason` 的既有代碼名不動。

---

## 5　驗收 (acceptance)

1. **零回歸，逐格比對**：改動後重跑兩份語料，分布必須與 §2 的基準線完全相同
   （287 / `has-human-prompt` 287；346 / 344 + 2）。**印出前後兩組數字**。
2. 加第三個 `SourceId` 時 `classifySession` **編譯失敗**；示範一次後還原探針（同 M1 做法）。
3. Codex 的 `classify.signals` 為 `["human-turn-count"]`，且分類仍然全數成功。
4. `tsc` / `vitest` / `build` / `check:rounds` 全綠。

---

## 6　只登記、本輪不做

| 項目 | 依據 |
|---|---|
| 規則分派完全資料表化 | §4-A，架構複核建議不做；兩套規則形狀不同 |
| `codex-unclassified` 這個代碼名帶有來源名 | 第 8 條的用法是準確的，改名是契約變更，收益低 |

<!--
review-when: a third SourceId is registered, or R11.2 R1's Codex signal reading changes. The
baseline in §2 is from the shipped indexer on 2026-08-26 (287 Claude entries, 346 Codex with an
8 MB cap); re-measure before trusting a later reading that disagrees.
-->
