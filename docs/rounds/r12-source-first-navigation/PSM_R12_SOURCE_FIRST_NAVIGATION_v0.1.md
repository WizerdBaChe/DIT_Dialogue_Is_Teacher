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

**權重裁定（2026-08-26，追加）**：

> 以我個人使用優先的話 Claude Code 適配到最高程度就很夠了，Codex 是順便。
> 大多數沒定義好都是 session 本身的鍋。

兩個來源**不對稱**。Claude Code 是主目標，要把它提供的 metadata 吃到滿；Codex 只要
「結構上被正確對待、能用、標題有就有」即可。這條裁定重排了下面的施工順序：Claude 的深度
適配（M4）排在 Codex 側車（M5）之前，而且 M5 明列為可延。

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

**BUILT 2026-08-26** — `src/core/source/profiles.ts`, `src/types/spanTree.ts`,
`src/core/index/contracts.ts`, `src/core/source/profiles.discovery.test.ts`. Three deltas
against the card, each with a reason:

1. `TitleSource` lives in `core/index/contracts.ts`, not `types/spanTree.ts` as this card
   guessed. It was MOVED to `types/spanTree.ts` (re-exported from its old home, so no call site
   changed) because the ladder's ORDER is now declared in `core/source/` and EXECUTED in
   `core/index/` — sibling slices that must not import each other, so the shared vocabulary has
   to sit below both.
2. **`TitleSource` did NOT gain `sidecar`, and Codex's ladder is `derived → filename`, not
   `sidecar → derived → filename`.** Declaring a rung before M5 writes the code that produces it
   is the `paste` SourceId / `milestone` span mistake for the third time — the type declares it,
   nothing emits it, the UI lists it anyway. M5 adds the rung and its producer in one card. The
   sidecar SPEC is here (path, `recordsAt`, `joinKey`) so M5 has a contract; only the ladder rung
   waits.
3. The acceptance probe found something the card did not anticipate. Adding a third `SourceId`
   fails `tsc` in exactly two places, both inside `profiles.ts` — and **the rest of `src/`
   compiles clean**, which is not the invariant holding. Three real source branches
   (`classifySession.ts:126`, `:143`, `sessionIndexer.ts:363`) fall silently past a new source
   instead of failing. M1 therefore DECLARES INV-R12-1; **M6 and M7 are what make it true**, and
   `sessionIndexer.ts:363` (`subagentPaths` computed only for `claude-code`) is discovery work
   that had not been assigned to a card — it goes to M7.

Gates: `typecheck` clean · `test` 524/524 (59 files) · `build` two-stage clean ·
`check:rounds` OK. Not browser-verifiable by construction: data only, zero call sites.
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

**Per-source position memory (author ruling 2026-08-26).** Do not remember "the last folder".
Remember one directory handle **per `SourceId`**, so the two systems never overwrite each
other's position, and pair it with the profile's `rootHint` so the level-1 choice actively helps
the user land in the right place instead of only recording that they chose. Picking Claude Code
returns to the Claude root; picking Codex returns to the Codex root; a first-time pick for one
source leaves the other's memory untouched.

**Files**: `src/components/SessionLoadActions.tsx`, `src/i18n/locales.ts`, `src/store/sessionStore.ts`,
the handle store behind `resumeLastDirectory` (keyed by source rather than singular).
**Acceptance**: from a cold start, a folder pick cannot be reached without a source choice.
Pick a folder as Claude Code, then pick a different one as Codex, then return to Claude Code —
the Claude position must be the first folder, not the second. Where the browser refuses to
persist a handle, `INDEX_HANDLE_NOT_PERSISTED` still fires per source and does not pretend.
A mismatch between the chosen source and the file content produces a named diagnostic, never a
silent reinterpretation.

**BUILT 2026-08-26** — `SessionLoadActions.tsx` (+ its test), `handleRepository.ts` (+ a new
test), `sessionIndexer.ts` (+ tests), `sessionStore.ts`, `locales.ts`, `diagnostics/contracts.ts`,
`i18n/diagnosticCopy.ts`, `core/index/index.ts`, `core/source/profiles.ts`, `styles/index.css`.

Delivered: the level-1 gate (level 2 is **absent**, not disabled — a button you cannot press
still invites you to press it), per-`SourceId` directory memory, and index-time verification.
`SUPPORTED_SOURCES` is derived from `PROFILES` so the supported list cannot drift from the
registry, and its ORDER carries the Claude-Code-first ruling (pinned by a test).

Four things worth carrying forward:

1. **Carrying the chosen source into single-file loading is deferred to M3.** The ingest layer
   has no `sourceId` anywhere — not in `loadFromBlobs`, not in the worker message contract —
   so it is a protocol change, which is exactly M3's "per-source path adaptation". M2 delivers
   the other half of that bullet (indexing) in full.
2. **The pre-R12 single remembered folder is discarded, not migrated, and it says so**
   (`INDEX_HANDLE_SOURCE_SPLIT`). Nothing recorded which system it belonged to and after R11
   WC-1.2 both harnesses can appear in one folder, so there is nothing to infer from. Guessing
   sends the user to the other harness's directory; silence looks like the app lost a setting.
3. **`expectSource` does not undo R11 WC-1.2.** Without it, behaviour is unchanged; with it, an
   unresolved source (`null`, head scan unusable) is still KEPT — only a file that resolves to
   the *other* harness is skipped, counted, and reported. "Could not read enough to ask" and
   "read it, it says the other one" stay different facts. Four tests pin this, both directions.
4. **The source buttons had no accessible name** — name-from-content did not compute across the
   two nested spans, so a screen reader got "button". Found by reading the a11y tree in the real
   build, not by any test; fixed with an explicit `aria-label` that also stops the label running
   into the path with no separator.

Gates: `typecheck` clean · `test` 542/542 (60 files) · `build` two-stage clean ·
`check:rounds` OK. Browser-verified against `npm run preview` by DOM read, not pixels: level 1
offers two choices and zero load entries; choosing Claude Code yields `data-level="2"`,
`data-source="claude-code"`, root hint `~/.claude/projects`, and exactly the two load entries in
the R9.1 F1 order; going back returns to level 1 with both choices. **Appearance is NOT verified**
— the pane reports `visibilityState: "hidden"`, and layout/legibility is a by-eye item.

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

**BUILT 2026-08-26** — `sessionIndexer.ts` (+ tests), `sessionStore.ts`,
`diagnostics/contracts.ts`, `i18n/diagnosticCopy.ts`.

**Measured on the real corpus** (`~/.codex`, 2026-08-26), which is what the card asked for:

| pick | files walked | `.jsonl` | `rollout-*` | excluded by name | sidecar |
|---|---|---|---|---|---|
| `~/.codex` | 9,699 | 361 | **358** | 3 | REACHABLE |
| `~/.codex/sessions` | 358 | 358 | **358** | 0 | out of reach |

Same 358 either way, and the sidecar difference is the only difference — exactly the card's
prediction. The Codex pattern also means a Claude Code pick's files are never opened at all.

Three things the measurement changed, none of which were visible from the unit tests:

1. **Those 3 excluded-by-name files are Codex's own** — `session_index.jsonl`,
   `transcription-history.jsonl`, and a plugin fixture. I had folded name-exclusions into
   `INDEX_SOURCE_MISMATCH` ("these do not belong to the system you chose"), which would have
   fired a false warn on **every** Codex root pick. Split into `INDEX_NOT_TRANSCRIPT` (info).
2. **The copy then had to narrow again.** A name can tell us "not one of THIS source's records";
   it cannot tell us whether the file is the other harness's transcript or not a conversation at
   all. The first wording said "not conversation records (a tool's own index, for example)",
   which is false for a Claude transcript sitting in a Codex folder. It now claims only what the
   name determines. Three layers, three different claims: `.jsonl` baseline (silent, never a
   candidate) → name (info) → content (warn, actionable).
3. **Load-path verification does NOT override the file.** M2's `expectSource` governs indexing
   because the question there is *where to look*. On load the file is already in hand and the
   adapter has read it, so content wins and `LOAD_SOURCE_MISMATCH` only says so — re-reading a
   Codex rollout as Claude Code would just grow a wrong tree. This is the piece M2 deferred here;
   it needed no worker-protocol change after all, only a check after the document is built.

**KNOWN GAP, blocks M5**: a Codex entry's `id` is its filename. `absorb()` only reads Claude
Code's `record.sessionId`; Codex self-reports at `session_meta.payload.id` and nothing looks
there, so "we did not look" is being recorded as "it is missing". M5's sidecar join uses exactly
that key, so it must be fixed there, with the join. Pinned by a test so it is a recorded fact
rather than a surprise.

**Not verifiable yet**: the card's "only the root pick reports sidecar titles". Nothing reads the
sidecar until M5, so what M3 can prove is *reachability* — the diagnostic fires on the
`sessions/` pick and not on the root pick — and the copy is worded to claim only that.

Gates: `typecheck` clean · `test` 556/556 (60 files) · `build` two-stage clean · `check:rounds` OK.

### M4 — Claude Code: consume the metadata it already ships (priority card)

Measured 2026-08-26 over a 200-file sample of the 522 files in `~/.claude/projects`. The
adapter currently reads `customTitle`, `aiTitle`, `cwd`, `isSidechain`, `parentUuid`,
`attachment`, `mode`. These are present in the corpus and referenced **nowhere in `src/`**:

| Field | Records | What it would give DIT |
|---|---|---|
| `attributionSkill` / `attributionAgent` / `attributionMcpServer` / `attributionMcpTool` | ~13,000 | Which skill, subagent or MCP tool produced a step |
| `toolUseResult` | 17,686 | The structured tool result beside the rendered `tool_result` text |
| `gitBranch` | 66,524 (68 distinct) | Real branch context, per record |
| `entrypoint` | 66,524 (`claude-desktop` 46,669 / `cli` 58) | How the session was started |
| `leafUuid` + `lastPrompt` (`last-prompt`, 4,523 records) | 4,523 | The conversation's branch pointer |

**Ruled OUT by measurement — do not spend time on it**: `slug` (24,108 records) is a random
codename; every record in a session shares one value such as `virtual-painting-aho`. It is an
id, not a purpose, and must never be offered as a title.

**Attribution is this card's centre of gravity.** The product is called Dialogue Is Teacher, and
"this step came from the `workflow-checkpoint` skill" / "this was done by the
`backend-architect` subagent" is teaching content that already sits in the file, already
labelled, and is thrown away today. Everything else in the table is context; this one is the
product.

Scope by value, not by completeness: attribution first, then `gitBranch` + `cwd` as project
context — which also sidesteps the folder-name decoding that F-06's masking bug lives in — then
`entrypoint`. `toolUseResult` and `leafUuid` are named here so they are not rediscovered from
scratch later; they may become their own card.

**Files**: `src/core/adapters/claudeCodeJsonl.ts`, `src/types/spanTree.ts`,
`src/core/source/profiles.ts` (these fields belong to the Claude profile, never to shared code),
plus whichever view surfaces attribution.
**Acceptance**: attribution reaches the rendered span for the records that carry it, and is
ABSENT rather than guessed for those that do not — print both counts against the author's
corpus. INV-R12-2 still holds: this is Claude-specific data reaching a source-agnostic viewer
*through the profile*, so no `if (source === "claude-code")` may appear under `src/components/`.

**BUILT 2026-08-26** — confirmation first:
[`RESEARCH_R12_CLAUDE_METADATA_2026-08-26.md`](RESEARCH_R12_CLAUDE_METADATA_2026-08-26.md)
(full corpus, 525 files / 208,527 records, replacing this card's 200-file sample). Then
`types/spanTree.ts`, `adapters/types.ts`, `adapters/claudeCodeJsonl.ts`, `normalize/normalizer.ts`,
`source/profiles.ts`, `components/parts.tsx`, `i18n/locales.ts`, `styles/index.css`, plus three
test files.

**Acceptance, measured by running the shipped pipeline over the author's corpus** — both counts,
as the card required:

| | |
|---|---|
| sessions parsed | **285**, 0 failed |
| sessions WITH attribution | **159 (55.8%)** |
| sessions WITHOUT | 126 (44.2%) |
| spans total | **91,229** |
| spans WITH attribution | **15,764 (17.3%)** |
| spans WITHOUT — absent, not guessed | **75,465 (82.7%)** |
| by kind | subagent 5,134 · skill 4,323 · mcp-tool 7,022 · **85 distinct names** |

INV-R12-2 is now enforced, not asserted: `components/sourceAgnostic.test.ts` globs every file
under `src/components/` and fails on any `source === "claude-code"`-shaped comparison. It ships
with two controls — a known-bad string must trip the pattern, and the glob must match >20 files,
so a glob that silently matched nothing cannot pass vacuously.

Design decisions that came from the measurement rather than from taste:

1. **`attribution` is a source-agnostic array on the span, not Claude fields plumbed downward.**
   `RawEvent` states it "knows no source format"; `attributionSkill` would have broken that. The
   array is measured, not defensive: skill+agent co-occur on 646 records.
2. **The profile declares `attribution.kinds`, and Codex's is `[]`.** That is what lets the view
   distinguish "this step was not labelled" from "this system never labels steps" without
   knowing which source it is rendering. Same shape as `classify.signals: []`.
3. **Half an MCP pair is refused.** server and tool are never apart in the corpus (8,629 / 0 / 0),
   so a half pair means an unmeasured shape — say nothing rather than name a tool after a server.
4. **`attributionAgent` is read even though `isSidechain` already flags those records.** The flag
   says "a subagent"; the field says *which* — that is the entire addition, so the existing group
   gets a name instead of a new layer beside it.
5. **`entrypoint` dropped by measurement**: 2 distinct values, 99.88% `claude-desktop`.

**A wrong number I nearly published**: the first acceptance run reported 228/513 files failing
and *zero* subagent attributions. Both were artifacts of the measurement loading each file alone,
where a `subagents/*.jsonl` file is `NO_MAIN_TRANSCRIPT` by design. Grouping main + subagents the
way `loadIndexEntry` does gives 0 failures and 5,134 subagent attributions. The instrument was
broken, not the code — and a 0 that agrees with a plausible story ("subagent spans get dropped")
is exactly the false negative worth re-checking before believing.

**Not browser-verified**: the built-in sample is synthetic and carries no attribution, so the
badge cannot appear without a real folder pick. The view half is covered by
`components/attributionBadges.test.tsx` under jsdom instead; appearance stays a by-eye item.

Gates: `typecheck` clean · `test` 575/575 (63 files) · `build` two-stage clean · `check:rounds` OK.

### M5 — Per-source title ladder, and the Codex sidecar (incidental; deferrable)

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

**BUILT 2026-08-26** — confirmation first:
[`RESEARCH_R12_CODEX_SIDECAR_2026-08-26.md`](RESEARCH_R12_CODEX_SIDECAR_2026-08-26.md). Then
`core/index/sidecarReader.ts` (new, + tests), `core/index/sessionIndexer.ts` (+ tests),
`core/source/profiles.ts`, `types/spanTree.ts`, `diagnostics/contracts.ts`,
`i18n/diagnosticCopy.ts`, `i18n/locales.ts`, `styles/index.css`.

**Acceptance, run against the real `~/.codex` with the shipped indexer** — expected beside
actual, as the card required:

```
EXPECTED (from the research doc): 61 sidecar / 297 derived-or-filename
ACTUAL:                           61 sidecar / 297 other          match: YES

files listed 9,699 · entries indexed 358
by rung: sidecar 61 · derived 174 · filename 123
entries whose id is still a filename: 0        ← DW-18 closed
diagnostics: INDEX_NOT_TRANSCRIPT(3), INDEX_TITLE_FROM_FILENAME(123)
```

Sample titles now shown where an excerpt of the first message used to be: 「Prism R9 實驗設計對齊、
階段偏移與錯誤的文件化獨立審查」,「調查 GPT 5.6 Luna max subagent 可用性判定、官方文件與實際
使用權限差異」.

**The finding that mattered most, which the card does not mention.** `session_meta.payload`
carries TWO id fields, both on all 358 rollouts, disagreeing on 135 — exactly the ones with
`parent_thread_id`. Those are forked threads: `id` is the thread's own, `session_id` is the
conversation it came from.

| join key | hits | wrong |
|---|---|---|
| `payload.id` (used) | 61 | **0** |
| `payload.session_id` | 190 | **129 — the parent's description** |
| forked threads with a description of their own | 0 | — |

`session_id` scores 17% → 53% coverage and is wrong 129 times, with no visible tell: a fluent
title, roughly related to the content. **Optimising for coverage would have shipped the
wrong-target defect disguised as a better number.** A test pins the correct key precisely so a
future "let's raise coverage" change fails instead of looking like an improvement.

Also settled: M1's flagged unknown — `electron-persisted-atom-state` is a plain object, no second
parse, and the description values are plain strings, not objects with a `.description` field.

Recorded, deliberately NOT built: showing a fork its parent's description. It would need its own
ladder rung and an on-screen "inherited from the parent conversation", or it simply *is* the bug
above. That is a product ruling, not the implementer's.

Two guards behaved as designed rather than being worked around: adding the `sidecar` rung failed
`tsc` at `t.browser.titleSources[...]` until the copy existed, and M1's "no rung nothing can
produce" test failed until the producer shipped in this same change — which is the only
circumstance in which growing that set is legitimate.

Gates: `typecheck` clean · `test` 593/593 (64 files) · `build` two-stage clean · `check:rounds` OK.
**Not browser-verified**: seeing this needs a real `~/.codex` folder pick; by-eye item.

### M6 — Classification declares its own signals

`classifySession` reads `discovery.classify` instead of Claude Code field names. The
`codex-unclassified` verdict exists only because Claude signals were applied to Codex; with the
source known up front, each profile says which signals it actually carries.

**Files**: `src/core/index/classifySession.ts`, `src/core/index/contracts.ts`.
**Acceptance**: the `無法判定` count for a Codex root is explainable from the profile rather
than being a side effect of reading absent fields. If the honest answer for some Codex sessions
is still "cannot tell", that is fine — it must be *because the signal is absent*, not because
the wrong signal was read. Do NOT delete `codex-unclassified` to make a number look better.

**Added 2026-08-26 after third-party review — the acceptance clause that makes INV-R12-1 real,
rather than declared for a third time.** Making the signal LIST data-driven is not enough: the
dispatch is a chain of `if (source === …)` ending in a catch-all, so a third `SourceId` will not
fail `tsc` — it will fall through and be labelled `codex-unclassified`, a reason code naming the
wrong source. The exhaustive-`Record` mechanism protects data tables, not branch dispatch.

So M6 must additionally satisfy: **adding a third `SourceId` makes `classifySession` fail to
compile.** The cheap way is an exhaustiveness assertion after the last branch
(`const _exhaustive: never = input.source;`) — no rule engine required, and no rewriting two
genuinely different rule shapes into one table. Demonstrate the failure once, then revert the
probe, the same way M1 did.

Do not take this as a reason to merge the two dispatches: Claude Code runs four rules and Codex
runs two of a different shape. They are not one rule set over different signals, and pretending
otherwise would cost more than it buys.

**BUILT 2026-08-26** — confirmation first:
[`RESEARCH_R12_CLASSIFY_SIGNALS_2026-08-26.md`](RESEARCH_R12_CLASSIFY_SIGNALS_2026-08-26.md).
Then `core/index/classifySession.ts` (+ tests), `core/source/profiles.ts`,
`core/source/profiles.discovery.test.ts`.

**The card's premise had expired, and M1 had written a false line.** Both found by measuring,
not by reading:

1. M6 asks for the `無法判定` count to be explainable from the profile. Measured with the shipped
   indexer: **`codex-unclassified` fires 0 times** on 346 real rollouts. R11.2 R1 already removed
   it. There was no batch of bad verdicts left to explain, so the card's value moved rather than
   vanished — to making the declaration true and the dispatch checkable.
2. **M1's `classify: { signals: [] }` for Codex was false.** `classifySession` has read two Codex
   signals since R11.2 R1 and classifies 346/346. M1's comment reasoned that R11.2 R1 measured
   the human-turn count as near-informationless here — a claim about the signal's VALUE, written
   as if it were about its EXISTENCE. Implementing the card literally against that row would have
   taken a module with zero regressions and made it classify nothing for Codex.

**Zero regression, cell for cell**, which is this card's real acceptance:

| | before | after |
|---|---|---|
| `~/.claude/projects` | 287 · dialogue 287 · has-human-prompt 287 | **identical** |
| `~/.codex` | 346 · dialogue 344 + machine 2 | **identical** |

**INV-R12-1's dispatch gap is closed.** The third-source probe now fails in **three** places, up
from M1's two — `classifySession.ts` joins the two profile tables:

```
classifySession.ts(187,9): Type '"probe-third-source"' is not assignable to type 'never'
profiles.ts(241,7):        Property '"probe-third-source"' is missing in Record<SourceId, SourceDiscovery>
profiles.ts(290,7):        Property '"probe-third-source"' is missing in Record<SourceId, SourceProfile>
```

Scope held to what the architectural review recommended: only *which signals apply* is
data-driven. The rules stay written per source, because Claude Code runs four and Codex two of a
different shape — they are not one rule set over different signals. Rule 11's catch-all also
stops borrowing `codex-unclassified`, which labelled an unknown third source with the wrong
source's name; rule 8 keeps it, where it is accurate.

Guarded behaviourally, not just by types: a test asserts a Codex machine run still classifies as
`machine`. A type check cannot notice a signal list that is merely *wrong* — only behaviour can,
which is exactly how M1's row survived.

Gates: `typecheck` clean · `test` 597/597 (64 files) · `build` two-stage clean · `check:rounds` OK.

### M7 — Viewing converges (guard card)

No view-layer change is expected; this card exists to prove the split stayed in discovery.

**Acceptance**: no source-conditional branch is added under `src/components/`; a Claude session
and a Codex session opened from their own roots render through the same components; the
`SessionDocument` contract is unchanged. Verify by grep and by opening one of each.

**Updated 2026-08-26.** The grep half is already automated and stricter than this card assumed —
`src/components/sourceAgnostic.test.ts` fails on **any source id written under
`src/components/`**, not merely on a comparison, so it cannot be evaded by a `switch` or a lookup
table. What M7 still owes is the other half:

- `sessionIndexer.ts`'s `subagentPaths` ternary (`source === "claude-code" ? … : []`) moves into
  `discovery` as a new field, inheriting that table's exhaustiveness. This is discovery work —
  "which files belong to this session" is a property of the harness's layout — and it had not
  been assigned to a card before M1's probe found it failing silently.
- After that, `src/` outside `core/source/profiles.ts` and the per-source adapters must hold no
  `source === …` at all. That is the point at which INV-R12-1 stops being an aspiration.

**BUILT 2026-08-26 — round complete.** `core/source/profiles.ts`, `core/index/sessionIndexer.ts`,
`core/normalize/normalizer.ts`, plus `core/source/sourceKnowledge.test.ts` (new) and two test
files extended.

1. **`subagentPaths` moved into the profile** as `discovery.subagents`
   (`{ siblingDir: "subagents" }` for Claude Code, `null` for Codex). It was the ternary M1's
   probe found failing silently — a third source got `[]` with nothing to notice. A missing row
   now fails to compile.

2. **A silent `?? "claude-code"` was hiding in the normalizer.** `finalizeMeta` defaulted an
   undetermined `source` to Claude Code without calling `reportFallback`, while the `id` default
   directly beside it always has. CLAUDE.md's invariant had a hole in the one place it mattered
   most: `source` selects the profile, and the profile drives denoise tool names, the title
   ladder and attribution kinds — one wrong guess and the entire render path is wrong with
   nothing visible to say so. It is unreachable today (both adapters set it), which is precisely
   what F-01/F-02 said about the sync pipeline a week before it became reachable. Now audible,
   with a test both ways.

3. **INV-R12-1 restated as a property, and enforced across all of `src/`.** The old wording —
   "no `if (source === …)` outside the profile" — names a syntax, the same mistake the view
   gate's first regex made. Two things legitimately know a source: a module that IS per-source
   (an adapter can only ever be its own harness), and an exhaustively guarded dispatch (adding a
   `SourceId` fails to compile, which is the invariant's actual purpose). `sourceKnowledge.test.ts`
   holds an allow-list with **a written reason per entry**, so a new file naming a source fails
   until someone justifies it. Comments are exempt — explaining history is not branching on it.
   Verified non-vacuous by inserting a literal into a non-listed file and watching it fire.

The gate also refuses to let its own allow-list rot: an entry whose file no longer names a
source fails, so the list cannot become permanent permission for code that has since been cleaned.

---

### M8 — Close the three coverage gaps the round's own audit found (added 2026-08-27)

**This card was added after Phase 18 checkpointed M1–M7 as built.** It is written here rather than
in a later round because it is R12's own verification debt, raised by R12's evidence audit, on
R12's branch, before R12 is accepted — the same route DW-02 and DW-18 took into this round. The
date is stated so a post-mortem reads the sequence correctly and does not mistake it for original
scope.

Three modules the audit named (`docs/DEFERRED.md` DW-19/20/21): `core/index/directorySource.ts`
and `core/ingest/session.worker.ts` had no tests at all, and M2's per-source folder memory had
tests at both ends and none across the store wiring that joins them. Premises, the coverage
measurement and its own miscalibration: `RESEARCH_R12_COVERAGE_GAPS_2026-08-27.md`.

**Acceptance**: not "the tests pass" — every group must be shown to FAIL when the behaviour it
claims to protect is removed. A suite written against previously untested code that goes green on
the first run is an instrument fault until a positive control says otherwise.

**BUILT 2026-08-27.** Three new test files (40 tests), plus two one-line repairs the tests found.

1. **`directorySource.test.ts`** (18 tests, jsdom) pins R9.1 RC-A from both sides — the picker's
   own `AbortError` is a cancellation, and an `AbortError` raised *after* the handle is in hand is
   not — plus the permission re-check, the walk's path semantics, and the property that carries
   the most weight: **both backends produce the same path for the same tree**. It also records why
   this module looked covered and was not: `browseFailure.test.ts` imports it through the barrel
   and mocks precisely the functions that hold its logic, so a line-coverage tool calls it loaded.

2. **`session.worker.test.ts`** (13 tests) pins per-file isolation and the cross-file progress
   accumulator, deliberately two-sided — one unreadable file must not stop the batch, and *every*
   file failing must still be fatal. **Found: the byte total was computed outside the `try`**, so a
   request with a missing blob threw where nothing could report it, posted no message at all, and
   left the caller's promise pending forever with the bar on "reading". Unreachable from `src/`
   today; the RC-5 leak class this codebase has already named twice. One line, moved inside.

3. **`sourceFolderMemory.test.ts`** (9 tests) walks the card's own acceptance across the store —
   Claude Code's folder, then Codex's, then back — and covers the two edges (a source never picked
   opens the picker instead of borrowing the other's folder; a revoked permission drops only that
   source). **Found: the start-up handle read replaced `cachedDirectoryHandles` wholesale**, so a
   user who picked a folder before that promise settled had the pick overwritten by last session's
   stored value. Self-healing on reload, which is why it would never be reported. Merged instead of
   replaced, with the reverse case tested too so "do not clobber the pick" cannot become "ignore
   storage".

Controls, per the acceptance above: `directorySource` was mutated three ways and failed in exactly
the six places it should, with the other twelve unmoved; the two repairs above are their own
natural positive controls, both reproduced before being fixed. Gates unpiped: typecheck, 649/649
across 68 files, two-stage build, `check:rounds` — all exit 0.

**Not closed here**: the worker's `cancelled` message has a consumer and no producer — nothing
passes `isCancelled` to `parseJsonlBlob`, because the UI cancels by terminating the worker. Pinned
by a test and recorded as DW-22 rather than deleted or "fixed" into a protocol nobody asked for.

---

## 5　不變量 (invariants)

- **INV-R12-1**（2026-08-26 M7 改寫成性質）：來源知識一律住在 `SourceProfile`。只有兩種例外
  —— **本身就是單一來源的模組**（adapter 只可能是它自己那一套），以及**窮舉守衛過的分派**
  （加一個 `SourceId` 會編譯失敗）。其餘任何檔案寫出來源 id 都是缺陷。
  原本的寫法「任何 `if (source === …)` 都是缺陷」指的是一種**語法**而不是性質，漏掉 `switch`、
  查表、以及本身合法的分派；改寫後由 `core/source/sourceKnowledge.test.ts` 逐檔強制，
  允許清單的每一列都必須寫下理由。
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

**降級順序**：**M1 → M2 → M3 → M4 → M5 → M6 → M7**，保底 **M1 + M2**。

理由：M1+M2 是骨架與導覽，做完就算後面全部延後，結構問題也已經被關起來（來源已知、
profile 已窮舉），不會再長出第三次同類缺陷。依 §0 的權重裁定，**M4（Claude Code 深度適配）
是本輪價值最高的一張**；它依賴 M1 的表，插不了隊，但排在 Codex 之前。**M5（Codex 側車標題）
明列為「順便」，預算不足時第一個砍** —— 它只覆蓋 17%，而缺標題多半是 session 本身沒定義好，
不是 DIT 要扛的責任。M6、M7 是把地基掃乾淨，可以延到下一輪。

---

## 7　裁決紀錄（2026-08-26，作者）

1. **位置記憶：依來源分開記錄。** 不是「記住上次選了哪一套」，而是每個 `SourceId` 各持一個
   目錄 handle，並配合 profile 的 `rootHint` **主動輔助定位**。已寫入 M2 的驗收。
2. **17% 足夠。** Codex 側車標題以現況驗收即可，不必等 LLM 那輪。理由是作者的：缺標題多半是
   session 本身沒定義好，不是 DIT 要扛的責任。連帶效果是 Codex 整體降為「順便」、Claude Code
   深度適配升為本輪主線（M4）。
3. **不跑 `product-design-thinking`。** 理由見下。

### 為什麼不跑 product-design-thinking

那個 skill 的用途是「方向未定時，用第一性原理與前人做法收斂出方向」，而且它自己的說明明列
**不適用於按既有規格施工**。本輪方向已由作者裁定（一級選來源、二級選模式、檢視收斂、
只支援兩套），根因是量出來的而不是討論出來的。跑它只會把已經拍板的東西重新推導一次。

真正缺的不是設計方法，是**盤點**——而盤點已經做完並寫進 M4 那張表（欄位、筆數，以及
`slug` 被實測排除）。

**它什麼時候才划算**：當出現方向真的未定的題目時。目前已知的下一個就是「LLM 濃縮補剩下的
無標題 session」——要不要做、在什麼時機跑、成本與隱私怎麼取捨、失敗與不確定要怎麼呈現，
那是一個沒有既定答案的設計題，屆時跑它才有東西可收斂。
