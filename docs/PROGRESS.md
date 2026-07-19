# DIT 開發進度 (Progress Log)

> 段落式進度紀錄，對應 RPD 里程碑。最新在上。

## R5 — 大型 Session 效能 + 窄螢幕可用性｜2026-07-19｜🟡 修正版實作與預檢完成，待最終視覺驗收

- [x] **可重現大型 fixture**：`npm run fixture:r5` 固定產生 main + `subagents/*.jsonl`，包含有效 UUID、
  parentUuid、isSidechain、timestamp、tool use/result；50 MiB 產生物進 `.tmp/`，由 Git 忽略。
- [x] **串流匯入與 Worker**：production 檔案載入改用 `Blob.stream()`、增量 UTF-8 `TextDecoder` 與
  JSONL carry buffer；解析、跨檔排序、normalize、denoise、distill、validate 在 Vite Worker 完成。
  同步 string pipeline 保留給 fixture／相容測試。
- [x] **原子發布與取消**：reading/parsing/organizing/validating/ready 進度在完整結果前可見；載入期間
  保留前一份有效文件。取消直接終止 Worker，不發布部分文件；warning 帶來源路徑＋行號，沒有 transcript log。
- [x] **受限 DOM**：採 `@tanstack/react-virtual@3.14.6`（MIT）；Sidebar／MainView 獨立虛擬化，
  ViewItem ID 作 key，ID→index + `scrollToIndex` 接通側欄選取與重播，MainView 動態高度交由 remeasurement。
- [x] **視覺驗收修正**：使用者通過原始 1–7 後指出設定列、常駐側欄、魚骨、全部子代理與詳情仍同時擠壓內容；
  D1–D3 拍板後改為預設收合設定匣，以及閱讀／魚骨／子代理／結構四個互斥工作區。任一時間只掛載一個
  `tabpanel`；手動導覽會停止播放、清除舊 `playingId`，再回閱讀定位同一 ViewItem。
- [x] **魚骨／子代理有界渲染**：魚骨只常駐主線，選定 station 的 ribs 與子代理摘要清單各自虛擬化；
  50 MiB fixture 在 390×844 的閱讀／魚骨／子代理／結構總 DOM 分別為 129／116／137／128。
- [x] **窄螢幕語意**：390×844 精簡列高 92.7 px；740×1113 與 2048×966 為 56 px。三種尺寸皆無
  文件級水平溢出；設定匣最高 45dvh，魚骨仍保留區域內水平捲動，中英文與鍵盤方向鍵分頁可用。
- [x] **效能實測**：固定 50.0018 MiB／29,452 view items 的 production preview 於 1,389 ms 載入；
  進度 322 ms 可見、取消 319 ms 完成；高密度頁面只掛載 15 sidebar + 9 main rows，總 DOM 240。
  第 8,058 項直接選取與第 8,059 項下一步均正確，未觀察到空白缺口／選取漂移。瀏覽器未提供 heap 指標。
- 驗證：18 個測試檔、95/95 通過；typecheck、110-module production build、`git diff --check` 通過。
  報告：[R5_BENCHMARK_2026-07-19.md](R5_BENCHMARK_2026-07-19.md)；修正合約：
  [PSM_R5_VISUAL_WORKSPACE_REMEDIATION_v0.1.md](PSM_R5_VISUAL_WORKSPACE_REMEDIATION_v0.1.md)。最新修正版仍待使用者人工確認。

## R4 — Subagent 跨檔串接 + 局部分支圖｜2026-07-19｜✅ 已完成並驗證

- [x] **多檔輸入**：Header 新增「載入 Session 資料夾」，可一次讀取主 transcript 與
  `subagents/*.jsonl`；pipeline 逐檔解析、合併 RawEvent 並依 timestamp 穩定排序。
- [x] **跨檔 parent linkage**：Normalizer 用既有 `uuid/parentUuid/isSidechain` 把旁鏈第一個節點
  掛回主線 `Task`，旁鏈內的後續節點維持父子關係；不更動 Span Tree v0.1 契約。
- [x] **可展開子代理群組**：旁鏈收為 `kind=subagent` 的群組；工具結果仍巢狀在其工具節點，
  不重複呈現。側欄可直接選取分支，魚骨下方有獨立局部分支區。
- [x] **輕量 SVG 分支圖**：沿用既有排印符號與色票，不新增 React Flow；點擊小型分支圖後，
  詳情自動展開並顯示每個子代理節點的種類、摘要、參數與結果。
- [x] **真實 preview 證據**：在 `http://localhost:4173` 選取 `src/fixtures/r4/` 整個資料夾，
  成功載入 9 spans／1 subagent group；畫面顯示 3 個節點的小型 SVG，Grep 結果維持巢狀。
- 驗證：使用者於 2026-07-19 確認資料夾載入、跨檔關聯、分支選取與展開等人工驗收 1–4 通過；
  15 個測試檔、81/81 通過；R1 snapshot 依預期更新；typecheck、96-module production build、
  `git diff --check` 全部通過。

## R3 — OpenCode 分析 + 去識別化 + 可恢復講解｜2026-07-19｜✅ 使用者驗收通過

- [x] **OpenCode 同級分析 Provider**：OpenCode 與 Ollama 都是講解來源，不作開發 worker；DIT 只連
  loopback server。`opencode serve --pure` 不載入專案 `opencode.json` 自訂 agent，因此啟動指令固定
  從專案根目錄使用一般模式，保留 `dit-annotator`。
- [x] **可重用 Privacy Gateway P0**：純核心位於 `src/core/privacy/`，DIT 整合只在 adapter；Cloud
  transport 只接受 `PrivacyEnvelope`。本機檢查、實際送出預覽、session-scoped consent、Secret
  fail-closed 已串接；取消或偵測到疑似金鑰時 OpenCode request 為 0。尚未以真實 session 執行 Cloud
  送出，避免在人工確認前產生外傳。
- [x] **全域 missing-first 批次**：「講解未處理／重試失敗／全部重新講解」固定可見；未選 Provider
  時 disabled 並說明原因。無 React 的 `AnnotationJobController` 負責逐項執行、停止與續跑，完成一項
  立即保存，失敗不會讓百分比卡在未完成狀態。
- [x] **IndexedDB 講解快取**：新增 `idb@8.0.3`（ISC）與測試用 `fake-indexeddb@6.2.5`
  （Apache-2.0）。cache key 納入 item fingerprint、Provider、model、prompt、locale、privacy policy
  版本；IndexedDB 不可用時顯示降級訊息並改用記憶體。
- [x] **真實本地還原證據**：以 `qwen2.5-coder:7b` 產生一則講解，重新載入頁面後切回 Ollama，
  立即顯示「已還原 1 則」、未出現生成狀態，待處理數 16→15。repository integration test 另證明
  reopen 後 missing job 對 cache hit 的 Provider 呼叫為 0。
- [x] **誠實的 Web runtime 邊界**：`WebRuntimeController` 可探測與提供固定複製指令，但
  `start/stopOwned` 回傳結構化 unsupported error，完全不執行 shell。面板明示 DIT 沒有在背景啟動
  或停止 Ollama／OpenCode；Tauri Desktop 仍是獨立產品決策，不阻擋 Web 版。
- [x] **清除語意**：按鈕改為「清除本次顯示」，提示明示只清畫面、不刪已存結果，下次仍可還原。
- [x] **2026-07-19 UAT 收尾**：使用者確認原驗收 1–4 通過。production preview 的 OpenCode
  `Failed to fetch` 根因為 4096 server 未啟動，且固定指令漏列 preview origin 4173；啟動命令已同時
  allowlist 5173/4173 的 localhost/127.0.0.1。Transport 將模糊 TypeError 改為 loopback/CORS 指引。
- [x] **錯誤恢復與真實 Cloud UAT**：Provider 切換或重新檢查轉 ready 時清除 stale node errors；錯誤卡
  新增「重新產生」，不必重置頁面。production preview 已驗證離線指引與重試；隨後由專案根目錄啟動
  OpenCode 1.17.20，`/global/health`、`/provider`、`/agent` 均回傳 HTTP 200，且 4173 CORS 正確。
  內建合成資料經 Balanced 去識別化預覽與同意後，以 `deepseek-v4-flash-free` 真實產生一則講解，
  畫面顯示 `來源 cloud`，待處理數 16→15。
- [x] **側欄圖例**：新增使用者／回覆／思考／操作／結果／子代理／群組完整圖例，符號由 9px 提升至
  14px；production preview 已確認可讀。
- 驗證：`npm run typecheck` 通過；R3 收尾後與 R4 合併回歸為 15 個測試檔、81/81 通過；
  `npm run build` 96 modules 成功。`git diff --check` 通過。Vitest 仍有既存
  `esbuild`/`oxc` 棄用警告；npm audit 的既存 1 moderate + 1 high dev-toolchain 問題未混入本輪修正。

## R2 — Ollama 講解品質實測｜2026-07-18｜✅ 已完成並驗證

- 同一份真實 DIT Claude Code session（解析後 88 spans／41 view items）改用 `qwen2.5-coder:7b` 重跑。
- 前 10 節點嚴格品質評分 7/10，達到 PSM 門檻；批次停在 24/41，進度與停止正常，頁面無崩潰。
- 首輪混入簡體字，prompt 已加強「臺灣繁中、不得簡體」；三個代表性節點重跑皆為繁體字。
- timeout／disconnect 可讀錯誤新增單元測試；與 prompt 測試合跑 5/5 通過。使用者另以工作管理員終止 `ollama.exe`，確認 UI 錯誤提示與重新檢查恢復皆正常。
- 7B 證據與逐節點判定：[UAT_ollama_2026-07-18.md](UAT_ollama_2026-07-18.md)；3B／Gemma4 基線保留於 [UAT_ollama_2026-07-17.md](UAT_ollama_2026-07-17.md)。

## R7 — i18n 雙語 + anti-slop 編輯排印版面｜2026-07-04｜✅ 已完成並驗證

依 PSM §3.2 R7 施工，於 feature branch `feat/r7-i18n-antislop`。實作前先拍板 4 項 UX 語意
（ADR-015~018）：編輯排印風、移除 emoji、預設 zh-TW、Header 下拉切換。

- [x] **i18n 雙語模組（自製輕量，零依賴）**：新增 `src/i18n/locales.ts`（zh-TW 權威字典 +
  EN，EN 以 `typeof zhTW` 型別約束，缺鍵/型別不符即編譯錯）與 `src/i18n/index.ts`
  （`useT()` / `useLocale()`）。store 加 `locale`（預設 zh-TW）/`setLocale`。所有元件面向使用者的
  中文移入字典；`src/components/labels.ts` 縮為與語言無關的視覺常數（節點記號、CSS class）。
- [x] **講解層 prompt 語言跟隨 UI**：`AnnotateContext.locale`；`prompt.ts` 依 locale 切換
  system/user prompt 與要求的回覆語言；`ollama.ts` 改呼叫 `buildSystemPrompt(ctx.locale)`。
- [x] **語言切換**：Header 下拉（繁體中文 / English）；實機驗證切換即時生效、已載入 session 與
  講解/選取狀態不丟失（store 只換 locale，不動 doc）。
- [x] **anti-slop 編輯排印風（ADR-015）**：`:root` 重做——襯線內文/標題（Georgia/宋體）、
  15px、line-height 1.75、ink `#1c1a17` + 暖白紙面、單一暗紅 accent `#7c2128`、hairline 細線、
  **全面移除 box-shadow**；無框卡片靠左規 + 底部細線分區；眉標走無襯線小型大寫。
- [x] **移除 emoji（ADR-016）**：側欄改幾何記號（● ○ ◇ ▸ ↳ ■）、魚骨節點/支線與徽章改純文字
  標籤 + 邊框配色區辨、播放鍵改 guillemets（‹ ›）、思考/群組/資訊框去 emoji。
- [x] **數字對齊修正（使用者回饋）**：Georgia 舊體數字在襯線文字中高低不齊 → 以
  `@font-face` + `unicode-range: U+0030-0039` 只把數字映射到 sans（Arial）的 lining figures，
  其餘襯線字元不動。
- 驗收：`npm test` 42/42 全綠、`npm run build` 77 modules 全綠、主控台無錯誤；
  grep `src/components` 僅註解命中中文（零硬編 UI 字串）；認知/高密度雙模式與中/英切換均實機確認。
- **範圍界定**：core 層診斷訊息（pipeline `PipelineError`、adapter warnings、`checkOllama` 狀態）
  維持 zh-TW——屬資料流診斷、非 UI chrome，避免 i18n 反向耦合進 core；如日後需雙語化，改走錯誤碼。
- 註解語言：依 codebase 慣例（AI/程式讀→英文、人類讀→中文），既有中文註解保留。

## R1 — 測試地基｜2026-07-04｜✅ 已完成並驗證

依 [PSM_DIT_v1.0.md](PSM_DIT_v1.0.md) §3.2 R1 施工。首個里程碑起，本資料夾已 `git init`
（ADR-014），本 R 於 feature branch `feat/r1-test-foundation` 進行。

- [x] **Repo 初始化**：`git init` + `.gitignore`（排除 `node_modules/`/`dist/`/`archive/`），
  基線 commit `chore: baseline DIT M1-M3 accepted state`，預設分支 `main`。
- [x] **Vitest 配置**：`vite.config.ts` 加 `test` 區塊（`environment: "node"`，因本輪僅測純函式，
  無元件測試）；`package.json` 加 `"test": "vitest run"`。
- [x] **第二份 fixture**：`src/fixtures/subagentSession.jsonl`——含 `isSidechain:true` 的
  subagent 內部步驟（Task 工具派送 → 子代理人 Grep 兩輪 → 回報）、一則長輸出（含測試框架
  coverage 摘要格式的 `tool_result`）、兩個使用者任務分界（先查清單、再統一改用中央處理並跑測試），
  為 R4 子代理人跨檔串接鋪路。
- [x] **Pipeline 快照測試**（`src/core/pipeline.test.ts`）：對 `sampleSession`/`subagentSession`
  兩份 fixture 做 adapter→normalize→denoise→distill 全流程快照；另驗證空輸入/無法辨識格式/
  解析後零可呈現節點皆拋 `PipelineError`（不是原始例外）。
- [x] **Denoiser 單元測試**（`src/core/denoise/denoiser.test.ts`）：milestone / error / retry /
  decision / edit-loop 五條規則各至少一正一反例，共 13 個案例（含「思考層才算 decision，
  回覆文字不算」「不同工具/不同檔案才打斷連續編輯」等邊界）。
- [x] **Distiller 單元測試**（`src/core/distill/distiller.test.ts`）：spine 三種
  （objective/decision/outcome）與 rib 四種（investigation/error/retry/edit-loop）各正反例，
  共 13 個案例（含「錯誤已上拋父卡，故 tool_result 本身略過」「同群組僅代表 span 出一條 rib」）。
- [x] **容錯測試**（`src/core/adapters/claudeCodeJsonl.test.ts`）：損壞 JSON 行、未知事件型別、
  已知噪音型別、空白輸入皆不拋例外且 warnings 正確帶行號/型別名；另於 pipeline 層驗證
  「損壞行＋未知型別混合」仍能產出文件並保留全部 warnings。
- 驗證：`npm test` 4 個測試檔、42 個案例全綠；`npm run build`（tsc + vite build）75 modules 全綠。
- 過程備註：vitest 4.1.9 在跑測試時透過 `vite:react-babel` 插件印出
  `esbuild`/`oxc` 已棄用選項警告（純工具鏈訊息，`vite build` 本身不出現，不影響測試/建置結果，
  未動任何專案程式碼修正，記錄供日後升級 vitest 時參考）。
- 未做（依 PSM 範圍界定）：元件測試、E2E（本階段收益低，留待日後 R 視需要補）。

## M3 — 實機驗收回饋修正｜2026-06-26｜✅ 已完成並驗證

依使用者第一輪實機驗收回饋：

- [x] **錯誤卡整張邊框轉紅**：`SpanCard` 依 `error` 標籤加 `.error` class；CSS 邊框/標題標記轉 `--danger`，選取/重播時仍保留高亮環。原本只有右上徽章與內文紅、外框仍綠。
- [x] **本地 Ollama 引導介面**：新增 `checkOllama()`（探 `/api/tags` 取已安裝模型）+ `OllamaPanel`。依狀態（offline/no-model/model-missing/ready）給可複製指令（`ollama serve` + `OLLAMA_ORIGINS`、`ollama pull <model>`）與模型下拉切換；annotate 遇 HTTP 404 改提示「請 `ollama pull <model>`」。store 新增 `ollamaConfig/ollamaStatus`。修正使用者「開了 Ollama 但無模型→404、且只有一句 OLLAMA_ORIGINS 說明」的痛點。
- [x] **卡片大字=精簡大意、小字=完整**：去除重複——`layer-desc` 只在完整內容比標題大意「多」（被截斷或多行）時才顯示，並加 `white-space: pre-wrap`。原本兩處同句。
- [x] **npm audit 說明**：2 個漏洞（esbuild moderate / vite high，GHSA-67mh-4wv8-2f99）僅影響**本地 dev server**，不影響 production build 產物；唯一修法是 `npm audit fix --force`→vite@8（破壞性）。屬上游 dev-only tech debt，未在此次一併升級（見 BACKLOG）。

第二輪回饋（2026-06-26）：

- [x] **Ollama 大模型逾時防呆**：判斷 gemma 3n E4B 超時非 thinking 所致（gemma 無 thinking 模式、我們也沒送 think），主因是 4B 冷載入 + 30s 上限過緊。對策：預設逾時 30s→**60s 且面板可調 (30/60/120s)**；另加**「停用思考」開關**送 `think:false`（僅對 qwen3/r1/gpt-oss 有效，預設關閉以免 gemma 報錯）。
- [x] **魚骨節點文字溢出/重疊**：`.fb-lesson` 由 max-height 裁切改 `-webkit-line-clamp:2`＋`.fb-concept overflow:hidden`，2 行省略、全文留 hover title，不再撐高重疊節點。
- [x] **新增畫面內 reset**：Header「↺ 重置」(全域，回內建範例+預設) 與「清除講解」；魚骨詳情「清除選取」(局域，回到 placeholder)。store 加 `resetToSample/clearAnnotations/clearSelection/updateOllamaConfig`。
- 驗證：`npm run build` 72 modules 全綠；preview 確認錯誤卡邊框 `rgb(220,38,38)`、0 張卡片重複大小字、Ollama 面板 offline 狀態+逾時/思考控制項、lesson 限 2 行(39px≤48px 不溢出)、reset 全域/局域皆生效、無 console 錯誤。

第三輪回饋（2026-06-26）：

- [x] **Ollama 調參緩解大模型變慢**：判斷 8B 變慢是「每次請求都重新冷載入 VRAM + 輸出無上限」，屬調用層可優化。`OllamaConfig` 加 `keepAlive`(keep_alive)/`numPredict`(num_predict)/`numCtx`(num_ctx)，面板加「保活(5/10/30m)」「輸出上限(256/512/1024/不限)」下拉，預設 keep_alive=10m、num_predict=512。連續講解第 2 個節點起免冷載入。
- [x] **講解進度檢視 UI（緩解等待焦慮）**：store 加 `annotateProgress{total,done,currentId}` + `cancelAnnotateAll`；新增 `AnnotateProgress` 元件顯示 進度條/已完成比例/目前講解節點/停止鈕（目前節點跑完即停）、完成後可關閉。註：單節點內 it/s 需 streaming，已記 BACKLOG。
- [x] **Ollama 面板可摺疊**：就緒(ready)時預設收合只留狀態列，未就緒時自動展開引導；head 加 ▸/▾ 切換鈕，使用者手動切換後以其為準。
- [x] **雲端 UI 骨架（拍板：先不接 Mistral）**：新增 `CloudPanel`（端點/模型/API key 欄位，暖色標示「會外傳」）+ `store.cloudConfig`；狀態明示「尚未啟用（UI 預留）」，呼叫仍走 `cloudProvider` 樁。資料流就緒，日後接 Mistral 等只需實作 `annotate`。
- 驗證：`npm run build` 74 modules 全綠；preview（serverId 56b9560c）確認：雲端面板 3 欄位 + 「尚未啟用」狀態 + disclaimer 更新；Ollama 面板 ▸/▾ 收合(0 row)↔展開(2 row)、keep_alive/num_predict 控制項在；攔截 `/api/chat` 確認 body 實送 `keep_alive:"10m"` + `options.num_predict:512`；進度條跑出「講解中…→✓ 完成 16/16 100%」、停止於 6/16 點擊→在途節點跑完後停在 7/16「已停止」、關閉鈕可消除；無 console 錯誤。

## M2 — 認知模式（魚骨）+ 系統檢查｜2026-06-25｜✅ 已完成並驗證

- [x] **檢視模式切換**：store `viewMode` + Header segmented（認知/高密度）+ App 條件渲染。預設「認知」。
- [x] **魚骨橫向視圖**：`src/core/view/fishbone.ts`（skeleton→站點+支線，解析 viewItem id）+ `FishboneView.tsx`。主線橫向、支線掛載、種類 icon + 圖例、有講解時顯示「可帶走的觀念」。
- [x] **drill-down**：點節點/支線 → 下方詳情面板展開該節點完整卡片（重用 SpanCard/GroupCard），從簡易模式看到已整理的原始內容。
- [x] **設計與 a11y**：spine 與節點中心精確對齊 (66/66)、button 可鍵盤操作、focus-visible、icon+文字非純色辨識、空/錯誤狀態。
- [x] **系統檢查**：對照 backend/frontend 兩份清單（見 `docs/REVIEW_2026-06-25.md`），修掉 3 個韌性缺口（Ollama 逾時、檔案讀取錯誤、輸入過大警告）。
- 驗證：build 71 modules 全綠；preview eval 確認 4 站點/4 支線、drill-down、模式切換、spine 對齊、無 console 錯誤。

## M1.1 — 後端蒸餾 + 清亮換膚｜2026-06-25｜✅ 已完成並驗證

依使用者方向調整：後端優先、前端魚骨延後、改清亮配色。

- [x] **後端蒸餾**：新增 `src/core/distill/distiller.ts`，把 Span Tree 整理成 `DistilledSkeleton`（spine/rib 分類，preset v1，view-agnostic），接入 pipeline。側邊欄顯示「主線/支線」數量。
- [x] **清亮主題**：`src/styles/index.css` 由 dark 換成 light tokens（變數名不變，方便日後 UI/UX skill 換膚）。
- [x] **備忘**：`docs/BACKLOG.md` 記錄魚骨視圖、節點點擊展開 drill-down、React Flow 升級、UI/UX skill 等延後項目。
- 驗證：見下方「驗證結果」更新。

## M1 — MVP 骨架（純前端，無 LLM 強制）｜2026-06-25｜✅ 已完成並驗證

**目標**：`.jsonl` → Span Tree → 雙欄渲染 + 降噪 + 思考層 + 重播，驗證「結構化呈現是否更易學」。

### 完成項目
- [x] Vite + React + TS 專案骨架（手動 scaffold，路徑別名 `@`）。
- [x] Span Tree canonical 型別（`src/types/spanTree.ts`，多 session 預留）。
- [x] ClaudeCodeJsonl adapter（容錯解析，噪音型別略過，介面 + 註冊表）。
- [x] Normalizer（events → Span Tree，tool_result 掛載父 tool_use）。
- [x] Denoiser（milestone / error / retry / decision 標籤；edit-loop 群組）。
- [x] 自檢驗證（order/parentId/group 參照 invariant）。
- [x] LLM Provider 層（none / ollama 真實 fetch / cloud 樁）。
- [x] Pipeline 編排 + Zustand store（載入 / Provider / 重播 / 講解）。
- [x] UI 元件（Header / Disclaimer / Sidebar / SpanCard / GroupCard / MainView）。
- [x] 內建範例 fixture + 檔案載入 + 空/錯誤狀態處理。
- [x] 文件：architecture.md、本 PROGRESS。

### 驗證結果
- `npm run build`：✅ tsc 型別檢查通過、vite build 成功（68 modules，~57KB gzip JS）。
- 執行期（dev server + 預覽）：✅ 範例 session 正確渲染為 16 張卡片 + 1 個 edit-loop 群組。
- 標籤驗證：milestone ×2、error ×1（Bash 測試失敗）、retry ×1（第二次 npm test）、decision ×2、group ×1（反覆修改 TodoList.jsx 折疊 2 步）。
- 主控台無錯誤。

### 過程中的修正
1. edit-loop 原本被中間的「回覆」文字打斷 → 改為只有不同工具或新使用者訊息才打斷。
2. decision 過度觸發（回覆文字也算）→ 限縮為僅思考層。
3. error 標籤掛在巢狀的 tool_result 上看不到 → 上拋到父操作卡片以徽章顯示。

## 下一步候選（M2+）
- step-through 重播的細節打磨（自動展開群組已做，可加進度列）。
- 真·分支圖（React Flow）於 subagent / 重試分叉處。
- 串接本地 Ollama 實測逐節點講解品質。
- 補 pipeline 單元測試（adapter→denoise 快照）。
- cloud Provider 實作（接 Claude API 或免費雲端 API）。

## 如何執行
```bash
npm install
npm run dev      # 開發 (預設 http://localhost:5173)，首次自動載入內建範例
npm run build    # 型別檢查 + production build
```
