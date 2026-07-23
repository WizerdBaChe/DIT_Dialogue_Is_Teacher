# 🎓 DIT — Dialogue Is Teacher（對話即教師）

> 把 AI coding agent（如 Claude Code、Codex）的執行軌跡，轉成**可學習**的結構化節點視圖——
> 讓你從「一直按同意」升級成「看懂這次到底是怎麼做出來的」。

[![build](https://img.shields.io/badge/build-passing-brightgreen)]()
[![stack](https://img.shields.io/badge/stack-Vite%20%2B%20React%20%2B%20TypeScript-blue)]()
[![privacy](https://img.shields.io/badge/privacy-local--first-success)]()
[![status](https://img.shields.io/badge/status-R7.5-orange)]()
[![license](https://img.shields.io/badge/license-Personal%20Use%20Only-lightgrey)](LICENSE)

**Language / 語言：[繁體中文](#繁體中文) ・ [English](#english)**

---

## 繁體中文

### 這是什麼？

當你用 Claude Code、Codex 之類的 AI coding agent 寫程式時，agent 會留下一份完整的執行紀錄（`.jsonl`）——它想了什麼、呼叫了什麼工具、結果如何。這份紀錄理論上看得到，但實際上是**一長串密密麻麻的文字與指令**，你大概只會不斷按「批准」，事後也很少有人回頭去看。

結果就是：用了一堆 AI agent，**技能卻沒有跟著長**。你只學會了「怎麼下指令」，沒學會「這次的解法到底為什麼是對的、下次遇到類似問題該怎麼做」。

**DIT 做的事情很單純**：讀進一份 Claude Code 或 Codex 的 session（`.jsonl`），把它解析、降噪、結構化，重新畫成一個你**看得懂、學得到東西**的儀表板——而不是另一個「給工程師除錯用」的 tracing 工具。

> DIT 的目標讀者是「想學會技術的使用者」，不是「想除錯 agent 行為的開發者」。這是它跟 LangGraph Studio、Agent Prism 這類 observability 工具最大的不同。

---

### 為什麼要做這個

| 現況 | 問題 |
|---|---|
| Raw log 是為「即時互動」設計的 | 資訊密度高、噪音多（重試、失敗、冗長輸出），不是為「事後複盤」設計 |
| 現有的 agent tracing 工具 | 給開發者除錯用，呈現「發生了什麼」，不解釋「為什麼、下次該怎麼做」 |
| 一般人的應對方式 | 自己回頭翻 log、靠記憶、或乾脆放棄理解（純黑箱使用） |

DIT 想驗證的核心假設很簡單：**只要把一條雜亂的執行軌跡，降噪、結構化、分層呈現出來，使用者就能更快看懂「這次任務的骨架」**——這件事甚至不需要額外的 AI 講解就已經有價值；AI 講解層是錦上添花，不是必要條件。

---

### 核心功能

- 🔍 **多來源解析**：讀取單一 session 檔案，在瀏覽器內完全本地解析，不需要任何後端。目前支援：
  - **Claude Code**（`~/.claude/projects/<專案>/*.jsonl`）
  - **Codex CLI**（`~/.codex/sessions/rollout-*.jsonl`）——自動辨識工具真實名稱、去重巢狀事件、
    過濾掉 Codex 特有的子代理協調雜訊與自動核准審查（auto-review）轉述，只留下有教學價值的內容。
  - 丟一個不是 session 的檔案會給你看得懂的「無法辨識輸入格式」訊息，不會白屏。
- 🧹 **確定性降噪**：不靠 LLM，用規則就先把雜訊清乾淨——
  - 連續修改同一個檔案 → 折疊成「反覆修改 X」群組
  - 失敗後重試的工具呼叫 → 標記 `retry`
  - 錯誤結果 → 標記 `error` 並上拋到操作卡片，整張卡邊框轉紅
  - 思考層出現「決定／改用…」等語彙 → 標記 `decision`
  - 使用者發出新訊息 → 標記任務分界 `milestone`
  - 系統/工具注入的前言（斜線指令展開、`<system-reminder>` 之類）自動剝除，不會冒出一張看不懂的卡
- 📋 **高密度閱讀模式（預設）**：逐步卡片時間軸，思考層可展開、參數與結果可摺疊，給你想深挖細節時用。
- 🐟 **Session 地圖（魚骨骨架導覽）**：隨時按 `M` 或點「地圖」，把整段 session 蒸餾成一條橫向主線（目標 → 決策 → 決策 → 結果），下面掛上取證／錯誤／重試／反覆修改等支線；三段縮放層級（全局／區段／細節）可切換，點節點會回到閱讀畫面對應位置。
- ▶️ **Step-through 重播**：像播放器一樣一步步往前走，逐步高亮目前在哪個節點。
- 🧠 **教學講解層（可選）**：對每個節點生成「做了什麼／為什麼這樣做／這類問題的通用做法」三段式講解，可在三種來源間切換：
  - `none`　完全不外傳，零成本
  - `ollama`　接你本機跑的 Ollama，code/log 完全不出機器
  - `cloud`（OpenCode 橋接）　接你本機跑的 [OpenCode](https://opencode.ai) CLI，由它轉送到你設定好的雲端模型（預設 `deepseek-v4-flash-free`）。DIT 本身不存金鑰，送出前會先在本機做去識別化並顯示「實際會送出的內容」預覽，你確認後才真的發送。
- 🔒 **隱私把關**：切換講解來源時，頂部橫幅即時變色變字告訴你這個選擇會不會外傳；`cloud` 模式額外多一道「確認送往 OpenCode 的內容」關卡，疑似金鑰/密碼會直接擋下、不能略過確認。
- 📤 **匯出**：把整理好的 session 匯出成 JSON（結構化資料）或一個**不需要任何伺服器、雙擊就能開**的單檔 HTML 快照，方便存檔或分享給別人看，對方不需要安裝或跑 DIT。

---

### 它長什麼樣子

```
┌─────────────────────────────────────────────────────────┐
│ 🎓 DIT   [總覽 | 閱讀 | 子代理]  地圖  設定  ⏮▶⏭          │
├─────────────────────────────────────────────────────────┤
│ ⚠ 講解來源：本地 Ollama — 不外傳                          │
├──────────┬──────────────────────────────────────────────┤
│ Session   │  逐步卡片時間軸（高密度閱讀，預設畫面）         │
│ 結構側欄  │  展開思考層／參數／結果，看回完整內容           │
│           │                                              │
│           │  按「地圖」或 M → 疊出魚骨骨架：                │
│           │  🎯 目標 ──◇決策──◇決策──▰ 結果  （橫向主線）  │
│           │       │        │                             │
│           │     ├取證   △錯誤  ○重試  ◆反覆修改（支線）    │
└──────────┴──────────────────────────────────────────────┘
```

> 「閱讀」是逐字稿，隨時能疊出「地圖」看骨架——兩者吃的是同一份資料，只是換一個解析度，點地圖上的節點會跳回閱讀畫面對應位置。

---

### 快速開始

```bash
git clone <你的 repo 網址>
cd DIT_Dialogue_Is_Teacher
npm install
npm run dev      # 開發模式，預設 http://localhost:5173
```

啟動後會**自動載入一份內建範例**（一個修 Todo bug 的 session），讓你立刻看到效果，不用先準備自己的資料。

想看自己的 session？左上角「載入 .jsonl」，選擇你電腦上留下的紀錄檔即可：

- **Claude Code**：通常在 `~/.claude/projects/<某專案>/*.jsonl`
- **Codex CLI**：通常在 `~/.codex/sessions/rollout-*.jsonl`

DIT 會自動判斷是哪個來源，不需要手動選擇。

#### 想串接教學講解（可選）

講解來源在「設定」對話框裡切換，有兩種本機優先的選項：

**本地 Ollama**（完全不外傳）

1. 安裝並啟動 [Ollama](https://ollama.com)，記得設定 `OLLAMA_ORIGINS` 允許瀏覽器跨域連線。
2. `ollama pull <model>` 拉一個 7–8B 等級的 coder 模型即可（例如 Qwen2.5-Coder 7B）。
3. 把「講解來源」切到「本地 Ollama」，下方引導面板會即時顯示連線狀態並給你可直接複製的啟動指令。

**雲端 AI（OpenCode 橋接，會外傳）**

1. 安裝 [OpenCode](https://opencode.ai) CLI，並依它的文件登入你要用的雲端模型供應商（金鑰存在 OpenCode 裡，DIT 不碰）。
2. 把「講解來源」切到「雲端 AI」，面板會給你一行啟動指令可複製（本機起一個 loopback server，只接受 DIT 這個網頁來源的連線）；**下方指令為 Windows 範例，macOS／Linux 請把 `opencode.cmd` 換成 `opencode`**。
3. 每次送出前，DIT 會先在本機做去識別化並跳出「確認送往 OpenCode 的內容」預覽，你按確認才會真的發送；疑似金鑰或密碼會直接擋下，無法略過。

#### Build

```bash
npm run build     # 型別檢查 + production build
npm run preview   # 預覽 build 產物
```

> 想知道內部架構、資料流、模組怎麼分層、目前開發到哪一步、接下來該做什麼、以及打包/發布步驟——這些都搬到了 [DEV_README.md](DEV_README.md)，給要接續開發或維護這個專案的人看。

---

### 隱私模式怎麼選

| 講解來源 | 資料會外傳嗎 | 適合誰 |
|---|---|---|
| `none`（預設） | 完全不外傳 | 只想看降噪後的結構，不需要 AI 講解 |
| `ollama` | 不外傳，純本機運算 | 想要 AI 講解、但 code/log 不想離開自己電腦 |
| `cloud`（OpenCode 橋接） | 會外傳到你設定的雲端模型 | 想要更高品質講解、能接受資料送出本機；送出前有本機去識別化 + 逐次確認把關 |

---

### 支援環境

DIT 是純前端的網頁應用，**沒有安裝檔，也不挑作業系統**——只要瀏覽器裝得起來，Windows／macOS／Linux 都能用，行為完全一致：

- **瀏覽器**：建議近期版本的 Chrome、Edge、Firefox；Safari 需 15.4 以上（介面用到原生 `<dialog>` 對話框）。不支援舊版 IE / Legacy Edge。
- **不需要伺服器也能看**：`npm run build` 額外會產出一份**單檔 HTML 快照**（`dist/snapshot.html`，也是「匯出」按鈕產生的檔案），雙擊即可離線開啟，不需要跑 `npm`、不需要網路。
- **想要完整的 DIT 本體、不只是快照？** 從 [Releases](../../releases) 下載打包好的 zip，解壓後雙擊 `start-dit.bat` 即可——它會在背景開一個只接受本機連線的小型伺服器並自動開啟瀏覽器，不需要安裝 Node.js／Python。（直接雙擊 `index.html` 會是白畫面：瀏覽器基於安全限制擋掉了 ES module，一定要透過 `start-dit.bat` 開。）macOS／Linux 使用者可在同一個資料夾改用 `npx serve .` 或 `python3 -m http.server`。
- **行動裝置**：目前是桌面優先的版面，手機／平板可以打開但排版未特別優化，屬已知限制。

**可選的本機講解引擎**（不影響 DIT 本體是否能用，只影響「教學講解」這個功能）：

| 引擎 | 支援平台 | 備註 |
|---|---|---|
| Ollama | Windows / macOS / Linux 皆支援官方安裝檔 | 面板提供的啟動指令為 PowerShell 語法；macOS/Linux 請改用你 shell 對應寫法（如 `OLLAMA_ORIGINS="*" ollama serve`） |
| OpenCode | Windows / macOS / Linux 皆支援官方安裝檔 | 面板提供的啟動指令含 Windows 專用的 `opencode.cmd`；macOS/Linux 把它換成 `opencode` 即可，其餘參數（`--port`／`--hostname`／`--cors`）跨平台一致 |

三種操作模式（不外傳 / 本地 Ollama / 雲端 OpenCode）在任何作業系統上的**行為與 UI 完全相同**——差別只在於你要不要、以及怎麼在你的作業系統上啟動對應的本機引擎。

切換時介面會即時顯示對應的責任說明，不會悄悄幫你做選擇。

---

### 目前狀態與已知限制

DIT 目前開發到 **R7.5**，已驗證可用，但仍是個人專案，持續開發中：

- ✅ 已完成：多來源 `.jsonl` 解析（Claude Code + Codex）、確定性降噪、高密度閱讀 + Session 地圖（魚骨骨架）雙導覽、step-through 重播、本地 Ollama 講解、雲端 OpenCode 講解橋接（含本機去識別化 + 逐次送出確認）、JSON／單檔 HTML 匯出、繁中/英雙語介面。
- 🚧 尚未完成：跨檔 subagent（`subagents/*.jsonl`）串接、全局摘要、行動裝置版面、Codex 子代理事件的專屬視覺呈現（目前落回通用「未知事件」寬容收納）。
- 📌 一次只處理單一 session；多 session／個人技能庫等橫向串接功能還在規劃中，但架構上已預留擴充空間（新增來源只需在 `src/core/adapters` 註冊，不必改動 pipeline 或 UI）。

詳細的決策紀錄、里程碑進度與待辦清單，維護者可參考 [DEV_README.md](DEV_README.md) 與 `docs/` 目錄。

---

### 這個專案不是什麼

- ❌ 不是即時的 agent 操控台——它是**事後複盤**工具，不參與 agent 執行過程。
- ❌ 不是通用的 LLM observability / debugging 工具——它是**教學導向**，不是除錯或監控導向。
- ❌ 不是聊天紀錄美化器——它做的是語意降噪與抽象化，不只是排版好看而已。

---

### License

DIT 採用 [DIT Personal Use License](LICENSE)（自訂授權，非 OSI 標準授權）：

- ✅ 可以：個人使用、研究、修改原始碼、在自己的電腦/環境上執行。
- ❌ 不可以：重新發布本專案或其修改版（包含公開託管、上傳套件庫、包進其他產品等），**即使有標註原作者/來源也一樣不行**。
- 📩 例外：如需重新發布，必須取得作者的**書面**同意（例如 email 或簽署文件）；口頭同意或預設同意一律無效。

完整條款請見 [LICENSE](LICENSE)。

[⬆ 回頂端 / Back to top](#)

---

## English

### What is this?

When you use an AI coding agent like Claude Code or Codex, the agent leaves behind a complete execution trace (`.jsonl`) — what it thought, which tools it called, and what happened. That trace is technically readable, but in practice it's **a dense wall of text and tool calls**. You end up just clicking "approve" over and over, and almost nobody goes back to actually read it afterward.

The result: you use a pile of AI agents, but **your own skill doesn't grow with it**. You learn how to prompt, not why the solution was actually correct or how to handle a similar problem next time on your own.

**What DIT does is simple**: it reads a Claude Code or Codex session (`.jsonl`), parses it, strips the noise, structures it, and redraws it as a dashboard you can actually **understand and learn from** — not another tracing tool built for engineers to debug agent behavior.

> DIT's target reader is "someone who wants to learn the underlying skill," not "a developer who wants to debug agent behavior." That's the key difference from observability tools like LangGraph Studio or Agent Prism.

---

### Why build this

| Current state | Problem |
|---|---|
| Raw logs are designed for real-time interaction | High information density, lots of noise (retries, failures, verbose output) — not designed for after-the-fact review |
| Existing agent tracing tools | Built for developers to debug — they show "what happened," not "why, and what to do next time" |
| The typical response | Scroll back through the raw log yourself, rely on memory, or just give up understanding it (pure black-box usage) |

The core hypothesis DIT is testing is simple: **just denoising, structuring, and layering a messy execution trace already lets a user understand "the skeleton of what happened" much faster** — and that's valuable even without any extra AI explanation layer. The AI explanation layer is a bonus, not a prerequisite.

---

### Core features

- 🔍 **Multi-source parsing**: reads a single session file, parsed entirely in-browser, no backend required. Currently supports:
  - **Claude Code** (`~/.claude/projects/<project>/*.jsonl`)
  - **Codex CLI** (`~/.codex/sessions/rollout-*.jsonl`) — automatically resolves real tool names, dedupes nested events,
    and filters out Codex-specific sub-agent coordination noise and auto-review pass-throughs, keeping only content with teaching value.
  - Dropping a file that isn't a session shows a readable "unrecognized input format" message instead of a blank screen.
- 🧹 **Deterministic denoising**: cleans up noise with rules first, no LLM involved —
  - Repeated edits to the same file → collapsed into a "repeated edits to X" group
  - Tool calls retried after a failure → tagged `retry`
  - Error results → tagged `error` and surfaced onto the action card, whose border turns red
  - Wording like "decided to / switched to…" in the thinking layer → tagged `decision`
  - A new user message → tagged as a task boundary `milestone`
  - System/tool-injected preambles (slash-command expansions, `<system-reminder>`-style content) are stripped automatically so you never see an unreadable card
- 📋 **High-density reading mode (default)**: a step-by-step card timeline where the thinking layer, parameters, and results can all expand/collapse — for when you want to dig into details.
- 🐟 **Session map (fishbone skeleton view)**: press `M` or click "Map" any time to distill the whole session into one horizontal spine (goal → decision → decision → outcome), with evidence / errors / retries / repeated-edit branches hanging off it; three zoom levels (global / section / detail) are switchable, and clicking a node jumps back to the matching spot in the reading view.
- ▶️ **Step-through replay**: walk forward one step at a time like a player, highlighting the current node as you go.
- 🧠 **Teaching explanation layer (optional)**: generates a three-part explanation per node — "what happened / why it was done this way / the general pattern for this kind of problem" — switchable between three sources:
  - `none` — nothing leaves your machine, zero cost
  - `ollama` — talks to Ollama running locally; code/logs never leave your machine
  - `cloud` (OpenCode bridge) — talks to the [OpenCode](https://opencode.ai) CLI running locally, which forwards to whichever cloud model you've configured (default `deepseek-v4-flash-free`). DIT itself never stores any API keys; it de-identifies content locally and shows you a preview of "what will actually be sent" before you confirm.
- 🔒 **Privacy gating**: switching the explanation source updates the top banner's color and text immediately to tell you whether that choice sends data out; `cloud` mode adds one more gate — a "confirm what's being sent to OpenCode" preview — and anything that looks like a key or password is blocked outright, with no way to skip the confirmation.
- 📤 **Export**: export the cleaned-up session as JSON (structured data) or as a **single-file HTML snapshot that needs no server and opens on double-click** — handy for archiving or sharing with someone who doesn't need to install or run DIT themselves.

---

### What it looks like

```
┌─────────────────────────────────────────────────────────┐
│ 🎓 DIT   [Overview | Read | Sub-agents]  Map  Settings  ⏮▶⏭ │
├─────────────────────────────────────────────────────────┤
│ ⚠ Explanation source: local Ollama — nothing leaves this machine │
├──────────┬──────────────────────────────────────────────┤
│ Session   │  Step-by-step card timeline (high-density reading, default view) │
│ structure │  Expand thinking layer / params / results to see the full content │
│ sidebar   │                                              │
│           │  Press "Map" or M → overlay the fishbone skeleton: │
│           │  🎯 Goal ──◇Decision──◇Decision──▰ Outcome  (horizontal spine) │
│           │       │        │                             │
│           │     ├evidence  △error  ○retry  ◆repeated edits (branches) │
└──────────┴──────────────────────────────────────────────┘
```

> "Read" is the verbatim transcript; you can overlay the "Map" for the skeleton view at any time — both read the same underlying data, just at a different resolution, and clicking a node on the map jumps back to the matching spot in the reading view.

---

### Quick start

```bash
git clone <your repo URL>
cd DIT_Dialogue_Is_Teacher
npm install
npm run dev      # dev mode, defaults to http://localhost:5173
```

On first launch DIT **automatically loads a built-in sample session** (a Todo-bug-fix session) so you can see it in action right away, without preparing your own data first.

Want to load your own session? Use "Load .jsonl" in the top-left corner and pick a trace file from your machine:

- **Claude Code**: usually under `~/.claude/projects/<some-project>/*.jsonl`
- **Codex CLI**: usually under `~/.codex/sessions/rollout-*.jsonl`

DIT detects which source it is automatically — no manual selection needed.

#### Wiring up the teaching explanation layer (optional)

The explanation source is switched inside the "Settings" dialog, with two local-first options:

**Local Ollama** (nothing leaves your machine)

1. Install and start [Ollama](https://ollama.com), and set `OLLAMA_ORIGINS` so your browser is allowed to connect cross-origin.
2. `ollama pull <model>` a 7–8B-class coder model (e.g. Qwen2.5-Coder 7B) is enough.
3. Switch "explanation source" to "Local Ollama" — the guidance panel below shows live connection status and a copy-pasteable start command.

**Cloud AI (OpenCode bridge, data leaves your machine)**

1. Install the [OpenCode](https://opencode.ai) CLI and log in to whichever cloud model provider you want, following its own docs (the key lives inside OpenCode; DIT never touches it).
2. Switch "explanation source" to "Cloud AI" — the panel gives you a one-line start command to copy (it starts a local loopback server that only accepts connections from DIT's own web origin); **the command shown is a Windows example — on macOS/Linux, swap `opencode.cmd` for `opencode`**.
3. Before every send, DIT de-identifies the content locally and pops up a "confirm what's being sent to OpenCode" preview; nothing actually goes out until you confirm, and anything that looks like a key or password is blocked outright with no way to skip it.

#### Build

```bash
npm run build     # type-check + production build
npm run preview   # preview the build output
```

> For internal architecture, data flow, how modules are layered, current development status, what's next, and packaging/release steps — all of that has moved to [DEV_README.md](DEV_README.md), for anyone continuing development or maintaining this project.

---

### Choosing a privacy mode

| Explanation source | Does data leave your machine? | Who it's for |
|---|---|---|
| `none` (default) | Never | You just want the denoised structure, no AI explanation needed |
| `ollama` | No, fully local compute | You want AI explanations but don't want code/logs leaving your machine |
| `cloud` (OpenCode bridge) | Yes, to whichever cloud model you configured | You want higher-quality explanations and are OK with data leaving locally; local de-identification + per-send confirmation gate it |

---

### Supported environments

DIT is a purely front-end web app — **no installer, and it doesn't care about OS**. As long as a browser can run, Windows/macOS/Linux all behave identically:

- **Browser**: recent versions of Chrome, Edge, or Firefox recommended; Safari needs 15.4+ (the UI uses the native `<dialog>` element). Legacy IE/Edge is not supported.
- **No server needed to view it**: `npm run build` also produces a **single-file HTML snapshot** (`dist/snapshot.html`, the same file the "Export" button generates) that you can double-click to open offline — no `npm`, no network required.
- **Want the full DIT app, not just a snapshot?** Download the packaged zip from [Releases](../../releases), unzip it, and double-click `start-dit.bat` — it starts a tiny local-only server in the background and opens your browser automatically, no Node.js/Python install required. (Double-clicking `index.html` directly gives you a blank page: browsers block ES modules for security reasons off `file://`, so it must be opened through `start-dit.bat`.) macOS/Linux users can run `npx serve .` or `python3 -m http.server` from the same folder instead.
- **Mobile**: the layout is currently desktop-first; phones/tablets can open it, but the layout isn't specifically optimized — a known limitation.

**Optional local explanation engines** (these don't affect whether DIT itself works — only the "teaching explanation" feature):

| Engine | Supported platforms | Notes |
|---|---|---|
| Ollama | Official installers for Windows / macOS / Linux | The panel's start command is PowerShell syntax; on macOS/Linux use your shell's equivalent (e.g. `OLLAMA_ORIGINS="*" ollama serve`) |
| OpenCode | Official installers for Windows / macOS / Linux | The panel's start command includes the Windows-specific `opencode.cmd`; on macOS/Linux swap it for `opencode` — the rest of the flags (`--port` / `--hostname` / `--cors`) are the same across platforms |

All three operation modes (nothing leaves your machine / local Ollama / cloud OpenCode) have **identical behavior and UI** across every OS — the only difference is whether, and how, you start the corresponding local engine on your platform.

The interface always shows the relevant privacy disclosure the moment you switch modes — it never silently makes that choice for you.

---

### Current status and known limitations

DIT is currently at **R7.5** — validated and usable, but still a personal project under active development:

- ✅ Done: multi-source `.jsonl` parsing (Claude Code + Codex), deterministic denoising, high-density reading + session map (fishbone skeleton) dual navigation, step-through replay, local Ollama explanations, cloud OpenCode explanation bridge (with local de-identification + per-send confirmation), JSON/single-file HTML export, bilingual (Traditional Chinese/English) UI.
- 🚧 Not yet done: cross-file sub-agent (`subagents/*.jsonl`) stitching, global summaries, mobile layout, dedicated visual treatment for Codex sub-agent events (currently falls back to the generic "unknown event" catch-all).
- 📌 Handles one session at a time; cross-session / personal skill-library features are still being planned, though the architecture already leaves room for it (adding a new source only requires registering it in `src/core/adapters` — no changes to the pipeline or UI needed).

For detailed decision records, milestone progress, and the backlog, maintainers can refer to [DEV_README.md](DEV_README.md) and the `docs/` directory.

---

### What this project is not

- ❌ Not a real-time agent control console — it's a **post-hoc review** tool that doesn't participate in the agent's execution.
- ❌ Not a general-purpose LLM observability/debugging tool — it's **teaching-oriented**, not debugging- or monitoring-oriented.
- ❌ Not a chat-log prettifier — it does semantic denoising and abstraction, not just nicer formatting.

---

### License

DIT is released under the [DIT Personal Use License](LICENSE) (a custom, non-OSI license):

- ✅ Allowed: personal use, study, modifying the source, running it on your own machine/environment.
- ❌ Not allowed: redistributing this project or a modified version of it (including public hosting, publishing to a package registry, or bundling it into another product) — **even with attribution to the original author**.
- 📩 Exception: redistribution requires the Author's **written** permission (e.g. email or a signed document); verbal or implied consent does not count.

See [LICENSE](LICENSE) for the full terms.

[⬆ Back to top](#)
