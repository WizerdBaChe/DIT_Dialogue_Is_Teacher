# R5 大型 Session 效能基準｜2026-07-19

## 測試輸入

- 產生指令：`npm run fixture:r5`
- 結構：`main.jsonl` + `subagents/agent-1.jsonl`
- 大小：52,430,643 bytes（50.0018 MiB）
- 記錄數：29,453；正規化後 39,256 spans／29,452 view items／40 subagent groups
- 主檔 SHA-256：`617e09526159f4f0cb5e5c818b7cd176f6d68b32d39c4c4a671ceb957dea7f90`
- Subagent SHA-256：`26dcb7840a0ac511ab3daa2be6a48ba5d75eebc643ef14949e8d1939d26b3950`
- 產生物位於 Git 忽略的 `.tmp/r5-50mib/`，未納入版本控制。

## 前後比較

| 指標 | R5 前基線 | 初版 R5 | 視覺修正版 |
|---|---:|---:|---:|
| 50 MiB 完整載入 | 70,993 ms | 1,389 ms | 資料路徑未改 |
| 進度首次可操作 | 無 | 322 ms | 資料路徑未改 |
| 取消完成 | 無 | 319 ms，舊文件保持不變 | 資料路徑未改 |
| 認知／魚骨總 DOM | 118,163 | 29,864 | 116 |
| 高密度／閱讀總 DOM | 383,276 | 240 | 129 |
| 子代理工作區總 DOM | 與魚骨同頁 | 與魚骨同頁 | 137 |
| 結構工作區總 DOM | 與主內容同頁 | 與主內容同頁 | 128 |
| 高密度模式切換 | 5,404 ms | 399 ms | 由互斥分頁取代 |
| Sidebar 掛載列 | 29,452 | 15 | 結構工作區 24 |
| MainView 掛載列 | 29,452 | 9 | 閱讀工作區 8 |
| 瀏覽器記憶體 | 未提供 | 未提供 | 未提供 |

瀏覽器沒有暴露可用的 JS heap 指標，因此記憶體數字標為「未提供」，沒有推估或虛構。初版 R5 依原範圍
保留 9,804 ribs 全掛載；使用者實機指出魚骨與全部子代理仍壓縮有效內容後，修正版只常駐 2 個主線
stations，並把目前 station 的 ribs 虛擬化。量測時只掛載 17 個 rib rows，完整虛擬高度 372,552 px。

## 行為驗證

1. 串流載入期間可見 reading/parsing 進度，既有文件仍可閱讀；取消後沒有發布部分 `SessionDocument`。
2. Sidebar 捲到第 8,058 項後直接選取，MainView 在 327 ms 內掛載並顯示同一項；「下一步」正確前進到第 8,059 項。
3. 深層選取前後 virtual rows 連續，未觀察到空白缺口或選取漂移。
4. 390×844 精簡列高 92.7 px；740×1113 與 2048×966 為 56 px。設定預設收合，三種尺寸都沒有文件級水平溢出。
5. 閱讀／魚骨／子代理／結構使用 WAI-ARIA tabs；鍵盤 ArrowLeft／ArrowRight 可切換，任何時刻只有一個 `tabpanel`。
6. 50 MiB 深層結構選取 `Plan deterministic inspection 2632.` 後，閱讀掛載同一項；下一步正確前進到 `Read item-2632.ts`。
7. 在已有 `playingId` 時選第 10 個子代理分支，手動選取會停止播放、清除舊位置，並展開／高亮正確群組。
8. 魚骨保留區域內水平捲動；目前 station ribs 使用獨立縱向虛擬清單；繁中與 English chrome 均可讀。
9. 以上最新視覺項目為自動化／開發者預檢，R5 響應式完成仍以使用者人工驗收為準。

## 可重現報告格式

將量測值寫成 JSON 後執行：

```bash
npm run benchmark:r5 -- <metrics.json>
```

輸出固定包含 fixture、載入、進度／取消、掛載 DOM、捲動、記憶體支援狀態與 pass/fail 結果。

## GN-07 Guided Navigation 實跑｜production preview

本節保留前述基線，另記錄 GN-07 完成後在同一台機器、Vite production build／preview 的真實瀏覽器實跑。
輸入仍為相同的 52,430,643-byte deterministic fixture；瀏覽器未提供可採信的 peak heap 數字，因此記憶體維持
「未提供」，不以推估值代替。

| 指標 | GN-07 實測 | 合約上限 | 結果 |
|---|---:|---:|---:|
| 50 MiB 完整載入 | 964 ms | 1,736.25 ms（1,389 ms × 1.25） | pass |
| 首次進度 | 66 ms，早於 ready | 必須早於 ready | pass |
| 取消與舊文件保留 | 379 ms；示範文件保持 | 完成前回應且不發布 partial doc | pass |
| Reader closed total DOM | 最大 249 | 250 | pass |
| Sidebar／Reader mounted rows | 38／9 | 各 250 | pass |
| Global map total DOM／targets | 474／42 | 500／80 | pass |
| Section map total DOM／targets | 477／43 | 500／200 | pass |
| Detail map total DOM／mounted rows | 354／25 | 500／120 | pass |
| Map open → first target | 115 ms | 200 ms | pass |
| 390／740／1280 水平溢出 | 全部 false | 全部 false | pass |

Reader DOM 量測使用合約指定的 390×844、740×1113、1280×720；結果分別為 158、249、243 個元素。
Map 的 global／section／detail 在三個寬度共九次量測皆低於 500，最高為 740 px section 的 477。為使
Reader 回到上限內，Minimap 將非互動 glyph 合併為一個編碼 SVG 背景；按鈕、方位、viewport、目前位置與
「只開啟地圖」互動語意均不變。

深層跳轉選取 `子代理分支 39` 後，Sidebar 與 Reader 都定位在 view item index 28,541；掛載 Reader indices
連續，沒有觀察到空白區或 selection drift。可重現的 machine-readable metrics 位於 Git 忽略的
`.tmp/r5-guided-navigation-metrics.json`，並以 `npm.cmd run benchmark:r5 -- .tmp/r5-guided-navigation-metrics.json`
得到 `Result: pass`。

以上是 production preview 自動化／開發者預檢，不取代 390、740、1280 寬度的使用者人工視覺驗收。
