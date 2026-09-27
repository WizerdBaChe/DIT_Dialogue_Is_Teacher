> status: DONE · UR-3f45 · 2026-09-07 · ux-walkthrough 第一次實跑（skill-co-upgrade round 1 的執行腿）；證據等級 UE1（讀碼）＋UE2（headless Chromium 1280×720 與 390×844 的 DOM 讀取），無使用者觀察。**2026-09-07 實作完成**：R1–R3 依建議值裁決並落地，F1–F5、F7、F8 已修，F6、F10 已核對並補上守衛，F11 依記錄不動；四個 commit 在 `feat/2026-09-editorial-workspace`（`9a9f22c` `106f73b` `1a5e949` `392cf07`）。剩餘事項與未決問題見文末「實作結果」。

# UX 走查 — 2026-09-editorial-workspace

- 對象：`feat/2026-09-editorial-workspace` @ `f12ef17`，dev server（Vite）+ playwright-headless。
- 方法：`~/.claude/skills/ux-walkthrough/`（任務卡 → 決策點四問 → 可執行發現 → 分層路由 → 工程優先驗證 → 優先序）。
- 未做：真實資料夾載入（headless 無目錄選擇器）、取消載入的實際觸發、Firefox／Safari、螢幕閱讀器、任何使用者觀察。凡標 `推論`／`待測` 者皆非已發生的使用者抱怨。

## 待作者裁決（先看這裡）

| # | 問題 | 走查給的證據 | 建議值 |
|---|---|---|---|
| R1 | 「開始示範」要不要從頭開始？ | F4：程式只切到閱讀頁、保留選取；名字暗示從頭 | 改名「閱讀示範對話」（純措辭）；要「從頭」則另定契約 |
| R2 | 「位置 2 / 16」表達「目前選取」還是「正在閱讀」？ | F5：來源是 playingId／activeId，不是捲動 | 先改名「目前步驟 2 / 16」，不把捲動寫回選取 |
| R3 | 「不講解」模式下，導讀第 3 步的「展開 why」怎麼處理？ | F3：預設模式沒有任何 why 入口 | 依狀態換句：「設定講解來源後，每一步可展開 why」 |

## 任務卡

| 卡 | 誰／情境（依任務，不依人設） | 目標與成功判準 | 證據標記 | 可被推翻的觀察 |
|---|---|---|---|---|
| C1 回訪者讀自己的一份對話 | 用過 DIT、知道自己的 session 在 `~/.claude/projects`；想回看昨天那段除錯 | 打開那一份、閱讀頁標題是自己的、能確認沒讀錯份 | 目標＝推論；資料夾提示＝已確認（`profiles` rootHint） | 回訪者在首頁的第一個動作是按「開始示範」 |
| C2 在示範裡找第一次失敗與後續修正 | 第一次用、想知道這產品能教什麼 | 指出「Bash npm test 錯誤」那步並說出後來的修正 | 示範內容＝已確認（16 步，含 錯誤／重試／結果 標籤） | 受測者只記得介面名詞、連不回內容 |
| C3 窄版＋僅鍵盤完成 C1／C2 核心路徑 | 同上，390 px 或無滑鼠 | 入口可聚焦、可展開、可返回，沒有卡住 | 變體 | 展開控制無法聚焦 |

## 決策點表（走過的路徑）

| 決策點 | 四問結果 | 契約缺口 |
|---|---|---|
| 首次啟動歡迎對話框 | 焦點落在標題；預設「不講解」附「沒有任何資料離開你的裝置」；「先略過」與「開始使用」皆算看過 | 無（正對照） |
| 總覽 → 「開始示範」 | 找得到；按下後到閱讀頁；**做完不知道是否從頭**（F4） | 後果詞 |
| 總覽 → 選來源（Claude Code／Codex） | 一級只設狀態，二級才出現，附「通常在 …」路徑（幫使用者找資料夾，留在當下，符合「按決策用途放置」） | 無 |
| 二級 → 「從對話集選擇」 | Chromium：開選擇器；**無選擇器的瀏覽器：顯示「等待你選擇資料夾…」但沒有東西在等**（F7，推論） | 等待文案對不上狀態 |
| 載入中狀態列 | `role=status`＋`aria-live=polite`；明說「載入期間保留目前文件」（正對照，保留欄位有寫） | 取消後的回饋（F8） |
| 閱讀頁 → 展開 思考鏈／參數／結果 | 滑鼠可；**鍵盤不可**：main 內 34 個可聚焦元素只有 1 個（地圖），6 個展開頭是 `div onClick`（F2） | 核心路徑鍵盤等價 |
| 閱讀頁常駐標題／位置 | 標題有 `title`、單行省略；位置 1／16 與側欄 `aria-current="step"` 一致（正對照） | 觸控取得全標題（F6，待測） |
| 導讀第 2／3 步文字 | 390 px 時側欄隱藏、「結構」抽屜入口可見，但文字仍說「左側」×2（F1）；「展開 why」在預設模式無入口（F3） | 位置詞、依狀態的承諾 |
| 回到總覽再進入 | CTA 在示範來源恆為「開始示範」（不會變「繼續閱讀」），位置保留 | 與 F4 同一裁決 |

## 發現（依 阻斷程度 × 影響範圍 × 證據信度 排序）

```
F2  展開控制無鍵盤路徑                              嚴重度：major（阻斷 C2／C3 的核心任務）
Task/context:  C2、C3（僅鍵盤）
Evidence:      已確認 src/components/parts.tsx:49（thinking-head）、:159（io-head）為 div onClick，無 button／tabIndex／keydown；
               UE2：閱讀頁 main 內可聚焦元素 1／34，.thinking-head ×2、.io-head ×4 皆 tabindex=null、aria-expanded=null
Current UI:    「思考鏈 ▾」「參數 · 1 項 · … ▾」「結果 · 7 行 · … ▾」
Consequence:   鍵盤／輔助技術使用者無法展開「結果」，就無法回答「第一次失敗的原因」
Layer:         interaction
Proposed:      原生 <button aria-expanded aria-controls>，Enter／Space 切換；保留現有滑鼠行為與摺疊摘要文字
Verification:  工程：Tab 可達、Enter／Space 切換、aria-expanded 翻轉（三者皆可測）；不進 UAT
Owner:         工程（frontend-developer）；無待裁決
```

```
F3  導讀承諾「展開 why」，預設模式沒有這個入口          嚴重度：major（承諾不存在的控制，R5）
Task/context:  C2（第一次用）
Evidence:      已確認 locales.ts:143 extendBody「展開 why…」；UE2：不講解模式下 .annotation 0 個、annotation 按鈕 0 個；WelcomeDialog 預設「不講解」
Current UI:    「展開 why；需要全局或分支時再開地圖或子代理。」
Consequence:   使用者在卡片上找「why」找不到，把「沒設定講解」讀成「壞了」或「藏起來」
Layer:         wording（依狀態）→ 交 audience-fit Mode B 類別 語意
Proposed:      依 providerId 換句：不講解 →「設定講解來源後，每一步可展開 why」；有講解 → 現句；名稱「why」與講解區實際標題（這步在做什麼／為什麼這樣做）是否統一，一併裁
Verification:  工程：兩種 providerId 各渲染對應句（單元測試）；B1：新手讀完知道要先去設定
Owner:         裁決 R3
```

```
F1  導讀在窄版仍說「左側」                            嚴重度：minor（文案；改字即解）
Task/context:  C3（390 px）
Evidence:      已確認 locales.ts:133、139；UE2 @390：aside 隱藏、「結構」抽屜按鈕可見、main 文字含「左側」×2；英文對應句同
Current UI:    「先確認任務，再沿左側結構逐步閱讀。」「左側顯示目前位置；…」
Consequence:   窄版與螢幕閱讀器使用者被指向不存在的位置（WCAG 2.2 SC 1.3.3）
Layer:         wording（純措辭：不改任何行為）
Proposed:      「再用結構導覽選擇要讀的步驟」「結構導覽顯示目前位置；閱讀頁頂端也有」（中英文同步）
Verification:  工程：i18n 表 grep 左側／右側／left 為 0；B1：窄版使用者找得到「結構」
Owner:         audience-fit Mode B（純措辭，可直接套用）
```

```
F4  「開始示範」暗示從頭，程式保留位置                 嚴重度：minor（期待落差）
Evidence:      已確認 OverviewView.tsx:47-53 示範來源恆用 startSample；sessionStore.ts:1251 startReading 只切視圖、暫停播放、不重設 activeId；推論：回到總覽再按會期待重來
Layer:         label distinctness → 裁決 R1
Verification:  裁決後：改名為純措辭；「從頭」則工程加 reset 契約＋測試
```

```
F5  「位置 n / 16」可能被讀成捲動位置                 嚴重度：minor
Evidence:      已確認 selectCurrentPosition 取 playingId ?? activeId（store:169-176）；可見範圍另供小地圖；推論：手動捲動後以為位置沒更新
Layer:         state semantics + wording → 裁決 R2
Verification:  B1：受測者說出「位置」代表什麼；不擅自把捲動寫回選取
```

```
F8  取消載入後沒有可見回饋                            嚴重度：minor（已知缺口 D-023，不重議）
Evidence:      已確認 cancelSessionLoad 只呼叫 task.cancel()（store:1032）；D-023 記錄取消以 console warning 呈現；推論：使用者不知道取消是否成功、保留了什麼
Layer:         wait–cancel–recovery（interaction）
Proposed:      取消後一則短狀態：「已取消載入，仍顯示原本的文件」（狀態列已有「載入期間保留目前文件」可沿用）
Verification:  工程：取消後 sessionLoadProgress 清空且 doc 不變（可測）；B1：使用者知道文件沒被換掉
Owner:         工程；作者決定是否翻開 D-023
```

```
F7  無目錄選擇器的瀏覽器：「等待你選擇資料夾…」但沒有在等   嚴重度：minor（推論，待測 Firefox）
Evidence:      推論 store:923-926 不支援時只 set picking 即 return；SessionBrowserDialog:119 顯示 picking 文案；fallback 檔案輸入只由對話框內的按鈕觸發（choose()）
Layer:         state model / wording
Proposed:      不支援時 browseState 用另一個值（如 "fallback"），文案改「這個瀏覽器不能記住資料夾，請按「選擇資料夾」」
Verification:  待測：Firefox 實開；工程：stub isDirectoryPickerSupported=false 的元件測試
```

```
F6  長標題單行省略＋title                              待測
Evidence:      已確認 MainView.tsx:70 title 屬性、CSS nowrap＋ellipsis；示範標題短，未觀察到截斷
Verification:  B2：兩份同前綴標題可分辨（觸控無 hover）→ 需 fixture
```

```
F10 窄版閱讀頁的地圖入口                               待測
Evidence:      UE2 @390：「開啟 Session 地圖」按鈕 0×0；1280 時可見；是否改由 header「地圖」按鈕承接未核對
Verification:  工程：390 px 下地圖入口至少一個可聚焦
```

```
F11 示範 CTA 先於載入區對回訪者是否最快               待測（任務研究，不改首頁）
Evidence:      已確認本輪把示範放前；無任務頻率資料
Verification:  C1 觀察：回訪者第一個有效動作與時間
```

## 工程可驗清單（不進人工驗收）

1. `parts.tsx` 展開頭：Tab 可達、Enter／Space 切換、`aria-expanded` 翻轉。
2. i18n：`grep -n "左側\|右側\|left\b\|right\b" src/i18n/locales.ts` 在導讀句為 0。
3. 導讀第 3 步依 `providerId` 渲染不同句。
4. 取消載入：`sessionLoadProgress` 清空、`doc` 不變、出現一則狀態文字。
5. 390 px：地圖入口至少一個可聚焦；`document.documentElement.scrollWidth === 390`（本次已為 390）。

## 人工驗收（併入本輪 UAT 卡，依 uat.md 分級）

- A2：僅鍵盤完成 C2（找到「Bash npm test 錯誤」並展開結果）— F2 修後才可能過。
- B1：新手讀導讀第 3 步後知道要先設定講解來源（F3）；取消載入後知道文件沒被換掉（F8）。
- B2：兩份同前綴標題在觸控下可分辨（F6，需 fixture）。

## 正對照（走查不得誤報）

歡迎對話框的焦點與預設；載入狀態列的 `role=status`＋「保留目前文件」；側欄 `aria-current="step"` 與位置列一致；來源面板的路徑提示留在當下；窄版無橫向捲動、按鈕高 30 px ≥ 24 px；DOM 順序＝閱讀順序。

---

# 實作結果（2026-09-07 追記）

作者裁決：R1、R2、R3 **一律取本記錄「建議值」欄**。以下依原優先序逐項交代做了什麼、沒做什麼。
四個 commit 皆在 `feat/2026-09-editorial-workspace`，每個 commit 前跑過 `npm test` 與
`npm run build`，輸出貼在各自的 commit body 裡（測試 696 → 740，全綠；build 乾淨）。

## 一、裁決落地（可翻轉性）

三個裁決都刻意做成**一處可翻**，因為裁決本來就可能被推翻：

| 裁決 | 採用的建議值 | 要翻的話動哪裡 |
|---|---|---|
| R1 | 「開始示範」→「閱讀示範對話」（en: Read the sample conversation），**純措辭** | 字典一個鍵。若改採「真的從頭」，那不是把字改回去，而是替 `startReading` 新增 reset 契約與測試——程式目前只切視圖、暫停播放、保留 `activeId`，沒有動過 |
| R2 | 「位置 n / 16」→「目前步驟 n / 16」（en: Current step n / 16），**捲動不寫回選取** | 字典兩個鍵（`structure.position`、`map.currentPosition`）。兩處同時改是刻意的：同一個數字給兩個名字比不改更糟 |
| R3 | 導讀第 3 步依「有沒有講解來源」換句 | `overview.steps.extendBody` 的兩個分支。呼叫端的條件與卡片決定要不要渲染講解區塊的條件是同一條（`providerId !== "none"`），翻裁決不需要動結構 |

## 二、逐項結果

| # | 結果 | 說明 |
|---|---|---|
| F2 | **已修** | 思考鏈／IO／**群組**三種展開頭改為原生 `<button type="button">` ＋ `aria-expanded` ＋ `aria-controls`。群組頭不在記錄列舉的六個裡，但它是同一類控制、同一個缺陷，而 C2 走的正是 retry／edit-loop 群組——只修列舉到的那六個，等於在回報這個發現的那條路徑上沒修完。 |
| F3 | **已修** | 見上表 R3。 |
| F1 | **已修** | 三句導讀改為指名控制而非方位；中英同步。 |
| F4 | **已修** | 見上表 R1。 |
| F5 | **已修** | 見上表 R2。 |
| F8 | **已修** | 取消後同一個表面留下一行 `role=status`：「已取消載入，仍顯示原本的文件。」判準放在 `cancelSessionLoad`（使用者按了那顆鈕），**不是** `SessionLoadCancelledError`——因為 `reset()` 與「開始下一次載入」也會 cancel，走例外那條路會在文件已經被換掉之後宣稱它還在。**未翻開 D-023**：那條裁決講的是選擇器拒絕與使用者取消在 API 層分不開，行為不變；這裡加的是取消**成功之後**的一句話，是另一個時刻。 |
| F7 | **已修** | `browseState` 新增 `fallback`，與 `picking` 分家。文案指名「選擇資料夾」那顆鈕，不指方位（理由同 F1：對話框在窄版會換行）。仍為 UE1／UE2 等級——**Firefox 實開仍未做**，見下方「尚未處理」。 |
| F6 | **非缺陷判定未做，改為補齊器材** | 產品未改。補了 `src/fixtures/longTitle/` 兩份共用 24 字前綴的 session，B2 才有東西可驗；並加了一道測試守住 fixture 的性質（前綴要長過窄版可見寬度、只在尾端不同），免得它日後被改成兩個一眼就不同的標題，讓 B2 勾了卻什麼都沒驗到。 |
| F10 | **已核對：不是缺陷，但補了守衛** | real Chromium @390×844 實測：小地圖是 `display:none`（那就是走查看到的 0×0），浮動「地圖」鈕 51×44 接手，可見可聚焦。記錄的未決問題（是否由 header 按鈕承接）答案是：由**浮動 launcher** 承接，不是 header。同時確認 `scrollWidth === 390`、無橫向捲動。這個正確原本沒有任何防護，已加樣式表層的不變式：任何藏起小地圖的區塊，必須在同一區塊放出窄版地圖鈕。 |
| F11 | **未動，如記錄所寫** | 「不改首頁」。它要的是 C1 使用者觀察（回訪者第一個有效動作與時間），本次無使用者觀察，做不了。 |

## 三、工程可驗清單 — 逐條交代

1. **展開頭 Tab 可達／Enter・Space 切換／`aria-expanded` 翻轉** — 部分達成，且**刻意不假裝達成**。
   - Tab 可達：real Chromium 實測焦點路徑，六個頭依閱讀順序全部走到；`main` 內可聚焦元素 1 → 7。
   - `aria-expanded` 翻轉：`src/components/expandControls.test.tsx`，類別閘（撈出全部展開控制逐一驗），
     並用突變校準過——把 `ThinkingBlock` 改回 `div` 會讓 7 條裡的 2 條掉。
   - **Enter／Space 沒有自動化證據，這一項留給人工驗收 A4。** jsdom 不實作按鍵啟動（實測：對
     `<button>` 送 Enter／Space 得到 0 次 click）；瀏覽器窗格的驅動器送出的是**受信任**的 Enter，
     卻連一顆當場注入的普通 `<button>` 也按不動——用已知良品校準過，所以那是器材的假陰性，不是
     程式的判決。修法選原生 button 而不是自製 keydown，正是為了讓這件事有平台契約可以引用。
2. **i18n 方位詞** — 達成。記錄指定的 grep 逐字跑過，導讀句 0 命中；剩下的命中是我自己引用舊文案的
   註解、以及兩處 "left out"（慣用語，不是方位）。另加一道兩語系窮舉的閘，正對照是記錄裡那三句原文。
   - **一處出界的命中留著沒改**：`main.emptyBodyPrefix` 說「點右上「載入 .jsonl」」/ "at the top right"。
     它同時是方位詞**和**過期標籤（那顆鈕現在叫「選擇一則對話」，也不在右上）。它不是導讀句，不在
     F1 範圍內，因此沒動——但它是下一輪該收的東西。
3. **導讀第 3 步依 `providerId` 渲染** — 達成，且是對字典 `provider` 表**推導出的全集**（9 個 provider）
   × 兩語系窮舉，不是手抄清單。新增第 10 個 provider 會自動被納入。
4. **取消載入：`sessionLoadProgress` 清空、`doc` 不變、出現狀態文字** — 三件都釘住了
   （`src/store/sessionLoadCancel.test.ts`），`doc` 比的是同一個參照而不只是非空。附已知為真的正對照：
   `reset()` 造成的取消**不得**留下那句話。
5. **390 px 地圖入口可聚焦 ＋ `scrollWidth === 390`** — 實測達成（見 F10 列）；並轉成樣式表不變式，
   寫成位置無關的形式（用括號配對解析區塊，不釘行號、不釘斷點數值）。

## 四、尚未處理（leftovers）

1. **F7 的 Firefox 實開**：仍是推論加元件測試。`fallback` 這條路徑在真的沒有 `showDirectoryPicker`
   的瀏覽器裡長什麼樣，本次環境（Chromium）驗不到。
2. **F11**：需要 C1 使用者觀察，無使用者觀察即無法進行。
3. **F6 的判定**：fixture 與守衛都備妥了，但「觸控下分辨得出來嗎」本身仍待作者回答（UAT B4）。
   分辨不出來時的收尾方式（換截斷位置／換行／把差異前移）刻意沒有預先選定。
4. **R3 夾帶的命名子問題沒有裁**：記錄的 F3 Proposed 末句問「名稱『why』與講解區實際標題（這步在
   做什麼／為什麼這樣做）是否統一，一併裁」，但建議值欄只給了換句的內容，沒有答這一題。因此導讀仍
   說「why」、講解區仍是那兩個中文標題，**兩者目前不統一**。這是一個未決問題，不是遺漏。
5. **R2 留下的用語尾巴**：指示器已改叫「目前步驟」，但導讀句仍寫「結構導覽顯示目前位置」（這是 F1
   建議值的原文，逐字採用）。散文裡的「位置」與標籤上的「目前步驟」不衝突，但也不是同一個詞；若要
   統一，屬於下一輪的文案題。
6. **範圍外但已看見**：上面第 2 條提到的 `main.emptyBodyPrefix`（過期標籤＋方位詞）。

## 五、方法上值得留下的三件事

- **有兩次是既有的紀律先抓到我，不是我抓到自己**：session-scoped reset 閘擋下沒有分類的
  `sessionLoadNotice`；`tsc` 擋下 `Messages = typeof zhTW` 把 `extendBody` 推論成中文字面值聯集的問題
  ——那次**測試全綠而 build 是壞的**，只跑測試就會出貨。
- **兩次「壞掉」其實是器材壞掉**：瀏覽器窗格按不動原生 button（用已知良品校準才確定是器材）；清掉
  視窗尺寸模擬後窗格塌成 0×0，虛擬清單於是渲染 0 張卡、`aria-current` 也跟著不見——那不是回歸，
  是 0×0 視窗的正確行為。兩次都是「負面但看似合理的判決，在儀器被檢查之前都算假陰性」。
- **三道新閘各自帶了正對照**，其中兩個當場就發揮作用：F1 的負對照第一次是我的例子寫錯（"left over"
  是兩個字，本來就該被抓）；F10 的校準案抓到 `import css from "./index.css?raw"` 在這套 Vitest 設定下
  回傳**空字串**——在那之前，那個檔案裡每一條斷言都是對著空字串通過的。
