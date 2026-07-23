# PSM R7.5 修正案 — Codex 輸入雜訊淨化 ＋ 設定對話框卡片化

- 日期：2026-07-23
- 狀態：**草案，待使用者核准後施工**。ops-relaxation：**L0（最嚴格，全流程、每步驗證）**。
- 文件角色：**唯一施工依據（sole-source）**。本文件自我完備，不把規範內容外包給已被取代／封存的檔案。
- 上游依據（已拍板、本文件不重寫）：
  - [PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md](PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md) Part B（Codex adapter 架構、R7-INV 不變式）
  - [DESIGN_R7_SETTINGS_DIALOG_v0.1.md](DESIGN_R7_SETTINGS_DIALOG_v0.1.md)（設定對話框互動模型）
  - [ACCEPTANCE.md](ACCEPTANCE.md) §22／§23（本輪回報來源）

---

## 0. 第一性原理框架（先於任何方案）

### 0.1 不可化約的痛（一句話）
使用者載入自己的 Codex session 後，**閱讀區幾乎全是機器雜訊，找不到真正的對話**——工具「能解析」但「看不懂」，等同沒接上。

### 0.2 為什麼必須做
Part B（Codex 接入）在自動化測試層全綠、施工方預檢通過，但使用者在真實環境的 §23 UAT 有 5 項標記「無法驗證」，**共同原因都是雜訊淹沒目標**，不是個別功能壞掉。不修，Part B 對真實使用者等於未交付。

### 0.3 本質核心 vs 表象（關鍵釐清，直接回答 §23 疑慮）
以你指定資料夾 `~/.codex/sessions/2026/07/23/` 的真實樣本實測，逐一否證你的四個疑慮：

| §23 疑慮 | 實測結論 |
|---|---|
| 找錯資料夾？ | **否**。`rollout-*.jsonl` 就是正確位置。 |
| Codex 沒有可解讀紀錄？ | **否**。使用者發言、AI 回覆、工具呼叫內容都完整解析成可讀中英文。 |
| 解讀方式完全不同？ | **否**。現行 adapter 解析正確，pipeline 正常運作。 |
| 本質不同？ | **部分是，但只在一個點**：Codex 的**編排型 session** 夾帶大量純機器 metadata 事件（子代理協調、生命週期訊號）與環境注入前言。這是「雜訊密度」差異，不是「無法解析」。 |

**核心結論：Part B 不需要重寫，只需要一層「雜訊淨化」。**

### 0.4 對既有設計物件的挑戰（Phase 0.4）
被挑戰並判定要修正的既有設計物件：
- **「未知型別一律寬容收納成可見卡片」（R7-INV-7 的原始寫法）**：對「可能夾帶內容的未知型別」正確；但套到「**已知的、結構性的、零內容 metadata**」就製造洪水。→ 本文件 §3 對 INV-7 做語意精修。
- **環境注入前言只在標題層被剝除**（現況函式 `stripSyntheticPreambleBlocks`，位於 `normalizer.ts`，目前僅供 `deriveFallbackTitle`；W1 起抽出並改名為白名單版 `stripInjectedPreamble`）：閱讀層沒有共用同一份剝除，導致注入前言照樣渲染成 user 卡。→ 抽成共用工具，渲染層與標題層、Codex 與 Claude 共用。

### 0.5 邊界（本輪明確不做）
- **不做**完整子代理分道視覺（Claude subagent 式）——使用者裁定「全部靜默丟棄」，完整視覺留作 BACKLOG 未來擴充。
- **不改**任何設定選項的實際行為、不新增設定項目、不動對話框互動模型（開關／Escape／✕／backdrop／互斥／focus 還原一律沿用 §21.1／§22 已驗收版本）。
- **不改**按鈕、下拉、toggle 的元件樣式——設定卡片化只動**版面容器**，不動控制項本身。
- **不做**完整子代理分道視覺；不新增任何選項；不動對話框互動模型。

> **範圍修訂（2026-07-23，更高層級掃描後）**：原草案寫「不動 Claude Code adapter」。掃描發現 RC-1（注入前言洩漏成 user 卡）**在 Claude adapter 同樣存在且完全未緩解**（見 §2.5 AN-1，已於真實 session 驗證）。因 W1 本來就要把剝除函式抽成共用工具，套用到 Claude 幾近零成本，故將 Claude 的**渲染層前言剝除**納入範圍（W6）。**仍不動** Claude 的巢狀鏈／subagent／tool 配對等既有解析邏輯，只在 user 文字進入事件流前多一層剝除。

---

## 1. 先例掃描（Phase 1，remediation 範圍）

本輪是既有產品的雜訊淨化，非新架構，先例掃描聚焦「session viewer 如何處理機器 metadata」：

- **假設sheet**：主流做法是「白名單渲染 + 已知 metadata 靜默或聚合」（如 IDE 的 git log viewer 折疊 merge noise、chat log viewer 隱藏系統訊息）。預期本專案已有 `token_count`／`world_state` 的靜默丟棄先例可沿用。
- **驗證**：實測確認 `token_count`（445 筆）、`world_state`（4 筆）在現行 adapter 已被靜默 `return` 丟棄，未產生卡片——**本專案已有「已知零內容 metadata 靜默丟棄」的既有慣例**，本輪只是把同一慣例延伸到子代理 metadata。無需引入外部函式庫，無選型。
- **設定卡片化先例**：使用者指定參考 GitHub Settings 的 `Subhead`（標題 + 分隔）＋群組容器模式。只借布局語彙，不引入其 CSS 框架。

---

## 2. 根因分析與量測基線（M0 證據）

實測樣本：`~/.codex/sessions/2026/07/23/` 全部 14 個 session。方法：以現行 `codexJsonlAdapter` 解析邏輯逐檔統計最終事件組成。

### RC-1｜環境注入前言被渲染成「使用者卡片」
- 現象：`response_item/message` 且 `role==="user"` 的內容，若是 `<recommended_plugins>` 之類 XML 注入前言，會被 `handleResponseItem` 的 `message` 分支（`codexJsonl.ts:202-214`）渲染成 `user_text` 卡。
- 量測：主編排 session 每個 1–2 張；14 檔共 7 張。**salience 高**（常是第一張卡，定調「這是機器日誌」的第一印象）。
- 現行只在標題層剝除（`normalizer.ts:104` 的 `deriveFallbackTitle`→`stripSyntheticPreambleBlocks`），渲染層未共用。

### RC-2｜子代理 metadata 洪水（「幾乎全是雜訊」的主因）
以最大樣本 `019f8b53-07c…`（2240 行）為例：

| 事件型別 | 數量 | 真實內容 | 現行處理 | 結果 |
|---|---|---|---|---|
| `inter_agent_communication_metadata`（top-level） | 49 | 僅 `{trigger_turn:false}`，**零可讀內容** | `codexJsonl.ts:194` `recordUnknown` | 49 張「未知事件」卡 |
| `event_msg/sub_agent_activity` | 40 | `{kind:"started", agent_path:"/root/t001…"}` | 落到 `codexJsonl.ts:401` `recordUnknown` | 40 張「未知事件」卡 |
| `response_item/agent_message` | 49 | 子代理訊息 | `codexJsonl.ts:293-296` `recordUnknown` | 49 張「未知事件」卡 |

- `RawEvent.kind === "unknown"` → normalizer `KIND_TO_SPAN_TYPE`（`normalizer.ts:23`）映射為 `assistant_msg` span → **渲染成可見內容卡**。
- 單一 session 約 **138 張零內容「未知事件」卡**淹沒真實對話。
- **範圍**：掃描確認洪水僅出現在**主編排 session**（噪音卡數：138 / 25 / 30 / 20 / 19 / 15…）；被派工的子代理 worker thread 本身乾淨（0 張）。使用者 §23 實測的正是一個「派工多技能」的主編排 session，故感受最強烈。

### RC-3｜設定面板左側色條貼字
- `.disclaimer` border-left（`index.css:252-254`）與 `.cloud-panel` border-left（`index.css:303`），疊上 `.settings-dialog-body .disclaimer/.ollama-panel` 把左右 padding 覆寫為 0（`index.css:209-210`），色條直接貼住文字。

### RC-4｜「語言」legend 與 label 重複
- `SettingsDialog.tsx:173` 的 `<legend>語言</legend>`，與同組 `settings-actions` 內 `<label>語言</label>`（`:175`）語意重複。其他四組沒有這種 label，僅語言組重複。

### RC-5｜legend↔settings-actions 謎樣間隔 ＋ 群組辨識度不足
- `.settings-panel-group legend{padding:0 0 8px}`（`:190-194`）＋群組 `padding:14px 0`（`:187`）＋`.settings-actions{padding-top:3px}`（`:195`）疊加出約 11px 空白；群組間僅靠 `border-top` 細線分隔，辨識度弱。

### 2.5 更高層級同構掃描（analogous issues，本輪新增）
把上述五個根因抽象成「問題類別」，回頭掃全庫找同類實例：

| 編號 | 問題類別 | 同構發現 | 驗證 | 處置 |
|---|---|---|---|---|
| **AN-1** | 注入前言洩漏成內容卡（＝RC-1） | **Claude adapter 完全相同**：`claudeCodeJsonl.ts:122-128` 把 `type==="user"` 文字直接渲染，無任何剝除。Claude Code 會注入 `<command-name>`／`<command-message>`／`<local-command-stdout>`（slash 指令）與 `<system-reminder>`（背景任務提示）到 user 訊息。 | 於使用者真實 session 實測：4138KB 檔 24 張 user 卡中 4 張是注入前言（`/compact`、`Compacted`）；4028KB 檔 5 張中 1 張是 `<system-reminder>`。**這是使用者主力場景，同樣髒。** | **納入範圍 → W6**（沿用 W1 抽出的共用工具，近零成本） |
| **AN-2** | 診斷洪水（＝RC-2 的 warning 版） | Claude adapter 對未知型別／解析失敗是**逐行各出一則 warning**（`:68`／`:155`），未像 Codex 聚合成「型別 ×N」。 | 靜態閱讀確認。屬 warning 通道非卡片，salience 低。 | **低優先，選配 W7**（一致性收斂，可不做） |
| **AN-3** | 色條貼字（＝RC-3） | 全庫 border-left 色條稽核：`.thinking-body`(左14px)／`.annotation`(16px)／`.subagent-step`(14px)／`.layer-card`(20px)／`.tree-item`(8px)／`.error-banner`(18px) 左內距**皆 ≥ 色條寬，安全**。**唯一違例是設定面板**——因 `.settings-dialog-body .disclaimer/.ollama-panel` 把左右 padding 覆寫成 0（`:209-210`）。 | 逐條讀 CSS 確認。 | W3 已涵蓋；另**明文立規**：不得把帶邊框裝飾元素的水平 padding 覆寫為 0（見 §3.3 R7.5-INV-4） |
| **AN-4** | 標籤/標題重複與版面一致性（＝RC-4＋RC-5） | W4（拿掉語言 legend）與 W5（每組都給卡片標題）**互相衝突**：若拿掉語言 legend，語言卡就成為唯一沒有標題的卡，破壞卡片一致性。 | 設計層推導。 | **W4 改寫**：保留 legend 作卡片標題（五組一致），改拿掉語言組內**重複的可見 label**，select 的無障礙名稱以 `aria-label` 保住（見 W4／D-10） |

掃描結論：注入洩漏（RC-1）**不是 Codex 專屬，是跨來源通病**；色條貼字（RC-3）**是被 padding 覆寫觸發的孤例**，非普遍缺陷。前者擴大範圍（W6），後者收斂為一條防再犯的規則。

---

## 3. PIM 語意精修（本輪唯一的語意變更，需入變更日誌）

### 3.1 詞彙表新增
- **Source-injected preamble（來源注入前言）**：由 CLI/環境自動塞進使用者訊息開頭的合成區塊，**非使用者真實輸入**。**跨來源皆有**：
  - Codex：`<recommended_plugins>`／`<INSTRUCTIONS>`／`<environment_context>` 等。
  - Claude Code：`<command-name>`／`<command-message>`／`<command-args>`／`<local-command-stdout>`／`<system-reminder>` 等（AN-1 實測）。
  - 判定以**已知注入標籤白名單**（§3.3 R7.5-INV-3）為準，只剝除白名單內的前置區塊，**不剝除任意 `<tag>`**——避免誤吃使用者真實貼上的 XML/HTML。判定邏輯以共用工具 `stripInjectedPreamble` 為唯一權威。
- **Known-noise metadata（已知零內容 metadata）**：型別已知、結構固定、且不攜帶任何可呈現給人閱讀內容的事件（`token_count`／`world_state`／`inter_agent_communication_metadata`／`sub_agent_activity`／子代理 `agent_message`）。

### 3.2 INV-7 精修（原：不得靜默丟棄未知型別）
> **R7-INV-7（v2）**：解析時分兩類——
> (a) **未知型別（可能夾帶內容）**：仍寬容收納為 `unknown` 卡片，warning 依型別聚合成「型別 ×N」（原行為不變）。
> (b) **Known-noise metadata（§3.1，已知零內容）**：**不渲染為卡片**，改計入單一聚合診斷 warning（`略過 N 筆子代理協調事件（無可呈現內容）`）。
>
> 這不違反「不得靜默丟棄」的本意——丟棄仍留痕跡（聚合 warning），只是不洗版閱讀區。`token_count`／`world_state` 早已是此類（現行連 warning 都沒有，本輪統一納入聚合診斷）。

### 3.3 新增不變式
- **R7.5-INV-1**：使用者訊息經 `stripInjectedPreamble` 後為空 → 不產生卡片；非空 → 以剝除後文字渲染。標題與渲染、Codex 與 Claude，共用同一剝除函式與同一白名單（單一真相源）。
- **R7.5-INV-2**：設定卡片化不得改變任何控制項的 DOM 語意角色與行為；每組仍是可被測試定位的獨立區塊（`<fieldset>`／`<section>`）。
- **R7.5-INV-3（白名單）**：前言剝除只作用於**已知注入標籤白名單**內的前置區塊；白名單外的 `<tag>` 一律視為使用者內容、保留。白名單集中於共用工具一處定義，新增來源時只改這一處。
- **R7.5-INV-4（padding 防再犯，來自 AN-3）**：任何帶 `border-left`/`border`-色條裝飾的元素，其對應方向的 padding 不得為 0；覆寫容器 padding 時必須保留 ≥ 色條寬度的內距。

### 3.4 語意變更的連帶正面效果
RC-1 修正後，第一個 `user_text` 事件即為真實首句 → `deriveFallbackTitle` 直接取得真實標題。§23「session 標題落回『未命名 session』是刻意安全行為」**由缺陷轉為正面**：純注入 session 仍安全，但含真實首句者現在會顯示真實標題。

---

## 4. 驗證閘（PIM→PSM 硬閘）

### 4.1 追溯矩陣（每條回報 → PIM 元素 → PSM 工作卡）
| 來源回報 | 根因 | PIM 元素 | PSM 工作卡 |
|---|---|---|---|
| §23「幾乎只看到雜訊」 | RC-2 | R7-INV-7 v2、known-noise metadata | W2 |
| §23 標題落回未命名 | RC-1 | R7.5-INV-1、source-injected preamble | W1 |
| §23 第一印象像機器日誌 | RC-1 | R7.5-INV-1 | W1 |
| 使用者問題 1（色條貼字） | RC-3 | R7.5-INV-4 | W3 |
| 使用者問題 2（語言 legend 重複） | RC-4／AN-4 | R7.5-INV-2 | W4 |
| 使用者問題 3（間隔/辨識度/卡片式） | RC-5 | R7.5-INV-2 | W5 |
| 掃描：Claude 注入洩漏 | AN-1 | R7.5-INV-1／INV-3 | W6 |
| 掃描：Claude 診斷未聚合 | AN-2 | R7-INV-7 v2 | W7（選配） |

無孤兒：每條回報／掃描發現都對應到工作卡；每張工作卡都對應到來源。

### 4.2 語意落差登記（gap register）
| PIM 語意 | 平台表徵落差 | 橋接策略 | 是否扭曲語意 |
|---|---|---|---|
| known-noise 靜默丟棄 | 平台無「隱藏但可稽核」原生概念 | 丟棄卡片 + 聚合 warning（沿用 diagnostics 通道） | 否（痕跡保留在 warning） |
| 卡片式分組 | `<fieldset>/<legend>` 原生外觀受限 | 以 CSS 容器（bg/border/radius）包裝，保留 fieldset 語意 | 否 |

### 4.3 作者≠驗證者
本文件語意由主模型撰寫；**M0 基線的復現與 M1／M2 的驗收由使用者在真實環境執行**（L0 要求），施工方預檢不得取代。

---

## 5. PSM — 里程碑與 build-ready 工作卡

技術棧沿用現況（Vite + React + TS + Zustand；vitest）。里程碑：
- **M0 基線**（施工前量測）。
- **M1 輸入淨化**：W1（共用工具＋Codex 前言）、W2（Codex metadata 丟棄）、W6（Claude 前言，依賴 W1）、W7（選配）。
- **M2 設定卡片化**：W3（色條）、W4（語言重複）、W5（卡片＋標題）。

M1、M2 無相依可平行；但 M1 內 W1→W6 有序、M2 內 W3→W4→W5 須同 agent 串行（§8.2）。L0 下逐一驗收。

### M0 — 量測基線（施工前）
- **目的**：把 §2 的 before 數字固化為文件，供 M1 前後對照。
- **交付**：`docs/R7.5_BASELINE_2026-07-23.md`，含 14 檔逐檔（env-inject 卡數／sub-agent 噪音卡數）與最大樣本的事件組成表（即 §2 數據）。
- **驗收**：使用者確認基線數字可復現（載入 `019f8b53-07c…` session，肉眼可見大量「未知事件」卡）。

---

### W1 — 抽出共用剝除工具（白名單版）＋ Codex 注入前言不再成 user 卡（RC-1）
> W1 是 W6 的前置：先把剝除能力抽成跨來源共用、可白名單控制的工具，再套到 Codex。W6 之後套到 Claude。
- **實作 INV**：R7.5-INV-1、INV-3、§3.4
- **檔案**：
  1. **新檔** `src/core/text/preamble.ts`：把 `normalizer.ts` 的剝除邏輯（`XML_BLOCK_RE`／`HEADER_LINE_RE`／`HEADER_CONTINUATION_RE`／`STRIP_ITERATION_LIMIT`）搬來，改寫為**白名單版** `stripInjectedPreamble(text: string): string`——只剝除**已知注入標籤**（`recommended_plugins`／`INSTRUCTIONS`／`environment_context`／`command-name`／`command-message`／`command-args`／`local-command-stdout`／`system-reminder`，集中成一個 `INJECTION_TAGS` 常數）開頭的區塊，以及 `#` 標頭附件。白名單外的 `<tag>` **保留**（INV-3）。葉節點工具，無下游依賴，`core/adapters/` 與 `core/normalize/` 皆可引用，不製造層級反向依賴。
  2. `src/core/normalize/normalizer.ts`：刪除本地定義，改 `import { stripInjectedPreamble }`；`deriveFallbackTitle` 改用之。**注意**：標題剝除從「任意 tag」收緊為「白名單 tag」，更保守但更正確——既有標題測試需複核（見測試對映）。
  3. `src/core/adapters/codexJsonl.ts`：`handleResponseItem` 的 `case "message"`（role 非 developer）內，對 flatten 後文字先 `stripInjectedPreamble`；**剝除後為空 → `return`（不 push）**；非空 → 以剝除後文字 push。
- **契約**：`stripInjectedPreamble(text: string): string`（純函式）；`INJECTION_TAGS: readonly string[]`（單一定義點）。
- **錯誤路徑**：`STRIP_ITERATION_LIMIT=50` 防病態輸入；非字串輸入上游已回空字串 → skip，fail-closed。
- **遷移／回滾**：純程式碼；回滾＝還原三檔 diff。
- **測試對映**：
  - Unit（新增 `preamble.test.ts`）：白名單標籤前言→剝除；**非白名單** `<foo>…</foo>`（模擬使用者貼的 XML）→**原樣保留**；「前言＋真實文字」→只留真實文字。
  - Unit（`codexJsonl.test.ts` 新增）：純注入 user 訊息→0 個 `user_text`；前言＋真實→1 個且為真實文字。
  - ⚠ Unit（`normalizer` 既有標題測試）：因剝除收緊為白名單，**須逐一複核**既有斷言仍成立；若某測試依賴「任意 tag 都被剝」的舊行為，更新為白名單語意（屬刻意變更）。
- **驗收證據（UAT）**：載入含 `<recommended_plugins>` 的真實 Codex session，第一張卡是真實首句、標題為真實首句。

### W2 — 子代理 metadata 全部靜默丟棄 + 聚合診斷（RC-2）
- **實作 INV**：R7-INV-7 v2、§3.2
- **檔案** `src/core/adapters/codexJsonl.ts`：
  1. 新增 `private droppedNoiseCount = 0` 與私有 `dropKnownNoise()`（遞增計數，不 push）。
  2. top-level dispatch（`:184-194`）：新增 `if (topType === "inter_agent_communication_metadata") { this.dropKnownNoise(); return; }`（置於落入末尾 `recordUnknown` 之前）。
  3. `handleEventMsg`：`sub_agent_activity` 明確納入丟棄（新增分支或併入既有 drop 集合），不再落到 `:401` 的 `recordUnknown`。
  4. `handleResponseItem` 的 `case "agent_message"`（`:293-296`）：由 `recordUnknown` 改為 `this.dropKnownNoise(); return;`。
  5. `finish()`：若 `droppedNoiseCount > 0`，push 一則聚合 warning：`略過 ${n} 筆子代理協調事件（inter_agent_communication_metadata／sub_agent_activity／agent_message，無可呈現內容）。`
  6. `event_msg/agent_message`（已在 `NO_EVENT_EVENT_MSG_TYPES` 靜默略過）：**維持現狀**，可選併入 `droppedNoiseCount` 以統一計數（不改可見行為）。
- **契約**：`ParseResult.warnings` 新增最多一則聚合診斷；`events` 不再含這些型別的 `unknown` 卡。
- **錯誤路徑**：型別判斷為白名單比對，無 I/O；未列入的其他未知型別仍走 INV-7(a) 原路徑（不受影響）。
- **遷移／回滾**：純程式碼；回滾＝還原 diff。
- **測試對映（含鎖住舊行為的既有測試）**：
  - ⚠ **`codexJsonl.test.ts:193-201`（"aggregates unknown types into one warning per type (R7-INV-7)"）鎖住的是本輪要反轉的舊行為**——它斷言 `inter_agent_communication_metadata ×5`＋`sub_agent_activity ×2` 產生 7 張 unknown 卡與 per-type warning。**必須改寫**為：這些型別產生 **0 張** unknown 卡、改出一則聚合診斷 warning。此為刻意的既定行為變更（非回歸），依「修改已驗收行為需逐項複核」原則明列於此。
  - Unit（新增）：含 138 筆混合噪音的 fixture → `events` 中 `kind==="unknown"` 為 0（就這些型別而言）、warning 含聚合診斷且數字正確。
  - Unit（回歸）：`patch_apply_end`/`mcp_tool_call_end`/`web_search_end` 的配對與降級行為（`codexJsonl.test.ts` 既有案例）**維持全綠**——本輪不動配對邏輯。
- **驗收證據（UAT）**：載入 `019f8b53-07c…` 主編排 session，閱讀區**看不到成片的「未知事件」卡**，只剩真實對話與工具步驟；warning 區可見一則「略過 N 筆子代理協調事件」。

### W6 — Claude Code 注入前言不再成 user 卡（AN-1，依賴 W1）
- **實作 INV**：R7.5-INV-1、INV-3
- **依賴**：W1 完成後才能做（用其 `stripInjectedPreamble`）。
- **檔案** `src/core/adapters/claudeCodeJsonl.ts`：`case "user"`（`:119-145`）內，字串 content（`:122-123`）與陣列 content 的 `text` 區塊（`:127-128`）在 push `user_text` 前先 `stripInjectedPreamble`；剝除後為空 → 不 push。tool_result 區塊（`:129-141`）**不動**。
- **⚠ 既有驗收行為變更**：Claude session 的渲染已通過 §1–§22 UAT。此卡改變「注入前言是否顯示」。依「修改已驗收行為需逐項複核」：施工須列出 Claude 渲染已接受的行為（首句、對話、思考、工具、subagent 排序、標題），改後逐一確認**除「注入前言不再顯示」外無其他變化**。
- **錯誤路徑**：同 W1；剝除只作用於 user 文字進入事件流前，不影響 uuid/parentUuid 巢狀鏈（剝除不改 uuid，只改 text；若整段被剝空而 skip，該節點無 text 卡但其 uuid 仍不被其他節點引用為 parent——Claude 的 user 純文字節點不會是他人 parent，安全）。
- **測試對映**：Unit（`claudeCodeJsonl.test.ts` 新增）：`<command-name>/compact</command-name>…` 純注入 user → 0 個 `user_text`；`<system-reminder>…</system-reminder>` 開頭＋真實文字 → 只留真實文字；tool_result 不受影響。既有 Claude adapter 測試維持全綠。
- **驗收證據（UAT）**：載入你自己最近的 Claude session，閱讀區看不到 `/compact`、`Compacted`、`<system-reminder>` 那種機器卡；其餘內容與改版前一致。

### W7 —（選配，AN-2）Claude 診斷聚合，與 Codex 一致
- **實作 INV**：R7-INV-7 v2
- **檔案** `src/core/adapters/claudeCodeJsonl.ts`：未知型別（`:155`）與 JSON 解析失敗（`:68`）由逐行 warning 改為計數，`finish()` 各出一則「型別 ×N／N 行解析失敗」聚合 warning，與 `codexJsonl` 慣例一致。
- **判斷**：salience 低（warning 非卡片），且改動 Claude 已驗收路徑。**建議列為選配**，若本輪求穩可延後。
- **測試對映**：Unit：多筆未知型別 → 一則聚合 warning。
- **驗收證據**：非視覺，靠 unit 即可。

---

### W3 — 移除面板左側色條 + 修正貼字（RC-3）
- **檔案** `src/styles/index.css`：
  - 刪除 `.disclaimer { border-left: 3px solid transparent; }`（`:252`）、`.disclaimer.cloud { border-left-color… }`（`:253`）、`.disclaimer.ollama { border-left-color… }`（`:254`）。
  - `.cloud-panel`（`:303`）移除 `border-left: 3px solid var(--accent-secondary);`，保留背景與 `border-bottom-color`。
  - 責任層級（雲端會外傳）改由**既有文字**與 `.disclaimer.cloud` 的暖色前景／背景表達，不再靠色條——符合「類型不只靠顏色」的既有 UAT 準則。
- **錯誤路徑**：純樣式，無。
- **測試對映**：無單元斷言色條；納入 M2 視覺 UAT。
- **驗收證據（UAT）**：本地 AI／雲端 disclaimer 與 Ollama/Cloud 面板文字左緣不再被色條貼住。

### W4 — 消除「語言」重複顯示（RC-4，經 AN-4 改寫）
> **與原草案的差異（重要）**：你原本的指示是「拿掉 `<legend>`、保留 label」。但 W5 把**每組的 legend 變成卡片標題**；若語言組拿掉 legend，它會是唯一沒有標題的卡，破壞卡片一致性（AN-4）。故反過來做——**保留 legend 作卡片標題（五組一致），拿掉組內重複的可見 label**。兩種做法都達成你的目的「語言只顯示一次」，但這個方向在卡片版面下更一致。**此為對你原始指示的重新詮釋，登記為 D-10，可一行還原成你原本的版本。**
- **實作 INV**：R7.5-INV-2
- **檔案** `src/components/SettingsDialog.tsx:172-180`：**保留** `<legend>{t.settings.languageGroup}</legend>`（作卡片標題）；把 `<label htmlFor="hdr-locale">{t.header.languageLabel}</label>` 的**可見文字移除**，改在 `<select>` 上加 `aria-label={t.header.languageLabel}`（無障礙名稱不流失）。視覺結果：卡片標題「語言」＋一個裸下拉，無重複。
- **測試對映**：
  - `SettingsDialog.test.tsx:30`（legends === `["Session","教學講解","語言","導航","匯出"]`）：**維持不變、仍全綠**（我們保留了語言 legend）——這與原草案的預期相反，是 AN-4 改寫後的正確結果。
  - 新增斷言：語言組內不再有可見的重複「語言」label；`#hdr-locale` select 有可及名稱（`aria-label`）。
- **驗收證據（UAT）**：語言組只出現一次「語言」（在卡片標題），下拉可正常切換、螢幕報讀器仍讀得到名稱。

### W5 — 設定卡片式分組（RC-5，標題加大依 Q2）
- **實作 INV**：R7.5-INV-2、使用者裁定「卡片式分組（GitHub Subhead 參考，只借布局）」＋「標題稍大，作視覺引導與內容切割」
- **檔案** `src/styles/index.css`（`.settings-panel-group` 系列，`:186-210`）：
  - `.settings-panel-group`：由「`border:0; border-top:1px` 細線分隔」改為**卡片容器**：`background: var(--bg-card)`、`border: 1px solid var(--rule)`、`border-radius: 4px`、`padding: 12px 14px`、`margin-bottom: 12px`。移除 `border-top` 分隔與 `:first-child` 特例。（若 `--bg-card` 與對話框底幾乎同色致邊界不明，退用 `--bg-sunken`；D-7，施工時就近取辨識度較佳者並記一行理由。）
  - `.settings-panel-group legend`（**標題加大，Q2**）：由現行 `--fs-2xs`(10.5px) 全大寫小標，改為較大的區塊標題——`font-size: var(--fs-base)`（就近取階梯內約 13–14px 級）、`font-weight: 600`、**取消 `text-transform:uppercase` 與大字距**（大寫小字距是「小標」語彙，與「加大標題作內容切割」相反）、下方加一條細分隔線（`border-bottom: 1px solid var(--rule); padding-bottom: 6px`，仿 GitHub Subhead）。目標：一眼分辨組界。
  - 收斂 legend 與 `.settings-actions` 間距，消除 RC-5 謎樣間隔（legend 分隔線與第一列控制項間距 ≤6px）。
  - `.settings-dialog-body .disclaimer / .ollama-panel`（`:209-210`）：改為與卡片一致的內距（不再 `padding:…0`，符合 INV-4），與 W3 一起讓 provider 面板落在卡片節奏內。
  - **不動**：`.btn`／`select`／`.toggle`／`.batch-control` 等控制項樣式（按鈕/選項不變）。
- **UX 語意**：僅視覺容器與標題字級變更；控制項互動、Tab 次序、focus 還原、backdrop 關閉一律不變。
- **i18n**：標題來自既有 `t.settings.*Group` 字串，zh/en 皆已存在，不新增字串。
- **測試對映**：Unit 沿用「每組是可定位的獨立 fieldset、標題與內容都在」；視覺效果納入 UAT。
- **驗收證據（UAT）**：五組各為可辨識卡片、標題明顯大於內文、一眼看出組界、legend 與內容無多餘間隔；390／740／1280／1920 無水平溢位；English 版同樣清楚。

---

## 6. 決策登記表（所有 gate 一表，含狀態）
| 編號 | 決策 | 狀態 | 裁定者 | 日期 |
|---|---|---|---|---|
| D-1 | ops-relaxation 級別 | **已核准：L0** | 使用者 | 2026-07-23 |
| D-2 | Codex 子代理 metadata 處理 | **已核准：全部靜默丟棄 + 聚合診斷** | 使用者 | 2026-07-23 |
| D-3 | 設定版面方向 | **已核准：卡片式分組** | 使用者 | 2026-07-23 |
| D-4 | 環境注入前言：渲染層一併剝除（W1） | **已核准**（Q1 選最乾淨） | 使用者 | 2026-07-23 |
| D-5 | INV-7 精修為 v2（known-noise 碳出） | **已核准**（隨 D-2 連帶） | 使用者 | 2026-07-23 |
| D-6 | 剝除邏輯抽成 `core/text/preamble.ts` 共用工具 | **已核准**（Q1 選最乾淨） | 使用者 | 2026-07-23 |
| D-7 | 卡片底色取 `--bg-card` vs `--bg-sunken` | 施工時就近定（辨識度優先），記一行理由 | 施工方 | — |
| D-8 | 前言剝除擴及 Claude adapter（W6，AN-1） | **建議採用**（同根因、近零成本、Q1 求乾淨）；動到已驗收路徑，須回歸複核 | — | 待核准 |
| D-9 | 前言剝除改**白名單**（非任意 tag，INV-3） | **建議採用**（避免誤吃使用者貼的 XML；更安全正確） | — | 待核准 |
| D-10 | 語言組：保留 legend 作標題、拿掉重複 label（AN-4） | **建議採用**（卡片一致性）；與你原始「拿掉 legend」相反，可一行還原 | — | 待核准 |
| D-11 | W7（Claude 診斷聚合）是否納入本輪 | **建議延後**（salience 低、動已驗收路徑） | — | 待核准 |
| D-12 | 標題字級加大、去大寫小字距（Q2） | **已核准** | 使用者 | 2026-07-23 |

D-4/5/6/12 已由你核准。**D-8/9/10/11 是本次高層級掃描新產生的決策**，預設值如上；若無異議即照建議施工，有異議請於啟動時一句話指定。

## 7. 選型（選擇 + 白話理由 + 被否決選項）
- **子代理 metadata：靜默丟棄 + 聚合診斷（採用）** vs 渲染成細標記（否決：本輪要的是乾淨，且完整視覺屬 BACKLOG）vs 完全不留痕跡（否決：違反 INV-7「不靜默丟棄」本意，聚合 warning 是折衷）。
- **前言剝除放在 adapter 層（採用）** vs 放在 normalizer 或 UI 層（否決：normalizer 已下游、UI 層太晚且會讓標題與渲染各算一次）。理由：注入前言是「來源特性」，在最靠近來源的 adapter 處理最貼語意，且 skip 空卡後標題 fallback 自然拿到真實首句。
- **卡片容器用 CSS 包裝 fieldset（採用）** vs 改寫成 `<section>`（否決：fieldset/legend 有無障礙語意，且測試以 legend 定位，改動面過大無收益）。

## 8. 交付附錄

### 8.1 決策狀態（原開放問題已由使用者回覆）
- Q1「最乾淨」→ D-4/5/6 全採納（渲染層剝除、INV-7 v2、抽共用工具）。
- Q2「標題稍大」→ D-12 採納（加大、去大寫小字距）。
- 高層級掃描新增的 D-8/9/10/11 採「建議即預設」，使用者可於啟動時一句話覆寫。

### 8.2 派工順序與衝突控制（給執行 session）
L0 逐一驗收；避免平行改同一檔造成衝突：
- **批次 A（Codex/Claude 淨化，可與批次 B 平行，但 A 內有序）**：`W1 → W6`（W6 依賴 W1 的共用工具）；`W2` 獨立（純 Codex metadata）；`W7` 選配殿後。
- **批次 B（設定對話框，內部須有序，皆改 `index.css`／`SettingsDialog.tsx`）**：`W3 → W4 → W5` 由**同一 agent 串行**完成，不可拆給不同 agent 平行（會撞同檔）。
- **收尾**：全部完成後跑一次 `typecheck` + `test` + `build`，再進 M1 UAT。

### 8.3 M1 手動驗收清單（首個里程碑，可由非作者盲測）
| # | 動作 | 預期觀察 |
|---|---|---|
| 1 | 載入 `~/.codex/…/23/rollout-…019f8b53-07c…jsonl`（主編排 session） | 直接進閱讀頁，不白屏 |
| 2 | 看閱讀區第一張卡 | 是你的真實首句（含 `code-review-deep-checklist…` 那段），**不是** `<recommended_plugins>` 外掛清單 |
| 3 | 捲動整個 session | **看不到成片「未知事件」空卡**；只有真實對話、思考、工具步驟 |
| 4 | 看 header 的 session 標題 | 是真實首句濃縮，非「未命名 session」 |
| 5 | 開啟 warning／診斷 | 可見一則「略過 N 筆子代理協調事件」聚合訊息（N 約在 138 量級） |
| 6 | 載入一個**乾淨的 worker thread**（如 `019f8b56-516…`，822 行） | 內容照常完整，未被誤刪（無過度過濾） |
| 7 | 快速連載入不同 session、中途取消 | 不殘留上一份、不 crash（回歸 §23 既有能力） |
| 8 | **（W6）載入你最近的 Claude session** | 看不到 `/compact`、`Compacted`、`<system-reminder>` 那種機器 user 卡；其餘對話、思考、工具、subagent 排序與改版前一致 |
| 9 | 載入你最大的 Claude Code session（含 50 MiB fixture） | 完全無回歸：subagent 排序、標題、Map、Minimap、M 快捷鍵、匯出皆正常 |
| 10 | **（壓力）貼上一段開頭是使用者自己寫的 `<foo>…</foo>` 的訊息** | 該內容**原樣保留**、不被誤剝（驗證白名單 INV-3） |
| 11 | 丟一個非 session 的 `.jsonl`／純文字 | 出現「無法辨識輸入格式」，不白屏（串流與同步兩路徑都試） |
| 12 | **（設定 UAT）** 開設定對話框，逐一看五組 | 各為卡片、標題明顯大於內文、無色條貼字、語言只出現一次、無謎樣間隔；390/740/1280/1920 × zh/en 無溢位 |

### 8.4 checkpoint 提議
M0 基線文件產出後、進 M1 前，建議以 workflow-checkpoint 存一個相位點，並記錄 `ops-relaxation: L0` 到專案根（本專案目前無 CLAUDE.md／AGENTS.md 記載此值），讓後續 session 不必重問。

---


