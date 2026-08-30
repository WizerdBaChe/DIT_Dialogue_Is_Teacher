# PSM R11.2 — UAT repairs

- **Round id**: `r11.2-uat-repairs` (allocated 2026-08-16, before any file was written)
- **Branch**: `feat/r11.2-uat-repairs`, cut from `feat/r11-release-readiness`
- **Entry state**: R11 construction complete and green — typecheck clean, 491/491, build clean — but **not accepted**. `docs/rounds/r11-release-readiness/UAT_R11_v1.0.md` came back 8 pass / 4 partial / 5 fail / 7 untestable on 2026-08-16.
- **Exit condition**: the R11 acceptance card passes, which reopens **D-004's merge gate** (R9.1 + R10 + R11 + R11.2 → `main`).

## 0　What this round is, and is not

This is a repair round for defects the manual acceptance of R11 surfaced. It is **not**
a feature round, and it is not the render layer — `r11.1-text-rendering` stays reserved
for Markdown/LaTeX (D-005) and nothing here touches it.

Two of the R11 acceptance failures are already resolved and are listed only so nobody
re-opens them:

- **C2 (snapshot export "broken")** was an error in the acceptance card, not the product:
  `exportHtml()` returns early under `import.meta.env.DEV`, so the button cannot work
  under `npm run dev`. The card now carries an erratum and the `npm run build` +
  `npm run preview` commands. **Re-test, do not "fix".**
- **C1** was blocked by the same mistake.

## 1　Traceability — every acceptance finding maps to exactly one card

| UAT item | Result | Card |
|---|---|---|
| B3, B4 (Codex sessions all 「無法判定」, rollout filename as title) | partial / fail | **R1** |
| B4 (card titles show raw `exec_command`, unexplained 「操作 foo」) | fail | **R2** |
| B7 (no diagnostics surface; M4's tier downgrade unobservable) | fail | **R3** |
| B9, B10 (high-entropy disclosure line not found) | fail / untestable | **R4** |
| B1, C11 (tooltip clipped or underlapped beside the reading column) | partial / fail | **R5** |
| B15 (group legend and group label can disagree) | partial | **R6** |
| C6 (browse dialog reopens itself; one session intermittently unreadable) | fail | **R7** |
| C1, C2 (blocked by the card's own dev-mode error) | untestable | **R8** (re-test only) |
| B11 remark (provider fields give no guidance), C7 (no image marker) | — | §5, not in this round |

## 2　Work cards

### R1 — Codex sessions need their own classifier and their own title source

**Why it is not simply a bug.** R11-M1 deliberately refused to read Claude-Code-shaped
fields (`agentId`, `isSidechain`, `type === "user"`) off a Codex envelope and report their
absence as a verdict, so it returns `unknown` / `codex-unclassified`. That was the correct
call and must not be reverted. But `pickTitle` derives titles from the same Claude-Code
record shapes, so Codex rows also fall back to `titleSource: "filename"`. The combined
result is a picker that is honest and useless: every Codex row reads 「無法判定」 with a
`rollout-…jsonl` name.

**Do**: add Codex-side signals to `classifySession` — read the Codex envelope
(`type: "response_item"` / `event_msg`, roles inside `payload`) rather than the Claude Code
one — and give `pickTitle` a Codex path that derives from the first real user message.
Keep the three-way rule from M1 intact: "could not read" must stay distinct from "read it,
it says no". `codex-unclassified` should become rare, not disappear — a Codex file whose
head window yields no usable signal still gets it.

**Files**: `src/core/index/classifySession.ts`, `src/core/index/sessionIndexer.ts`, tests.
**Constraint**: D-001 — never infer intent from a `shell_command` string.
**Acceptance**: on the author's real `~/.codex/sessions`, the large majority of rows carry a
real classification and a derived title; measure and report the before/after share rather
than asserting it.

### R2 — Codex card titles leak raw tool identifiers

Titles show `exec_command` and 「操作 foo」. The second one is unexplained and must be
root-caused before anything is changed — find which record produces it and why the word
`foo` survives into a title. Do not pattern-match the symptom away.

**Files**: `src/core/adapters/codexJsonl.ts`, whatever derives card titles for tool spans.
**Constraint**: R10.1 §P2 and D-001 both forbid widening the exec-name regex into a looser
full-text search. If the honest answer is "this input has no recoverable tool name", the
card must say so in the UI rather than invent one.
**Acceptance**: a fixture built from the offending real record renders a title that is
either a real name or an explicit "unnamed operation", never a raw identifier.

### R3 — There is no diagnostics surface, so M4's downgrade made the information vanish

`noticeable()` (`src/core/diagnostics/contracts.ts:80`) filters out `tier === "info"`, and
that is what `MainView` renders as the warning banner; `ParseNoticeDialog` opens only for
`fatal`. R11-M4 moved `CODEX_EXEC_TOOL_NAME_UNRESOLVED` and `CODEX_EVENT_UNPAIRED` from
`warn` to `info` so they would stop reading as damage — but with no surface that shows
`info`, they stopped being visible at all. **The goal was "stop looking like a fault", not
"disappear".** M4's tier change was half a fix.

**Do**: give `info` a home. Suggested shape, not mandated: a quiet, dismissible summary
somewhere the reader can reach on demand (the overview already counts `noticeable()`
diagnostics — that count is currently a lie by omission for Codex sessions). Whatever is
chosen must state the capability limit honestly and must not re-escalate these two codes
to `warn`.

**Files**: `src/components/MainView.tsx` or `OverviewView.tsx`, `src/i18n/diagnosticCopy.ts`.
**Acceptance**: loading a Codex session with unpaired events shows the reader, without
alarming them, that some events could not be paired and why the source cannot say more.

### R4 — Reproduce the missing high-entropy disclosure before changing anything

The author could not find the 「另偵測到 N 筆疑似高熵字串（未遮）」 line in a real export.
Three possibilities and they need separating: the session genuinely contained no
high-entropy strings (the line renders only when the count is above zero, by design), the
line rendered somewhere the author did not look, or the count is wrong.

**Do**: run a **positive control first** — an export from a session known to contain a
long unprefixed token — and confirm the line appears. Only if it does not is there a
defect. Report the ruler beside the rate: say which session, which export format, and what
the count was.

**Files**: investigation first; `src/core/export/transcriptMarkdown.ts:59`,
`transcriptHtml.ts`, `src/core/privacy/redact.ts` if a defect is confirmed.
**Constraint**: D-006 — the disclosure must work whether or not the redaction rule is
enabled. Never report a redaction that did not happen.

### R5 — The legend tooltip is clipped or underlapped beside the reading column

Hover itself works — verified on real hardware during R11 (opacity 1, correct size, not
occluded *within its own region*). What was never checked is stacking and overflow against
the reading column, and narrow widths. The bubble is `position: absolute; z-index: 30`
inside the sidebar; an ancestor with `overflow: hidden` or a higher-stacked sibling will
clip or cover it.

**Do**: find the actual mechanism (clipping ancestor vs stacking context) before choosing
a fix — they need different remedies, and guessing between them wastes a round.
**Files**: `src/styles/index.css`, `src/components/StructureLegend.tsx` if the bubble must
escape its container.
**Acceptance**: hover and keyboard focus both show the full bubble at desktop width, at a
narrow width, and in the drawer, with nothing clipped and nothing covering it. This is a
by-eye item — it cannot be closed by a passing test.

### R6 — The group legend and the group label must share one source

The author's point, and it is a design defect rather than a copy bug: the legend and the
card label each carry their own `GroupKind` → text mapping, so they can disagree, and R11
proved they do. Two mappings maintained separately will diverge again.

**Do**: make one the single source and have the other read it.
**Files**: `src/components/labels.ts`, `src/components/GroupCard.tsx`,
`src/components/StructureLegend.tsx`, `src/i18n/locales.ts`.
**Acceptance**: a test that fails if a `GroupKind` exists in one table and not the other —
the invariant is a property of the asset, not a reminder to a future editor.

### R7 — The browse dialog reopens itself after being closed

Reported: closing it makes it come back, apparently without the indexing state; separately,
one session was unreadable until a full reload. The second may or may not be the same bug —
do not assume they are.

**Do**: root-cause the reopen through the blocking-surface machine and `browseState`
(R11-M3 changed `resumeLastDirectory` to open on `"picking"` instead of `"closed"` — check
that first, it is the most recent change in this area and the most likely cause).
**Files**: `src/store/sessionStore.ts`, `src/components/SessionBrowserDialog.tsx`.
**Acceptance**: closing the dialog keeps it closed; a regression test pins it.

### R8 — Re-test C1 and C2 under a built preview

No code change. Run `npm run build` then `npm run preview`, export a snapshot, open the
exported file offline, and confirm zero network requests and no settings entry points.

## 3　Degradation order（若預算不足，從後往前砍）

保證核心：**R1 + R3**。前者決定 Codex session 在清單裡是否可用，後者決定 M4 那半個修正是否算數——兩者都直接擋在 D-004 的合併閘門前面。

砍除順序：**R7 → R6 → R2 → R5 → R4**。被砍的項目必須以編號原樣出現在下一份 OUTSTANDING 清單，不得靜默消失。

R8 永遠不砍：它不是施工，是把兩個因為驗收卡寫錯而誤判的項目重測回來。

## 4　Hard constraints carried in

- D-001: never infer what a Codex `shell_command` did from the command string.
- P-001: ~94% of unpaired `*_end` events are structurally unrecoverable; the goal is honest reporting, never zero warnings. Never claim compaction as a specific event's cause; never guess an ID relation between the `exec-*` and `call_*` namespaces.
- Adapters never throw on a bad line; one unreadable file must not fail a batch.
- `reportFallback` is only for a substitution the user cannot observe.
- No `window.confirm` / `alert` / `prompt`, no `dangerouslySetInnerHTML` in `src/`.
- No user-facing string hardcoded in a component; both locales stay in sync.
- No document may claim Firefox/Safari support — only "a fallback exists, unverified there".

## 5　Not in this round

- The render layer (D-005 → `r11.1-text-rendering`).
- The Codex skeleton-coverage fix (D-011 → R12), and RCA P1/P2/P3 including WC-4.3 (D-010).
- The ten remaining `REVIEW_R11_BLIND_SPOTS.md` findings and the three remaining SECREVIEW suggestions (D-014 made two of them documented exclusions).
- `src/` comment-language unification (ticket held outside the repo; measured at 1,308 lines across 65% of files).
- **Unruled, needs the author**: provider config fields give no guidance on what to enter (B11 remark — the author has no API key for any data-out provider, so this also blocks B11/B12 acceptance); image-bearing sessions carry no marker that an image was present (C7).
