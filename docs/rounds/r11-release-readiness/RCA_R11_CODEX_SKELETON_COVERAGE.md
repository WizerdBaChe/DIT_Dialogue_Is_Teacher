# RCA R11 — Codex 骨架覆蓋率 (skeleton coverage) 根因分析

- 卡片：R11 **M5（investigate only）**，`PSM_R11_RELEASE_READINESS_v1.0.md` §3
- 授權裁決：**D-007**「量測先於任何修改」。本文件**未修改 `src/` 下任何檔案**。
- 日期：2026-08-15　·　分支：`feat/r11-release-readiness`
- 對應 UAT 發現：C3(b)　·　餵給待裁決問題：**R11-Q3**

> 名詞依 `references/DIT-context.md`：**骨架覆蓋率 (skeleton coverage)** 指一段 session 的 spans
> 之中，成為**主線節點 (spine node)** 而非**支線 (rib)** 的比例。它與**平價 (parity)** 是兩件事
> ——平價比較兩個來源的輸出，兩邊同樣貧乏時它照樣會通過。

---

## 0　結論摘要（先講結果）

| 指標（僅計對話型 session，見 §2.1） | Codex n=284 | Claude Code n=153 |
|---|---|---|
| 主線節點數 p50 / mean / max | **2 / 1.98 / 2** | 4 / 8.63 / 49 |
| 主線恰好是 `{objective, outcome}` | **279 (98.2%)** | 62 (40.5%) |
| 有至少一個 `decision` 節點的 session | **0 (0%)** | 90 (58.8%) |
| `decision` 節點總數 | **0** | 1,015 |
| 支線數 p50 / mean | 0 / 1.59 | 23 / 44.01 |
| 有至少一條支線的 session | 58 (20.4%) | 137 (89.5%) |

**根因（一句話）**：`distill()` 產生**中段**主線節點的唯一來源是 `decision` 標籤；而
`denoise()` 產生該標籤的唯一判準是
**`s.type === "thinking" && DECISION_RE.test(s.text)`**（`src/core/denoise/denoiser.ts:75`）。
這條判準是照 Claude Code 的**原始思考鏈 (raw chain-of-thought)** 調出來的九個字面詞彙表；
Codex 的 `thinking` span 來自 **reasoning summary**（中位數 87 字），實測在 **11,908 個 Codex
thinking span 上命中 0 次（0.00%）**。因此 `decision` 這個節點類別對 Codex 而言**結構上不可達**，
主線被鎖死在 2 個節點。

**這不是 shell_command 分類問題。** 本文件的根因完全不依賴判讀任何指令字串，D-001 與 R10.1 RCA §P2
的禁令在此毫無鬆動空間（延伸討論見 §3.4）。

---

## 1　方法 (Method)

### 1.1 量了什麼

用**產品自己的管線**（不是重寫一份）對本機真實語料跑一遍，逐 session 記錄
`doc.skeleton.nodes` / `doc.skeleton.ribs` / `doc.spans` 的結構統計。
`src/core/pipeline.ts` 以 esbuild 打包成暫存 ESM 後匯入，所以
adapter → normalize → denoise → distill 就是 app 出貨的那份程式碼。

### 1.2 腳本

`scripts/measure-skeleton-coverage.mjs`（本卡片保留、已整理並加註解）。

```powershell
node scripts/measure-skeleton-coverage.mjs --codex="$env:USERPROFILE\.codex\sessions" --claude="$env:USERPROFILE\.claude\projects" --out=. --quiet
```

延續 `scripts/scan-codex-sessions.mjs` 的**零內容外洩**紀律：報告只含**計數與封閉列舉
(closed enum)**。訊息文字、思考文字、指令字串、cwd、檔案路徑、session id、檔名一律不進報告；
文字只量**長度**。工具名稱過 `TOOL_NAME_WHITELIST`，其餘歸 `(other)` ——
這一條是必要的，R10.1 已證明 Codex 的 `EXEC_TOOL_NAME_RE` 會從自由格式 `input` 裡撈出任意識別字，
未過濾的工具名統計本身就是內容外洩。

腳本新增兩組**判準儀器 (predicate instrumentation)**，直接回答「為什麼沒有節點」：

- `objectivePredicate` — 沒有任何 `user_msg` span 的 session 有多少（這種 session 連 `objective`
  都不可能有，混進統計會誇大缺陷）。
- `decisionPredicate` — `thinking` span 總數、其中命中 `DECISION_RE` 的數量、以及 thinking 文字
  **長度**分佈。腳本內的 `DECISION_RE` 是 `denoiser.ts` 的**複製品**並已註明；該正則若變動，
  這段數字即失效，需重跑。

### 1.3 前一位 agent 留下的東西怎麼處理

- `scripts/measure-skeleton-coverage.mjs`：**保留**。骨幹正確（跑真管線、隱私設計到位），
  本卡片重構了彙總層以支援 §2.1 的分層，並補上兩組判準儀器。
- `_probe5.mjs`：**刪除**。它問的是「多少 Codex session 沒有 user_msg」，該問題已被
  `objectivePredicate` 完整吸收並回答得更細，屬於被取代的殘留檔。
- 另外兩支一次性探針（判定 §2.1 的成因、驗證平價測試 fixture 的骨架形狀）跑完即刪，
  不留在工作樹裡；它們的輸出直接寫進 §2.2 / §4。

### 1.4 語料 (corpus)

**是真實本機語料，不是 fixture。**

| 來源 | 根目錄 | 找到 | 排除 | 納入 | 建置失敗 |
|---|---|---|---|---|---|
| Codex | `%USERPROFILE%\.codex\sessions` | 358 | 0 | **358** | 0 |
| Claude Code | `%USERPROFILE%\.claude\projects` | 201 | 48（`subagents/` 子代理逐字稿，非 session） | **153** | 0 |

單一開發機、單一使用者、單一工作型態。這是代表性的主要限制，見 §6。

---

## 2　量測結果 (Measurement)

### 2.1 先做一次分層：74 份 Codex rollout 根本沒有使用者回合

原始 358 份 Codex rollout 中，**74 份 (20.7%) 完全沒有 `user_msg` span**。
`distill()` 的 `objective` 取自「第一個 `user_msg`」（`distiller.ts:46`），所以這 74 份**不可能**
有 `objective` 節點——把它們算進 `{start, end}` 比例會誇大缺陷。

追查結果（實測，非推論）：這 74 份檔案裡共有 960 筆 `response_item/message` 且 `role=user`，

- **882 筆**以 Codex auto-review 的固定開頭起始，於 `codexJsonl.ts:272` 被判為
  auto-review 歷史轉述、轉成 `unknown` 事件；
- **78 筆**在 `codexJsonl.ts:294` 被 `stripInjectedPreamble()` 剝成空字串而略過；
- **0 筆**存活。

也就是說，**這 74 份是 Codex 自動審查子代理的 rollout，不是使用者對話**，
adapter 的行為是**正確的**，不是缺陷。這正是 D-007「先量測」擋下的一次誤修——
若直接動手，很可能會去「修好」一段本來就對的程式碼。

以下**主表一律只計 284 份對話型 (conversational) Codex session**（Claude Code 側 153 份全部有
使用者回合，兩個分層數字相同）。

### 2.2 主線骨架

| | Codex n=284 | Claude Code n=153 |
|---|---|---|
| 主線節點數 min / p50 / p90 / max | 1 / **2** / 2 / **2** | 1 / 4 / 22 / 49 |
| 主線節點數 mean | 1.98 | 8.63 |
| 節點數分佈 | `1`→5、`2`→**279**、`3+`→**0** | `2`→62、`3-5`→25、`6-20`→45、`21-50`→20 |
| 恰好 `{objective, outcome}` | **279 (98.2%)** | 62 (40.5%) |
| 節點類別總計 | `objective` 284、`outcome` 279、**`decision` 0** | `decision` 1,015、`objective` 153、`outcome` 152 |

**Codex 主線節點數的最大值是 2。** 284 份對話型 session 裡，沒有任何一份產生過第三個主線節點。

### 2.3 支線

| | Codex n=284 | Claude Code n=153 |
|---|---|---|
| 支線數 p50 / mean / max | 0 / 1.59 / 67 | 23 / 44.01 / 1,628 |
| 有支線的 session | 58 (20.4%) | 137 (89.5%) |
| 支線類別總計 | `investigation` 380、`edit-loop` 71、**`error` 0**、**`retry` 0** | `investigation` 4,374、`edit-loop` 1,098、`error` 780、`retry` 481 |
| `tool_use` 總數 | 13,493 | 23,930 |
| 其中成為支線者 | 451 (**3.3%**) | 6,733 (28.1%) |

### 2.4 骨架覆蓋率本身（依 `DIT-context.md` 的定義）

| | Codex n=284 | Claude Code n=153 |
|---|---|---|
| spans 總數 | 102,910 | 61,720 |
| → 成為主線節點 | 563 (**0.55%**) | 1,320 (2.14%) |
| → 成為支線 | 451 (**0.44%**) | 6,733 (10.91%) |
| → 進入骨架（合計） | 1,014 (**0.99%**) | 8,053 (13.05%) |

Codex 的骨架吃掉不到 **1%** 的 spans；Claude Code 是 **13%**。閱讀畫面因此退化成一串平鋪的側枝，
與作者 UAT C3 的描述一致。

### 2.5 決策判準儀器 —— 根因的直接證據

| | Codex n=284 | Claude Code n=153 |
|---|---|---|
| `thinking` span 總數 | 11,908 | 6,607 |
| 有 `thinking` 的 session | 114 (40.1%) | 101 (66.0%) |
| **命中 `DECISION_RE` 的 `thinking` span** | **0 (0.00%)** | 1,015 (15.36%) |
| 有命中的 session | **0 (0%)** | 90 (58.8%) |
| `thinking` 文字長度 min / p50 / p90 / max | 5 / **87** / 175 / 1,784 | 3 / **377** / 1,893 / 18,904 |
| `thinking` 文字長度 mean | **100** | 794 |

Codex 不是「沒有思考內容」——它有 11,908 個 thinking span，比 Claude Code 還多。
問題是那些文字**平均只有 100 字**（Claude Code 是 794 字，約 8 倍），且形態是**摘要式標題句**
而非逐字推理。一張九個字面詞的詞彙表掃過 100 字的摘要，命中率實測為**零**。

---

## 3　根因 (Root cause)

### 3.1 完整程式碼路徑

```
codexJsonl.ts:306-313        response_item/reasoning → 只取 payload.summary 的明文
codexJsonl.ts:421-429        event_msg/agent_reasoning → 相鄰碎片合併成一個 thinking
        ↓ （Codex 的 thinking = reasoning summary，中位數 87 字）
        ↓ （對照 claudeCodeJsonl.ts:217-218 = block.thinking 原始思考鏈，中位數 377 字）
normalizer                   照原樣搬運；不做分類
denoiser.ts:74-78            ★ if (s.type === "thinking" && DECISION_RE.test(s.text)) addTag(s,"decision")
denoiser.ts:14               ★ DECISION_RE = 九個字面詞（決定|改用|改成|應該改|換成|instead|
                                let me switch|i'?ll use|we should）
distiller.ts:46-50           objective ← 第一個 user_msg
distiller.ts:51-56           ★ 唯一的中段主線來源：if (s.tags.includes("decision"))
distiller.ts:64-68           outcome  ← 最後一個非 marker span
fishbone.ts:52+ / sessionMap.ts   純投影；不做任何分類 → 視圖層無罪
```

### 3.2 被點名的判準

> **`src/core/denoise/denoiser.ts:75`**
> ```ts
> if (s.type === "thinking" && DECISION_RE.test(s.text)) {
> ```

這就是把 Codex span 擋在主線之外的那一條判準。它有兩道關卡，Codex 兩道都過不了得漂亮：

1. **型別關**（`s.type === "thinking"`）——Codex 過得了，有 11,908 個。
2. **詞彙關**（`DECISION_RE`）——Codex **0/11,908**。這道關卡的隱含前提是「思考文字是長篇逐字推理，
   因此一段推理裡出現九個決策動詞之一的機率夠高」。這個前提在 Claude Code 成立（15.36%），
   在 Codex 的摘要式 reasoning 上**不成立**。

由於 `distiller.ts:52` 是**唯一**的中段主線節點來源，詞彙關一失守，Codex 的主線就只剩頭尾兩站。
`nodeKindTotals` 的 `decision: 0` 是這條因果鏈的直接量測證據。

### 3.3 還有一層更深的設計缺口，兩個來源都有

作者的原話是「**正常的使用者意圖跟回覆都沒有變成一個正常的節點**」。要誠實回答：
**`distill()` 本來就沒有任何規則會把「第二個以後的使用者回合」或「助理回覆」變成主線節點**——
只有**第一個** `user_msg` 會成為 `objective`。這是兩個來源共有的設計性質，不是 Codex 專屬缺陷。

規模（實測）：Codex 對話型 session 有 1,600 個 `user_msg`，其中 **1,316 個（82%）**是第一回合之後
的使用者回合，全部沒有進入骨架；228/284 份 session 有兩個以上使用者回合。
Claude Code 同樣有 923 個第一回合後的使用者回合被略過。

差別只在於：**Claude Code 有 `decision` 這個逃生口把主線撐起來（p50 4 站），Codex 沒有。**
所以同一個設計缺口，只在 Codex 上被看見。

這一點對修正方案至關重要：**只把 `DECISION_RE` 調寬，不會補上這個缺口。**
同時要記得 D-003 已經裁定過相鄰地帶——`milestone` 之所以維持移除，正是因為沒有人提得出一個
不會退化成「每則使用者訊息都是節點」的判準。

### 3.4 支線的缺口有一半是「已裁定的結果」，不是缺陷

Codex 13,493 次 `tool_use` 中，`shell_command` 7,182 + `exec` 555 + `exec_command` 12 = **7,749
(57.4%)** 落在 `profiles.ts:73` 的 `ambiguousTools`，依 **D-001** 刻意不分類，因此不會成為
`investigation` 支線。這是**裁定的後果，不是 bug**，本文件不提出任何以指令字串反推語意的方案。

另一半才值得看：`profiles.ts:71` 給 Codex 的 `investigationTools` 只有
`{web__run, view_image, tool_search_call}`，實測覆蓋 380/13,493 = **2.8%**。

### 3.5 順帶量到的第二個發現（不屬 M5 範圍，但需要留痕）

**整個 Codex 語料（358 份）有 0 個 `error` 標籤 span、0 個 `retry` 標籤 span。**
（Claude Code：1,664 個 error 標籤、654 個 retry 標籤、106/153 份 session 至少有一個。）

同時，原始語料裡確實存在失敗紀錄：`patch_apply_end` 共 **2,187** 筆，其中 **8 筆
`success: false`**（與 PSM §7 U3 引用的數字一致）。這 8 筆失敗**沒有變成任何一個 error 標籤**。

- 這使 **UAT U3**（「載入一份 `apply_patch` 失敗過的 Codex session，那張卡片有 error 徽章」）
  的**通過條件目前在本機語料上無法達成**——重測前應先確認這件事。
- 成因**未經 M5 驗證**。與 **P-001** 的未配對 `*_end` 問題方向一致，但本卡片**沒有**做逐事件因果
  確認，因此不做任何斷言，也不主張任何與壓縮 (compaction) 有關的成因。
- 建議掛到 M4 / R12 的觀察清單，不併入本文件的根因。

---

## 4　`crossSourceParity.test.ts` 是否斷言錯了性質

**是。它斷言錯了性質，而且它的 fixture 也不具代表性——兩個問題同時成立。**

### 4.1 它斷言了什麼

`src/core/source/crossSourceParity.test.ts` 的四項斷言分別讀
`doc.groups`（edit-loop 數）、`doc.skeleton.ribs`（investigation 數）、
`doc.spans[].tags`（error 數）、`doc.spans[].result.outcomeUnknown`。
**它從頭到尾沒有讀過 `doc.skeleton.nodes`。** 主線骨架完全不在測試視野內。

### 4.2 兩份 fixture 的實際骨架（實測，非推論）

以 fixture 原文餵進 `buildSessionDocument()`：

| | nodes | ribs | thinking spans |
|---|---|---|---|
| `CLAUDE` fixture | `["objective","outcome"]` | `["investigation","edit-loop"]` | **0** |
| `CODEX` fixture | `["objective","outcome"]` | `["investigation","edit-loop"]` | **0** |

兩份 fixture **都沒有任何 `thinking` span**，所以 `decision` 這條路徑在兩邊**都沒有被執行過**；
兩份 fixture 的主線**都已經在地板上**（恰好 `{objective, outcome}`）。
這正是骨架覆蓋率與平價的差別在真實專案裡具體長什麼樣：**測試比較兩個同樣貧乏的骨架，然後通過。**

還有一個放大效應：`expect(ribs(codex)).toBe(ribs(claude))` 是「兩個未知數相等」型斷言，
`0 === 0` 一樣會過。Claude 側的 `toBeGreaterThan(0)` 是唯一的防呆，而主線**連這個防呆都沒有**。

### 4.3 它應該斷言什麼（**只陳述，不撰寫**——M5 不得改動程式碼）

1. **每個來源各自的下限 (floor)，而非跨來源相等**：對一份含有推理回合且該回合陳述了決策的
   fixture，`skeleton.nodes.filter(n => n.kind === "decision").length >= 1` 必須**對每個來源分別成立**。
2. **覆蓋率斷言，而非平價斷言**：對一份含有 N 個使用者回合與 M 個推理回合的 fixture，
   `skeleton.nodes.length > 2` 必須對每個來源分別成立——亦即「主線不得恰為 `{objective, outcome}`」
   本身就是一條斷言。
3. **fixture 必須含有 `thinking`／`reasoning` 回合**：現況兩份都沒有，所以 denoise 的決策規則
   對**兩個來源**都處於零覆蓋，Claude Code 側同樣沒被測到。Codex 側的 fixture 必須用
   `response_item/reasoning` 的 `summary` 形狀，而不是 Claude 的 `block.thinking` 形狀。
4. **平價降為次級斷言，且只在下限之上才有意義**：先各自過下限，再比較兩者相等。
   兩個地板之間的相等是空話。
5. **§3.5 那條也要有下限**：`errors(codex) === errors(claude)` 目前靠 fixture 撐著，
   而真實語料是 0 —— error 標籤同樣需要一條「Codex 側 `>= 1`」的獨立下限。

---

## 5　修正方案與規模評估（餵給 R11-Q3；**我建議，你裁定**）

### 方案 A —— 只調寬 `DECISION_RE`／改成 per-profile 詞彙表

- **動到**：`denoiser.ts`（正則）、可能加一個 `SourceProfile.decisionVocabulary` 欄位、
  `denoiser.test.ts`。約 30–60 行 + 測試。
- **成本/風險**：這正是 D-001 與 P-001 一再警告的「調啟發式」動作。對 87 字的摘要來說，
  再多的詞也是猜；同一組更寬的詞掃過 Claude Code 794 字的思考鏈會**過度觸發**
  （現況已是每份 session 平均 6.6 個 `decision` 節點，本來就偏多）。
- **判定**：**不建議單獨採用。** 它會製造「數字變好看但語意更糟」的假修好。

### 方案 B —— 給主線一個不依賴詞彙的**結構性**產生器

不猜語意，改用結構事實。兩個候選：

- **B1 使用者回合**：第一回合之後的使用者回合成為主線節點。可用量體最大
  （Codex 1,316 個、Claude Code 923 個），但**直接踩到 D-003 拒絕過的地帶**——需要一個
  不會退化成「每則使用者訊息都是節點」的判準（例如只取開啟新工作的回合），
  而那個判準要由你來定義，不是由 agent 猜。
- **B2 顯式計畫事件**：Codex 的 `update_plan` 是**宣告式的計畫變更**，語意不需要猜測，
  也完全不觸碰 D-001。實測 291 次，分佈在 **44/284 (15.5%)** 份 session。
  Claude Code 本機語料的對應物 `TodoWrite` 出現 **0 次**（`ExitPlanMode` 18 次），
  所以 B2 **只能補 Codex，且只補得到約 15% 的 session**——單靠它救不了 98.2%。
- **動到**：`distiller.ts`（新的節點來源）、`profiles.ts`（新的工具集合或回合判準）、
  若要新增節點類別還會動到 `spanTree.ts`、`categoryDefinitions.ts`、i18n、圖例、
  `StructureLegend`／`SessionMap` 兩處符號表，以及 §4 那組新測試。
  約 80–150 行產品碼 + 測試；**若新增節點類別，UI/i18n/圖例的連帶面比產品碼本身還大**。

### 方案 C —— R11 不動產品碼，僅補測試盲點

只做 §4.3 的斷言改寫：`crossSourceParity.test.ts` 一個檔案，測試專屬，**零產品行為變更**。
它不會讓骨架變好，但會讓「骨架變差」下次**測得出來**。

### 建議

**主體進 R12，不併回 R11。** 理由四條：

1. 這不是 bug 修復，是「主線節點該代表什麼」的**設計變更**。D-003 已經在這塊地上裁定過一次，
   並且是因為判準說不清而拒絕。同一個坑不該由 agent 在收尾輪裡猜第二次。
2. R11 的退場條件是 D-004 的合併閘門 = M1+M2+M3。M5 在 PSM §4 的降級順序裡本就屬「可延後」層。
3. 任何可信的修正都需要一組新的驗收測試（平價測試裝不下），加上可能的圖例／i18n 連帶面——
   那是一輪的量體，不是一個 patch。
4. D-007 的邏輯本身指向這裡：量測完成後的下一步是**你對「主線節點該是什麼」下裁決**，不是動手。

**唯一建議併回 R11 的切片是方案 C。** 它是測試專屬、單檔、零產品行為變更，
而且它讓 R12 動手時有一條能證明修好了的線。若預算不允許，連 C 一起延後也不會傷到合併閘門。

**明確不建議**：任何以 `shell_command` 指令字串反推讀寫語意的做法（D-001 維持不變），
以及任何試圖補回未配對 `*_end` 事件的做法（P-001：約 94% 結構上不可復原）。

---

## 6　可否證性 (Refutability)

**主張**：中段主線節點的唯一產生器是 `denoiser.ts:75` 的決策判準；它對 Codex 的
reasoning summary 召回率為 0，因此 Codex 主線被鎖在 2 個節點。

**成立條件 (holds-when)**

- `denoiser.ts:14` 的 `DECISION_RE` 與 `denoiser.ts:74-78` 的規則未變動；
- `distiller.ts:51-56` 仍是唯一的中段主線來源；
- Codex 的 `reasoning.summary`／`agent_reasoning` 仍是短摘要形態（實測中位數 87 字）。

**什麼會推翻它 (overturned-by)**

1. **一個反例**：在任何語料裡找到**一份**產生 `decision` 節點的 Codex session。
   「結構上不可達」立刻降級為「極罕見」，方案 A 的評估要重做。
2. **我漏掉的節點來源**：若 `distiller.ts:46-68` 以外有任何程式碼會往 `skeleton.nodes` 塞東西，
   §3.1 的追蹤鏈就不完整。查法：`grep -n "nodes.push\|skeleton.nodes" src/`。
3. **語料不具代表性**：358 + 153 份全部來自單一開發機、單一使用者、單一工作型態。
   若另一台機器的 Codex reasoning summary 明顯更長或更口語，`DECISION_RE` 就可能有非零命中，
   0.00% 這個數字就不能外推。**重跑 §1.2 的指令即可驗證**，這是最便宜的一條反駁路徑。
4. **修好了但症狀還在**：若把 Codex 主線拉到 Claude Code 的水準，作者的 UAT 觀感**沒有改善**，
   那症狀的真正主體就在支線與 error 覆蓋（§2.3、§3.5），不在主線，本文件的優先序判斷有誤。
5. **§3.3 的設計缺口才是主體**：若作者認定「第二個以後的使用者回合沒有成為節點」才是他真正在講的事，
   那 `decision` 的 0% 只是次要症狀，方案 B1 就從備選升為主線，D-003 需要重新裁定。

**證據層級 (evidence tier)**

- §2 全部數字、§3.1–3.2 的因果鏈、§4.2 的 fixture 骨架、§3.5 的 error 標籤與 `patch_apply_end`
  計數：**直接量測**，跑產品管線於真實語料，可用 §1.2 的指令重現。
- §2.1 的 auto-review 歸因：**直接量測**（960 筆逐筆分類，882 + 78 + 0）。
- §3.5 的**成因**：**未驗證**，明確標示為未決，不併入根因。
- §5 的行數估計：**工程判斷**，非量測。
