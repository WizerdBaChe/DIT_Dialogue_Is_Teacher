# RESEARCH R12 M4 — Claude Code 已經在寫、DIT 卻沒讀的中繼資料

> 開工前的完整確認。M4 卡片的數字來自 522 個檔案裡的 200 個抽樣；本文是**全量**掃描
> （525 檔 / 208,527 筆紀錄 / 0 筆解析失敗），並補上卡片沒有的**形狀事實**——欄位在紀錄的
> 哪個位置、掛在哪種 record type、值長什麼樣、彼此如何共現。
>
> 量測腳本：`scan-claude-meta.mjs` / `scan-claude-meta2.mjs` / `cov.mjs`（scratchpad，未入庫；
> 邏輯已寫在本文 §2，可重跑複查）。語料：作者本機 `~/.claude/projects`，2026-08-26。

---

## 1　邊界契約 (boundary contract)

**前提 (premises)**
- (user) Claude Code 適配到最高程度、Codex 順便 —— D-005，M4 因此排在 M5 之前。
- (model, 已驗證) 這四個 attribution 欄位存在於語料且 `src/` 完全沒有引用 —— §3 全量重測確認。
- (model, 已驗證) INV-R12-2：來源專屬資料要經由側寫抵達來源無關的檢視層。

**解讀分歧 (interpretation forks)**
- 卡片說欄位歸屬「Claude 側寫」。實作上 adapter 本身就是來源專屬模組，把欄位名再繞一層
  側寫表沒有換到任何東西。**本文的解讀**：真正的要求是「檢視層不得分歧」，做法見 §5-A。
- 若這個解讀是錯的，翻轉點是 `profiles.ts` 的 `attribution` 區段 —— 把欄位名搬進去即可，
  adapter 與檢視層都不用動。

**邊界輸入 (boundary inputs)**：`~/.claude/projects/**/*.jsonl`；只讀，不寫。

**驗收 (acceptance)**：見 §7。

**非目標與降級 (non-goals & degradation)**：`entrypoint` 量測後移除（§6）；
`toolUseResult`、`leafUuid`/`lastPrompt` 只登記不實作（§8）。預算不足時的順序：
attribution（核心，不可砍）→ `gitBranch` → 其餘全部延後。

---

## 2　量測方法

三支腳本，逐行 `JSON.parse`，不抽樣：

1. **pass 1** — record type 分佈、欄位出現次數（分「頂層」與「巢狀」兩種）、attribution 的
   值分佈與共現組合、`gitBranch`／`entrypoint` 的相異值。
2. **pass 2** — 兩個設計要用到的問題：attribution 與既有 `isSidechain`／`agentId` 的關係、
   attribution 落在哪些 content block 種類、`toolUseResult` 掛在哪種 record type。
3. **cov** — **以 session 為單位**的覆蓋率。前兩支算的是紀錄數，但使用者感受到的是
   「我打開的這個 session 有沒有」。

---

## 3　全量結果，以及卡片數字的修正

卡片的數字全部偏低（抽樣未回推）。以下是全量值：

| 欄位 | 卡片（200 檔抽樣） | **全量（525 檔）** | 位置 |
|---|---|---|---|
| `attributionSkill` | ~13,000（四項合計） | **7,408** | 頂層 |
| `attributionAgent` | 〃 | **11,502** | 頂層 |
| `attributionMcpServer` | 〃 | **8,622** | 頂層 |
| `attributionMcpTool` | 〃 | **8,622** | 頂層 |
| `toolUseResult` | 17,686 | **47,229** | 頂層 |
| `gitBranch` | 66,524 / 68 distinct | **175,166 / 183 distinct** | 頂層 |
| `entrypoint` | 66,524 | **175,166 / 2 distinct** | 頂層 |
| `leafUuid` | 4,523 | **11,607** | 頂層 |
| `lastPrompt` | 〃 | **11,584** | 頂層 |

**四個 attribution 欄位全部在紀錄頂層，巢狀出現數為 0。** 讀取成本等於讀一個欄位。

**使用者實際會看到的覆蓋率（以 session 計，n=525）**：

| | session 數 | 佔比 |
|---|---|---|
| 至少有一種 attribution | **384** | **73.1%** |
| 有 skill | 131 | 25.0% |
| 有 subagent | 226 | 43.0% |
| 有 MCP tool | 100 | 19.0% |

73.1% 不是邊緣功能。對照 Codex sidecar 的 17%（作者已接受為足夠），這一項的回報高得多，
也印證了「Claude 優先」那條裁決。

---

## 4　形狀事實（卡片沒有、但設計要靠它）

**F-1　只掛在 `assistant` 紀錄上。** 四個欄位在其他 record type 出現次數為 **0**。

**F-2　`attributionAgent` ⇒ 一定是 sidechain。** 帶 attribution 的 26,247 筆中，
`isSidechain: true` 有 11,579 筆、帶 `agentId` 的也是 **11,579 筆**，而
`attributionAgent × thread` 交叉表裡 **9 種 agent 全部落在 sidechain，主線 0 筆**。

> 意義重大：DIT **早就知道**「這是子代理」（靠 `isSidechain`／`agentId` 分群）。它不知道的是
> **哪一種**子代理。所以這個欄位加的不是新結構，是既有分群的**名字**——
> 「子代理」變成「`backend-architect` 子代理」。

**F-3　真正的新訊號是主線上的 skill。** 帶 attribution 的紀錄有 **55.9% 在主線**
（14,668 / 26,247），主要是 skill：`workflow-checkpoint` 2,053、`product-design-thinking` 827、
`scientific-research-guide` 619…。這一段是 DIT 目前**沒有任何其他方法**能知道的資訊。

**F-4　MCP 的 server 與 tool 永遠成對。** both=8,629、serverOnly=**0**、toolOnly=**0**。
它們是同一個概念的兩半，型別上不該是兩個各自獨立的 optional。

**F-5　attribution 可以共現，所以它是集合不是單值。**

| 組合 | 筆數 |
|---|---|
| 只有 agent | 10,486 |
| server + tool | 7,977 |
| 只有 skill | 6,486 |
| skill + agent（skill 跑在子代理裡） | 646 |
| agent + server + tool | 369 |
| skill + server + tool | 275 |
| 四個都有 | 1 |

**F-6　attribution 覆蓋三種 block，不只工具呼叫。**
`tool_use` 15,076、`thinking` 7,750、`text` 3,421。

**F-7　`toolUseResult` 100% 掛在 `user` 紀錄上**（47,239 / 47,239）——它是工具結果的信封。

**F-8　值域小且都是人看得懂的名字**：skill 27 種、agent 9 種、MCP server 12 種、
MCP tool 54 種。這正是卡片說的「教學內容」，而且已經標好了。

---

## 5　設計決定

### A　attribution 是來源無關的概念，不是 Claude 專屬欄位

`RawEvent` 的檔頭自述「Normalizer 只認 RawEvent[]，不認得任何特定來源格式」。把
`attributionSkill` 這種名字帶進去會違反它。

但「這一步是誰／哪個機制做的」本身**不是** Claude 專屬——Codex 也有 `sub_agent_activity`
與 MCP 呼叫。所以抽象層放在概念，不放在欄位名：

```ts
export interface Attribution {
  kind: "skill" | "subagent" | "mcp-tool";
  /** 來源紀錄的原字串，不改寫、不美化。 */
  name: string;
  /** 只有 mcp-tool 有：工具所屬的 server。永不臆造（F-4：兩者必定成對）。 */
  server?: string;
}
```

`RawEvent.attribution?: readonly Attribution[]` → `Span.attribution?: readonly Attribution[]`。
**用陣列是 F-5 量出來的**，不是防禦性設計：skill+agent 有 646 筆真實共現。

### B　側寫負責的是「這個來源有沒有這種資料」，不是欄位名

繞一層側寫表去查欄位名沒有意義——`claudeCodeJsonl.ts` 只可能是 Claude。側寫真正要回答的是
檢視層的問題：**沒有 attribution 時，該說「沒有」還是「這套系統不記錄」？**

```ts
// SourceProfile
attribution: { kinds: readonly Attribution["kind"][] };   // Claude: 三種；Codex: []
```

Codex 的空陣列跟 `classify.signals: []` 是同一種誠實：不是還沒做，是量出來沒有。
檢視層據此顯示「Codex 不記錄這項」而不是靜靜留白——留白會被讀成「這一步沒有來歷」。

### C　`attributionAgent` 不另開節點，它去命名既有的子代理群組

F-2 證明它與現有分群 100% 重合。再開一層只會產生兩個講同一件事的視覺元素——
R5.5 SA-01「一個符號不得有兩個意思」的反面。

### D　`gitBranch`：逐筆保留，且 `HEAD` 不是分支名

183 個相異值裡最大宗是 `HEAD`（56,531 筆，32%），那是 detached HEAD，不是分支。
把它當分支名顯示是假資訊。

session 層級：525 個 session 全部至少有一個分支值，**423 個只有一個、102 個有多個**
（最多 12 個）。所以「一個 session 一個分支」對 102 個 session 是謊話——逐筆保留才誠實。

---

## 6　量測後明確移除：`entrypoint`

卡片把它列在範圍內。全量量測：**175,166 筆、相異值只有 2 個**——
`claude-desktop` 174,964（99.88%）、`cli` 213（0.12%）。

一個 99.88% 都是同一個值的欄位不帶資訊。這與 R11.2 R1 判定 Codex 的 `humanTurnCount`
「幾乎不帶資訊」是同一種判斷，理由也相同：值域塌縮的欄位顯示出來只是雜訊。

**不做，且理由記在這裡**，免得下一輪又把它當成「漏掉的待辦」撿回去。

---

## 7　驗收 (acceptance)

1. attribution 抵達渲染後的 span，且**沒有的紀錄是 ABSENT 而不是猜**——兩個數字都要印。
2. 對作者語料重跑：session 覆蓋率 384/525 (73.1%)，紀錄層 26,247 筆。
3. `src/components/` 底下 **0 個** `if (source === "claude-code")`（INV-R12-2）。
4. `tsc` / `vitest` / `build` / `check:rounds` 全綠。
5. 型別上：新增第三個 `SourceId` 時，`attribution.kinds` 那一列缺了要編不過。

---

## 8　只登記、本輪不做

| 項目 | 量到的規模 | 為什麼延後 |
|---|---|---|
| `toolUseResult` | 47,229（全在 `user` 紀錄） | 它是結果信封，屬於「工具結果呈現」而不是「來歷」，自成一張卡 |
| `leafUuid` + `lastPrompt` | 11,607 / 11,584 | 對話分支指標，與 T-008（壓縮鏈接合）是同一族問題，該一起做 |
| `slug` | 65,333 | **已排除**：每個 session 內全部相同的隨機代號（如 `virtual-painting-aho`），是 id 不是目的，永遠不得當標題 |

另有一項 M3 量出、**擋住 M5** 的缺口記在此供複查：Codex 條目的 `id` 目前是檔名，因為
`absorb()` 只讀 Claude 的 `record.sessionId`，而 Codex 自報在 `session_meta.payload.id`。
M5 的 sidecar join 用的正是那把鑰匙。

<!--
review-when: the Claude Code transcript schema changes (new attribution field, renamed field),
or the corpus is re-measured. Every number here is from a full scan on 2026-08-26, n=525 files
/ 208,527 records; if a later reading disagrees, re-run before trusting either.
-->
