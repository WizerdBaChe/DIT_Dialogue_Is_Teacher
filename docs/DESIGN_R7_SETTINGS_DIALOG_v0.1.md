# 設計草案 — 設定改為獨立對話框 v0.1

日期：2026-07-23
狀態：**已核准，2026-07-23 開始施工**。§7 四題使用者全部選擇「照草案」：對話框
`min(560px,92vw) × min(84dvh,780px)`；§5 三個選項說明（批次講解模式、快取清除、M 快捷鍵）；
說明文字常駐顯示；關閉僅 Escape＋✕，不支援點背景。
背景：取代 R7A-01／R7A-02 的「設定匣」（`.settings-tray` 內橫向 flex-wrap 排列的 5 個群組）。
三輪修正（等分 grid → flex-grow+basis → flex-grow+max-width → 拿掉 grow 改內容決定寬度）後，
使用者判斷：只要還是「橫向塞進一行、靠斷點換行」這個模型，就永遠在跟像素打架。改用大部分 app
慣用的「跳出一個設定視窗、群組垂直排列」模式，從根本繞開這個問題類別。

---

## 1. 為什麼

橫向 flow 排版的本質限制：5 個群組控制項數量差 7 倍（語言 1 個 vs 教學講解 7 個），無論用等分
grid、flex-grow、還是純內容寬度，都要讓「這一行還放得下另一個群組嗎」這個問題在每個斷點重新回答一次
——換行位置、留白多寡，永遠是視窗寬度的函數，不是設計者能一次定案的東西。

改成對話框：對話框自己的寬度是設計者選的常數（不是視窗寬度的函數），群組永遠垂直排列、永遠一個接
一個往下——不再有「這一行湊不湊得滿」這個變數，橫向排版類的缺陷（RC-F 系列）整類消失。

## 2. 範圍

- 取代對象：`Header.tsx` 內 `{settingsOpen && <section id="settings-tray">...}` 整塊（含
  `.settings-grid` 五個 fieldset、`Disclaimer`／`OllamaPanel`／`CloudPanel`）。
- 觸發方式不變：header 右側「☰ 設定」按鈕還在原位，但語意從「切換內嵌 tray 展開/收合」改成
  「開啟對話框」。
- 新增：非自明控制項底下補一行「選項說明」（見 §5，草案，待你核准哪些真的需要）。
- **不在範圍**：不改任何選項實際做什麼、不新增設定項目、不動 Session Map 對話框或 Structure
  Drawer 本身的邏輯（只調整它們與新對話框的互斥規則，見 §3）。

## 3. 互動模型（沿用 `SessionMapDialog.tsx` 已驗收的既有慣例，不重新發明）

這個 app 已經有一個做得完整的原生 `<dialog>` 慣例（Session Map），新對話框直接照抄同一套：

- 原生 `<dialog>` 元素，`showModal()` / `close()` 由一個 boolean 狀態驅動，在 `useLayoutEffect`
  裡呼叫（理由跟 Map 一樣：`<dialog>` 未開啟時 `display:none`，內容量測必須等 layout 階段先把
  dialog 打開）。
- 這個 boolean（暫定命名 `settingsOpen`）**從 `Header.tsx` 的區域 `useState` 搬進
  `sessionStore`**，理由：需要跟 `mapOpen`／`structureDrawerOpen`／`privacyReview` 互斥——
  現有 store 裡 `openMap`／`openStructureDrawer` 都已經在檢查彼此、互相關閉
  （見 `sessionStore.ts:672-703` 一帶），新對話框要接進同一套互斥規則，區域 state 做不到這件事。
  - `openSettings()`：`privacyReview` 開啟時不可開（跟 Map 的守門邏輯一致）；開啟時順手關閉
    `mapOpen`／`structureDrawerOpen`。
  - `closeSettings()`：對稱於 `closeMap()`。
  - Map／Structure Drawer 的開啟動作也要補上「順手關閉 `settingsOpen`」，跟它們現在彼此互斥的
    寫法一致。
- Escape（`<dialog>` 的 `onCancel`）：`preventDefault()` 後呼叫 `closeSettings()`，跟 Map 一致。
- 開啟時初始 focus 移到對話框標題（`tabIndex={-1}` + `requestAnimationFrame` 呼叫 `.focus()`），
  跟 Map／PSM 既有的 §10 無障礙驗收標準一致。
- 關閉時 focus 還給觸發按鈕（`#settings-toggle-btn`）——比 Map 單純，Map 要判斷「從 minimap
  按鈕開的還是從別處」，設定只有一個入口，不需要那個分支。
- M 快捷鍵：目前的守門邏輯是「聚焦在可編輯控制項時不觸發」，對話框內的控制項本身多半就是
  select/input/button（已受保護）；但保險起見會比照 `privacyReviewOpen` 補一個明確的
  `!settingsOpen` 條件，不依賴「剛好聚焦在正確元素上」這種間接保證。

## 4. 視覺結構

```
┌──────────────────────────────────────────┐
│  設定                                  ✕  │  ← sticky header，仿 .session-map-header
├──────────────────────────────────────────┤
│  SESSION                                  │  ← <h3>，仿現有 <legend> 但改區塊標題
│  [載入 .jsonl] [載入資料夾] [重置]         │
│  ──────────────────────────────────────  │  ← 群組分隔線
│  教學講解                                  │
│  講解來源      [不講解 ▾]                  │
│  ☑ 顯示教學講解                            │
│  批次講解模式  [講解未處理 ▾] [講解未處理(16)] │
│    ⓘ 「未處理」只補缺，「全部」會覆蓋既有結果  │  ← 選項說明，非自明才有
│  本機快取講解：0 則  [清除]                 │
│  ──────────────────────────────────────  │
│  語言          [繁體中文 ▾]                │
│  ──────────────────────────────────────  │
│  導航                                      │
│  ☑ 顯示微縮導航                            │
│  ☑ 啟用 M 地圖快捷鍵                       │
│    ⓘ 開啟後按 M 鍵可快速開關 Session 地圖    │
│  ──────────────────────────────────────  │
│  匯出                                      │
│  [匯出 JSON] [匯出 HTML 快照]              │
│  匯出檔包含完整逐字內容，可能含密鑰...       │
├──────────────────────────────────────────┤
│  （Disclaimer / OllamaPanel / CloudPanel， │  ← provider 相關，條件顯示，接在最後
│   依 providerId 決定是否顯示）              │
└──────────────────────────────────────────┘
```

- 對話框尺寸：`width: min(560px, 92vw); max-height: min(84dvh, 780px);`——比 Session Map 的
  1440px 窄很多（這是一欄式表單，不是寬版圖形），內容超過高度上限時 body 內部捲動，header 常駐。
  數字為草案，若你有偏好的寬度／高度我可以直接改。
- `<720`（既有窄版斷點，跟 Session Map 一致）：對話框改滿版 `width:100vw; height:100dvh`。
- 群組順序不變：Session／教學講解／語言／導航／匯出，垂直往下排，中間一條分隔線（不再需要判斷
  「這個群組該多寬」）。
- 群組內部：單控制項的維持橫向 wrap（跟現在一樣）；教學講解維持 R7A-02 的 label/control
  兩軌對齊，但軌道寬度不再需要跟外層群組寬度搶版面，因為外層已經是固定寬度的單欄。
- 每個控制項可選配一行「選項說明」（ⓘ 圖示 + 一行小字，跟現有 `.export-privacy-note` 同等視覺
  層級），只在非自明的控制項底下出現——見 §5。

## 5. 哪些控制項需要說明文字（草案，需要你核准取捨）

| 控制項 | 加說明？ | 理由 |
|---|---|---|
| 講解來源 | 否 | 已有 `Disclaimer` 面板承擔隱私語意，重複會太囉唆 |
| 顯示教學講解 | 否 | 標籤本身已經自明 |
| 批次講解模式＋執行 | **是** | 「未處理／失敗／全部」三種模式的差異（全部會覆蓋既有結果）不看說明猜不到 |
| 本機快取講解＋清除 | **是** | 清除會讓下次要重新呼叫 AI，是有後果的操作，值得提醒 |
| 顯示微縮導航 | 否 | 標籤自明 |
| 啟用 M 地圖快捷鍵 | **是** | 「M」這個按鍵本身不會自己被發現，需要明說 |
| 匯出 JSON／HTML 快照 | 否（維持現有 privacy note） | 已有一行说明；可考慮再加一句區分兩種格式用途，但非必要 |
| 語言／載入．重置 | 否 | 標籤自明 |

## 6. 資料／契約層變更（實作階段才動，這裡先列出影響面）

- `src/i18n/locales.ts`：新增對話框標題／關閉鍵、以及上表「是」的選項說明字串（zh-TW＋en 各一組）。
- `src/store/sessionStore.ts`：新增 `settingsOpen: boolean` 欄位、`openSettings()`／
  `closeSettings()` action；`openMap`／`openStructureDrawer`／進入 privacy review 的路徑補上
  互斥（關閉 `settingsOpen`）與守門條件。
- `src/components/Header.tsx`：移除整個 `{settingsOpen && <section id="settings-tray">...}`
  區塊與區域 `useState`；「☰ 設定」按鈕的 `onClick` 改呼叫 `openSettings()`。
- 新檔 `src/components/SettingsDialog.tsx`：比照 `SessionMapDialog.tsx` 的 ref／effect 結構，
  裝載搬進來的五個群組＋Disclaimer／OllamaPanel／CloudPanel。
- `src/App.tsx`：新增 `<SettingsDialog />`，跟 `<SessionMapDialog />` 同層。
- `src/styles/index.css`：新增 `.settings-dialog` 系列規則（沿用 `.session-map-dialog` 的
  `<dialog>` 尺寸／backdrop 慣例）；**刪除** R7A-01 的 `.settings-grid`／`.settings-group` flex-wrap
  規則與 R7A-02 的 `.settings-actions.rows` 兩軌 grid（整類問題不存在了，不是疊加新規則）。
- 測試：`Header.test.tsx` 目前斷言「settings tray 展開後 5 個 `.settings-group` 各帶 `g-*`
  class」與「provider label/select 為 rows grid 相鄰子項」兩案例，隨排版消失而失效，
  搬到新的 `SettingsDialog.test.tsx`，斷言改為「每個群組是獨立 `<section>`、標題與內容都在」。
- 本輪的 PSM 文件（`PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md`）A4.1／R7A-01／R7A-02 需要第三次
  修訂——這次不是修訂數值，是整段技術方案換掉，需要標注「橫向 flow 模型已放棄，改用對話框」。

## 7. 待你核准的問題

1. 對話框尺寸 `min(560px, 92vw) × min(84dvh, 780px)` 可以嗎？還是你有偏好的數字？
2. §5 的「哪些選項需要說明文字」清單，取捨可以嗎？或你想要更多／更少？
3. 說明文字的呈現方式：**常駐顯示一行小字**（如上面草圖）還是**ⓘ 圖示，hover/點擊才展開**？
   常駐佔更多垂直空間但一定看得到；收合式更精簡但多一次互動才能發現。
4. 關閉方式：Escape ＋ ✕ 按鈕（跟 Session Map 一致，**不**支援點擊背景關閉）可以嗎？還是你也想要
   點擊背景（backdrop）關閉？

等你回覆這四點（或直接說「都照你的草案」），我才會開始動工。
