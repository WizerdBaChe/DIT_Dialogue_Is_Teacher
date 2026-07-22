# DIT R5 最終驗收單 (Acceptance Checklist)｜2026-07-19

> 狀態：GN-01～GN-10 的自動化、build 與 production preview 預檢已通過；下列視覺／互動項目必須由使用者
> 在真實環境確認。完成前 T-005 維持 `in-progress`。

## 0. 啟動與測試資料

```powershell
cd D:\AIWork\DIT_Dialogue_Is_Teacher
npm.cmd run build
npm.cmd run preview -- --host 127.0.0.1 --port 4173
```

大型資料可用 `npm.cmd run fixture:r5` 產生於 Git 忽略的 `.tmp/r5-50mib/`。

## 1. 首次入口

- [有問題] 390×844、740×1113、1280×720 初載都先看到 Overview 與主 CTA，不直接顯示 Reader 卡片。（R6.5 施工範圍與後續狀態見 §20）
- [X] 內建示範的 badge、Session 摘要、步驟數與解析提示正確。

## 2. 自有 Session

- [驗收項目錯誤] 「載入 .jsonl」與「載入 Session 資料夾」成功後都回 Overview。 [回報] 應該是直接進Reading而非Overview(就是現在的實際運作狀態)
- [X] badge、counts、warnings 屬於新 Session；載入中 progress 在 ready 前可見。
- [無法測試] 載入途中取消會保留上一份有效文件，不出現 partial Session。 [回報] 載入太快無法驗證，但應該成立

## 3. Desktop Structure（740／1280）

- [X] 左側 Structure 預設可見，切 Overview／Reader／Subagents 不消失。
- [X] 收合／展開不丟失目前位置；選取深層項目後 Reader 定位同一項。

## 4. Narrow Structure（390）

- [有問題] Header 顯示目前位置；按 Structure 從左開啟 drawer。 [回報] 小尺寸狀態下"位置"(<span class="structure-trigger-position">位置 </span>)很容易影響到"結構"的顯示，我認為乾脆直接拔掉位置，只保留"結構"，讓minimap擔任"location"的視覺呈現即可（LS-08 已拔除，見 §20）
- [X] Tab 不離開 modal、Escape 關閉、關閉後 focus 回 trigger。
- [X] 選取後 drawer 關閉，Reader 與 Header 定位同一項。

## 5. Reader 與既有能力

- [X] 上一項／下一項／重播、深層跳轉、group 展開與 why 維持；Structure 與 Reader 指向同一項。
- [X] 手動選取會停止播放並清除舊 `playingId`；R4 subagent ordering／linkage 不變。

## 6. Minimap

- [X] 740／1280 Reader 可見 Minimap，目前位置與 viewport 隨 scroll／replay 更新，不遮最後卡。
- [X] 點 Minimap 只開 Session Map，不直接跳轉；390 只顯示至少 44×44 的 Map 按鈕。

## 7. M 快捷鍵

- [X] 一般畫面按 `M` 可開／關地圖。
- [X] Provider、model、file 或其他 editable control 聚焦時不觸發；Ctrl／Alt／Meta 與 repeat 不觸發。
- [X] 設定停用後不觸發，但可見 Map 按鈕仍可使用。

## 8. Map global

- [X] 開圖以目前位置聚焦；cluster 明示 count／範圍且看起來不是代理步驟。
- [X] 真實 landmark 只更新選取預覽，不會在選取瞬間誤跳。

## 9. Map zoom 與 Jump

- [X] Global → Section → Detail 的順序可理解，Detail ribs 可捲動且無空白區。
- [X] Jump 後 dialog 關閉、Reader 聚焦、Structure 同步且播放停止。

## 10. Map accessibility

- [X] 開啟後 title 取得初始 focus；Tab 不逸出；Escape 關閉；關閉後回到觸發按鈕。
- [X] 文字地標清單可用鍵盤完成所有真實 landmark 跳轉。

## 11. 空／錯狀態

- [X] 無 skeleton、無 subagent、invalid map target、load failure 都有可讀訊息與返回路徑，不白屏。
- [X] Privacy Review 開啟時 Structure drawer、Map 與 `M` 不會穿透。

## 12. 大量資料

- [X] 50 MiB 在 390×844、740×1113、1280×720 無 crash、文件級水平溢出、空白捲動區或 selection drift。
- [x] 開發者 GN-09 production preview：Reader DOM 最大 210；Map DOM 最大 397；首 target 134 ms；load／cancel 與深層捲動沿用未改資料管線的 GN-07 同機證據。
- [x] `npm.cmd run benchmark:r5 -- .tmp/r5-gn09-metrics.json` 輸出 `18 passed / 0 failed / Result: pass`。

## 13. 雙語

- [有問題] zh-TW／English 切換後狀態、位置與 Map selection 不變。 [回報] 切成English之後header排版完全跑掉且錯亂，根本是兩個不同狀態而不是單純換字，有正確使用通用層單純改字而已嗎？。 但匯出後的HTML快照反而顯示正常？（根因為 RC-A+RC-B 版面缺陷、非 i18n 缺陷，LS-01～LS-03 修正，見 §20）
- [有問題] 沒有 raw key；文字不因截斷而使按鈕、位置或地標無法辨識。

## 14. 既有能力回歸

- [x] Ollama、OpenCode／Privacy Review、annotation cache、load cancel 與 R4 subagent ordering／linkage 正常。
- [x] `npm.cmd test`：20 files、131/131 passed。
- [x] `npm.cmd run typecheck`、`npm.cmd run build`、`git diff --check`：exit 0。

## 15. GN-09 視覺 UAT

- [有問題] 390／740／1280：Structure 中 Minimap 可見的重要節點都有類型標籤，且精簡圖例可讀。 [回報] 檢驗項目正確，但問題不在這邊，詳見對話。（併入本輪 RC-A/RC-B 分析，見 §20）
- [X] GN-09 當時的 Sidebar 白底幾何符號已依使用者回饋由 GN-10 取代；Session Map 的方塊／菱形／六角／圓角仍保留。
- [X] Reader 的「回覆／思考／操作」等項目標示外框放大，字級至少與同列標題相同；其他選項標示也明顯大於一般內容。
- [X] Header、Structure、Reader、Map、footer 使用同色系但可辨識的深淺底色，且類型不只靠顏色表達。
- [有問題] 全站 list、panel、title、content、Minimap 等字級相較舊版約放大 1.25 倍，選項類約 1.5 倍；無文字互相覆蓋。 [回報] 現在的狀態反而太大，全部調回之前的倍率（LS-01 已回退並改為 `--ui-scale` token，見 §20）
- [X] 從 Minimap／Map 按鈕開圖時 dialog 位於 viewport 中央，目前／選定節點位於圖區中央；紅色「關閉地圖」一眼可辨且完整可見。
- [X] 四節點 Session Map 的主線只從第一節點連到第四節點，第四節點後沒有無意義尾線。
- [X] Session Map 恢復不同節點的方塊／菱形／六角／圓角語彙，魚骨支線提示可直觀看出分支與種類。
- [X] 關閉、Global／Section／Detail、cluster 與 Jump 行為維持 GN-01～GN-08 已接受語意。

## 16. GN-10 Section 與視覺平衡 UAT

- [X] Section 點選 2.1、3.1 或其他地標時，原本同畫面的節點都不消失；只改變右側／下方預覽選取，尚未按「跳到這一步」前 Reader 不跳轉。
- [X] Structure 節點回到原有的簡單符號語彙，符號約 20 px、略大於文字但不形成白底圖塊；重要節點仍有「目標／決策／里程碑／結果」文字標籤。
- [X] Structure 圖例每一橫列最多四種，390 drawer 與 740／1280 Sidebar 都完整可讀，不占掉約一半內容高度。
- [X] Map、Minimap 與其他圖形沒有突兀白底；節點內部接近所在區域底色，紅色 current／Close 與文字仍清楚可辨。
- [X] 390／740／1280 沒有文件級水平溢位；Map dialog 在 viewport 置中，390 為全畫面，740／1280 左右留白對稱。
- [X] Global／Section／Detail、cluster zoom、真實 Jump、Reader／Structure 同步、M 與 load／cancel 行為沒有回歸。

## 17. R5.5 符號語意對齊 UAT（新增，與上列合併於同一輪 UAT）

- [X] 740／1280：Sidebar 圖例（樹列上方）逐符號對照正下方樹列——● 使用者、○ 回覆、◇ 思考、▸ 操作、
      ↳ 結果、◆ 子代理、■ 群組；圖例下方一行小字說明「重要節點另以文字標籤標示」。
- [X] 開啟 Session 地圖：地圖圖例逐符號對照地圖形狀（方＝目標、菱＝決策、六角＝里程碑、圓角＝結果、
      四種 rib 提示、子代理與聚合區段各有獨立符號），沒有一個符號同時代表兩種語意。
- [X] Overview：CTA 按鈕之後可見「符號說明」收合區塊，預設收合；展開後 span 層與 skeleton 層分兩節列出，
      390 寬不水平溢出；首屏 badge→標題→用途→三步→CTA 順序未變。
- [X] Header 按鈕、Overview 第 2 步說明、Reader 下方 info-box 都改為「逐步瀏覽」（英文 Step through）；
      逐項前進、按鈕變暫停、再按繼續等行為與改名前完全相同。
- [X] Reader 卡片中收合的「參數」「結果」區塊，不展開即可看到「N 行 · 首行內容」；展開後摘要消失、顯示完整內容；
      錯誤結果仍預設展開，不受影響。
- [X] Reader Minimap 視覺（740／1280 的軌道、地標點、聚合塊、viewport 框、目前位置圓點）與 R5 GN-10 版本
      肉眼一致；點擊 Minimap 仍只開 Session Map，不直接跳轉。
- [X] M 快捷鍵、Map Jump、cluster 不可跳、50 MiB 載入／取消、雙語切換等既有能力沒有回歸。

## 18. 驗收結果｜2026-07-21｜✅ 使用者確認通過

使用者於 2026-07-21 在真實環境完成 §1～§17 的 R5＋R5.5 合併視覺／互動 UAT 並回報通過。
UAT 過程中發現的偏差已於同一分支修正並包含在受驗版本內，對應四個 commit：
`b3691f5`（降級記錄機制）、`d017b0f`（魚骨站點定位修正）、`32b13f0`（地圖站序與取景語意）、
`4ad846a`（工作區控制與可關閉提示）。詳見 `docs/PROGRESS.md` 的「R5.5+ UAT 後修正輪」。

註：§1「初載先看到 Overview」的語意維持不變——Overview 是**內建示範**的著陸頁；
使用者自行載入的 session 自 `4ad846a` 起直接進入 Reader。

## 19. R6 匯出（FR-8）UAT｜2026-07-21｜🔄 待使用者驗收

依 [PSM_R6_EXPORT_v0.1.md](PSM_R6_EXPORT_v0.1.md) §7 施工完成後的驗收清單。前置：
`npm.cmd run build`（兩段皆需成功，`dist/` 才有 `snapshot.html`），再 `npm.cmd run preview` 開啟。

- [X] 設定匣可見「匯出」區塊，含隱私提示一行；390／740／1280 皆不水平溢位。
- [無法測試] 無 session 時「匯出 JSON」與「匯出 HTML 快照」皆為 disabled，不會產生空檔。 [回報] 預設就有session，不存在空檔狀況
- [X] 匯出 JSON：檔案可用文字編輯器開啟，最外層看得到 `ditExport` / `exportVersion` / `exportedAt`。
- [X] 匯出 HTML 快照後**完全關閉 dev server／preview**，雙擊檔案開啟：Reader 可捲動、Map 可開可縮放、
      Overview 可見。
- [有問題] 快照內看不到載入／講解／Provider／匯出入口；語言切換仍可用。 [回報] 還是看的到總覽頁面中的"載入SESSION"、"載入.jsonl"且可點選操作（RC-E，LS-10 已將守門移入 `SessionLoadActions` 元件自身，見 §20）
- [X] 快照的瀏覽器 console 無錯誤，Network 分頁無任何對外請求。
- [X] dev 模式（`npm.cmd run dev`）按「匯出 HTML 快照」時，出現明確提示而非產出壞檔。
- [X] 匯出大型 session（如 `npm.cmd run fixture:r5` 產生的 50 MiB fixture）時，大小回報正確且提示
      檔案較大；瀏覽器未當掉。
- [X] 既有能力無回歸：載入／取消、M 快捷鍵、Map Jump、cluster 不可跳、雙語切換、講解流程。

**施工方預檢證據**（非使用者 UAT，供使用者驗收前參考）：EX-03／EX-04 各自完成過一輪 file:// 硬性驗收
（見 `docs/PROGRESS.md` R6 段落），包含真實從 `vite preview` 應用內點擊匯出、關閉 server、以 `file://`
開啟下載檔確認 Reader／Map／Overview 可操作、console 與 Network 乾淨、設定匣正確隱藏 snapshotMode 下
不適用的入口。這**不能取代**上列清單——尤其大型 session、390 寬度、dev 模式提示、雙語切換等項目
施工方尚未驗過，需使用者在真實環境完成。

## 20. R6.5 版面與尺度系統修正 UAT｜2026-07-22｜✅ 使用者確認通過

依 [PSM_R6.5_LAYOUT_SCALE_REMEDIATION_v0.1.md](PSM_R6.5_LAYOUT_SCALE_REMEDIATION_v0.1.md) §7 施工完成後的
驗收清單，回應本文件 §1／§4／§13／§15／§19 標記「有問題」的項目。前置：`npm.cmd run build`、
`npm.cmd run preview -- --host 127.0.0.1 --port 4173`，**瀏覽器縮放保持 100%**。
1~19的青膽內容已過期，依照此區為主。

- [X] 字級回到 R5 GN-09 之前的大小；全站無文字互相覆蓋。
- [X] 1280（你的預設環境）下整體版面不再有「東西太大、擠成一團」的感覺，不需要縮到 75% 才能用。
- [X] 總覽／閱讀／子代理三個分頁在 390／740／1280 都完整可見，不需要橫向拖動才點得到。
- [X] 切換到 English 後，header 三個分頁仍完整可見、版面不錯亂（與 zh-TW 只有文字不同）。
- [X] 「講解來源」改到設定匣，三個選項（不講解／本地 AI／雲端 AI）文字都不與箭頭重疊；
      下方說明列仍完整顯示「零外傳／需外傳」等隱私語意。
- [X] 閱讀區明顯變寬，右側不再有一整條空白；minimap 只遮住右下角，不擋到閱讀中的卡片。
- [X] minimap 比之前大約 1.5 倍，內容仍可辨識；點它仍只開 Session 地圖，不直接跳轉。
- [X] 740 寬開啟 Session 地圖，dialog 尺寸與 R5 一致（不是全螢幕、不是過小）。
- [X] Sidebar 變窄（約佔 20%）；圖例預設收合成一行「符號說明」，點開才展開；
      樹狀節點區至少看得到 11 列。
- [X] 390／740／1280／1706 四個寬度 × zh／en，任何一段文字都不會出現「一個字母一行」或
      「一個中文字一行」的情況。若寬度真的不夠，應該是版面換排法或出現可見溢位，而不是文字降級。
- [X] 390 下 header 的「結構」按鈕文字完整、不被「位置」擠掉；打開 drawer 後在 sidebar 內仍看得到位置。
- [X] 講解任一項目後 Ctrl+R：出現一則看得懂的提示（說明從本機快取取回幾則、這次不用再呼叫 AI），
      按 × 後消失；設定匣「教學講解」區塊常駐顯示快取筆數。再 Ctrl+R 提示會再出現一次（這是正確的）。
- [X] 重新匯出 HTML 快照 → 關閉所有 server → `file://` 開啟：總覽頁看不到也點不到
      「載入 Session」「載入 .jsonl」。
- [X] 既有能力零回歸：載入／取消、M 快捷鍵、Map Jump、cluster 不可跳、Privacy Review、
      Ollama 連線、逐步瀏覽、子代理排序與連結。

**施工方預檢證據**（非使用者 UAT，供使用者驗收前參考）：
- M0 量測基線：[docs/R6.5_BASELINE_2026-07-22.md](R6.5_BASELINE_2026-07-22.md)，實測復現症狀 2（740 寬
  `.layer-title .title-text` 崩到 21px×833px）與 English header 分頁 `clientWidth` 歸零，均比 §1 推算更嚴重，
  確認根因方向成立。
- SIT：`npm.cmd run typecheck`、`npm.cmd test`（180 項，含新增 Header／StructureLegend／SessionLoadActions／
  locales 案例）、`npm.cmd run build`（含快照 target）皆 exit 0。
- `npm.cmd run benchmark:r5 -- .tmp/r6.5-ls05-ls06-metrics.json` 輸出 `18 passed / 0 failed / Result: pass`；
  Reader 封閉 DOM 上限由 250 上調至 320——這是 LS-05／LS-06 刻意讓內容欄變寬、Sidebar 靜態區變矮後，
  同一 720px 高視窗內可同時掛載的（更矮）卡片數／樹列數增加的**預期結果**，不是效能回歸；虛擬化仍把
  29,452 筆資料的實際掛載數壓在三位數，未隨資料量線性增長。詳細數字見上述基線文件與
  `.tmp/r6.5-ls05-ls06-metrics.json`（Git 忽略）。
- 施工方以 Browser 自動化在 dev server 實測（390／740／1280 三寬度、zh/en 雙語）：修正後
  `.workspace-tabs` 於 1280 zh/en 與 740 皆 `scrollWidth === clientWidth`；740 寬 `.title-text` 由 21px×833px
  恢復為 215px×71px（正常換行，不再逐字斷行）；English 1280 分頁 `clientWidth` 由 0 恢復為 238px；
  740 寬 Session 地圖 dialog 為 681×980（＝92vw×88dvh，與 R5 一致）；390 寬「結構」按鈕文字完整、
  無文件級水平溢位。這**不能取代**上列清單——尤其使用者的真實 150% 系統縮放環境、視覺可讀性主觀判斷、
  講解快取提示的實際互動流程等項目，施工方無法在自動化環境中完整驗證，需使用者確認。
