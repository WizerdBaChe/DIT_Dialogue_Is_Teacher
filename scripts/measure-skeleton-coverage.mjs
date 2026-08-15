/**
 * Skeleton coverage measurement (R11 M5 investigation tool).
 *
 * Question it answers: over the REAL local corpora, how many spine nodes and ribs does
 * `distill()` actually produce per session, per source — and how often is the spine exactly
 * {objective, outcome} with nothing in between?
 *
 * It runs the PRODUCT pipeline, not a re-implementation. `src/core/pipeline.ts` is bundled with
 * esbuild into a temp ESM module and imported, so adapter → normalize → denoise → distill is
 * exactly the code the app ships. No product file is modified.
 *
 * Two cohorts are reported per source:
 *   - `all`            — every rollout found under the root.
 *   - `conversational` — only sessions with at least one `user_msg` span. Measured 2026-08-15:
 *                        74 of 358 local Codex rollouts are auto-review agent transcripts with
 *                        no user turn at all, so they can never have an `objective` node. Mixing
 *                        them into the headline would overstate the defect.
 *
 * ── Privacy design (same discipline as scan-codex-sessions.mjs) ───────────────────────────
 * The report contains COUNTS and CLOSED ENUMS ONLY. It never emits message text, thinking text,
 * command strings, cwd, file paths, session ids, or file names.
 *   - Span types are a closed union from `src/types/spanTree.ts`.
 *   - Skeleton node/rib kinds are closed unions.
 *   - Tool names are passed through `TOOL_NAME_WHITELIST`. Everything else is bucketed as
 *     `(other)`. This matters: R10.1 proved Codex's `EXEC_TOOL_NAME_RE` can lift arbitrary
 *     identifiers out of free-form `input` (`combinations`, `append`, `items`), so an
 *     unfiltered tool-name tally would be a content leak.
 *   - Text is measured by LENGTH only, never emitted.
 *   - Scanned roots are reported as "(omitted)"; files are never named.
 *
 * Usage:
 *   node scripts/measure-skeleton-coverage.mjs --codex=<dir> --claude=<dir> [--out=.] [--quiet]
 *   node scripts/measure-skeleton-coverage.mjs --codex=%USERPROFILE%\.codex\sessions ^
 *        --claude=%USERPROFILE%\.claude\projects --out=.
 *
 * Options:
 *   --codex=<dir>     root of Codex rollouts (recursive, *.jsonl)
 *   --claude=<dir>    root of Claude Code sessions (recursive, *.jsonl)
 *   --out=<dir>       output directory for skeleton-coverage-report.json (default: cwd)
 *   --limit=<n>       scan at most n files per source, newest first (0 = all, default 0)
 *   --max-bytes=<n>   skip files larger than n bytes; skips are reported (default 0 = no cap)
 *   --quiet           no per-file progress
 */
import { build } from "esbuild";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const entry = process.argv.find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

const codexRoot = readArg("codex", null);
const claudeRoot = readArg("claude", null);
if (!codexRoot && !claudeRoot) {
  console.error("usage: node scripts/measure-skeleton-coverage.mjs --codex=<dir> --claude=<dir> [--out=.]");
  process.exit(1);
}
const outDir = resolve(readArg("out", process.cwd()));
const limit = Number(readArg("limit", "0"));
const maxBytes = Number(readArg("max-bytes", "0"));
const quiet = process.argv.includes("--quiet");

// ── closed enums allowed into the report ────────────────────────────────────────────────
const TOOL_NAME_WHITELIST = new Set([
  // Claude Code
  "Read", "Write", "Edit", "MultiEdit", "NotebookEdit", "NotebookRead", "Grep", "Glob",
  "Bash", "BashOutput", "KillShell", "WebFetch", "WebSearch", "Task", "TodoWrite",
  "ExitPlanMode", "SlashCommand", "AskUserQuestion", "Skill", "Agent",
  // Codex
  "shell_command", "exec_command", "exec", "apply_patch", "web__run", "view_image",
  "update_plan", "tool_search_call",
]);
function safeToolName(name) {
  if (typeof name !== "string" || name.length === 0) return "(none)";
  if (TOOL_NAME_WHITELIST.has(name)) return name;
  if (name.startsWith("mcp__")) return "mcp__*";
  return "(other)";
}

/**
 * Mirror of `DECISION_RE` in `src/core/denoise/denoiser.ts` (copied 2026-08-15; the denoiser does
 * not export it). If that regex changes, this copy is stale and `decisionPredicate` must be
 * re-derived. It is instrumentation for the M5 question "why does no Codex span carry the
 * `decision` tag", not a second implementation of the rule.
 */
const DECISION_RE = /(決定|改用|改成|應該改|換成|instead|let me switch|i'?ll use|we should)/i;

const BUCKETS = [
  { label: "0", test: (n) => n === 0 },
  { label: "1", test: (n) => n === 1 },
  { label: "2", test: (n) => n === 2 },
  { label: "3", test: (n) => n === 3 },
  { label: "4", test: (n) => n === 4 },
  { label: "5", test: (n) => n === 5 },
  { label: "6-10", test: (n) => n >= 6 && n <= 10 },
  { label: "11-20", test: (n) => n >= 11 && n <= 20 },
  { label: "21-50", test: (n) => n >= 21 && n <= 50 },
  { label: "51+", test: (n) => n >= 51 },
];
function histogram(values) {
  const out = {};
  for (const b of BUCKETS) out[b.label] = 0;
  for (const v of values) out[BUCKETS.find((b) => b.test(v)).label] += 1;
  return out;
}
function stats(values) {
  if (values.length === 0) return { n: 0 };
  const s = [...values].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  return {
    n: s.length,
    min: s[0],
    p50: q(0.5),
    p90: q(0.9),
    max: s[s.length - 1],
    mean: Number((s.reduce((t, v) => t + v, 0) / s.length).toFixed(2)),
  };
}
function tally(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1]));
}
function bump(map, key, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

// ── file walk ───────────────────────────────────────────────────────────────────────────
function walk(dir, found = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) found.push(full);
  }
  return found;
}
/** Subagent transcripts are not sessions; the pipeline refuses them as a main file by design. */
function isSubagentPath(path) {
  return /(^|[\\/])subagents[\\/]/i.test(path);
}

// ── build the product pipeline ──────────────────────────────────────────────────────────
const workDir = join(tmpdir(), `dit-skeleton-measure-${process.pid}`);
mkdirSync(workDir, { recursive: true });
const bundlePath = join(workDir, "pipeline.bundle.mjs");
await build({
  entryPoints: [join(REPO, "src/core/pipeline.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundlePath,
  alias: { "@": join(REPO, "src") },
  logLevel: "silent",
});
const { buildSessionDocument } = await import(pathToFileURL(bundlePath).href);

/**
 * One session reduced to numbers and closed enums. Nothing downstream ever sees the document
 * again, which is what keeps the report leak-free by construction.
 */
function measureOne(doc) {
  const nodes = doc.skeleton?.nodes ?? [];
  const ribs = doc.skeleton?.ribs ?? [];
  const kinds = nodes.map((n) => n.kind);
  const ribSpanIds = new Set(ribs.map((r) => r.spanId));

  const rec = {
    spine: nodes.length,
    ribs: ribs.length,
    spans: doc.spans.length,
    user: 0,
    assistant: 0,
    thinking: 0,
    thinkingMatchingDecisionRe: 0,
    thinkingLengths: [],
    nodeKinds: kinds,
    ribKinds: ribs.map((r) => r.kind),
    spanTypes: [],
    toolNames: [],
    toolNamesRibbed: [],
    startEndOnly: nodes.length === 2 && kinds[0] === "objective" && kinds[1] === "outcome",
    hasDecision: kinds.includes("decision"),
  };

  for (const s of doc.spans) {
    rec.spanTypes.push(s.type);
    if (s.type === "user_msg") rec.user += 1;
    else if (s.type === "assistant_msg") rec.assistant += 1;
    else if (s.type === "thinking") {
      rec.thinking += 1;
      const text = typeof s.text === "string" ? s.text : "";
      rec.thinkingLengths.push(text.length);
      if (DECISION_RE.test(text)) rec.thinkingMatchingDecisionRe += 1;
    } else if (s.type === "tool_use") {
      const name = safeToolName(s.tool?.name);
      rec.toolNames.push(name);
      if (ribSpanIds.has(s.id)) rec.toolNamesRibbed.push(name);
    }
  }
  return rec;
}

function summarize(records) {
  const n = records.length;
  const pct = (c) => (n > 0 ? Number(((c / n) * 100).toFixed(1)) : 0);
  const col = (f) => records.map(f);
  const countIf = (f) => records.filter(f).length;

  const nodeKinds = new Map();
  const ribKinds = new Map();
  const spanTypes = new Map();
  const toolNames = new Map();
  const toolNamesRibbed = new Map();
  const thinkingLengths = [];
  let thinkingSpansTotal = 0;
  let thinkingMatching = 0;
  for (const r of records) {
    for (const k of r.nodeKinds) bump(nodeKinds, k);
    for (const k of r.ribKinds) bump(ribKinds, k);
    for (const t of r.spanTypes) bump(spanTypes, t);
    for (const t of r.toolNames) bump(toolNames, t);
    for (const t of r.toolNamesRibbed) bump(toolNamesRibbed, t);
    thinkingLengths.push(...r.thinkingLengths);
    thinkingSpansTotal += r.thinking;
    thinkingMatching += r.thinkingMatchingDecisionRe;
  }

  const noUser = records.filter((r) => r.user === 0);

  return {
    sessions: n,
    spineNodeCount: { ...stats(col((r) => r.spine)), histogram: histogram(col((r) => r.spine)) },
    ribCount: { ...stats(col((r) => r.ribs)), histogram: histogram(col((r) => r.ribs)) },
    spanCount: stats(col((r) => r.spans)),
    userMsgCount: { ...stats(col((r) => r.user)), histogram: histogram(col((r) => r.user)) },
    assistantMsgCount: stats(col((r) => r.assistant)),
    thinkingSpanCount: { ...stats(col((r) => r.thinking)), histogram: histogram(col((r) => r.thinking)) },

    spineIsExactlyStartEnd: { count: countIf((r) => r.startEndOnly), pct: pct(countIf((r) => r.startEndOnly)) },
    spineIsExactlyStartEndAndHasRibs: {
      count: countIf((r) => r.startEndOnly && r.ribs > 0),
      pct: pct(countIf((r) => r.startEndOnly && r.ribs > 0)),
    },
    spineHasAtMostOneNode: { count: countIf((r) => r.spine <= 1), pct: pct(countIf((r) => r.spine <= 1)) },
    sessionsWithAnyDecisionNode: { count: countIf((r) => r.hasDecision), pct: pct(countIf((r) => r.hasDecision)) },
    sessionsWithAnyThinkingSpan: { count: countIf((r) => r.thinking > 0), pct: pct(countIf((r) => r.thinking > 0)) },
    sessionsWithAnyRib: { count: countIf((r) => r.ribs > 0), pct: pct(countIf((r) => r.ribs > 0)) },

    // `distill()` mints `objective` from the FIRST `user_msg`. A session with none can never
    // have one, so this cohort must be separated before the {start,end} share means anything.
    objectivePredicate: {
      sessionsWithNoUserMsg: { count: noUser.length, pct: pct(noUser.length) },
      spanCountOfThoseSessions: {
        ...stats(noUser.map((r) => r.spans)),
        histogram: histogram(noUser.map((r) => r.spans)),
      },
    },

    // `distill()` mints a MID-spine node only from a span tagged `decision`, and `denoise()`
    // only ever tags a span of type `thinking` whose text matches DECISION_RE. These counters
    // separate "no thinking spans" from "thinking spans the vocabulary does not match".
    decisionPredicate: {
      thinkingSpansTotal,
      thinkingSpansMatchingDecisionRe: thinkingMatching,
      thinkingMatchRatePct:
        thinkingSpansTotal > 0 ? Number(((thinkingMatching / thinkingSpansTotal) * 100).toFixed(2)) : 0,
      sessionsWithThinkingMatchingDecisionRe: {
        count: countIf((r) => r.thinkingMatchingDecisionRe > 0),
        pct: pct(countIf((r) => r.thinkingMatchingDecisionRe > 0)),
      },
      thinkingTextLength: stats(thinkingLengths),
    },

    nodeKindTotals: tally(nodeKinds),
    ribKindTotals: tally(ribKinds),
    spanTypeTotals: tally(spanTypes),
    toolUseByName: tally(toolNames),
    toolUseByNameThatBecameARib: tally(toolNamesRibbed),
  };
}

// ── per-source measurement ──────────────────────────────────────────────────────────────
function measureSource(label, root) {
  const all = walk(resolve(root)).filter((p) => !isSubagentPath(p));
  const files = all
    .map((p) => ({ p, mtime: statSync(p).mtimeMs, bytes: statSync(p).size }))
    .sort((a, b) => b.mtime - a.mtime);
  const selected = limit > 0 ? files.slice(0, limit) : files;

  const records = [];
  let skippedTooLarge = 0;
  const failByCode = new Map();

  for (let i = 0; i < selected.length; i += 1) {
    const { p, bytes } = selected[i];
    if (maxBytes > 0 && bytes > maxBytes) {
      skippedTooLarge += 1;
      continue;
    }
    if (!quiet && i % 25 === 0) process.stdout.write(`  ${label}: ${i}/${selected.length}\r`);

    let doc;
    try {
      doc = buildSessionDocument(readFileSync(p, "utf8")).doc;
    } catch (error) {
      // Only the pipeline's own enumerated fatal codes are recorded; a raw message could
      // contain a path, so anything else is bucketed.
      const code = typeof error?.diagnostic?.code === "string" ? error.diagnostic.code : "(non-pipeline-error)";
      bump(failByCode, code);
      continue;
    }
    records.push(measureOne(doc));
  }
  if (!quiet) process.stdout.write(`  ${label}: ${selected.length}/${selected.length}   \n`);

  return {
    filesFound: all.length,
    filesSelected: selected.length,
    filesSkippedTooLarge: skippedTooLarge,
    sessionsBuilt: records.length,
    buildFailuresByCode: tally(failByCode),
    all: summarize(records),
    conversational: summarize(records.filter((r) => r.user > 0)),
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  rootsScanned: "(omitted)",
  note: "counts and closed enums only; no message text, command, path, cwd or session id",
  cohorts: {
    all: "every rollout the walk found",
    conversational: "sessions with >= 1 user_msg span (excludes Codex auto-review agent transcripts)",
  },
  sources: {},
};

if (codexRoot) {
  if (!quiet) console.log("scanning codex…");
  report.sources.codex = measureSource("codex", codexRoot);
}
if (claudeRoot) {
  if (!quiet) console.log("scanning claude-code…");
  report.sources["claude-code"] = measureSource("claude-code", claudeRoot);
}

mkdirSync(outDir, { recursive: true });
const reportPath = join(outDir, "skeleton-coverage-report.json");
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
try {
  rmSync(workDir, { recursive: true, force: true });
} catch {
  /* temp dir cleanup is best-effort */
}

console.log("\n═════════ summary ═════════");
for (const [id, s] of Object.entries(report.sources)) {
  for (const cohort of ["all", "conversational"]) {
    const c = s[cohort];
    console.log(
      `${id} [${cohort}]: n=${c.sessions} · spine p50=${c.spineNodeCount.p50} mean=${c.spineNodeCount.mean} · ` +
        `ribs p50=${c.ribCount.p50} mean=${c.ribCount.mean} · {start,end}-only ${c.spineIsExactlyStartEnd.pct}% · ` +
        `has-decision ${c.sessionsWithAnyDecisionNode.pct}% · ` +
        `thinking→decision ${c.decisionPredicate.thinkingMatchRatePct}%`,
    );
  }
}
console.log(`\nreport: ${reportPath}`);
console.log("report holds structural counts only; open it before sharing.");
