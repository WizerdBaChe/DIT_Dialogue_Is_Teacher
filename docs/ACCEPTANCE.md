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

## 21. R7 Part A 版面收尾 UAT｜2026-07-23｜✅ 使用者確認通過（含 §21.1 設定對話框，補充回報見 §22）

依 [PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md](PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md) §A7 施工完成後的
驗收清單，回應 2026-07-22 使用者 R6.5 UAT 後追加回報的四項症狀。前置：`npm.cmd run build`、
`npm.cmd run preview -- --host 127.0.0.1 --port 4173`，**瀏覽器縮放保持 100%**。

- [X] 設定匣中「語言」不再佔一大塊空白（寬度約只夠放下標籤與下拉），「教學講解」不再擠成一團。
      **本項下方描述的橫向 flow tray 已於同輪被整段棄用、改為對話框**（見 §21.1），這裡驗收的是
      §21.1 的對話框版本，不是下面兩段文字原本描述的 flex-wrap 版面。
- [X] 「教學講解」裡的四段（來源／顯示開關／批次講解／快取與清除）各自成列，不再被換行隨機切斷；
      390 與 1280 都讀得順。（同上，實際驗收請看 §21.1 對話框內的教學講解群組）
- [X] Reader 卡片標題明顯變寬——沒有 badge 的卡幾乎佔滿整行；有 badge 的卡，標題仍佔約 8 成以上，
      不再出現「一行放得下卻被切成多行」。
- [X] 收合的「參數」區塊顯示得出實際內容（如「參數 · 3 項 · file_path: src/…, limit: 50」），
      不再只看到 `{`；展開後內容與以前完全一樣；「結果」區塊的摘要語意沒有改變。
- [X] header 的標題（DIT／Dialogue Is Teacher）、三個分頁、播放與設定按鈕明顯變大，
      一眼就看得出是第一層導覽，與內文有層級差。
- [X] header 的高度沒有變（≥720 單列情境與修改前肉眼一致，維持 56px）；三個分頁在
      390／740／900／1000／1280／1706 × zh／en 全部完整可見，不溢位。
- [X] 既有能力零回歸：載入／取消、M 快捷鍵、Map Jump、cluster 不可跳、Privacy Review、Ollama 連線、
      逐步瀏覽、子代理排序與連結、匯出 JSON／HTML 快照。

### 21.1 設定改對話框 UAT（本輪新增，見 [DESIGN_R7_SETTINGS_DIALOG_v0.1.md](DESIGN_R7_SETTINGS_DIALOG_v0.1.md)）

取代上方 §21 開頭兩項原本描述的橫向 flow tray——三輪修正後判斷同一個模型永遠在跟像素打架，
改用對話框從根本繞開。前置同上（`npm.cmd run build`、`npm.cmd run preview`，瀏覽器縮放 100%）。

- [X] 點 header 右側「☰ 設定」按鈕，跳出一個置中對話框（不是原本 header 下方展開的內嵌區塊），
      背景（backdrop）有明顯變暗遮罩。
- [X] ≥720 寬：對話框寬度明顯窄於 Session 地圖（約落在 560px 上下，不是撐滿視窗）；內容超出高度時
      對話框內部自己捲動，頂部「設定 ✕」列固定不跟著捲。
- [X] <720 寬（390）：對話框改滿版（撐滿整個畫面寬高），不是維持小視窗。
- [X] 對話框內五組（Session／教學講解／語言／導航／匯出）由上到下垂直排列、中間有分隔線，
      不再是橫向排列、靠寬度換行；「語言」只佔一行的自然寬度，不再留一大塊空白；
      「教學講解」四段（來源／顯示開關／批次講解／快取與清除）各自成列，390 與 1280 都讀得順。
- [X] 只有三個控制項下面有一行灰色小字說明：批次講解模式（說明「未處理」只補缺、「全部」會覆蓋）、
      本機快取清除（說明清除後下次要重新呼叫 AI）、啟用 M 地圖快捷鍵（說明按 M 可開關地圖）；
      其餘控制項（講解來源、顯示教學講解、顯示微縮導航、匯出、語言、載入/重置）底下沒有多餘說明字。
- [X] 關閉方式只有 Escape 與右上角「✕」按鈕生效；點對話框外的暗色背景**不會**關閉對話框
      （這是設計裁定的行為，不是遺漏）。
- [X] 開啟對話框時，鍵盤焦點會落在「設定」標題上（可直接按 Tab 在對話框內容間移動，不會跳到
		背景頁面的元素）；按 Escape 或點 ✕ 關閉後，焦點回到 header 的「設定」按鈕上
      （可直接再按 Enter/Space 重新打開，不需要用滑鼠找按鈕）。
- [X] 設定對話框開啟時按 `M`：不會觸發 Session 地圖開關（跟 Privacy Review、Structure Drawer
      開啟時 `M` 被擋下的既有行為一致）。
- [X] 開啟中的設定對話框，若改點「地圖」或「結構」按鈕：設定對話框自動關閉、對應的地圖／結構
      面板正常開啟（互斥行為，不會兩者同時疊在畫面上）。
- [X] 匯出快照模式（`file://` 開啟已匯出的 HTML）下開啟設定：只看得到「語言」與「導航」兩組，
      Session／教學講解／匯出／Ollama 相關面板不出現（沿用既有 `snapshotMode` 守門邏輯）。
- [X] 對話框內每個控制項的實際功能（切換 provider、勾選顯示教學講解、跑批次講解、清除快取、
      切換語言、切換微縮導航／M 快捷鍵開關、匯出 JSON／HTML）都與改版前行為一致，沒有任何一個
      按下去沒反應或報錯。

**施工方預檢證據**（非使用者 UAT，供使用者驗收前參考）：
- 本段實作恢復自上一輪因 usage limit 中斷而未提交的工作；復原後發現並修正一處會在 jsdom 測試環境
  下拋錯的殘留呼叫（`SettingsDialog.tsx` 的 `onClose` 誤留一個不存在的 `restoreFocus()`，焦點還原
  其實已經在 `useLayoutEffect` 的關閉分支處理，見對應 commit）。
- `npm.cmd run typecheck`、`npm.cmd test`（34 檔／194 項全綠，含新增 `SettingsDialog.test.tsx` 5 案例）、
  `npm.cmd run build`（含快照 target）皆 exit 0。
- **無法以自動化驗證的項目**：施工環境的瀏覽器預覽工具與這批未提交程式碼所在的工作目錄是分離的，
  沒有實際在瀏覽器裡點開過這個對話框看畫面——上列清單全部需要你在真實環境親眼確認，不能拿
  測試通過當作「畫面正確」的證據。
- R7A-00 量測基線：[docs/R7_BASELINE_2026-07-23.md](R7_BASELINE_2026-07-23.md)——發現 740／1000 寬（非
  原案假設的 1280）才是 header ×1.5 的最緊情境，已停工回報並由使用者裁定改為三級分級旋鈕（見
  PSM A4.4 已修訂版）。
- 施工方以 Browser 自動化在 dev server 實測（English 最壞情境）：`--chrome-scale` 三級斷點
  （720/900/1280，值 1.1/1.2/1.5）在 720／899／1000／1280／1706 五個邊界寬度下，`.header` 皆為
  `getBoundingClientRect().height === 56`、`.workspace-tabs` 皆 `scrollWidth === clientWidth`；
  `<720` 維持既有雙列基線不受影響。
- 設定匣排版於使用者 1920px 寬螢幕 UAT 中回報「教學講解組吃掉不成比例空間」，經兩輪修正（先補
  `max-width` 上限止血，後改為拿掉 `flex-grow`、寬度完全由內容決定，見 PROGRESS.md 與 PSM A4.1
  已二次修訂版）。目前每組寬度＝瀏覽器量測的內容固有寬度，390/740/1280/1920 四寬度下皆無水平溢位、
  教學講解組內部（`batch-control` 等）不再有可量測的死白。**此項目的視覺效果仍需你在真實環境
  重新確認**——這是回應你 UAT 回饋的第二輪修正，不是本文件原始撰寫時的預檢證據。
- 1280 下取樣 9 張 Reader 卡：0 badge 卡 `.layer-title` 佔卡寬 95.8%（≥0.95 達標）、1-2 badge 卡
  87–92%（≥0.80 達標）。
- `npm.cmd test` 189 項全綠（含 R7 新增 16 案例）；`npm.cmd run typecheck`、`npm.cmd run build`
  （含快照 target）皆 exit 0。
- `grep -c "var(--fs-" src/styles/index.css` = 16（R7A-06 範圍內字級已引用階梯）。
- **未完成／需使用者環境驗證的項目**：`npm.cmd run benchmark:r5` 的 50 MiB fixture 效能量測本輪未跑
  （R7A-03 commit 已記錄此缺口，見 PROGRESS.md）；390 寬 header（雙列基線）在 R7A-05 前後的肉眼比對；
  真實 150% 系統縮放環境下的視覺可讀性判斷。這**不能取代**上列清單。

## 22. R7 §21 UAT 後補充回報修正｜2026-07-23｜🔄 待使用者驗收

使用者完成 §21（含 §21.1）UAT 並確認全數通過後，回報三項補充問題。前置同上：
`npm.cmd run build`、`npm.cmd run preview -- --host 127.0.0.1 --port 4173`，瀏覽器縮放 100%。

- [X] **設定對話框重複捲軸（已修正，待重新確認）**：內容量超過對話框高度時，只看得到一條捲軸
      （`.settings-dialog-body` 內層），不再出現外層 `<dialog>` 自己的第二條、幾乎捲不動的捲軸。
      根因：`<dialog>` 原生預設 `overflow:auto`，`height:auto`＋`max-height` 讓 dialog 與內部
      shell 各自算出的高度上限有 1px 級誤差（border-box 的邊框），觸發 dialog 自己也變成捲動容器；
      已比照 `.session-map-dialog` 的既有慣例，在 `.settings-dialog`／`.settings-dialog-shell`
      都加上 `overflow:hidden`，只留 `.settings-dialog-body` 一個捲動區。
- [X] **Session 地圖與設定對話框都新增「點背景（backdrop）關閉」**：點對話框內容以外的暗色遮罩區域
      會關閉對話框，等同於按 Escape 或按 ✕／「關閉地圖」；點對話框內容本身**不會**誤觸關閉。
      這是原設計（[DESIGN_R7_SETTINGS_DIALOG_v0.1.md](DESIGN_R7_SETTINGS_DIALOG_v0.1.md) §7 問題 4）
      刻意排除的行為，本輪由你確認兩個對話框的既有功能都正常後裁定加回，兩者做法一致
      （偵測原生 `click` 事件的 `target` 是否為 `<dialog>` 元素本身——只有點在 backdrop 上才會是
      dialog 自己，點在對話框內容上 target 永遠是某個子元素），不影響 Escape／✕／既有互斥規則。
- [X] 既有能力零回歸：§21／§21.1 所有已通過項目本輪沒有再壞掉（尤其對話框開關、Escape、
      Tab 不逸出、focus 還原、地圖與設定互斥、M 快捷鍵防穿透）。

**關於第三項回報（50 MiB fixture 內 `Read item-N.ts` 的結果顯示大量重複的
`deterministic-performance-payload`）：判斷為測試資料設計，不是解析或呈現的缺陷，本輪不改動程式碼**——

- 根因確認：`scripts/generate-r5-fixture.mjs:37,101` 明文寫死
  `"deterministic-performance-payload ".repeat(128)` 當作每筆 `tool_result` 的填充內容，
  唯一目的是用最少的程式碼／時間撐出 50 MiB 檔案大小，供效能測試用；與解析器／normalizer 無關。
- 用你指定的 `C:\Users\gunda\.codex\sessions\2026\07\` 底下最大的真實樣本（17.6 MB，
  `2026/07/08/rollout-....jsonl`）核對：真實大檔案裡**也存在**大段重複內容（同一份「上一輪對話被
  壓縮後的摘要」在 session resume 時逐字重出好幾次），但那是有意義的長篇敘述文字，跟 fixture 裡
  「同一個詞疊 128 次」的字元層級重複完全不是同一類東西，也不需要用「偵測重複」這種方式特殊處理
  ——它就是內容的一部分，該怎麼顯示就怎麼顯示。
- 判斷：**忠實保留是對的，不需要加防呆或摘要邏輯**。理由：(1) 收合態已經有 A4.3 訂下的「值驅動摘要、
  單一字串 >32 字元截斷」規則，不管內容是否重複，收合態本來就不會讓使用者看到一整段重複文字；
  (2) 展開態是使用者主動點開才看到完整內容，屬於刻意查看原始資料，不是被動被塞爆畫面；
  (3) 加一層「偵測重複並收合」屬於為了不會發生的情境（真實資料沒有這種字元級重複）預先設計的防呆，
  違反「不要為可能不會發生的情境加驗證」的原則，且會讓「這段文字本來就重複」與「這段文字被我們的
  程式重複輸出」這兩種完全不同的問題混在一起、更難排查。**不需要短敘述警告**，因為使用者展開時看到
  的就是原始資料本身，沒有被程式加工過，沒有「使用者可能誤解為程式錯誤」的風險。
- 這項發現與 Part B（多來源接入）並不衝突：Part B 的 `R7B-04`／`R7B-04` 白名單與寬容收納設計
  （見 [PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md](PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md) §B1～B4）
  已經是拿真實 16.3 MB Codex 樣本實測過的結果，不受這項（純屬 fixture 設計）的觀察影響。

**施工方預檢證據**（非使用者 UAT，供使用者驗收前參考）：
- `npm.cmd run typecheck`、`npm.cmd test`（34 檔／196 項全綠，含 `SessionMapDialog.test.tsx`／
  `SettingsDialog.test.tsx` 各新增一項 backdrop-click 案例）、`npm.cmd run build`（含快照 target）
  皆 exit 0。
- **無法以自動化驗證的項目**：捲軸是否「肉眼看起來只有一條」與 backdrop 點擊區域的實際手感
  （例如點在對話框邊緣、圓角外側等邊界情況）需要你在真實瀏覽器裡確認，測試只驗證了「點 dialog
  元素本身會關閉、點 shell 內容不會關閉」這個邏輯層行為，不是視覺層的捲軸外觀。

## 23. R7 Part B 多來源接入（Codex Adapter）UAT｜2026-07-23｜🔄 待使用者驗收

依 [PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md](PSM_R7_MULTI_SOURCE_AND_LAYOUT_v0.1.md) §B7 草稿、
對照 [R7B_BASELINE_2026-07-23.md](R7B_BASELINE_2026-07-23.md) 的真實樣本回歸結果調整後的驗收清單。
前置：`npm.cmd run build`、`npm.cmd run preview -- --host 127.0.0.1 --port 4173`。你需要準備至少一份
自己的 Codex `rollout-*.jsonl`（通常在 `~/.codex/sessions/`）。

**先讀這段文字**： .codex/sessions/的jsonl跟claude是否存在本質上的不同？ 雖然能解讀，但看起來更像機器的操作日誌，包含sysyem prompt等等，和一些細部操作但不可解讀的資料，帶有非常繁複的"雜訊"，而不是能和claude一樣正常被解析的內容？ 如果確認本質不同，先查詢是否我找錯檔案夾，又者codex沒有正常能解讀的紀錄，又或者解讀方式完全不同，這影響Part B到底要不要修改。 以下無法驗證都是因為幾乎都只看到雜訊，無法找到目標。
- [X] 用「載入 .jsonl」選一個 Codex 的 `rollout-*.jsonl`，能正常載入並直接進入閱讀頁，不報錯、不白屏。
- [X] 操作卡的工具名稱是**看得懂的真實名稱**（`shell_command`／`apply_patch`／`mcp__node_repl__js`
      等），不是清一色的「exec」；極少數抽不到真實名稱時退回「exec」也不算異常（見下方施工方證據）。
- [無法驗證] 改檔案的步驟，展開「參數」看得到 diff 相關內容（`changes`）；「結果」看得到成功與否的文字。
- [無法驗證] 同一句話不會出現兩張卡（`response_item`／`event_msg` 兩層去重生效，`agent_message` 等
      `event_msg` 層噪音不重複出現）。
- [無法驗證] 思考（◇）在 Codex session 明顯較少且較零碎——**這是資料源限制，不是 bug**（`encrypted_content`
      無法還原，只有 summary 有文字時才出現）；確認沒有出現空白的思考卡。
- [無法驗證] 被中斷或被撤回的回合，附近看得到一則說明卡（「此回合被中斷」「之前 N 個回合已被撤回」「對話
      歷史在此處被壓縮」），而原本的步驟仍然看得到、沒有被隱藏或重複。
- [X] Session 標題不是「未命名 session」的話，是你當初第一句話的濃縮；**若你的 session 開頭也有
      Codex 環境注入的前言（`<recommended_plugins>` 之類），落回「未命名 session」是已知且刻意的
      安全行為，不是 bug**——見下方施工方證據。
- [X] 載入一個較大的 Codex session（10+ MB）不當掉，載入中可取消；Map、Minimap、M 快捷鍵、
      逐步瀏覽、匯出都正常。
- [X] Claude Code 的 session **完全沒有回歸**：載入、subagent 排序與連結、50 MiB 大檔、
      標題（原本就有 `ai-title` 者不變）。
- [X] 隨便丟一個不是 session 的 `.jsonl`（或純文字檔）→ 出現看得懂的「無法辨識輸入格式」訊息，
      不白屏（串流與同步兩條載入路徑都要試：拖曳單一大檔走 Web Worker 串流路徑，貼上文字走同步路徑）。
- [X] 如果你的 session 含有子代理／多執行緒協作內容（`sub_agent_activity` 等），這些內容目前會落入
      通用的「未知事件」寬容收納呈現，不會有專屬的子代理視覺——**這是本輪刻意的範圍縮減**（見
      BACKLOG「Codex 子代理事件視覺呈現」候選項），不是遺漏；確認不會因此白屏或報錯即可。

**施工方預檢證據**（非使用者 UAT，供使用者驗收前參考）：
- 用三份真實 Codex 樣本（16.3 MB／17.6 MB／含子代理事件的最新樣本）跑過 `codexJsonlAdapter.parse()`
  與完整 pipeline，全部無 crash，詳細數字（事件數、warning 數、配對率）見
  [R7B_BASELINE_2026-07-23.md](R7B_BASELINE_2026-07-23.md)「R7B-05 真實樣本回歸結果」一節。
- 過程中發現並修正兩個真實缺陷：(1) 標題 fallback 沒處理 Codex 的 `<tag>...</tag>` 環境前言，兩份
  樣本原本顯示成字面上的 `<recommended_plugins>`，已改用整段正則比對修正，現在安全落回既有佔位字串；
  (2) 巢狀事件配對只看「最近一個相容呼叫」，沒用到 spec 要求的 `turn_id`，補上後用一個新單元測試
  證明「開兩個並發 turn、先關較早開的那個」這種情境下能正確配對，不會誤配到另一個 turn。
- **明確承認未達的門檻**：PSM §9.1 開放問題 3 要求擴到 ≥5 份真實檔案驗證；本輪只驗證了 3 份
  （§B1 原樣本＋本輪新增兩份）。第三份（含子代理事件）的巢狀事件配對率量到 73%（19/26），逐筆核對
  後確認 7 筆落差的成因是該 session 的 `context_compacted`（歷史壓縮）讓原始呼叫從事件流中消失，
  屬於資料本身的限制、不是配對邏輯缺陷，因此判斷不需要為此停工——但沒有達到 5 份檔案的門檻是事實，
  如果你有更多樣的 Codex 樣本，這是最值得優先拿來驗證的項目。
- `npm.cmd run typecheck`、`npm.cmd test`（36 檔／228 項全綠，含本輪新增的 codexJsonl／normalizer
  單元測試）、`npm.cmd run build`（含快照 target）皆 exit 0。
- **無法以自動化驗證的項目**：實際在瀏覽器裡載入你自己的 Codex session、肉眼確認卡片呈現、Map／
  Minimap／匯出等既有能力沒有回歸——上列清單全部需要你在真實環境完成，不能拿測試通過當作證據。
