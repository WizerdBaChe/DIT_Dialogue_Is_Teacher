# DIT R5 最終驗收單 (Acceptance Checklist)｜2026-07-19

> 狀態：GN-01～GN-08 的自動化、build 與 production preview 預檢已通過；下列視覺／互動項目必須由使用者
> 在真實環境確認。完成前 T-005 維持 `in-progress`。

## 0. 啟動與測試資料

```powershell
cd D:\AIWork\DIT_Dialogue_Is_Teacher
npm.cmd run build
npm.cmd run preview -- --host 127.0.0.1 --port 4173
```

大型資料可用 `npm.cmd run fixture:r5` 產生於 Git 忽略的 `.tmp/r5-50mib/`。

## 1. 首次入口

- [ ] 390×844、740×1113、1280×720 初載都先看到 Overview 與主 CTA，不直接顯示 Reader 卡片。
- [ ] 內建示範的 badge、Session 摘要、步驟數與解析提示正確。

## 2. 自有 Session

- [ ] 「載入 .jsonl」與「載入 Session 資料夾」成功後都回 Overview。
- [ ] badge、counts、warnings 屬於新 Session；載入中 progress 在 ready 前可見。
- [ ] 載入途中取消會保留上一份有效文件，不出現 partial Session。

## 3. Desktop Structure（740／1280）

- [ ] 左側 Structure 預設可見，切 Overview／Reader／Subagents 不消失。
- [ ] 收合／展開不丟失目前位置；選取深層項目後 Reader 定位同一項。

## 4. Narrow Structure（390）

- [ ] Header 顯示目前位置；按 Structure 從左開啟 drawer。
- [ ] Tab 不離開 modal、Escape 關閉、關閉後 focus 回 trigger。
- [ ] 選取後 drawer 關閉，Reader 與 Header 定位同一項。

## 5. Reader 與既有能力

- [ ] 上一項／下一項／重播、深層跳轉、group 展開與 why 維持；Structure 與 Reader 指向同一項。
- [ ] 手動選取會停止播放並清除舊 `playingId`；R4 subagent ordering／linkage 不變。

## 6. Minimap

- [ ] 740／1280 Reader 可見 Minimap，目前位置與 viewport 隨 scroll／replay 更新，不遮最後卡。
- [ ] 點 Minimap 只開 Session Map，不直接跳轉；390 只顯示至少 44×44 的 Map 按鈕。

## 7. M 快捷鍵

- [ ] 一般畫面按 `M` 可開／關地圖。
- [ ] Provider、model、file 或其他 editable control 聚焦時不觸發；Ctrl／Alt／Meta 與 repeat 不觸發。
- [ ] 設定停用後不觸發，但可見 Map 按鈕仍可使用。

## 8. Map global

- [ ] 開圖以目前位置聚焦；cluster 明示 count／範圍且看起來不是代理步驟。
- [ ] 真實 landmark 只更新選取預覽，不會在選取瞬間誤跳。

## 9. Map zoom 與 Jump

- [ ] Global → Section → Detail 的順序可理解，Detail ribs 可捲動且無空白區。
- [ ] Jump 後 dialog 關閉、Reader 聚焦、Structure 同步且播放停止。

## 10. Map accessibility

- [ ] 開啟後 title 取得初始 focus；Tab 不逸出；Escape 關閉；關閉後回到觸發按鈕。
- [ ] 文字地標清單可用鍵盤完成所有真實 landmark 跳轉。

## 11. 空／錯狀態

- [ ] 無 skeleton、無 subagent、invalid map target、load failure 都有可讀訊息與返回路徑，不白屏。
- [ ] Privacy Review 開啟時 Structure drawer、Map 與 `M` 不會穿透。

## 12. 大量資料

- [ ] 50 MiB 在 390×844、740×1113、1280×720 無 crash、文件級水平溢出、空白捲動區或 selection drift。
- [x] 開發者 GN-09 production preview：Reader DOM 最大 210；Map DOM 最大 397；首 target 134 ms；load／cancel 與深層捲動沿用未改資料管線的 GN-07 同機證據。
- [x] `npm.cmd run benchmark:r5 -- .tmp/r5-gn09-metrics.json` 輸出 `18 passed / 0 failed / Result: pass`。

## 13. 雙語

- [ ] zh-TW／English 切換後狀態、位置與 Map selection 不變。
- [ ] 沒有 raw key；文字不因截斷而使按鈕、位置或地標無法辨識。

## 14. 既有能力回歸

- [ ] Ollama、OpenCode／Privacy Review、annotation cache、load cancel 與 R4 subagent ordering／linkage 正常。
- [x] `npm.cmd test`：20 files、130/130 passed。
- [x] `npm.cmd run typecheck`、`npm.cmd run build`、`git diff --check`：exit 0。

## 15. GN-09 視覺 UAT

- [ ] 390／740／1280：Structure 中 Minimap 可見的重要節點都有類型標籤，且精簡圖例可讀。
- [ ] Structure 一般節點符號約為舊版兩倍並大於文字；重要節點另以方框、菱形、六角、圓角等形狀辨識，不像雜訊。
- [ ] Reader 的「回覆／思考／操作」等項目標示外框放大，字級至少與同列標題相同；其他選項標示也明顯大於一般內容。
- [ ] Header、Structure、Reader、Map、footer 使用同色系但可辨識的深淺底色，且類型不只靠顏色表達。
- [ ] 全站 list、panel、title、content、Minimap 等字級相較舊版約放大 1.25 倍，選項類約 1.5 倍；無文字互相覆蓋。
- [ ] 從 Minimap／Map 按鈕開圖時 dialog 位於 viewport 中央，目前／選定節點位於圖區中央；紅色「關閉地圖」一眼可辨且完整可見。
- [ ] 四節點 Session Map 的主線只從第一節點連到第四節點，第四節點後沒有無意義尾線。
- [ ] Session Map 恢復不同節點的方塊／菱形／六角／圓角語彙，魚骨支線提示可直觀看出分支與種類。
- [ ] 關閉、Global／Section／Detail、cluster 與 Jump 行為維持 GN-01～GN-08 已接受語意。

## 回報格式

> 項次 / 寬度 / 預期 / 實際 / 截圖或訊息
