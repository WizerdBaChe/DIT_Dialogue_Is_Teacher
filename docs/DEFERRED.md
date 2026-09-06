---
xi: 1
what: 待歸屬工作登記表——已決定要做但還沒輪次收留的工作，DW-NN 編號＋home 欄 (the deferred-work register: decided-but-unhomed items filed as DW-NN entries carrying a home column)
tags: [dit, backlog, register]
aliases: [待歸屬工作, 登記表, DW編號, DEFERRED, deferred work register]
date: 2026-08-26
---
# DIT — 待歸屬工作登記表 (Deferred Work Register)

> **這份表回答一個問題：已經決定要做、但還沒有輪次收留的工作，現在歸誰？**
>
> 建立於 2026-08-26，用來取代散落在各處的「延到 R12」。那句話寫於 R12 尚未配置的時候，
> 意思其實是「延到下一輪」；R12 後來被配給 source-first-navigation，於是那句話變成一個
> **指錯輪次的承諾**——讀的人會以為這批東西在 R12 的範圍內。這是 R9 撞號的同一個形狀。
>
> 正面寫法：待辦拿 `DW-NN` id，`home` 欄只有兩種合法值——**`unassigned`**，或**一個已在
> [`docs/rounds/ROUNDS.md`](rounds/ROUNDS.md) 登記過的輪次 id**。沒有第三種。想不出要放
> 哪一輪，答案就是 `unassigned`，**不是**先佔一個下一個數字。
>
> 機器檢查：`npm run check:rounds`。

## 這份表與另外兩份的分工

| 檔案 | 回答的問題 |
|---|---|
| **本檔 `DEFERRED.md`** | 已決定要做、**還沒有輪次收留**的工作歸誰 |
| [`BACKLOG.md`](BACKLOG.md) | 長期備忘：想做、但**還沒決定要不要做**的東西 |
| [`OUTSTANDING_2026-08-14.md`](OUTSTANDING_2026-08-14.md) | 2026-08-14 封版的那一份總表，是**快照**，不再更新 |

## 登記表

`home` 欄：`unassigned` = 還沒有輪次收留。看到某一輪要吃下它，才把這格改成該輪的 id。

### 來自 R11 M9 複核（`REVIEW_R11_BLIND_SPOTS.md`，report-only，十項）

| id | home | 項目 | 證據 |
|---|---|---|---|
| DW-01 | unassigned | **S-01／F-12** 一行前導壞行讓整份合法檔案變成 unrecognized，資料流上等同丟整檔 | REVIEW §S-01；`src/core/ingest/jsonlStream.ts:52,55,66-68` |
| DW-02 | R12 | ~~**S-02** 同步 pipeline 沒有檔案級 parse isolation~~ **DONE 2026-08-26**，作者裁決選 A（就地補 try/catch）。見下方註記 | REVIEW §S-02；`src/core/pipeline.ts` |
| DW-03 | unassigned | **S-04／F-05** raw exception、檔案路徑、provider response body 原文直接進使用者畫面 | REVIEW §S-04；`sessionStore.ts:397-420`、`diagnosticCopy.ts` |
| DW-04 | unassigned | **S-05／F-06** `showModal` 的 catch 對真實瀏覽器錯誤也靜默降級成非模態，無 Diagnostic | REVIEW §S-05；`useBlockingSurface.ts:44-53` |
| DW-05 | unassigned | **S-06／F-07** Settings focus restore 會在其他 blocking surface 活躍時搶走焦點 | REVIEW §S-06；`SettingsDialog.tsx:58-61` |
| DW-06 | unassigned | **S-08／F-04** adapter 收到的 `prLinks` 在 `finalizeMeta` 遺失（資料保全性欠債，無消費端） | REVIEW §S-08；`normalizer.ts:86-94` |
| DW-07 | unassigned | **S-09／F-11** fishbone／distiller／map 三處未回報的 silent first-target fallback，缺 fixtures | REVIEW §S-09 |
| DW-08 | unassigned | **S-10** validator 缺口 | REVIEW §S-10 |
| DW-09 | unassigned | **S-11** File System Access 上限的套用時機 | REVIEW §S-11 |
| DW-10 | unassigned | **S-12／F-08** 三處 collapse 缺 keyboard／ARIA | REVIEW §S-12 |

> **DW-02 已完成 2026-08-26（作者裁決選 A）。** 複核當時判「程式仍存在、但 UI 全走 worker
> 所以踩不到」。R11.2 的 F-01／F-02 為了讓 worker 開機失敗能降級，**新增了一條從真實使用者
> 載入通往同步路徑的路**（`sessionLoader.ts` 的 `defaultFallback`），這筆欠債因此從休眠變成
> 可觸發，而且違反 CLAUDE.md 明寫的不變式——「一份讀不了的檔案不得讓整批失敗」。**這是修復
> 本身抬高的風險，不是既有技術債的自然惡化**，所以它沒有跟其他九項一起排隊等輪次。
>
> 實作比預期小：`parse_failed` 早就存在於 `ParsedFileOutcome`，批次層早就會處理
> （`FILE_PARSE_FAILED`），worker 從 R9 就在產它；缺的只是同步路徑從來沒產出過。四個測試
> 釘住：一個壞檔不牽連其他檔、原本會 throw 的回歸案例、**全部壞掉仍然是 fatal**（隔離不等於
> 壓抑）、沒有檔案壞掉時行為零差異。
>
> 施工時發現一件比預期好的事：全滅時批次層報 `FILE_PARSE_FAILED` 而不是 `NO_MAIN_TRANSCRIPT`
> ——它報真正發生的事（檔案解不開），不是它造成的後果（因此沒有主檔），後者會把使用者指向
> 錯的方向。原本預期的是後者，測試因此改成前者：錯的是預期，不是程式。

### 來自 R11 M7 資安複核（`SECREVIEW_R11_M7_REDACTION.md`）

| id | home | 項目 | 證據 |
|---|---|---|---|
| DW-11 | unassigned | **§4** 同一原值可能對到兩個不同佔位符（`mappingKey` 是 kind-scoped，高熵規則是上下文無關的第一條）。兩者都有被遮，不構成洩漏，但違反 `apply.ts` 自述的「同一個值永遠同一個編號」 | SECREVIEW §4；`src/core/privacy/apply.ts` |

> §2（高熵 checkbox 在主開關關閉時無效）與 §3（單檔快照匯出不經遮蔽管線）**不在這份表裡**
> ——D-014 已把它們裁定為**明文排除**，不是待辦。驗收看到它們不算缺陷。

### 來自 R10.1 RCA 與 R11 的兩項作者裁決

| id | home | 項目 | 證據 |
|---|---|---|---|
| DW-12 | unassigned | **RCA P1／P2／P3** Codex exec 名稱解析與 `*_end` 事件配對的修復（RCA 已寫、修復從未施工） | `docs/rounds/r10.1-codex-session-provenance/RCA_R10.1_*.md` |
| DW-13 | unassigned | **D-011** Codex 骨架覆蓋率：`DECISION_RE` 是對著 Claude Code 的 raw chain-of-thought 調的，`decision` 對 Codex 結構上不可達 | `RCA_R11_CODEX_SKELETON_COVERAGE.md`；D-011 |
| DW-14 | unassigned | **D-010／WC-4.3** 未配對 `*_end` 卡片視覺降權，「僅在候選數造成歧義時升為 warn」。**被 DW-12 的 P1 擋住**（需要 P1 才有的候選數） | D-010；PSM_R11 M4 WC-4.3 |

### 其他

| id | home | 項目 | 證據 |
|---|---|---|---|
| DW-15 | unassigned | `src/` 註解語言統一（量到 1,308 行、涵蓋 65% 檔案）。純 chore，不需要輪次，任何一輪都可以順手吃掉 | 工單存放在 repo 之外 |
| DW-16 | 2026-09-compact-chain | **T-008** 壓縮過的 session 靠 `logicalParentUuid` 串成一場對話。**2026-09-06 由 `2026-09-compact-chain` 吃下**（實測鏈結鍵是 boundary 本身的 uuid，`logicalParentUuid` 只是母檔判準的一半，見該輪 PSM §1）。原文如下 主題上最接近 R12 的探索半邊（哪些檔案屬於同一場 session），但**明確不在 R12 v0.1 的卡片集內——這行不是承諾** | `references/DIT-tickets.md` T-008 |
| DW-18 | R12 | ~~**Codex 索引條目的 `id` 是檔名，不是 session id。**~~ **DONE 2026-08-26（R12 M5）**：`absorb()` 加讀 `session_meta.payload.id`；實測 358 筆全部拿到真正的 session id，退回檔名的 0 筆。原文如下 `absorb()` 只讀 Claude 的 `record.sessionId`；Codex 自報在 `session_meta.payload.id`，沒人去看，於是「沒去看」被記成「沒有」。M5 的 sidecar join 用的正是那把鑰匙，所以**若 M5 照降級順序被砍，這一項不會跟著消失**——它同時是 Codex session 在索引層的身分基準 | R12 M3 施工時量到；`sessionIndexer.ts` `pickTitle` 上方的 `stats.sessionId ?? baseName(...)` |
| DW-19 | R12 | ~~**`src/core/index/directorySource.ts` 零測試。**~~ **DONE 2026-08-27（R12 M8）**：`directorySource.test.ts`，18 支。R9.1 RC-A 兩側都釘住（選擇器自己的 `AbortError` 是取消；拿到 handle 之後的 `AbortError` 不是），加上權限重查、`walk` 路徑語意、以及兩個後端的路徑一致性。原文如下 這是 File System Access 的核心（`pickDirectory`／`restoreDirectorySource`／遞迴 `walk`／webkitdirectory 後備），而且守著一個這個 repo **真的踩過**的不變式——R9.1 RC-A：「使用者取消」與「拿到權限之後才失敗」不得混為一談，混了會讓索引失敗偽裝成使用者不想選。目前只靠 try/catch 的作用範圍維持，沒有任何測試守著 | 證據稽核 2026-08-27，排序第一 |
| DW-20 | R12 | ~~**`src/core/ingest/session.worker.ts` 零測試。**~~ **DONE 2026-08-27（R12 M8）**：`session.worker.test.ts`，13 支，逐檔隔離與進度累加兩側都測。**寫測試時量到一個缺陷並修掉**：位元組總和算在 try 之外，請求裡少一個 blob 就會拋在所有處理器之外，一則訊息都不回、呼叫端永遠停擺（見 D-020）。原文如下 裡面有逐檔隔離 (DSM-1) 與跨檔進度累加，是真邏輯不是轉發。對照組 `sessionLoader.ts` 用依賴注入做到 8 支測試涵蓋所有失敗模式，手法可以直接沿用（測試環境可 stub `self`） | 證據稽核 2026-08-27 |
| DW-21 | R12 | ~~**M2 的「每來源位置記憶」缺端到端測試。**~~ **DONE 2026-08-27（R12 M8）**：`sourceFolderMemory.test.ts`，9 支，走完卡片自己寫的驗收路徑。**寫測試時量到一個缺陷並修掉**：啟動時讀回的位置整包覆蓋，會蓋掉使用者搶先選好的資料夾（見 D-020）。原文如下 持久層（`handleRepository.test.ts`）與 UI 層（`SessionLoadActions.test.tsx`）各自測了，串起兩者的 `sessionStore` orchestration（`cachedDirectoryHandles` 預抓取與依來源切換）沒有任何一支測試模擬卡片自己寫的驗收情境：選 A 套挑資料夾 → 選 B 套挑另一個 → 回到 A 套。這段 wiring 壞掉時兩層測試都會維持綠燈 | 證據稽核 2026-08-27 |
| DW-23 | R12 | ~~**匿名化漏掉「扁平化的專案路徑」變形，Windows 使用者名整個外洩。**~~ **DONE 2026-08-27（作者指示直接修）**：`detectors.ts` 加一條規則對應 `[磁碟]--Users-<名>` 形，比對過 `~/.claude/projects` 底下 60 個真實目錄名（含使用者名在同一個 token 裡出現兩次的那個）。三支測試含**負向對照**（`home-page`／`all-users-online`／`D--AIWork-Prism` 皆不得觸發）。**明列未涵蓋**：macOS／Linux 的扁平形（`-Users-名-` / `-home-名-`）沒有磁碟機代號可錨定，任何規則都會誤殺一般連字號文字，而本語料裡沒有樣本可校正——寧可寫明缺口，也不要一條沒人量過誤判率的規則。原文如下 作者在 R11.2 驗收「前提2」親自回報並附行號（651／911／913／915／1115／1214）：`C--Users-gunda--claude` 沒有被遮。原因已確認——`src/core/privacy/detectors.ts:29-30` 只認 `C:\Users\<名>` 與 `/home\|/Users/<名>` 兩種**原形**，而 Claude Code 把專案路徑編碼成目錄名時會把冒號與反斜線全換成連字號，變形之後 lookbehind 對不上。**這是隱私外洩，而且它從 2026-08-17 回報以來一直不在任何登記表裡**——`DEFERRED.md`／`DIT-decisions.md`／`DIT-tickets.md` 三處都查過，都沒有。登記表漏接一個親自回報的缺陷，比缺陷本身更值得記一筆 | UAT_R11.2 §E 前提2；`detectors.ts:29-30`；2026-08-27 查證未歸屬 |
| DW-25 | R12 | ~~**符號圖例的泡泡在「抽屜模式」下右側被抽屜切掉。**~~ **DONE 2026-08-27**：修了兩處，而且量測過程**推翻了我自己前一次的判斷**——第一次驗 B5 只測最右邊的符號（因為卡片寫的已知風險是「最右緣」），回報通過；把八顆全量之後發現真正壞的是**左邊**（900 寬時第 1、2 欄的泡泡 x = -78/-43/-89/-43，被 `workspace-layout` 從左裁掉），而且**每個寬度都壞**。修法：靜態側欄改靠左對齊（右邊有閱讀區可延伸，左邊沒有餘裕）；抽屜模式改貼齊整個格線（抽屜寬 `min(88vw,320px)`、格線 4 欄、泡泡 260px，置中在幾何上無解——360 實測八顆有五顆出界）。驗證：360／560／900／1280 四個寬度 × 八顆符號 **全部無裁切、無出界**，抽屜內層捲動不受影響。原文如下 2026-08-27 以無頭瀏覽器量到，**R11.2 的 B5／C11 沒有完全修好**——R5 修的是「不被自己的容器裁掉」，在**靜態側欄**下確實修好了（1280 與 900 兩個寬度、最右下角的符號，四角＋中心全部命中泡泡自己、三個 `overflow:hidden` 祖先都沒切到）。但視窗窄到切換成**抽屜 (drawer) 模式**時，泡泡改由 `dialog.structure-drawer` 承載，而它右緣就是裁切邊界。**重現**：視窗 560×560 →「結構」開抽屜 → 滑過最右欄的 ▣ 系統事件。量到：泡泡 `(142,218) 260×51`，右緣 402 > 抽屜右緣約 307，**右側約 95px 被裁**；`elementFromPoint` 四角測試中**兩個右側角回傳 `dialog.structure-drawer` 而不是泡泡**。修法方向：泡泡需要脫離抽屜的裁切上下文（portal 到 `body`，或抽屜改用非 `hidden` 的 overflow），並在靠右的項目上翻轉對齊方向 | 2026-08-27 無頭瀏覽器實測；`legend-tooltip-bubble`、`dialog.structure-drawer`；截圖在 scratchpad |
| DW-24 | R12 | ~~**「使用者取消」與「這個瀏覽器不肯開選擇器」在 API 層無法區分**~~ **已裁決並部分實作 2026-08-27（D-023）**：行為**不變**（RC-A 仍然成立，取消仍然安靜關閉），但不再對開發者靜默——拒絕在 200ms 內到達時印一行具名 console 警告，說明「人不可能取消得這麼快」。門檻**只決定要不要印 log、不做任何判定**，所以訂錯零成本；真正的負向對照（真人在真 Chrome 取消要多久）只有作者驗收時量得到，已寫進驗收卡。原文如下 「使用者取消」與「這個瀏覽器不肯開選擇器」在 API 層無法區分，而 DIT 對兩者都靜默關閉。** 2026-08-27 實測 Claude Code 內建瀏覽分頁：`showDirectoryPicker()` 直接 `REJECTED AbortError :: "The user aborted a request."`——**環境拒絕開原生對話框，卻謊報成使用者取消**。DIT 依 R9.1 RC-A 把選擇器自己的 `AbortError` 判為取消、安靜關掉（對真的按了取消的人這是對的），於是使用者按了「從對話集選擇」之後**什麼都沒發生、也沒有任何訊息**。**RC-A 的規則沒有錯，錯在它假設 `AbortError` 只有一個成因。** 可能的修法：量測拒絕延遲（環境拒絕是即時的，真人取消要數百毫秒）——**但那需要一份真實 Chrome 的人工取消當負對照才能校正**，只有正對照的門檻不能信。在那之前至少可以做的：取消之後若清單仍是空的、且這個來源從來沒有成功過，給一句「沒有開起選擇器？這個瀏覽器可能不支援」的提示，而不是純靜默 | 2026-08-27 於內建分頁實測；`directorySource.ts:96`、`sessionStore.ts` `pickAndIndexDirectory` |
| DW-22 | R12 | ~~**worker 的「取消」訊息有消費端、沒有生產端。**~~ **裁決為明文保留 2026-08-27（D-022）**：不接線、也不刪除。接線要新增一套訊息式取消協定，而 `terminate()` 已經把取消做完了——**核心需求已滿足，不為了做而做**；刪除則會連「取消該長什麼樣」的唯一定義一起刪掉。現況由 `session.worker.test.ts` 釘住。原文如下 `sessionLoader` 會處理 `{type:"cancelled"}`，`session.worker.ts` 也會在收到 `StreamCancelledError` 時送出它——但**沒有任何生產路徑**：`parseJsonlBlob` 只在拿到 `isCancelled` callback 時才丟那個例外，而 worker 從不傳；UI 的取消是直接 `terminate()` worker。這是 P-005 從另一端看的形狀（宣告沒有生產者，而不是沒有消費者）。**不建議直接刪**——那條分支是對的，刪掉等於刪掉唯一定義「取消該長什麼樣」的地方；要嘛補上訊息式取消協定，要嘛在契約上註明它是保留路徑。目前由 `session.worker.test.ts` 釘住現況 | R12 M8 施工時量到；`session.worker.ts:61,76` |
| DW-17 | unassigned | M9 的 Consider 級 spot-check 殘留：C-01／F-13（註解宣稱用 uuid 去重、實作用 200 字元前綴）、C-05（`activePreset` 無 allow-list，壞值靜默 no-op）、C-06（`resetToSample` 未清 `snapshotMode`）、C-07（無可重現的相依套件 audit gate）、S-07（死 CSS）、S-13（殘留文件對齊） | REVIEW §4、§5 第 7–8 項 |

## 收工條件 (how an item leaves this table)

一筆 DW 只有三種離開方式，**刪掉不算**：

1. 某一輪吃下它 → `home` 改成該輪 id，並在該輪的 PSM 裡出現成一張卡。
2. 被裁定為明文排除 → 移進 `references/DIT-decisions.md` 開一個 D-NNN，本表留一行指過去
   （DW-11 上方那段就是 §2／§3 的樣子）。
3. 被實作掉 → 標 `done` 並附 commit sha，下一次整理時才移出。

<!--
review-when: a round is allocated or its card set changes, a DW item is implemented or ruled
out, or a new deferral is made. `home` values are validated by scripts/check-round-ids.mjs —
they must be the literal `unassigned` or an id listed in docs/rounds/ROUNDS.md.
-->
