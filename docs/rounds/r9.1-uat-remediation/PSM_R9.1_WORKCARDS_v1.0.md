# R9.1 — UAT Remediation: Work Cards (PSM v1.0)

> Upstream: [`RCA_R9_UAT_v1.0.md`](../r9-session-browser-and-fsm/RCA_R9_UAT_v1.0.md) (root causes RC-A … RC-H)
> Rulings: RCA §4 (F1 folder-first + copy / F2 contract + sweep, no component layer / F3 design note only)
> Branch: `feat/r9.1-uat-remediation` (cut from `main`)
> ops-relaxation: **L1** — boundary contract lives in RCA §0 and governs this round; do not re-emit.

---

## §0 Card index

| Card | Root cause | Scope | Blocking? |
|---|---|---|---|
| **M1** | RC-A | Browse-flow error classification + gesture/IO decoupling | yes — correctness |
| **M2** | RC-C | Subagent identity from content, not path | yes — the only UAT failure |
| **M3** | RC-D | Semantic `outcome`; markers get their own span type | yes — correctness |
| **M4** | RC-B | Named degradation vs silent fallback | no |
| **M5** | F1 | Load-entry priority and copy | no |
| **M6** | RC-E | `.btn` size contract + project-wide sweep | no |
| **M7** | RC-F | Progress strip owns its own width assumptions | no |
| **M8** | RC-G a | Minimap reads as density, not as nodes | no |
| **M9** | RC-G b | Single source of truth for category definitions | no |
| **M10** | RC-H | Markdown/LaTeX design note (no implementation) | no |
| **M11** | B3 / B6 | UAT step rewrite + permission-expectation copy | no |

Degradation order (from RCA §4): drop M10 → M9 → M8 → M6-sweep → floor is **M1 + M2 + M3 + M6-contract + M5**.

---

## M1 — Browse-flow failure must never end in an invisible state

**Files** `src/store/sessionStore.ts`, `src/core/index/directorySource.ts`, `src/core/index/handleRepository.ts`, `src/store/surfaceSelectors.ts`, `src/core/diagnostics/contracts.ts`, `src/i18n/diagnosticCopy.ts`

**Mechanism (confirmed by reading, not inferred).** `pickAndIndexDirectory` wraps *two* phases in one `try`, and classifies errors from both with a rule that is only valid for the first:

```ts
const { source, handle } = await pickDirectory();   // phase 1 — cancellable
void saveDirectoryHandle(handle);
await runIndex(set, source);                        // phase 2 — NOT cancellable
} catch (error) {
  if (error instanceof DirectoryPickCancelledError) { …"no_directory"… }
```

`runIndex` → `buildSessionIndex` → `source.list()` → `walk()` → `entry.getFile()`. On a freshly granted handle `getFile()` can reject with a `DOMException` — and `pickDirectory`'s own catch already converts *any* `AbortError` into `DirectoryPickCancelledError`. A phase-2 failure is therefore reported as "the user cancelled", lands on `no_directory`, and `surfaceSelectors.ts:17` makes that the one value where the browser dialog disappears entirely. Second attempt succeeds because the handle is warm.

**Steps**
1. `BrowseState`: rename `no_directory` → `closed`. It becomes reachable **only** from `closeBrowser()`, the initial state, and an explicit picker cancel. Update `surfaceSelectors.ts` accordingly.
2. Split the try in `pickAndIndexDirectory`: only `pickDirectory()` may produce a cancel. Everything from `saveDirectoryHandle` onward funnels to `index_failed`. Same split in `resumeLastDirectory`.
3. `directorySource.ts`: `DirectoryPickCancelledError` is raised only by `pickDirectory`'s own picker call — add a comment pinning the invariant. `walk()`/`list()` failures propagate as-is.
4. Hoist the gesture: `resumeLastDirectory` must not `await` IndexedDB before `showDirectoryPicker()`. Pre-read the stored handle once at store init into a module-level cache; the click path reads the cache synchronously.
5. `handleRepository.ts`: the three empty `catch {}` blocks report a `warn` diagnostic instead of vanishing. Still best-effort — never throws, never blocks.
6. New diagnostic code `INDEX_DIRECTORY_UNREADABLE` (fatal, index scope) + copy in both locales.

**Automated acceptance**
- Transition test: a `runIndex` rejection lands on `index_failed`, never on `closed`.
- Transition test: a rejection whose `name === "AbortError"` raised *during indexing* still lands on `index_failed`.
- Transition test: picker cancel with zero entries lands on `closed`.
- Selector test: `closed` is the only `browseState` for which `session-browser` does not want to open.

---

## M2 — Subagent identity comes from record content, not from a path string

**Files** `src/core/index/classifySession.ts`, `src/core/pipeline.ts`, `src/components/ReaderMinimap.tsx`

**Mechanism.** `isSubagentPath` matches `(^|/)subagents/`. `SessionLoadActions.onFiles` builds paths as `file.webkitRelativePath || file.name`; a plain multi-file selection has an **empty** `webkitRelativePath`, so the path degrades to `agent-<id>.jsonl`. `pipeline.ts:131` then accepts a subagent transcript as the main transcript and `NO_MAIN_TRANSCRIPT` can never fire.

**Steps**
1. Add `isSubagentContent(parsed)` — true when every event is `isSidechain`, or any event carries an `agentId`. This is the same signal `classifySession` rules 4–5 already trust; it is being promoted from tiebreaker to primary.
2. `pipeline.ts`: pick the main transcript with `!isSubagentPath(path) && !isSubagentContent(file)`. If nothing qualifies **and** at least one file is subagent-shaped, throw `NO_MAIN_TRANSCRIPT` (existing copy already says the right thing).
3. `ReaderMinimap`: density buckets and the "you are here" dot must both derive from the same projection. Today buckets come from `projection.targets` and the dot from `viewItems.findIndex`. Resolve the dot through the projection; when the projection cannot place it, draw no dot (the existing `currentX === null` branch already handles this correctly).

**Automated acceptance**
- Pipeline test: two subagent-shaped files with bare basenames (no `subagents/` in the path) throw `NO_MAIN_TRANSCRIPT`.
- Pipeline test: a real main + a bare-basename subagent still parses, with the main chosen correctly.
- Minimap test: a `selectedId` absent from the projection produces no dot.

---

## M3 — `outcome` is a semantic slot; markers are not messages

**Files** `src/types/spanTree.ts`, `src/core/normalize/normalizer.ts`, `src/core/distill/distiller.ts`, `src/components/labels.ts`, `src/i18n/locales.ts`

**Mechanism.** `KIND_TO_SPAN_TYPE` maps the adapter's `unknown` kind (which is what compaction/api-error markers are emitted as) to `assistant_msg` — marker identity is destroyed at the normalize boundary. `distiller.ts:54` then crowns `spans[spans.length - 1]` as `outcome` unconditionally, so a trailing compaction marker becomes the conversation's "result".

**Steps**
1. `SpanType` gains `"marker"`. `KIND_TO_SPAN_TYPE.unknown` → `"marker"`.
2. `distiller`: `outcome` = the last span whose type is **not** `marker`. Markers never occupy a spine station.
3. `labels.ts` `SPAN_DOT` + `locales.ts` `spanKind` gain a `marker` entry in both locales (the `Record<SpanType, …>` typing makes this compiler-enforced).
4. `milestone` decision: the `SkeletonNodeKind` union declares it, `sessionMap.ts:359` treats it as a chapter boundary, and the distiller never emits it. **Ruling for this round: keep the union member and emit it** — the denoiser already tags `milestone` on user messages (`denoiser.ts:38`), so promote a tagged non-first user message to a `milestone` station. This closes the dead branch without inventing a new rule.

**Automated acceptance**
- Distiller test: a document ending in a marker span puts `outcome` on the last content span, not the marker.
- Distiller test: a marker span appears in no `nodes` entry and no `ribs` entry.
- Distiller test: a mid-conversation `milestone`-tagged user message produces a `milestone` station.
- Snapshot: `pipeline.test.ts.snap` re-approved if the sample fixture shifts.

---

## M4 — Named degradation is not a silent fallback

**Files** `src/core/index/sessionIndexer.ts`, `src/core/diagnostics/contracts.ts`, `src/i18n/diagnosticCopy.ts`, `CLAUDE.md`

**Steps**
1. Drop the per-file `reportFallback("sessionIndexer/pickTitle", …)`. `titleSource: "filename"` is already a first-class value rendered with its own class and tooltip.
2. Emit one aggregate `info` per index run: `INDEX_TITLE_FROM_FILENAME` with `count`.
3. `CLAUDE.md`: sharpen the invariant — `reportFallback` is for a substitution the caller **cannot observe**. A degradation already encoded in the return type and surfaced in the UI reports through diagnostics instead.

**Automated acceptance** Indexer test: N title-less files produce exactly one `INDEX_TITLE_FROM_FILENAME` diagnostic with `count === N`, and zero fallback reports.

---

## M5 — Load entries: folder first (ruling F1)

**Files** `src/components/SessionLoadActions.tsx`, `src/i18n/locales.ts`

**Steps**
1. Order: folder button first, `.jsonl` label second.
2. Folder button becomes `.btn primary`; the file label stays default weight.
3. Copy: `loadFile` → "載入單一檔案" / "Load a single file"; `loadFileTitle` explains it is for a file whose path you already know, and points to the folder entry otherwise. `loadFolderTitle` becomes the primary explanation ("挑選 session，不必先知道檔名").
4. Both locales, both label sets (`header` and `overview`).

**Automated acceptance** `SessionLoadActions.test.tsx`: DOM order is folder-then-file, and the folder control carries `primary`.

---

## M6 — `.btn` gets a size contract; per-site overrides come back to tokens

**Files** `src/styles/index.css`, `src/components/OverviewView.tsx`

**Sweep result (43 call sites).** Three classes of override exist today:
- *Legitimate variants* — `.compact-action` (square icon), `.compact-replay` (min-width), `.map-launcher` (FAB), `.map-close`, `.ap-stop`/`.ap-close` (compact strip). Keep, but express through the token.
- *Layout-only* — `.ol-recheck`, `.settings-dialog-close`, `.parse-notice-details-toggle`, `.welcome-more-toggle`. No change needed.
- *Ad-hoc sizing / re-declaring what `.btn` should own* — `.overview-primary-action { min-height:40px; padding-inline:20px }`, and `.settings-toggle-btn` / `.structure-drawer-trigger` each re-declaring `display:inline-flex; align-items:center`.

**Steps**
1. `.btn` declares the contract: `display:inline-flex; align-items:center; justify-content:center; box-sizing:border-box; line-height:1; min-height:var(--btn-min-h, 30px); white-space:nowrap;`.
2. Size variants as token overrides, not as new padding rules: `.btn.lg { --btn-min-h: 40px; padding-inline: 20px; }`, and `.ap-stop, .ap-close { --btn-min-h: 22px; }`.
3. `.overview-primary-action` sizing removed; the element uses `btn primary lg`.
4. Remove the now-redundant `display`/`align-items` from `.settings-toggle-btn`. `.structure-drawer-trigger` keeps `display:none` (that is a visibility rule, not a size rule) and drops `align-items`.

**Automated acceptance** Not statically verifiable — see the manual checklist. `npm run build` must stay green.

---

## M7 — The progress strip owns its own width assumptions

**Files** `src/styles/index.css`

**Mechanism.** `grid-template-columns: minmax(220px,1fr) minmax(120px,320px) auto` — copy and bar both hold hard minimums, the button column is the only unprotected one, so it is what collapses inside the settings dialog. The existing narrow-width rule is a *viewport* media query and cannot see that the dialog is a narrow container in a wide window.

**Steps**
1. Bar column → `minmax(40px, 1fr)`; copy column → `minmax(0, 2fr)`; button column `auto` + `white-space: nowrap`.
2. Add `container-type: inline-size` to the strip's host and convert the narrow-layout rule from `@media` to `@container`. The project already uses container queries (`.sidebar`, `@container dit-app`), so this introduces no new mechanism.

---

## M8 — The minimap must read as density

**Files** `src/components/ReaderMinimap.tsx`, `src/i18n/locales.ts`, `src/styles/index.css`

The bars are per-bucket landmark counts, normalised to that session's own peak — correct behaviour that the UI never states. Give the component a visible axis baseline plus a small "密度" caption, and put the normalisation fact into the `aria-label`/tooltip so the encoding is stated where it is read. No change to the computation.

---

## M9 — One source of truth for category definitions

**Files** new `src/core/view/categoryDefinitions.ts`, `src/i18n/locales.ts`, `src/components/StructureLegend.tsx`, `src/components/SessionMapDialog.tsx`, `docs/USER_GUIDE.md`

Every spine kind and rib kind gets: one-sentence definition, the actual trigger rule, one real example. One table, consumed by the legend tooltip, the map legend, and the user guide. A definition that exists in three places will diverge.

**Automated acceptance** A table-completeness test in the same shape as `diagnosticCopy.test.ts`: every `SkeletonNodeKind` and `SkeletonRibKind` has a definition in every locale.

---

## M10 — Markdown / LaTeX: design note only (ruling F3)

**Files** new `docs/design/DIT_TEXT_RENDERING.md`. **No `src/` changes.**

Must record: the rendering-scope boundary (which constructs are in and out); the sanitisation stance (no raw HTML injection — the reader renders agent-authored text, which is untrusted input); the fact that there are **two** render paths (reader view and the single-file export snapshot) that must not diverge; the bundle-size constraint the single-file snapshot imposes; candidate libraries with the selection criteria. The point is that the next round does not re-derive any of this.

---

## M11 — Test-step and expectation copy

1. **B3** — the UAT step is unexecutable by construction: the welcome dialog blocks background controls, which is exactly what it must do. Rewrite the step to load a fatal-bearing file *at startup* so both surfaces contend without needing a background click.
2. **B6** — File System Access persists the *handle*, never the *permission*. Add copy near the folder entry stating that the browser re-asks on every fresh page load and that the red styling is the browser's own file-access prompt. Turn the surprise into an expectation; do not attempt to suppress it.

---

## §1 已知不做 / 降級聲明

- **B5（Firefox / Safari 後備路徑）** 仍未實跑。本輪不觸碰該路徑，因此風險維持在 R9 的水準，不增不減。
- **不新建 `<Button>` 元件層**（作者裁決 F2）。M6 只補尺寸契約與盤點；是否值得抽象，由盤點結果留待日後判斷。
- **不實作 Markdown / LaTeX**（作者裁決 F3），只交付設計引導文件。
- **DSM-7/8/9/10 與 e2e 缺口**不動，續留 `docs/BACKLOG.md`。
