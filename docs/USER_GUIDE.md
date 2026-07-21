# DIT 使用手冊 / User Guide

DIT 將代理工作紀錄整理成可逐步閱讀、回看決策與延伸講解的 Session。所有結構化與瀏覽功能都可離線使用；
Ollama 與 OpenCode 講解是選配功能。

## 繁體中文

### 建議順序

載入 → 總覽 → 閱讀 → 結構跳轉 → 地圖 → 子代理 → 選配講解。

1. **載入 Session**：選「載入 .jsonl」讀單一或多個檔案；選「載入 Session 資料夾」同時讀主檔與
   `subagents/*.jsonl`。讀取期間會顯示階段、百分比、MiB 與行數；按「取消載入」會保留上一份有效 Session。
2. **先看總覽**：啟動、載入成功或重置後都先進入總覽。確認來源、步驟數與解析提示，再按主按鈕開始或繼續閱讀。
3. **沿 Reader 閱讀**：使用上一項、下一項或逐步瀏覽逐步移動。卡片保留思考、操作、參數、結果、群組與 why；
   手動選取會停止舊播放位置，讓 Header、結構與 Reader 指向同一項。
4. **用結構直接跳轉**：寬度至少 720 px 時，結構固定在左側並可收合；390 等窄版由 Header 的「結構／位置」
   按鈕開啟左側 drawer。精簡圖例說明樹列符號所代表的事件類型（使用者、回覆、思考、操作、結果、子代理、群組）；
   重要節點的目標／決策／里程碑／結果骨架圖例只在 Session 地圖顯示，總覽頁另有可收合的教學版兩層符號說明。
   選取後會關閉 drawer、回到 Reader 並定位同一項。
5. **需要全局時開地圖**：Reader 的 Minimap 或可見「地圖」按鈕只負責開啟 Session Map。Global 顯示全局地標與
   cluster，Section 展開區段，Detail 顯示目前 station 與 ribs。地圖開啟時會把目前／選定節點置中，主線只連到最後一個節點；
   節點與魚骨支線以文字加形狀區分。cluster 只可繼續縮放，真實地標才可 Jump；紅色「關閉地圖」離開 modal。
6. **查看子代理**：切到「子代理」查看分支摘要；選取分支後回 Reader 展開唯一完整內容，跨檔 parent linkage
   與時間順序不變。
7. **選配講解**：設定內可選不講解、Ollama 或 OpenCode。OpenCode 外傳前必經去識別化預覽與逐 Session 同意；
   Secret finding 會阻擋請求。批次模式可補未處理、重試失敗或全部重跑，成功結果會保存到本機快取。

### 畫面寬度與快捷鍵

- **390 px**：不顯示常駐 Sidebar 或 Minimap；Header 顯示目前位置，結構使用左側 drawer，地圖使用 44×44 按鈕。
- **740 px**：左側結構常駐；Reader 顯示 144×96 Minimap；Session Map 保持 modal 且內容有界。
- **Desktop（至少 900 px）**：左側結構常駐；Reader 顯示 176×112 Minimap；地圖以較寬 modal 呈現。
- **M**：一般頁面按 `M` 開／關地圖。焦點在輸入欄、下拉、可編輯區時不觸發；Ctrl／Alt／Meta、按鍵重複、
  Privacy Review、Structure drawer 或其他 modal 開啟時也不觸發。可在設定的 Navigation 群組停用；可見按鈕仍保留。

## English

### Recommended flow

Load → Overview → Reader → structure jump → Map → Subagents → optional explanations.

1. **Load a Session**: use “Load .jsonl” for one or more files, or “Load Session folder” for the main transcript plus
   `subagents/*.jsonl`. Loading shows phase, percent, MiB, and line count. Cancel keeps the previous valid Session.
2. **Start at Overview**: startup, a successful load, and reset all return to Overview. Confirm the source, item count, and
   warnings, then use the primary action to start or continue.
3. **Read in Reader**: move with Previous, Next, or Step through. Cards retain thinking, actions, parameters, results, groups,
   and why. Manual selection stops stale playback so the Header, structure, and Reader stay on the same item.
4. **Jump from structure**: at 720 px and wider, the collapsible structure Sidebar stays on the left. On narrow screens,
   the Header structure/position button opens a left drawer. A compact legend explains what each tree glyph means (user,
   reply, thinking, action, result, subagent, group); the objective/decision/milestone/outcome skeleton legend only appears
   in the Session Map, and Overview has its own collapsible two-layer symbol guide for the teaching version. Selecting an
   item closes the drawer and focuses it in Reader.
5. **Open Map for global context**: the Reader Minimap and visible Map button only open Session Map. Global shows landmarks
   and clusters, Section expands a region, and Detail shows the current station and ribs. Opening Map centers the current or
   selected node; the spine ends at the last node, while text plus geometry identifies node and fishbone-rib types. Clusters
   zoom, only real landmarks jump, and the red “Close map” control exits the modal.
6. **Inspect Subagents**: the Subagents view lists branch summaries. Selecting a branch returns to its single complete Reader
   representation while preserving cross-file parent linkage and timestamp order.
7. **Add explanations only when needed**: Settings offers none, Ollama, or OpenCode. OpenCode requires a de-identified preview
   and per-Session consent; secret findings block the request. Batch modes fill missing items, retry failures, or rerun all.

### Widths and shortcut

- **390 px**: no persistent Sidebar or Minimap; the Header shows position, structure uses a left drawer, and Map uses a 44×44 button.
- **740 px**: the structure Sidebar is persistent, Reader uses a 144×96 Minimap, and Session Map remains a bounded modal.
- **Desktop (900 px and wider)**: the structure Sidebar is persistent, Reader uses a 176×112 Minimap, and Map uses a wider modal.
- **M**: press `M` on a normal page to open or close Map. It is ignored in inputs, selects, editable regions, with
  Ctrl/Alt/Meta, on key repeat, or while Privacy Review, Structure drawer, or another modal is open. Navigation settings can
  disable it without removing the visible Map control.

Visual and interaction acceptance remains a user-run check at 390, 740, and 1280 widths; automated tests and production
preview measurements do not replace that confirmation.
