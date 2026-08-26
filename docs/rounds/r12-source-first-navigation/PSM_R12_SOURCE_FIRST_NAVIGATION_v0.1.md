# PSM R12 — 來源優先導覽 (source-first navigation)

- **輪次 id**：`r12-source-first-navigation`（分配於 2026-08-26；`docs/rounds/` 查無衝突）
- **分支**：`feat/r12-source-first-navigation`
- **前置**：[`RCA_R11.2_WORKER_BOUNDARY_2026-08-26.md`](../r11.2-uat-repairs/RCA_R11.2_WORKER_BOUNDARY_2026-08-26.md) ·
  [`REVIEW_R11.2_STATE_AND_DESIGN_2026-08-20.md`](../r11.2-uat-repairs/REVIEW_R11.2_STATE_AND_DESIGN_2026-08-20.md) §4
- **狀態**：規格待施工

---

## 0　這一輪要解決什麼（作者裁定 2026-08-26）

> 分兩套搜尋系統（搜尋階段分開，但檢視時回到同一套系統）。明確說明只支援 Codex 跟 Claude，
> 然後把目前的「從對話集選擇」和「單開對話」放到二級選單，一級選單先讓使用者選到底要讀哪套
> agent 系統，然後個別對路徑和不同的資訊欄位（例如 metadata）做適配，從設計上解決一直以來
> 我們兩邊無法用同一套系統完善目的的狀況。

這不是修 B1，是把 B1 的**成因**拿掉。B1（標題全是雜訊）只是這個結構問題最顯眼的出口。

---

## 1　根因：同一個缺陷，第二次發生

**R10-B（2026-08-11）已經踩過一次。** 當時 `denoise()` / `distill()` 拿 Claude Code 的工具名
去比對所有來源，於是同一段作業在 Codex 側產出「零支線、零群組、零 error 標籤」。修法是引入
`SourceProfile`（`src/core/source/profiles.ts`），讓來源自己描述自己。

**R11.2 B1 是同一個缺陷，換一層。** `sessionIndexer.ts:279` 的 `pickTitle` 是一道梯子：

| 階 | 訊號 | 誰有 |
|---|---|---|
| 1 | `custom-title` 記錄 → `titleSource: "custom"` | 只有 Claude Code |
| 2 | `ai-title` 記錄 → `"ai"` | 只有 Claude Code |
| 3 | 第一則真人訊息前 90 字 → `"derived"` | 兩者皆可，但對 Codex 是**唯一** |
| 4 | 檔名 → `"filename"` | Codex 144 筆 |

前兩階是 Claude Code 的記錄型別，Codex 兩個都沒有，所以 358 個 session 全數摔到第 3、4 階。
`classifySession` 也一樣：`codex-unclassified` 這個判定值之所以存在，正是因為
`hasAgentId` / `allSidechain` / `humanTurnCount` 讀的是 Claude Code 的欄位名。

**為什麼教訓沒有轉移**：R10-B 的 profile 只覆蓋**渲染**（denoise/distill）。**探索**
（indexing / classification / title）沒有納入，而且沒有任何東西讓「來源差異必須走 profile」
成為資產的性質——它只存在於當時那個修法的記憶裡。第三次還會發生，除非這一輪把它變成型別。

### 1.1　連帶查到的事實（實測，非推論）

- Codex 的 rollout 檔**沒有** title 欄位。全語料 542 筆 `session_meta` 逐欄位統計確認。
- `event_msg/thread_goal_updated` 的 `goal.objective` 存在，但全語料**只有 10 筆**，不是通用來源。
- `user_message.text_elements` 在取樣的 80 個檔案中為空，不是可用訊號。
- **Codex 的「對話目的」在檔案之外**：`~/.codex/.codex-global-state.json`
  → `electron-persisted-atom-state` → **`thread-descriptions-v1`**，以 thread id 為鍵。
  例：`019f4cf8-452d-77a1-…` → 「將 Claude 規則內容移植到 Codex 環境並調整 CLAUDE.MD 與 hook 相關字眼」。
- **連結是乾淨的**：61 / 61 筆 description 都能經由 rollout 的 `session_meta.payload.id`
  對上磁碟檔案。**覆蓋率 61 / 358 = 17%**。

第二點決定了整個架構：**Codex 的 metadata 不在逐字稿裡，而在同一層的側車檔 (sidecar)**。
DIT 現行模型假設「逐字稿自我描述」，這對 Claude Code 成立、對 Codex 不成立。這也是為什麼
根目錄必須取 `~/.codex` 而不是 `~/.codex/sessions`——瀏覽器讀不到已選目錄的父層。

---

## 2　設計：一級選來源，二級選模式

| 層級 | 內容 | 為什麼在這一層 |
|---|---|---|
| 一級 | **Claude Code** / **Codex**（明列，只有這兩個） | 來源一旦已知，路徑、metadata、標題、分類全部可以查表，不必從內容猜 |
| 二級 | 從對話集選擇 / 單開對話 | 既有的兩個模式原樣保留，只是被移到來源之下 |
| 之後 | 索引 → 挑選 → 檢視 | **檢視層收斂**：`SessionDocument` 契約不變，view 層不得有來源分支 |

分岔只發生在**探索**，會合發生在**檢視**。這正是作者裁定的形狀，也是它能同時解決標題、分類、
路徑三件事的原因——它們全都是探索階段的問題。

---

## 3　Architecture

`SourceProfile` gains a **discovery half** beside the existing render half. Two sources become
two rows of data in one table, never two parallel code paths — a second code path is how this
defect returns a third time.

```
SourceProfile (src/core/source/profiles.ts)
├── render   … existing, untouched by this round (denoise / distill, R10-B)
└── discovery … NEW
    ├── rootHint       where to point the user, and what that root contains
    ├── transcripts    how to find transcript files beneath the root
    ├── sidecars       metadata that lives OUTSIDE the transcripts, and how to key it
    ├── titleLadder    ordered rungs, per source — replaces the one hard-coded ladder
    └── classify       which signals this source actually carries
```

The registry must be a **typed exhaustive record over `SourceId`**, so adding a third source
fails to compile until its discovery half is filled in. That is what makes the R10-B lesson a
property of the asset rather than a thing someone has to remember.

---

## 4　Work cards

### M1 — Give `SourceProfile` a discovery half (foundation; ship even if everything else is cut)

Add the `discovery` section to `src/core/source/profiles.ts` as an exhaustive
`Record<SourceId, SourceDiscovery>`. Data only in this card: no call site changes, no behaviour
change. The render half is not touched.

- Claude Code: root `~/.claude/projects`, transcripts `**/*.jsonl`, sidecars none,
  title ladder `custom → ai → derived → filename`.
- Codex: root `~/.codex`, transcripts `sessions/**/rollout-*.jsonl`, sidecar
  `.codex-global-state.json` at the root keyed by `session_meta.payload.id`,
  title ladder `sidecar → derived → filename`.

**Files**: `src/core/source/profiles.ts`, `src/types/spanTree.ts` (if `TitleSource` gains `sidecar`).
**Acceptance**: `profileFor("claude-code").discovery` and `profileFor("codex").discovery` both
resolve; a deliberately added third `SourceId` fails `tsc` until its row exists — demonstrate
this once in the PR body, then revert the probe. A registry that cannot fail this way has not
made the rule structural.

### M2 — Source-first navigation

First level picks the agent system and names the two supported systems explicitly. The two
existing entry points move under it unchanged.

- `SessionLoadActions.tsx` renders the level-1 choice; the current folder/file buttons become
  level 2 and are unreachable until a source is chosen.
- The chosen `SourceId` is carried into indexing and single-file loading, replacing
  `detectAdapter`'s role as the PRIMARY mechanism. Detection stays as a **verification** step:
  if the picked source and the file's actual shape disagree, say so by name.

**Files**: `src/components/SessionLoadActions.tsx`, `src/i18n/locales.ts`, `src/store/sessionStore.ts`.
**Acceptance**: from a cold start, a folder pick cannot be reached without a source choice; the
choice survives a reload the same way the directory handle does, or honestly does not (no
pretending). A mismatch between the chosen source and the file content produces a named
diagnostic, never a silent reinterpretation.

### M3 — Per-source root and path adaptation

The indexer walks per `discovery.transcripts` instead of one hard-coded shape.

- Picking the Codex root indexes `sessions/**/rollout-*.jsonl`.
- Picking the Claude root indexes `projects/**/*.jsonl` (current behaviour).
- Neither scans the other's shape.

Accept BOTH `~/.codex` and `~/.codex/sessions` for the Codex pick, because the second is the
existing habit — but when the user picks `sessions/` say plainly, in the UI, that titles will be
unavailable because the sidecar is one level up, and offer to re-pick. A degradation the user
can act on beats a silent worse result.

**Files**: `src/core/index/sessionIndexer.ts`, the directory source in `src/store/sessionStore.ts`.
**Acceptance**: both picks index the same 358 sessions; only the root pick reports sidecar
titles; the `sessions/`-pick path prints the named degradation. Paste the counts.

### M4 — Per-source title ladder, and the Codex sidecar (highest value)

`pickTitle` stops being one ladder with Claude-only rungs and walks `discovery.titleLadder`.
Add the sidecar reader: parse `.codex-global-state.json` →
`electron-persisted-atom-state["thread-descriptions-v1"]`, key by `session_meta.payload.id`.

The sidecar is a **named degradation source**, not a silent fallback: a title that came from it
carries `titleSource: "sidecar"` and gets its own affordance in the list, exactly as
`"filename"` does today.

**Files**: `src/core/index/sessionIndexer.ts`, a new sidecar reader under `src/core/index/`,
`src/core/index/contracts.ts`, `src/i18n/diagnosticCopy.ts`.
**Acceptance**: two-sided and MEASURED, not asserted. With the Codex root picked, print the
counts — expect **61 sidecar / 297 derived-or-filename** on the author's corpus, and state the
number the run actually produced beside the expected one. A session with no description must
fall through to the next rung, never error. The sidecar file being absent or malformed must
degrade to today's behaviour with a named diagnostic, not fail the index.

### M5 — Classification declares its own signals

`classifySession` reads `discovery.classify` instead of Claude Code field names. The
`codex-unclassified` verdict exists only because Claude signals were applied to Codex; with the
source known up front, each profile says which signals it actually carries.

**Files**: `src/core/index/classifySession.ts`, `src/core/index/contracts.ts`.
**Acceptance**: the `無法判定` count for a Codex root is explainable from the profile rather
than being a side effect of reading absent fields. If the honest answer for some Codex sessions
is still "cannot tell", that is fine — it must be *because the signal is absent*, not because
the wrong signal was read. Do NOT delete `codex-unclassified` to make a number look better.

### M6 — Viewing converges (guard card)

No view-layer change is expected; this card exists to prove the split stayed in discovery.

**Acceptance**: no source-conditional branch is added under `src/components/`; a Claude session
and a Codex session opened from their own roots render through the same components; the
`SessionDocument` contract is unchanged. Verify by grep and by opening one of each.

---

## 5　不變量 (invariants)

- **INV-R12-1**：來源差異一律經由 `SourceProfile`。任何 `if (source === …)` 出現在 profile
  以外的檔案都是缺陷，不是風格問題。這是 R10-B 教訓的資產化。
- **INV-R12-2**：探索可以分岔，檢視必須收斂。`src/components/` 下不得出現來源分支。
- **INV-R12-3**：側車缺席、損毀、或對不上 id，一律降級到下一階並留下具名 diagnostic；
  絕不讓索引失敗，也絕不靜默假裝有標題。
- **INV-R12-4**：`SourceId` 的 discovery 表必須是窮舉型別。新增第三個來源時編譯失敗，是設計。

---

## 6　非目標與降級順序

**非目標**：

- **不做** LLM 濃縮補剩下 83% 的無標題 session。那是獨立的一輪（它同時能救 Claude Code
  那些沒有 `ai-title` 的舊 session），而且牽涉跑模型的成本與隱私裁定。
- 不碰 F-05（前言剝除白名單）與 F-06（匿名化漏遮壓平路徑）。F-05 在 M4 之後價值會下降，
  因為 `derived` 從「唯一來源」退回「後備」——**做完 M4 再重新評估它值不值得修**。
- 不碰 R11.2 其餘未結項。

**降級順序**：**M1 → M2 → M3 → M4 → M5 → M6**，保底 **M1 + M2**。

理由：M1+M2 是骨架與導覽，做完就算後面全部延後，結構問題也已經被關起來（來源已知、
profile 已窮舉），不會再長出第三次同類缺陷。**M4 是價值最高的一張**（它是使用者實際看到的
改變），但它依賴 M1 的表與 M3 的根目錄，插隊做不了。M5、M6 是把地基掃乾淨，可以延到下一輪。

---

## 7　待裁決

1. **來源選擇要不要記住？** 目錄 handle 已經會被記住（在瀏覽器允許的範圍內）。來源選擇跟著記
   會少一次點擊，但也會讓「我上次看的是哪一套」變成隱藏狀態。記或不記都合理，這是你的判斷。
2. **17% 夠不夠構成 M4 的驗收通過？** 我的立場是夠：它把「完全沒有目的性標題」變成
   「六分之一有、而且看得出來是哪六分之一」，而剩下的要靠獨立的 LLM 那輪。但如果你認為
   驗收門檻應該是「大多數 session 有可讀標題」，那 M4 就必須跟 LLM 那輪綁在一起出貨。
