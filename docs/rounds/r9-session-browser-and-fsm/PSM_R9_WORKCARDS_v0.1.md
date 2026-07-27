# R9 — Session Browser + 狀態機統整：施工卡 PSM v0.1

> 狀態：**待作者確認後才施工**（本文件不含任何已寫入 `src/` 的改動）。
> 觸發：作者 2026-07-27 回報四項問題（真實資料夾無法讀取／`system` 型別被當未知／HASH 檔名難以挑選／FSM 需統整檢查）。
> 參考：`D:\AIWork\Prism\docs\design\PRISM_STATE_MACHINES_2026-07-26.md`（同型缺陷的先例，本文件沿用其缺陷分類法與「先確立狀態機再挑元件」的順序）。
> 分支：`feat/r9-session-browser-and-fsm`（自 `main` 切出）。
> ops-relaxation：**L1**（作者裁決，見 D1）。

---

## §0 邊界契約（L1，施工前先立）

**解讀分岔**：作者問題 3 的「載入改為二級行為」被解讀為「先索引後挑選」，而非「自動判斷該載哪個檔」——DIT 不替使用者選 session，只讓他看得見再選。若此解讀有誤，翻轉點在 M3 的 `SessionIndexEntry` 消費端（清單 UI），索引層本身不受影響。

**邊界輸入**：`~/.claude/projects/` 實測 140 個 `.jsonl`／267 MB／15 個 `subagents/` 目錄；單一專案目錄最多 53 檔。含 `.meta.json` 旁檔、含 `compact_boundary` 的壓縮 session、含零真人 prompt 的機器 session。Codex `~/.codex/sessions/<年>/<月>/` 為平行來源，索引層必須來源無關。

**驗收**：(a) 選 `C--Users-gunda--claude/` 可列出 53 筆並成功載入其中任一筆（含帶 subagents 的）；(b) 全量掃描 140 檔後 `warnings` 中 `tier==="fatal"` 為 0；(c) 每台本輪動到的機器至少一條 transition test；(d) 同時只可能有一個阻斷面開啟，可由測試斷言。

**非目標與降級**：不做 session 內容全文搜尋、不做跨 session 比較、不做標題的 LLM 生成（規則式即可）。降級順序：**捨棄索引持久化 → 捨棄分類徽章 → 捨棄 Codex 來源索引 → 保底：Claude Code 單一目錄的可視化挑選＋正確載入**。

---

## §1 盤點：四個問題的根因（2026-07-27 實測）

### RC-1a — 單一無法辨識的旁檔造成整批載入失敗

`subagents/` 目錄同時含 `agent-<id>.jsonl` 與 `agent-<id>.meta.json`。後者被 [`SessionLoadActions.tsx:21`](../../../src/components/SessionLoadActions.tsx:21) 的 `/\.(jsonl|json|txt)$/i` 濾網收入，兩個 adapter 的 `canParse` 都不認領（`{"agentType":…}` 無 `type` 欄位），[`jsonlStream.ts:67`](../../../src/core/ingest/jsonlStream.ts:67) 拋 `UnknownSourceError`，[`session.worker.ts:61`](../../../src/core/ingest/session.worker.ts:61) 把**整批**判失敗。

分類：**[fail-whole]**。adapter 層每行失敗只記 warning，但檔案層失敗是全有全無——同一條資料流的兩段採用了相反的容錯策略。

### RC-1b — 「main + `subagents/` 同層」是未經真實資料驗證的假設

真實佈局為 `projects/<專案>/<sessionId>.jsonl` 與 `projects/<專案>/<sessionId>/subagents/*.jsonl`，**主檔是資料夾的兄弟，不在資料夾內**。[`USER_GUIDE.md:13`](../../USER_GUIDE.md:13)、[`PSM_DIT_v1.0.md:156`](../../PSM_DIT_v1.0.md:156)、[`architecture.md:103`](../../architecture.md:103) 均寫「主檔＋`subagents/*.jsonl`」，唯一驗證素材是 `npm run fixture:r5` 自行合成的 `src/fixtures/r4/`——用自製 fixture 驗證對外部格式的假設。

後果：選 `<sessionId>/` 只會拿到 subagent 檔，[`pipeline.ts:126`](../../../src/core/pipeline.ts:126) 的 `files.find(非 subagents) ?? files[0]` 靜默把 subagent 當主檔。分類：**[untracked]**（沒有「這批檔案沒有主檔」這個狀態）。

### RC-2 — 標準型別被當成未知型別

[`claudeCodeJsonl.ts:150-158`](../../../src/core/adapters/claudeCodeJsonl.ts:150) 的噪音白名單只有 5 種，其餘落入 `default` 出 warning。全量掃描 140 檔結果：

| 型別 | 次數 | 現況 | 語意 |
|---|---|---|---|
| `custom-title` | 1528 | ❌ 未知型別 warning | 使用者手設標題（應優先於 `ai-title`） |
| `system` | 539 | ❌ 未知型別 warning | 依 subtype 分流 |
| `pr-link` | 264 | ❌ 未知型別 warning | PR 產出證據 |
| `permission-mode` | 3 | ❌ 未知型別 warning | 噪音 |

`system` subtype 分布：`stop_hook_summary` 433、**`compact_boundary` 62**、`api_error` 38、`local_command` 3、`model_refusal_fallback` 2、`turn_duration` 1。

`compact_boundary` 攜帶 `logicalParentUuid` 與 `compactMetadata.{trigger, preTokens}`，代表「此處之前的歷史已被摘要取代」——對一個以因果骨架為賣點的產品，這是結構性事件，目前被當垃圾丟棄。**規範已經存在但沒被套用**：Codex adapter 對 `turn_aborted`／`context_compacted` 的處置就是「產生一則自我解釋的標記事件插在原時序位置」（[`codexJsonl.ts` 檔頭 §B4.5](../../../src/core/adapters/codexJsonl.ts)）。

### RC-3 — 解析提醒被誤讀為分類器，且門檻不分級

`68466cc1` 實測：200 行、`attachment` 108、`assistant` 46、`user` 27、`system:stop_hook_summary` **2**、`isSidechain` **0**——純人機對話。它跳提醒只因那 2 行命中 RC-2，而 [`ParseNoticeDialog.tsx:18`](../../../src/components/ParseNoticeDialog.tsx:18) 的條件是 `warnings.length > 0 && !acknowledged`：**任何一條 warning 都強制不可跳過的 modal**。

兩層結論：(a) 這不是誤傷分類，是**根本沒有分類器**——修好 RC-2 後此誤鳴自然消失；(b) `warnings: string[]` 不分級仍是缺陷，「3 行 JSON 壞掉」與「2 行我還沒支援的已知型別」共用同一個強制 modal。分類：**[not a machine]**，同 Prism SM-12。

### RC-4 — 阻斷面有六個擁有者

[`App.tsx:51-55`](../../../src/App.tsx:51) 掛載 6 個表面：`SessionMapDialog`／`SettingsDialog`／`ParseNoticeDialog`／`FolderLoadConfirmDialog`／`WelcomeDialog`／`PrivacyReview`。前三個透過 [`sessionStore.ts:899-920`](../../../src/store/sessionStore.ts:899) 的手動互清假裝互斥；`ParseNotice`／`FolderLoadConfirm`／`Welcome` 完全不在互清網內。首次啟動載入含 warning 的 session ⇒ `WelcomeDialog` 與 `ParseNoticeDialog` 可同時 `showModal()`，兩者都進 top layer 疊放。分類：**[split-brain]**，同 Prism SM-16。

### RC-5 — 載入失敗有兩個擁有者、瞬時旗標無共同紀律

`error`（同步路徑 [`sessionStore.ts:342`](../../../src/store/sessionStore.ts:342)）與 `sessionLoadError`（worker 路徑 [`sessionStore.ts:621`](../../../src/store/sessionStore.ts:621)）描述同一件事，UI 兩邊都要顯示。`publishPipelineResult` 以一份 30 行手寫清單逐欄復位 20+ 個瞬時欄位（[`sessionStore.ts:273-303`](../../../src/store/sessionStore.ts:273)）——漏一欄即為下一個「地圖建立中…」永久卡死類缺陷。分類：**[split-brain] + [leak 風險]**，同 Prism F5。

---

## §1.5 M1／M2 施工後實測（2026-07-27，真實資料）

以完工後的 adapter 與批次機掃描 `C:\Users\gunda\.claude\projects\` 全部 **140 個真實 `.jsonl`**：

| 診斷 | 次數 | 分級 |
|---|---|---|
| `NOISE_SKIPPED` | 140 檔皆有 | info |
| `MARKERS_EMITTED` | 17 檔 | info |
| `NO_EVENTS` | 1 檔（真的空 session） | warn |

**`UNKNOWN_RECORD_TYPE` 0 次、`LINE_PARSE_FAILED` 0 次、`fatal` 0 次**；單檔非 info 診斷的最大值為 1。RC-2 描述的 2334 行「未知型別」全數歸零，達成 §0 驗收 (b)。

再以作者實測失敗的那個資料夾 `66c03ab2-d399-473a-9896-b3c1647c517f` 依 M3 將採用的組法（主檔 + 同名資料夾下的 `subagents/*`）實跑：

```
inputs=3 (2 parsed, 1 unrecognized)
spans=140  subagentGroups=2
title="剛剛做了系統環境的改動，給我一些測試驗證規則層路由跟permissions.ask有生效。"
diagnostics=[ warn FILE_UNRECOGNIZED ×1 (…/agent-a19da4e7585bd9a2b.meta.json), info NOISE_SKIPPED ×140, info NOISE_SKIPPED ×3 ]
只選 subagents/ 資料夾 → NO_MAIN_TRANSCRIPT
```

也就是：RC-1a 的 `.meta.json` 現在只是一條 warn，整份 session 正常載入；RC-1b 的「只有子代理」變成具名狀態，不再靜默把子代理當主檔。§0 驗收 (a) 的自動化部分成立，UI 部分待 M3 與 §5 手動驗收。

## §1.6 M3 施工後實測與兩次誤傷修正（2026-07-28，真實資料）

以完工後的索引器掃 `C:\Users\gunda\.claude\projects\`（218 個檔案）：

```
entries=109   耗時 ~450 ms
kind        = { dialogue: 108, machine: 1 }
kindReason  = { has-human-prompt: 108, no-human-prompt: 1 }
titleSource = { custom: 72, ai: 11, derived: 25, filename: 1 }
withSubagents=15   withCompaction=1   diagnostics=[]
```

**109 個 session 有 108 個顯示得出可讀標題**，唯一還顯示 HASH 的那個是 7 行的空 session（只有 `queue-operation` 與 `local_command`，沒有任何訊息），`machine/no-human-prompt` 判定正確。**唯一的啟發式規則（`synthetic-prompts-only`）在真實語料上一次都沒有觸發**，也就是這批資料裡沒有任何一筆是靠推測分類的。

### 實測抓到的兩個誤傷（已修，各有回歸測試）

作者特別要求「避免誤傷」，實測確實抓到兩個，兩個都是把**真人對話**標成機器任務：

| # | 症狀 | 根因 | 修法 |
|---|---|---|---|
| 1 | `3f5c5d01`（51 則回覆的 `/doctor` 工作階段）被判為 `machine` | 判準是「淨化後還剩幾個字」。斜線指令 `<command-name>/doctor</command-name>` 淨化後整段消失，於是計數為 0 | 改數「真人**出手**的回合」(`humanTurnCount`)，與「還剩多少文字」分開。文字只用來取標題 |
| 2 | `c32fe685`（附截圖的真人 prompt）被判為 `machine` | 那則訊息把 base64 影像塞在同一行 JSON，單行 132 KB，剛好跨過 128 KB 檔頭邊界而被當成半行丟掉 | 被切掉的殘段超過 32 KB 就不像普通一行，放大檔頭視窗（上限 1 MB）重讀一次 |

連帶把偏誤方向統一成一條原則並補在三處：**寧可漏判機器，不可誤判真人**——機器語句用精確比對而非前綴比對；掃描讀不到任何完整行時回報「無法判定」而不是「沒有真人訊息」；同理，讀不到完整行時也不得回報「不是 Claude Code」而把檔案從清單上抹掉。

---

## §2 決策登錄

| # | 決策 | 裁決者 | 落於 |
|---|---|---|---|
| D1 | ops-relaxation = **L1 核心**（啟用邊界契約與決策憲章，不跑完整多階段 ops）；記入專案 `CLAUDE.md` 使之後不再詢問 | 作者 2026-07-27 | §0、M0 |
| D2 | 檔案存取 = **File System Access API 為主 + `webkitdirectory` 後備**。Chromium/Edge 走 `showDirectoryPicker()` 並把 handle 存入 IndexedDB（記住上次資料夾、可逐檔惰性讀）；Firefox/Safari 自動退回既有機制 | 作者 2026-07-27 | M3 |
| D3 | 入口語意 = **「載入資料夾」改為二級行為**（選目錄 → session 清單 → 挑一個 → 載入）。入口仍是兩顆按鈕；`FolderLoadConfirmDialog` 的數量／大小防呆隨之退役 | 作者 2026-07-27 | M3、M4 |
| D4 | 分類呈現 = **全部顯示 + 徽章 + 可切換篩選**，預設全顯示。分類錯誤時使用者仍看得到、點得到 | 作者 2026-07-27 | M3 |
| D5 | `warnings` 升級為分級結構 `{tier, code, detail}`。只有 `fatal` 才強制 modal；`info` 降為非阻斷 banner | 主模型（決策憲章：可逆、非價值分岔）2026-07-27 | M2 |
| D6 | `compact_boundary`／`api_error`／`model_refusal_fallback` 產生標記事件插入原時序（沿用 Codex adapter 既有慣例）；`stop_hook_summary`／`turn_duration`／`local_command`／`permission-mode` 列入靜默噪音白名單；`custom-title` 寫入 `meta.title`；`pr-link` 收為 session 級 metadata | 主模型 2026-07-27 | M1 |

D5／D6 為主模型裁決，作者可推翻；推翻 D6 的翻轉點在 M1 的 `SYSTEM_SUBTYPE_POLICY` 單一常數表。

---

## §3 State machine inventory (DIT)

Defect classes follow the Prism legend: **[1-way] [dead-end] [split-brain] [untracked] [leak] [fail-whole]**.

| ID | Machine | Owner today | Health | Touched this round |
|---|---|---|---|---|
| DSM-1 | Session load (blob → document) | `sessionStore` × `session.worker` × `jsonlStream` | ❌ **fail-whole, two error owners** | M2 |
| DSM-2 | Parse diagnostics / notice tier | `warnings: string[]` + `parseNoticeAcknowledged` | ❌ **not a machine** | M2 |
| DSM-3 | Blocking surface (overlay) | 6 independent booleans | ❌ **split-brain** | M4 |
| DSM-4 | Session index / browse | *(does not exist)* | ❌ **missing** | M3 |
| DSM-5 | Endpoint capability | `EndpointStatus` ([`endpointStatus.ts:7`](../../../src/core/llm/endpointStatus.ts:7)) | ✅ **sound** — house pattern | — |
| DSM-6 | Annotation job | `AnnotationJobController` | ✅ sound (single terminal emit) | — |
| DSM-7 | Privacy consent gate | `pendingPrivacyReviewer` + `privacyReview` | ⚠ module-level resolver, not in state | — |
| DSM-8 | Annotation cache restore | `cacheLoadGeneration` + `cacheReady` | ⚠ generation guard is correct; `cacheReady` has 3 setters | — |
| DSM-9 | Playback | `replayTimer` + `isPlaying` + `playingId` | ⚠ timer lives outside state | — |
| DSM-10 | Workspace view | `primaryView` + drawer/map booleans | ⚠ overlaps DSM-3 | M4 |
| DSM-11 | Onboarding gate | `welcomeOpen` + IndexedDB flag | ⚠ not arbitrated against DSM-3 | M4 |
| DSM-12 | Snapshot mode | `snapshotMode` | ✅ sound (single writer, gates by invariant) | — |

**DSM-5 is the counter-example that proves this is achievable in this codebase** — enumerated states, per-state remediation copy, one owner. Every target below is written to look like it.

### DSM-1 target — load outcome becomes total (closes RC-1a, RC-1b, RC-5)

Per-file outcome replaces all-or-nothing:

```
[*] --> scanning
scanning --> recognized      : an adapter claims line 1
scanning --> unrecognized    : no adapter claims it        (was: throw, killed the batch)
recognized --> parsed
recognized --> parse_failed  : stream/decode error         (per file, not per batch)
```

Batch outcome derives from the per-file set:

```
[*] --> collecting
collecting --> ok            : >=1 parsed file, exactly one top-level sessionId
collecting --> ok_partial    : >=1 parsed + >=1 unrecognized/parse_failed  -> load, report the skipped set
collecting --> no_main       : all parsed files are under subagents/       -> typed error, names the sibling main file
collecting --> multi_session : >1 distinct top-level sessionId             (existing guard, keep)
collecting --> empty         : 0 parsed files                              -> typed error
```

Rules: (1) `unrecognized` is never fatal while at least one file parsed; (2) `no_main` is a named state — never silently promote a subagent file to main; (3) one error owner — `sessionLoadError` is deleted and `error` carries a typed code, so the sync and worker paths converge.

### DSM-2 target — three tiers, one queue (closes RC-3)

| Tier | Trigger | Surface | Exit |
|---|---|---|---|
| `info` | known type handled by policy (`compact_boundary` marker emitted, N noise lines skipped) | inline count in the overview, no interruption | next load |
| `warn` | recoverable degradation (file skipped as unrecognized, subagent pairing failed, oversized input) | dismissible banner, expandable detail | user dismiss or next load |
| `fatal` | nothing renderable (`empty`, `multi_session`, `no_main`, all files failed) | blocking surface via DSM-3, names cause **and** next action | explicit acknowledge |

`Diagnostic = { tier, code, detail?, count? }` — never a raw message string. Codes map to zh-TW/en copy in exactly one table; an unmapped code falls back to generic copy plus the code.

### DSM-3 target — one blocking-surface carrier (closes RC-4)

```
[*] --> closed
closed --> open   : request(surface) when none open
closed --> queued : request(surface) while one is open
queued --> open   : the open surface closes
open --> closed   : resolve(explicit action)
open --> closed   : escape/backdrop — ONLY if policy = "escapable"
open --> closed   : owning condition resolves (e.g. diagnostics cleared)
```

MUST NOT: two surfaces open at once; a `<dialog>` carrying a static `open` attribute; an `action-only` surface closing on Escape or backdrop. Dismissal policy is per-call-site data, not a component decision. `ParseNoticeDialog` = `action-only`; `Settings`/`SessionMap`/`Welcome` = `escapable`; `PrivacyReview` = `action-only`.

### DSM-4 target — the new machine

```
[*] --> no_directory
no_directory --> picking       : user picks a directory (FSA or webkitdirectory)
picking --> no_directory       : cancelled
picking --> indexing           : directory handle / FileList acquired
indexing --> indexed           : header scan complete
indexing --> index_failed      : permission revoked / read error  -> retry available
indexed --> indexing           : user refreshes
indexed --> loading            : user picks one entry -> DSM-1
loading --> indexed            : load finished or failed (the list survives the load)
```

The list surviving the load is the point of the machine: a failed load must return the user to the list, not to an empty app.

---

## §4 Work cards

### M0 — Branch + boundary contract recorded

- Create `feat/r9-session-browser-and-fsm` from `main`.
- Add `ops-relaxation: L1` to the project `CLAUDE.md` (create the file if absent) so the gate does not re-fire.
- No source change.

---

### M1 — Claude Code adapter completeness (closes RC-2; no UI)

**Modify** `src/core/adapters/claudeCodeJsonl.ts`

1. Add a single policy table, exported for tests:
   ```ts
   type SystemPolicy = "marker" | "noise";
   export const SYSTEM_SUBTYPE_POLICY: Record<string, SystemPolicy> = {
     compact_boundary: "marker",
     api_error: "marker",
     model_refusal_fallback: "marker",
     stop_hook_summary: "noise",
     turn_duration: "noise",
     local_command: "noise",
   };
   ```
   Unknown `system` subtype ⇒ `marker` with a generic label **plus** an `info` diagnostic (never silent, never fatal — R7-INV-7 discipline).
2. `case "system"`: emit a self-describing marker `RawEvent` at its timestamp position for `marker` subtypes. `compact_boundary` marker text carries `compactMetadata.trigger` and `preTokens`; `api_error` carries `error.status`/`error.message`; `model_refusal_fallback` carries `direction`. Reuse the existing Codex marker convention — do not invent a second one.
3. `case "custom-title"`: `meta.title = record.customTitle`. Precedence: `custom-title` > `ai-title` > `deriveFallbackTitle`. Because a file may carry several of both, keep the **last** `custom-title` and the **last** `ai-title` rather than the first-wins rule currently applied at [`claudeCodeJsonl.ts:85`](../../../src/core/adapters/claudeCodeJsonl.ts:85).
4. `case "pr-link"`: collect into `meta.prLinks: Array<{number, url, repository}>`. Add the field to `ParseResult["meta"]` and `SessionMeta` (optional; Codex leaves it undefined).
5. Add `permission-mode` to the silent noise list.
6. `default` branch: keep the warning but aggregate by type (`型別 "x" ×N`), matching the Codex adapter's existing anti-flood rule.

**Modify** `src/types/spanTree.ts` — new marker `SpanType` (or reuse the Codex marker span type if one already exists; check before adding) and `SessionMeta.prLinks`.

**Tests** `src/core/adapters/claudeCodeJsonl.test.ts`
- Each `SYSTEM_SUBTYPE_POLICY` key: `marker` ⇒ exactly one event at the right position; `noise` ⇒ zero events, zero warnings.
- Unknown `system` subtype ⇒ one marker + one `info` diagnostic.
- `custom-title` beats `ai-title`; last-wins within each.
- Regression fixture: a synthetic file containing all 4 previously-unknown top-level types produces **zero** `fatal`/`warn` diagnostics.

**Acceptance (automated)**: a scan-all script over the fixture corpus reports 0 unknown-type warnings for the four types in §1 RC-2.

---

### M2 — Load outcome machine + diagnostic tiers (closes RC-1a, RC-1b, RC-3, RC-5)

**New** `src/core/diagnostics/contracts.ts` — `Diagnostic { tier: "info"|"warn"|"fatal"; code: string; detail?: string; count?: number }` and `DiagnosticCode` union. **Note**: `src/core/diagnostics.ts` (fallback recorder) is a different concern and stays as-is; do not merge them.

**New** `src/i18n/diagnosticCopy.ts` — one `code → {zh-TW, en}` table. Unmapped code ⇒ generic copy + the code, never the raw message.

**Modify** `src/core/ingest/jsonlStream.ts`
- `parseJsonlChunks` no longer throws `UnknownSourceError`. Return `{ outcome: "recognized"|"unrecognized"|"parse_failed", parsed?, inputBytes, lineCount, diagnostic? }`.
- Keep `StreamCancelledError` as a throw (cancellation is not a file outcome).

**Modify** `src/core/ingest/session.worker.ts` — collect per-file outcomes; only the batch-level decision (below) can fail the load.

**Modify** `src/core/pipeline.ts`
- `buildSessionDocumentFromParsedFiles` implements the `collecting` machine of §3 DSM-1. Replace the `?? files[0]` fallback at line 126 with the explicit `no_main` state.
- `no_main` diagnostic copy must name the actual fix: 「這個資料夾只有子代理紀錄，主檔是它的**同層兄弟檔** `<id>.jsonl`。請改選上一層目錄，或用 Session 瀏覽器挑選。」
- Keep `assertSingleTopLevelSession` but convert its throw into the `multi_session` fatal diagnostic.

**Modify** `src/store/sessionStore.ts`
- Delete `sessionLoadError`; `error: Diagnostic | null` becomes the single owner for both the sync and worker paths.
- `warnings: string[]` → `diagnostics: Diagnostic[]`. Keep `warningsDismissed` semantics for the `warn` banner.
- Extract the 30-line reset block of `publishPipelineResult` into a named `SESSION_SCOPED_INITIAL_STATE` constant so adding a session-scoped field cannot silently skip its reset (closes the RC-5 leak risk). Add a test asserting every session-scoped key is present in it.

**Modify** `src/components/ParseNoticeDialog.tsx` — open only when `diagnostics.some(d => d.tier === "fatal")`; render copy from the table, never `detail` alone.
**Modify** `src/components/NoticeBanner.tsx` / `SessionLoadStatus.tsx` — render `warn`/`info` non-blocking.

**Tests**
- Transition tests for DSM-1: one per batch outcome (`ok`, `ok_partial`, `no_main`, `multi_session`, `empty`).
- `ok_partial` case uses a **real-shaped** fixture: `agent-x.jsonl` + `agent-x.meta.json` ⇒ loads, one `warn` diagnostic naming the skipped file. This is the direct RC-1a regression test.
- `fatal`-only modal: a session with 5 `info` diagnostics does not open `ParseNoticeDialog`.

---

### M3 — Session index + browser (closes issue 3; D2/D3/D4)

**New** `src/core/index/contracts.ts`

```ts
export type SessionKind = "dialogue" | "subagent" | "machine" | "unknown";

export interface SessionIndexEntry {
  id: string;                    // sessionId, or synthesized from path when absent
  path: string;                  // relative to the picked directory
  project: string | null;        // top-level dir name, decoded to a real path when derivable
  title: string;                 // custom-title > ai-title > first human prompt > filename
  titleSource: "custom" | "ai" | "derived" | "filename";
  source: SourceId;              // claude-code | codex
  startedAt: string | null;
  endedAt: string | null;
  sizeBytes: number;
  humanPromptCount: number;
  assistantCount: number;
  hasCompaction: boolean;
  subagentPaths: string[];       // sibling <id>/subagents/*.jsonl, resolved by the indexer
  kind: SessionKind;
  kindReason: string;            // stable short code, shown in the badge tooltip
}
```

**Scope (author ruling 2026-07-27)**: Claude Code only. A file the indexer cannot confirm as
Claude Code is indexed as `kind: "unknown"` and excluded from the list — never guessed into
another source. Codex single-file loading is unaffected.

**New** `src/core/index/sessionIndexer.ts` — header scan, **not** a full parse.
- Read at most the first `INDEX_SCAN_BYTES = 64 * 1024` and the last `16 * 1024` of each file (last chunk supplies `endedAt`; a title record may appear anywhere, so a file whose title is still `filename` after the head scan is **not** rescanned — accept `derived`/`filename` rather than pay a full read).
- Measured budget: 140 files × 80 KB ≈ 11 MB — acceptable. Log a `info` diagnostic if the directory exceeds `INDEX_MAX_FILES = 500` and report what was dropped (no silent truncation).
- Sibling resolution implements RC-1b correctly: for `<id>.jsonl`, attach every `<id>/subagents/*.jsonl` found in the same listing. `.meta.json` sidecars are read for the subagent's `description`/`agentType` and are **never** passed to the pipeline.

**New** `src/core/index/classifySession.ts` — D4's classifier. Ordered rules, first match wins, each returns a `kindReason`:

| Order | Condition | kind | kindReason |
|---|---|---|---|
| 1 | path matches `subagents/`, or any record has `agentId`, or all records are `isSidechain` | `subagent` | `path-subagents` / `field-agentid` / `all-sidechain` |
| 2 | `humanPromptCount === 0` | `machine` | `no-human-prompt` |
| 3 | every human prompt is a known machine phrase (`Continue from where you left off.` and the `<<autonomous-loop*>>` sentinels) or `isMeta` | `machine` | `synthetic-prompts-only` |
| 4 | `humanPromptCount >= 1` | `dialogue` | `has-human-prompt` |
| 5 | otherwise | `unknown` | `insufficient-signal` |

A "human prompt" is `type==="user"` with string/text content, `isMeta !== true`, no `tool_result` block, and not `isCompactSummary`. **Rule 3 is the only heuristic** and is the one that can misfire — hence D4: it is a badge, never a filter that hides by default.

**New** `src/core/index/directorySource.ts` — D2's two backends behind one interface:
```ts
export interface DirectorySource {
  kind: "fsa" | "webkitdirectory";
  list(): Promise<Array<{ path: string; size: number; read(range?: {start:number; end:number}): Promise<Blob> }>>;
  openForLoad(paths: string[]): Promise<SessionBlobInput[]>;
}
```
`fsa` persists its `FileSystemDirectoryHandle` in IndexedDB (reuse `src/core/onboarding/repository.ts`'s IDB helper pattern) and re-verifies `queryPermission` on restore; a revoked permission lands in `index_failed`, not a crash. `webkitdirectory` builds the same interface over a one-shot `FileList` and simply has no persistence.

**New** `src/components/SessionBrowserDialog.tsx` — the list surface. Columns: badge, title (+ `titleSource` tone), project, time, human/assistant counts, size, subagent count, compaction mark. Filter chips per `SessionKind`, **all on by default** (D4). Sort by time desc default. Row click ⇒ `loadFromBlobs(entry + subagentPaths)`.

**Modify** `src/components/SessionLoadActions.tsx` — the 「載入資料夾」 button becomes D3's two-step entry: pick directory ⇒ open `SessionBrowserDialog`. Single-file entry unchanged. Keep the button count at two.

**Modify** `src/store/sessionStore.ts` — DSM-4 state: `browseState`, `indexEntries`, `indexDiagnostics`, `browserFilter`. `loading → indexed` on both success and failure (the list must survive a failed load).

**Tests**
- `classifySession` table test: one case per rule, plus a **negative-control** case built from the real shape of `68466cc1` (2 × `stop_hook_summary`, 0 sidechain, 27 user records) asserting `dialogue`, not `machine`.
- Indexer: `<id>.jsonl` + `<id>/subagents/*.jsonl` in one listing ⇒ one entry with `subagentPaths.length === 1`; `.meta.json` never enters `openForLoad`'s output.
- Title precedence: custom > ai > derived > filename.
- DSM-4 transition tests, including `loading → indexed` after a failed load.

---

### M4 — Blocking surface machine (closes RC-4)

**New** `src/core/surface/blockingSurface.ts` — DSM-3 as a store slice: `{ current: SurfaceRequest | null; queue: SurfaceRequest[] }`, `SurfaceRequest = { id, policy: "action-only" | "escapable" }`.
**New** `src/components/BlockingSurface.tsx` — the single `<dialog>` carrier. `showModal()` only; a static `open` attribute is forbidden. jsdom fallback stays but must not disable the real path (Prism's exact failure — assert `showModal` was called).

**Modify** all six surfaces to request through the machine instead of owning a boolean. `FolderLoadConfirmDialog` is **deleted** (D3 retires the blind-folder guard; the browser makes over-selection impossible). Its threshold constants move to the indexer as `INDEX_MAX_FILES`.

**Tests** — two simultaneous requests ⇒ one open, one queued; `action-only` ignores Escape; `escapable` resolves to cancel on Escape/backdrop; the Welcome + fatal-diagnostic startup case yields exactly one open surface.

---

### M5 — FSM inventory document + transition-test discipline (closes issue 4)

- **New** `docs/design/DIT_STATE_MACHINES.md` — §3 of this document promoted to a maintained inventory, with as-built/defects/target per machine, `file:line` for every claim, and DSM-5 named as the house pattern.
- **New** `src/store/__tests__/transitions.test.ts` — one `from state A, event E ⇒ state B` test per machine touched in M2/M3/M4. This is the direct answer to Prism F6 (「沒有任何機器被測試斷言」), which DIT shares.
- Record the DSM-7/8/9/10/11 findings as backlog items in `docs/BACKLOG.md` with their defect class — **not fixed this round**, and explicitly marked as pre-existing debt, not R9 regressions.

---

## §5 手動驗收清單（作者執行，非作者不可代簽）

前置：`npm run build && npm run preview`，準備好 `C:\Users\gunda\.claude\projects\`。

1. 點「載入資料夾」→ 選 `C--Users-gunda--claude`。**預期**：出現 session 清單，約 53 筆，每筆有可讀標題（非 HASH），有分類徽章。
2. 在清單中找 `66c03ab2…`。**預期**：顯示為一筆（不是兩筆），標題可讀，subagent 數顯示 1。
3. 點它載入。**預期**：成功載入且結構含子代理分支；**不出現**任何強制彈窗。
4. 找 `68466cc1…`。**預期**：徽章為「對話」，非「機器任務」。載入後不跳解析提醒。
5. 找任一含壓縮的 session（清單有壓縮標記）。**預期**：載入後時序中可見「對話在此被壓縮」標記卡。
6. **壓力**：直接選最上層 `projects/` 根目錄。**預期**：列出跨專案全部 140 筆並標出專案欄，不當機、不彈舊的數量防呆窗；若超過上限有明說被略過幾筆。
7. **壓力**：載入某筆時，在進度跑到一半按取消，然後立刻點另一筆。**預期**：回到清單、清單未消失、第二筆正常載入、無殘留進度條。
8. **壓力**：首次啟動（先清 IndexedDB）+ 立刻載入一個會產生 `fatal` 的檔。**預期**：歡迎彈窗與錯誤彈窗**不同時**出現，一個關掉後另一個才出現。
9. **壓力**：在 Firefox 或 Safari 重跑步驟 1。**預期**：功能可用（走 webkitdirectory 後備），只是不記住上次資料夾。
10. **壓力**：Chromium 下關掉分頁再開，點「載入資料夾」。**預期**：直接列出上次的目錄，不需重選；若權限已被撤銷，出現可重試的錯誤而非白畫面。

---

## §6 降級宣告

若本輪預算或時程不足，依此順序捨棄，**不接受每項都做到六成**：

1. 捨棄 **M5 的文件部分**（transition tests 保留——測試才是防回歸的那一半）。
2. 捨棄 **M3 的索引持久化**（FSA handle 存 IndexedDB），每次重選目錄。
3. 捨棄 **M3 的分類徽章與篩選**（D4），清單只做「可讀標題 + 正確 subagent 歸併」。
4. 捨棄 **M4**（阻斷面統一），六個表面維持現狀並記為債。
5. **保底不可捨**：M1（型別完整性）+ M2（載入不再整批失敗、fatal 才彈窗）。這兩張卡直接對應作者回報的問題 1 與問題 2，捨棄即等於本輪沒解決問題。

---

## §7 待決問題

1. ~~**Codex 來源的索引**~~ — **已裁決（作者，2026-07-27）：本輪不做 Codex 索引。** 理由：Codex 格式的異常狀態過多，上一輪的問題即源於此。`SessionIndexEntry` 仍保留來源無關的欄位設計（`source: SourceId`），但 M3 的索引器只掃 Claude Code；Codex 檔案若出現在目錄中，索引為 `unknown` 並排除於清單之外，**不猜測**。既有的「單檔載入」路徑對 Codex 不受影響，仍可正常使用。
2. **`prLinks` 的呈現面**：M1 會把它收進 `SessionMeta`，但本輪沒有卡片消費它。先只存不顯示，還是順手在總覽加一行？
3. **`compact_boundary` 之前的內容**：標記卡會說「此處之前已被摘要取代」，但如果同一 session 有 2 次壓縮，是否要在 Session Map 上把它畫成分段邊界？屬地圖層設計，本輪未納入。
