# PSM R11 — Release Readiness

- Round id: `r11-release-readiness` (allocated 2026-08-15, before any file was written)
- Branch: `feat/r11-release-readiness`, cut from `test/uat-2026-08-14`
- Exit condition: D-004's merge gate is met — R9.1 + R10 + R11 can go to `main`
- Predecessors: R9.1, R9.2, R10, R10.1 (RCA only, unimplemented)
- Deferred sibling: `r11.1-text-rendering` (Markdown/LaTeX render layer, author ruling 2026-08-15)

> Spec body is English because a dispatched agent executes it. The sections the
> author personally rules on — degradation order, open rulings, manual UAT — are
> Traditional Chinese.

---

## 0　Why this round exists

`docs/OUTSTANDING_2026-08-14.md` Part 1 was run by the author on 2026-08-15. Of 24 items:
14 passed clean, 1 failed, 3 partially passed, 5 could not be determined, 1 was untestable
by construction. Phase 13 recorded seven newly-surfaced defects and left them untriaged.
D-004 authorizes the merge to `main` **once those are addressed** — this round is that
fix-up pass, and nothing more.

Two things this round explicitly is **not**:

- It is not a feature round. The only new capability is one opt-in redaction rule (M7).
- It is not an attempt to make Codex diagnostics green. The R10.1 RCA proved ~94% of the
  unpaired `*_end` events have no recoverable candidate in the exported stream at all.
  Chasing zero warnings would mean fabricating associations. M4 makes the reporting honest
  instead.

---

## 1　Traceability — every UAT finding maps to exactly one card

| UAT item | Result | Finding | Card |
|---|---|---|---|
| A4 | 需調整 | entry-point copy uses the word "session" | **M0 (landed)** |
| A5, A6, A1, A2, A3 | 通過 | — | closed, no work |
| A7 | 部分通過 | legend collapsed by default, no discovery affordance | **M6** |
| A8 | 無法測試 | author ruled the scenario is unreachable by hand | closed, no work |
| B1 | 未通過 | (a) transcript still carries tool activity | **M0 (landed)** |
| B1 | 未通過 | (b) export entry naming unreadable | **M0 (landed)** |
| B1 | 未通過 | (c) Markdown never rendered, in Reader or exports | **deferred → R11.1** |
| B2, B4 | 通過 | — | closed, no work |
| B3 | 一半通過 | long unprefixed tokens not detected | **M7** |
| C1 | 通過 + defect | folder browser hard-excludes Codex sessions | **M1** |
| C2, C5, C6 | 通過 | — | closed (C6's "two render paths" question answered in §6) |
| C3 | 無法判定 | (a) subagent groups labelled 群組 | **M0 (landed)** |
| C3 | 無法判定 | (b) Codex skeletons are start/end + all-ribs | **M5 (investigate only)** |
| C4 | 部分通過 | wrapper tags eat card titles; duplicate empty thinking cards | **M4** |
| D1 | 通過 | (duplicate thinking cards — same as C4) | **M4** |
| D2 | 無法判定 | blocked by C1 | re-test after **M1** |
| D3 | 通過 | (subagent label — same as C3a) | **M0 (landed)** |
| D4 | 無法判定 | the `paste` entry point does not exist | **M4 (WC-4.4)** |
| D5 | 無法判定 | UAT wording, not a code defect | re-worded in §7, no card |
| D6 | 通過 | ruled D-001 | closed, no work |
| P2-1 | blocker | indexer does not recompute adapter after window expansion | **M1** |
| P2-2 | blocker | snapshot still fetches `dit.config.json` | **M2** |
| P2-3 | blocker | WebKit fallback has no failure exit | **M3** |
| P2-4 | agreed, unbuilt | R10-A Paginated detect-and-degrade | **not in R11** — see §8 |
| P2-5 | agreed, unbuilt | R10-C full-text search | **not in R11** — D-002 ruled the UX, build is a later round |
| 🟡 / ⚪ | unreviewed | 8+13 should-fix unverified; ~1,400 lines never reviewed | **M9 (report only)** |

---

## 2　M0 — already landed on this branch (no agent needed)

Done inline on 2026-08-15 before the cards were written. All three gates green after:
`typecheck` clean, **462/462 tests**, `build` clean (`dist/snapshot.html` 464.32 kB / 146.16 kB gzip).

| WC | Change | Files |
|---|---|---|
| 0.1 | Entry-point copy: 「挑選 Session」→「從對話集選擇」, 「載入單一檔案」→「選擇一則對話」; EN mirrored to "Choose from your conversations" / "Open one conversation". Cross-references inside tooltips updated. | `src/i18n/locales.ts` (4 sites × 2 locales) |
| 0.2 | Export group naming: 「匯出」→「匯出閱讀頁面快照」, 「對話紀錄」→「匯出純對話紀錄」, 「複製 Markdown」→「以 MD 形式複製到剪貼簿」; EN mirrored. | `src/i18n/locales.ts`, `src/components/SettingsDialog.test.tsx` |
| 0.3 | `DEFAULT_TRANSCRIPT_OPTIONS.includeToolSummary` flipped `true → false`. The stats header still reports `工具呼叫 N（未納入）`, so the omission stays visible rather than silent. Four tests that were relying on the old default now pass `includeToolSummary: true` explicitly — they test summary rendering, not the default. | `src/core/export/contracts.ts`, `transcript.test.ts`, `transcriptMarkdown.test.ts`, `transcriptHtml.test.ts` |
| 0.4 | `GroupCard` rendered a hardcoded 「群組」 for every group kind, so subagent groups never showed the category the legend documents. Now keyed on `group.kind` via a new `card.groupKindTag` table using the legend's own vocabulary (反覆修改 / 重試 / 子代理 / 聚合區段). | `src/i18n/locales.ts`, `src/components/GroupCard.tsx` |

---

## 3　Work cards

Each card is one dispatched agent. Cards within a milestone are one agent's scope.
**Every agent must run `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build` before
reporting, and paste the tail of each.** A card is not done on a green typecheck alone.

Shared constraints, binding on every card:

- Windows: `npm.cmd`, not `npm`. Comments and commit messages in English.
- Adapters never throw on a bad line or a bad file — record a `Diagnostic` and skip.
- Every unobservable substitution calls `reportFallback`. A degradation already encoded in
  the return type and surfaced in the UI reports through `Diagnostic` aggregates instead.
- No `window.confirm` / `alert` / `prompt` anywhere in `src/`.
- No `dangerouslySetInnerHTML`. The project is at zero occurrences and stays there.
- Do not renumber, rename, or "tidy" anything outside the card's stated files.

---

### M1 — Session index correctness　▸ agent: `testing-bug-fixer`

Release blocker P2-1 and UAT finding C1 live in the same 15 lines of
`src/core/index/sessionIndexer.ts`. Fix them together; splitting them means touching the
same function twice.

**WC-1.1 — recompute the adapter verdict after the head window is expanded (P2-1)**

`scanFile()` computes `detectAdapter(headText)` on the first 128 KiB window. When a
straddling line over 32 KiB triggers the expansion to 1 MiB, `headText` is re-read but
`isClaudeCode` is never recomputed. The stale verdict then drives the skip at the bottom of
the loop. Symptom: a legitimate session whose first message carries a screenshot as inline
base64 vanishes from the list.

Recompute `detectAdapter` against the widened `headText` after the re-read. Regression test:
a fixture whose first line exceeds 128 KiB and whose adapter is only identifiable past that
boundary must appear in the index.

**WC-1.2 — index Codex sessions instead of dropping them (C1)**

```
if (headScanUsable && !result.isClaudeCode) continue;
```

This is a pre-R7 author ruling (「本輪只索引 Claude Code」) and therefore not a regression —
but R10 shipped multi-source support, and the author reported the consequence as a defect:
Codex sessions are reachable only by single-file load, never by browsing. The author's own
UAT remark is the ruling; treat it as decided.

Replace the skip with source-aware indexing:

- Keep any file whose adapter is recognised (`claude-code` **or** `codex`).
- Keep, and mark 「無法判定」, any file where `headScanUsable` is false — the existing
  distinction between "confidently not ours" and "could not read it" must survive.
- Drop only files where the head scan was usable and **no** adapter claimed the file.
- Carry the resolved `SourceId` onto `SessionIndexEntry` and show it in the picker list, so
  the user can tell a Codex session from a Claude Code one before opening it.
- `subagentPrefixFor()` assumes the Claude Code layout `<dir>/<id>/subagents/`. Codex
  rollouts have no such sibling directory. Do not invent one: for a Codex entry the subagent
  path list is empty, and that must be a deliberate branch with a comment, not an accident.

`classifySession()` takes `hasAgentId` / `allSidechain` inputs that were derived from Claude
Code field names. Check whether they read anything on a Codex rollout; if they cannot, the
Codex entry's `kind` must be the honest "unknown", never a defaulted 「主線」.

**WC-1.3 — re-test D2 after WC-1.2 lands**

D2 (`apply_patch` failure shows an error badge) was recorded 無法判定 solely because C1 made
the sample unreachable. It needs no code; it needs the author to re-run it. Add it to §7.

Acceptance: `sessionIndexer.test.ts` gains cases for the expanded-window recompute, for a
Codex file appearing in the index with `source: "codex"`, and for an unreadable head still
being listed as undetermined rather than dropped.

---

### M2 — Snapshot makes zero network requests　▸ agent: `testing-bug-fixer`

Release blocker P2-2. `App.tsx` calls `loadPersistedConfig()` in an unconditional `useEffect`;
the store action has no snapshot guard; `configFile.ts` performs the actual `fetch`. This
violates R6 `EX-INV-1/3` and the explicit promise in `USER_GUIDE.md` that a snapshot issues
no network requests.

The store already carries `snapshotMode` (set before `publishPipelineResult` so downstream
readers see it synchronously) and `loadIndexEntry` already guards on it. Apply the same guard
to the config path. Put the guard where the other one is — in the store action — so the
invariant has one enforcement point rather than one per caller.

Acceptance: a test asserting `loadPersistedConfig()` performs no fetch when `snapshotMode` is
true, plus the author's manual check in §7 (DevTools → Network on the opened snapshot, zero
requests other than the document itself).

---

### M3 — The WebKit fallback has a failure exit　▸ agent: `testing-bug-fixer`

Release blocker P2-3. `indexFileList()` calls `runIndex()` with no `try`/`catch`, while the
FSA path immediately above it wraps the identical call and sets `browseState: "index_failed"`
on throw. A throw on the fallback path therefore leaves the UI pinned at `"indexing"` forever
with no error and no way out.

Make the fallback path symmetric with the FSA path: catch, set `index_failed`, record the
diagnostic via the same `toIndexDiagnostic()`.

Second half of the same blocker: `resumeLastDirectory()` sets `browseState: "closed"` and
returns when `isDirectoryPickerSupported()` is false, on the assumption (stated in a comment)
that the UI then opens an `<input>`. **Verify that entry actually exists.** If it does not,
the fallback has no entry point at all and the comment is wrong — report that as a finding
and wire the entry; do not silently leave the comment standing.

Note for the report: none of this is verifiable in this environment (Chromium only). Per the
R9.1 B5 ruling, the card is complete when the failure exit exists and is unit-tested. **No
document may claim Firefox/Safari support** — only "a fallback exists, unverified in that
environment".

---

### M4 — Codex provenance honesty (P-001 P0 + C4)　▸ agent: `testing-bug-fixer`

**Required reading before touching code:**
`docs/rounds/r10.1-codex-session-provenance/RCA_R10.1_CODEX_SESSION_PROVENANCE_2026-08-15.md`.
Implement its **P0 only**. P1 (the `association` / `unmatchedReason` provenance model), P2
(tri-state exec name resolution) and P3 (small type gaps) are explicitly **out of scope for
R11** and must not be started.

The RCA's binding constraints, restated so they cannot be missed:

- Do **not** guess an ID relationship between `exec-*` and `call_*`. Measured: different
  namespaces.
- Do **not** widen `EXEC_TOOL_NAME_RE` into a looser full-text search. It would tag program
  strings, comments and multi-tool orchestrator scripts as single tools. Same reasoning as
  D-001.
- Do **not** drop `*_end` events to silence a warning. They still carry patch results,
  search queries and MCP results.
- Do **not** claim compaction as the cause. 97 local `context_compacted` events prove
  compaction is *one* proven cause; the adapter has no per-event causal link to the other
  ~1,063.

**WC-4.1 — downgrade `CODEX_EXEC_TOOL_NAME_UNRESOLVED`**
Re-tier from `warn` to a named capability limit at `info` (the RCA suggests
`CODEX_EXEC_DETAILS_OPAQUE`). The card still shows `exec` and its raw input. This is a
user-visible naming degradation, not a parse failure, so it belongs on the `Diagnostic`
aggregate channel, not the fallback channel.

**WC-4.2 — rewrite `CODEX_EVENT_UNPAIRED` copy**
Current copy in `src/i18n/diagnosticCopy.ts` asserts 「多半是該呼叫已被歷史壓縮取代」. That
causal strength exceeds the evidence. Replace with a statement of what is actually known:
the export provides no verifiable link back to the originating call; possible reasons include
history compaction, record boundaries, and unsupported wrappers.

**WC-4.3 — de-emphasise unpaired `*_end` cards**
An unpaired end event must stop rendering as a prominent 「未知事件」 card. Keep the data;
present it as a low-weight system marker or a collapsed 「未關聯的工具結束事件」 section.
Escalate to `warn` only in the genuinely ambiguous case: multiple compatible candidates
within the same turn, forcing an arbitrary pick.

**WC-4.4 — three defects the RCA does not cover (found in UAT C4/D1)**

1. **Wrapper tags eat card titles.** `[external_agent_tool_result]` … `[/external_agent_tool_result]`
   and similar bracketed wrappers appear as the card's title, displacing the real content.
   Note this is *not* the `INJECTION_TAGS` preamble mechanism — those are angle-bracket XML
   blocks at the start of a message, and this wrapper appears mid-content. Find where the
   Codex adapter derives the summary/title and stop the wrapper token from becoming it.
   Do not add these to `INJECTION_TAGS`: stripping content the user might need is a different
   decision from not using it as a title.
2. **Duplicate thinking-chain cards.** The author confirmed byte-identical repeated
   「思考鏈」 cards with no detail body. Root-cause before fixing — deduping identical
   content at render time would hide the real cause if the adapter is emitting each reasoning
   item twice.
3. **`paste` is a declared-but-unreachable `SourceId`.** `src/types/spanTree.ts` declares
   `"paste"`, `profiles.ts` defines a `PASTE` profile, and nothing ever produces it — the two
   adapters hardcode `"claude-code"` / `"codex"` and no UI path reaches it. This is the exact
   pattern R9.1 removed `milestone` for, and D-003 confirmed the precedent. **Remove it**
   (type member, profile, and the D4 UAT item), rather than building an entry point nobody
   asked for. Author decision 2026-08-15, logged under the decision charter as reversible.

---

### M5 — Codex skeleton coverage: investigate only　▸ agent: `general-purpose`

**This card produces a document. It changes no product code. An agent that edits `src/`
has failed this card.**

Author's UAT C3 finding, verbatim: 「CODEX 的 session 們目前完全沒辦法很正常的自動進入
其他 kind 的分類，很多情況都是只有起點跟終點，中間都是支線，正常的使用者意圖跟回覆
都沒有變成一個正常的節點。」

That is more serious than the label bug M0 fixed. It suggests R10-B's `SourceProfile` repaired
`denoise()` and `distill()` while the skeleton classification layer — what becomes a spine
node versus a rib — is still Claude-Code-shaped. R10-B's own parity test
(`crossSourceParity.test.ts`) passes, so whatever is wrong is not covered by it; that gap is
itself a finding.

Deliverable: `docs/rounds/r11-release-readiness/RCA_R11_CODEX_SKELETON_COVERAGE.md`.

Required content:

1. **Measured, not inferred.** Extend `scripts/scan-codex-sessions.mjs` (structure-only,
   zero content leakage — it already proves this discipline against eleven planted strings)
   or add a sibling script. Over the local corpus, report per source: spine node count
   distribution, rib count distribution, and the share of sessions whose spine is exactly
   {start, end}. Compare against Claude Code sessions from the same machine.
2. **Root cause, pinned to source lines** in `src/core/distill/distiller.ts` and
   `src/core/view/fishbone.ts` / `sessionMap.ts`. Name the specific predicate that a Codex
   span fails.
3. **Why `crossSourceParity.test.ts` passes anyway.** Either its fixtures are unrepresentative
   or it asserts the wrong property. Say which.
4. **Options with costs**, not a recommendation to guess. D-001 stands: `shell_command`
   classification by command-string guessing is ruled out unless new evidence appears, and the
   R10.1 RCA §P2 independently reached the same conclusion. If the measurement produces that
   new evidence, present it as evidence and let the author re-rule — do not act on it.

---

### M6 — Legend becomes a hover tooltip　▸ agent: `frontend-developer`

UAT A7, 部分通過. The author's judgement: the three-part definitions are good, the placement
is not — the Overview page's 符號說明 is a `<details>` collapsed by default with no discovery
affordance, so nobody opens it.

Author's instruction, and the exact scope: replace the collapsed disclosure with
hover-to-reveal tooltips carrying the full definition, **without otherwise changing the
existing layout**, at both:

- `src/components/StructureLegend.tsx` — `<details class="tree-legend">`
- `src/components/SessionMapDialog.tsx` — `<p class="map-legend">屬性符號圖例: □ 目標 · ◇ 決策 · ▰ 結果 · ├ 取證 · △ 錯誤 · ○ 重試 · ◆ 反覆修改 · ⬠ 子代理 · ▦ 聚合區段</p>`

Constraints:

- Hover is not the only path. Keyboard focus must reveal the same content, and the definition
  must be reachable by a screen reader. A `title` attribute alone does not satisfy this.
- Do not put the definitions in a second place. They live in
  `src/core/view/categoryDefinitions.ts` and the i18n dictionary; the tooltip reads them.
- Nine symbols now, seven before. `StructureLegend.test.tsx` asserts against the `<details>`
  element and will need updating — update the assertion to the new affordance, do not delete
  the test.

---

### M7 — High-entropy redaction, opt-in　▸ agent: `testing-bug-fixer`, then review by `security-engineer`

UAT B3, 一半通過: emails and passwords were caught, long unprefixed tokens were not.
`src/core/privacy/detectors.ts` matches only prefixed known shapes — private-key blocks,
`github_pat_`/`gh[pousr]_`/`xox[baprs]-`, JWT `eyJ…`, `sk-…`, and connection-string passwords.
A 40-character hex SHA, a session UUID, or any unprefixed bearer token passes straight through.

**Author ruling 2026-08-15**：新增高熵偵測，**預設關閉**。理由是抓長亂碼必然連帶誤擋
git commit hash 這類無害字串，而逐字稿的技術可讀性是使用者要自己權衡的，不該由預設值代決。

Build:

- A new detector rule for long high-entropy runs. Not a bare length threshold — a hex SHA and
  a base64 token have measurably different character distributions from an English word, and
  the rule must state its own criterion in a comment so a future reader can argue with it.
- `confidence` strictly below the prefixed rules, so `kindPriority` resolution keeps existing
  behaviour unchanged where both match.
- A separate opt-in checkbox in the export options, **default off**, distinct from the
  existing 「匯出前遮蔽」.
- Honest reporting whether or not it is enabled: when off, the redaction summary must still
  say 「另偵測到 N 筆疑似高熵字串（未遮）」. Silence would be the same failure mode the
  `reportFallback` invariant exists to prevent.

Regression bar: every existing test in `detectors.test.ts`, `apply.test.ts`, `gateway.test.ts`
and `redact.test.ts` must pass **unchanged**. If one needs editing, the new rule has changed
default behaviour and is wrong.

Then hand the diff to `security-engineer` for a read-only pass: does the new rule leak
anything by widening a capture range, and does the default-off choice leave a documented gap.

---

### M9 — Review sweep of the blind spots　▸ agent: `code-reviewer` (read-only, reports findings)

`OUTSTANDING_2026-08-14.md` Part 2 has two unmeasured regions:

- ⚪ **Never reviewed at all** (~1,400 lines): `src/core/export/transcript*.ts`,
  `src/core/privacy/apply.ts`, `src/core/privacy/redact.ts`, plus R10's
  `src/core/source/profiles.ts` and the R10-M1 Codex adapter changes. Both 2026-08-03 reviews
  predate v0.4.0's merge.
- 🟡 **Reviewed but never re-verified**: 8 + 13 should-fix items and work cards WC-04..WC-12
  from the two 2026-08-03 reviews. Only the three blockers were re-checked on 2026-08-14.
  Known headline items: `pr-link` lost in normalize; raw exceptions reaching the user's
  screen; `showModal()`'s catch degrading silently; collapse controls being `div`s with no
  keyboard semantics; the validator not catching malformed skeletons or parent cycles; the
  FSA walk recursing fully before applying the 500-file cap.

Deliverable: `docs/rounds/r11-release-readiness/REVIEW_R11_BLIND_SPOTS.md`. For each
should-fix item, one of: **still present** (with a current file:line), **already fixed**
(by which round), or **no longer applicable** (why). Reports only — no edits, no commits.
Findings become R12 candidates, not R11 work.

---

## 4　執行順序與降級宣告

保證核心是 **M1 + M2 + M3**：三個 release blocker 清掉，D-004 的合併閘門就到位，
R9.1 + R10 + R11 可以進 `main`。其餘卡片按價值排序，預算不足時**由後往前砍**：

```
保證核心   M1 → M2 → M3            （三個 blocker，合併閘門）
第二層     M4                      （Codex 忠實度 P0：使用者每天看到的噪音）
第三層     M7 → M6                 （遮蔽補洞、圖例可發現性）
可延後     M5 → M9                 （兩張只產文件的卡，不影響合併）
```

砍掉的部分不靜默消失——每一張沒做的卡都要寫進 phase-log 的 Open Questions，
並在下一份 OUTSTANDING 文件裡帶著原本的編號出現。

M1/M2/M3 彼此無相依，可平行派工。M4 與 M1 都會碰 Codex 路徑但檔案不重疊
（`sessionIndexer.ts` vs `codexJsonl.ts` / `diagnosticCopy.ts`），一樣可平行。
M5 是唯讀調查，隨時可派。M9 唯讀，最後派以便看到本輪的改動。

---

## 5　本輪仍未裁定的事（不阻擋開工）

| # | 問題 | 何時需要答案 |
|---|---|---|
| R11-Q1 | git commit SHA 到底算不算敏感？M7 的高熵規則預設關閉已經把急迫性降下來了，但「開啟後 commit hash 被遮成佔位符」這個副作用需要你看過實際輸出再判斷值不值得排除。 | M7 交付後，看 §7 UAT 的實際輸出再答 |
| R11-Q2 | Codex session 在清單裡要不要跟 Claude Code 混排？M1 會把來源標出來，但排序、篩選、是否預設兩者都顯示，是介面語意問題。 | M1 交付後，看實機再答 |
| R11-Q3 | M5 若量出 Codex 骨架的根因，修正要進 R12 還是併回 R11？ | M5 交付後 |

---

## 6　C6 的追問：哪兩條渲染路徑

作者在 C6 備註問「哪兩條渲染路徑？影響是？」。答案在
`docs/design/DIT_TEXT_RENDERING.md` §2.2，這裡直接答完，不另開卡：

| 路徑 | 位置 | 限制 |
|---|---|---|
| 閱讀畫面 | `src/components/SpanCard.tsx`、`GroupCard.tsx`、`parts.tsx` | 走 React；有虛擬捲動，渲染成本會被可見卡片數乘上去 |
| 匯出快照 | `src/core/export/snapshotTemplate.ts` → `dist/snapshot.html` | 單檔產物，所有東西內聯 |

「悄悄分岔」的意思是：只改其中一條，匯出的 HTML 會跟你在 app 裡看到的長得不一樣，
而且不會有任何錯誤告訴你。C6 你驗的就是這件事沒發生——**通過是有意義的**。
R11.1 的渲染層必須同時做兩條，這是它獨立成一輪的主要理由之一。

---

## 7　R11 手動驗收（施工完成後跑，不是現在）

每一項填：結果（通過／失敗／不確定／跳過）、實際觀察、日期、備註。空白視為沒驗。

**U1（M1）在對話集清單裡看得到 Codex**
清 site data → 重整 → 「從對話集選擇」→ 選 `~/.codex/sessions` 底下的資料夾。
**通過條件**：列出 Codex session，每一列標得出來源是 Codex；同時選 `~/.claude/projects/...`
仍然正常。**明確不該出現**：清單空白、或顯示「沒有 Claude Code 的對話」。

**U2（M1）夾帶大圖的 session 不再消失**
找一份首則訊息帶截圖 base64 的 session（單行可到 132 KB），確認它出現在清單裡。
找不到樣本就填「跳過」，不要填通過。

**U3（M1）重跑原本的 D2**　▸ 這一項原本因為 C1 卡住
載入一份 `apply_patch` 失敗過的 Codex session（本機實測 2,186 次中有 8 次失敗）。
**通過條件**：那張卡片有 error 標記／紅色徽章。

**U4（M2）快照真的零請求**
`npm.cmd run build` → 開 `dist/snapshot.html`（直接雙擊，不透過 dev server）→
DevTools → Network → 重整。**通過條件**：除了文件本身，**一條請求都沒有**。
B2 驗過逐字稿 HTML 是乾淨的（唯一一條就是文件自己）；這一項驗的是另一個產物。

**U5（M3）後備路徑失敗時說得出話**
這一項在 Chromium 上驗不到真實情境。退而求其次：確認 `indexFileList` 的失敗路徑有單元測試
覆蓋，且 `resumeLastDirectory` 在不支援 FSA 時**確實有一個入口**可按。
**任何文件都不得寫「Firefox/Safari 可用」。**

**U6（M4）閱讀主流不再被黃字淹沒**
載入一份工具密集的 Codex 對話。**通過條件**：主閱讀流不再滿是黃色 warning 與「未知事件」卡；
未關聯的結束事件仍然找得到（在展開資訊或折疊區段裡），且標示了關聯強度。
這一項是 RCA §建議驗收第 5 點，只有你能判——自動化測試只能證明資料沒丟。

**U7（M4）括號包裝不再吃掉標題**
同一份 session，確認 `[external_agent_tool_result]` 這類包裝不再變成卡片標題。

**U8（M4）思考鏈不再重複**
確認不再出現內容完全相同、又沒有詳細內容的重複「思考鏈」卡。

**U9（M6）圖例滑過去就看得到**
總覽頁與 Session Map。**通過條件**：滑過符號即顯示完整三段式定義；用鍵盤 Tab 過去也顯示；
其餘排版與現在一樣。

**U10（M7）高熵遮蔽預設關閉、但誠實回報**
用 B3 那份 session（`78b30412-…`）匯出兩次。
**通過條件**：預設關閉時，長亂碼**沒被遮**，但遮蔽摘要寫出「另偵測到 N 筆疑似高熵字串（未遮）」；
勾選後長亂碼被換成佔位符，同一個值在全文同編號。
**順便回答 R11-Q1**：看勾選後的輸出，commit hash 被遮掉這件事你能不能接受。

**U11（M0）回歸：三項文案與一項預設**
(a) 入口按鈕讀作「從對話集選擇」／「選擇一則對話」；
(b) 設定匣兩個匯出區塊讀作「匯出閱讀頁面快照」／「匯出純對話紀錄」，一眼分得出差別；
(c) 「以 MD 形式複製到剪貼簿」；
(d) 匯出純對話紀錄**預設不含工具活動**，但統計仍寫「工具呼叫 N（未納入）」；
(e) 子代理群組卡的分類標籤顯示「子代理」而不是「群組」。

**U12 壓力路徑**
(1) 反覆快速開關子代理旁鏈 10 次以上；(2) 用最大的一份 rollout（本機最大 3,202 行）重跑 U1；
(3) 載入一份 Claude Code session 確認 M1 沒有動到它；(4) 在對話集清單裡連續切換 5 份不同來源
的 session。**通過條件**：不閃爍殘影、不重複插入、不當掉、清單不消失。

---

## 8　明確不在本輪（不要排進來）

| 項目 | 為什麼 |
|---|---|
| **Markdown / LaTeX 渲染層** | 作者裁定 2026-08-15：獨立成 `r11.1-text-rendering`。它是新功能不是修正，牽涉兩條渲染路徑與不可信輸入的注入面，需要自己的安全驗收。設計引導已在 `docs/design/DIT_TEXT_RENDERING.md` |
| **R10.1 RCA 的 P1 / P2 / P3** | 本輪只做 P0。P1 是新的 provenance 資料模型，P2 是 lexical scanner，P3 是型別缺口——各自需要自己的量測與測試 |
| **R10-A Paginated 偵測降級（P2-4）** | 已裁定要做，但本機 356 份全是 Legacy，做完也驗不到。等到出現任何一份 Paginated 樣本 |
| **R10-C 全文搜尋（P2-5）** | D-002 已把三個 UX 問題裁定完，但這是功能不是修正，不該擋住合併 |
| **`milestone` 復活** | D-003：維持移除 |
| **`shell_command` 分類猜測** | D-001：不猜。R10.1 RCA §P2 獨立得到同一結論 |
| **Firefox / Safari 驗證** | 本環境無法驗。解除條件見 `OUTSTANDING_2026-08-14.md` Part 4 |
