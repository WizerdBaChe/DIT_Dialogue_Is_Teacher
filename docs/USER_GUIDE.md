---
xi: 1
what: DIT 使用手冊——載入/總覽/閱讀/結構跳轉/地圖/匯出的建議操作順序，離線查閱用 (the DIT user guide covering the load/overview/read/structure/map/export flow, for offline reference)
tags: [dit, user-guide]
aliases: [使用手冊, 操作手冊, user guide, how to use DIT]
---
# DIT 使用手冊 / User Guide

DIT 將代理工作紀錄整理成可逐步閱讀、回看決策與延伸講解的 Session。所有結構化與瀏覽功能都可離線使用；
AI 講解是選配功能（本機模型、OpenCode 本地代理或自帶金鑰的雲端服務，皆需另外安裝或提供金鑰）。

## 繁體中文

### 建議順序

載入 → 總覽 → 閱讀 → 結構跳轉 → 地圖 → 子代理 → 選配講解 → 匯出。

1. **載入 Session**：在「總覽」頁（或右上「設定」的 Session 區）先選要讀哪一套系統——**Claude Code** 或
   **Codex**，選好後才會出現兩個入口（要換系統，按系統名稱旁的「換一套」）。「從對話集選擇」會開啟
   **Session 瀏覽器**——先選一個目錄（例如 `~/.claude/projects/<專案>/`，或直接選 `projects/` 一次看全部），
   DIT 會列出裡面每一個 session 的標題、時間、規模與分類，挑一個才真正載入；「選擇一則對話」則直接讀你
   已經知道是哪個的單一或多個檔案。

   > **為什麼需要瀏覽器**：Claude Code 的檔名都是 UUID，而且主檔 `<session-id>.jsonl` 與它的子代理資料夾
   > `<session-id>/subagents/` 是**並排的兄弟**——主檔不在那個資料夾裡面。所以直接用系統檔案選擇器挑
   > 「某個 session 的資料夾」只會拿到子代理紀錄。瀏覽器會替你把兩者配成一組，你不需要知道這個佈局。

   讀取期間會顯示階段、百分比、MiB 與行數；按「取消載入」會保留上一份有效 Session。載入失敗會回到清單，
   不會把你丟回空白畫面。
2. **用總覽確認**：啟動與重置後停在總覽（內建範例的著陸頁）；**自己載入的 Session 成功後直接進「閱讀」**。
   想確認來源、步驟數與解析提示時切到「總覽」分頁，再按主按鈕開始或繼續閱讀。
3. **沿 Reader 閱讀**：使用上一項、下一項或逐步瀏覽逐步移動。卡片保留思考、操作、參數、結果、群組與 why；
   手動選取會停止舊播放位置，讓 Header、結構與 Reader 指向同一項。
4. **用結構直接跳轉**：寬度至少 720 px 時，結構固定在左側並可收合；390 等窄版由 Header 的「結構／位置」
   按鈕開啟左側 drawer。精簡圖例說明樹列符號所代表的事件類型（使用者、回覆、思考、操作、結果、子代理、群組）；
   重要節點的目標／決策／里程碑／結果骨架圖例只在 Session 地圖顯示。
   選取後會關閉 drawer、回到 Reader 並定位同一項。
5. **需要全局時開地圖**：Reader 的 Minimap 或可見「地圖」按鈕只負責開啟 Session Map。Global 顯示全局地標與
   cluster，Section 展開區段，Detail 顯示目前 station 與 ribs。地圖開啟時會把目前／選定節點置中，主線只連到最後一個節點；
   節點與魚骨支線以文字加形狀區分。cluster 只可繼續縮放，真實地標才可 Jump；紅色「關閉地圖」離開 modal。
6. **查看子代理**：切到「子代理」查看分支摘要；選取分支後回 Reader 展開唯一完整內容，跨檔 parent linkage
   與時間順序不變。
7. **選配講解**：設定的「講解來源」下拉選單有九個選項，預設「不講解」：

   | 選項 | 資料外傳 | 需要 |
   |---|---|---|
   | 不講解 | 否 | 無 |
   | Ollama／LM Studio／Jan | 否，純本機 | 安裝該軟體 + 下載模型（LM Studio／Jan 另需開啟本機伺服器） |
   | 本地代理（OpenCode） | 是，經本機 OpenCode 轉送到雲端模型 | 安裝 OpenCode CLI 並登入供應商；費用依所選模型 |
   | Anthropic／OpenRouter／Groq | 是，瀏覽器直連 | 你自己的 API 金鑰；扣你的帳號額度 |
   | 自訂端點 | 是（本機網址也當外傳處理） | OpenAI 相容端點網址 + 模型 + API 金鑰；依該服務計價 |

   所有會外傳的選項，送出前必經去識別化預覽與逐 Session 同意（換金鑰、端點或模型會重新詢問）；Secret finding
   會阻擋請求。金鑰只留在分頁記憶體，重新整理需重貼（或改用 `dit.config.json`，見 README）。批次模式可補未處理、
   重試失敗或全部重跑，成功結果會保存到本機快取。
8. **匯出**：設定匣「匯出」區塊提供兩種格式——「匯出 JSON」是帶版本標記的原始結構化資料（`ditExport` /
   `exportVersion` / `exportedAt`），適合程式化重用或存檔；「匯出 HTML 快照」產出**單一可獨立開啟**的
   `.html` 檔，雙擊即可用瀏覽器直接開啟重現 Overview／Reader／Map（含講解），不需要安裝 DIT、不需要
   dev server、不需要任何網路連線；快照本身不會對外發出任何請求。兩種格式都會把講解結果一併帶出。
   **隱私提醒**：匯出檔包含 session 的完整逐字內容，可能含 API 金鑰、路徑等內部資訊——分享前請自行確認
   內容，不要未經檢查就傳給他人。HTML 快照必須先用 `npm run build` 產出 production build，
   dev 模式下按此按鈕只會顯示提示，不會產出檔案。

### 畫面寬度與快捷鍵

- **390 px**：不顯示常駐 Sidebar 或 Minimap；Header 顯示目前位置，結構使用左側 drawer，地圖使用 44×44 按鈕。
- **740 px**：左側結構常駐；Reader 顯示 144×96 Minimap；Session Map 保持 modal 且內容有界。
- **Desktop（至少 900 px）**：左側結構常駐；Reader 顯示 176×112 Minimap；地圖以較寬 modal 呈現。
- **M**：一般頁面按 `M` 開／關地圖。焦點在輸入欄、下拉、可編輯區時不觸發；Ctrl／Alt／Meta、按鍵重複、
  Privacy Review、Structure drawer 或其他 modal 開啟時也不觸發。可在設定的 Navigation 群組停用；可見按鈕仍保留。

## English

### Recommended flow

Load → Overview → Reader → structure jump → Map → Subagents → optional explanations → export.

1. **Load a Session**: in the Overview tab (or the Session group under Settings, top right), first choose which system to
   read — **Claude Code** or **Codex**. Only then do the two entries appear (“Switch system” next to the system name goes
   back). “Choose from your conversations” opens the **Session browser** — pick a directory (e.g.
   `~/.claude/projects/<project>/`, or `projects/` to see everything), and DIT lists every session in it with title, time,
   size, and kind; picking a row is what loads. “Open one conversation” reads one or more files you already know.

   > **Why a browser**: Claude Code names files by UUID, and the main transcript `<session-id>.jsonl` sits *next to* its
   > subagent folder `<session-id>/subagents/`, not inside it. Choosing "a session's folder" in a file picker therefore
   > yields only subagent transcripts. The browser pairs them for you, so the layout never has to be your problem.

   Loading shows phase, percent, MiB, and line count. Cancel keeps the previous valid Session. A failed load returns you to
   the list rather than to an empty app.
2. **Check in Overview**: startup and reset land on Overview (the built-in sample's landing page); **a session you load
   yourself opens straight in the Reader**. Switch to the Overview tab to confirm the source, item count, and warnings,
   then use the primary action to start or continue.
3. **Read in Reader**: move with Previous, Next, or Step through. Cards retain thinking, actions, parameters, results, groups,
   and why. Manual selection stops stale playback so the Header, structure, and Reader stay on the same item.
4. **Jump from structure**: at 720 px and wider, the collapsible structure Sidebar stays on the left. On narrow screens,
   the Header structure/position button opens a left drawer. A compact legend explains what each tree glyph means (user,
   reply, thinking, action, result, subagent, group); the objective/decision/milestone/outcome skeleton legend only appears
   in the Session Map. Selecting an item closes the drawer and focuses it in Reader.
5. **Open Map for global context**: the Reader Minimap and visible Map button only open Session Map. Global shows landmarks
   and clusters, Section expands a region, and Detail shows the current station and ribs. Opening Map centers the current or
   selected node; the spine ends at the last node, while text plus geometry identifies node and fishbone-rib types. Clusters
   zoom, only real landmarks jump, and the red “Close map” control exits the modal.
6. **Inspect Subagents**: the Subagents view lists branch summaries. Selecting a branch returns to its single complete Reader
   representation while preserving cross-file parent linkage and timestamp order.
7. **Add explanations only when needed**: the Settings "Notes source" drop-down has nine options; the default is "No notes":

   | Option | Data leaves the machine | Needs |
   |---|---|---|
   | No notes | No | Nothing |
   | Ollama / LM Studio / Jan | No, fully local | Install the app + download a model (LM Studio / Jan also need their local server on) |
   | Proxy (OpenCode) | Yes, relayed by local OpenCode to a cloud model | Install the OpenCode CLI and log in to a provider; cost depends on the model |
   | Anthropic / OpenRouter / Groq | Yes, browser-direct | Your own API key; billed to your account |
   | Custom | Yes (treated as outbound even for a local URL) | OpenAI-compatible endpoint URL + model + API key; that service's pricing |

   Every outbound option requires a de-identified preview and per-Session consent (changing the key, endpoint, or model asks
   again); secret findings block the request. Keys live only in tab memory and must be re-pasted after a reload (or use
   `dit.config.json`, see README). Batch modes fill missing items, retry failures, or rerun all.
8. **Export**: the Settings "Export" group offers two formats. "Export JSON" is the raw structured data with a versioned
   wrapper (`ditExport` / `exportVersion` / `exportedAt`), suited for programmatic reuse or archiving. "Export HTML snapshot"
   produces a **single self-contained** `.html` file — double-click it to reopen Overview/Reader/Map (including
   explanations) in a browser, with no DIT install, no dev server, and no network access needed; the snapshot itself never
   makes outbound requests. Both formats include any saved explanations. **Privacy note**: the exported file contains the
   full verbatim session content, which may include API keys, paths, or other internal details — review it before sharing,
   never send it unchecked. The HTML snapshot requires a production build (`npm run build`) first; in dev mode this button
   only shows a notice and produces no file.

### Widths and shortcut

- **390 px**: no persistent Sidebar or Minimap; the Header shows position, structure uses a left drawer, and Map uses a 44×44 button.
- **740 px**: the structure Sidebar is persistent, Reader uses a 144×96 Minimap, and Session Map remains a bounded modal.
- **Desktop (900 px and wider)**: the structure Sidebar is persistent, Reader uses a 176×112 Minimap, and Map uses a wider modal.
- **M**: press `M` on a normal page to open or close Map. It is ignored in inputs, selects, editable regions, with
  Ctrl/Alt/Meta, on key repeat, or while Privacy Review, Structure drawer, or another modal is open. Navigation settings can
  disable it without removing the visible Map control.

Visual and interaction acceptance remains a user-run check at 390, 740, and 1280 widths; automated tests and production
preview measurements do not replace that confirmation.
