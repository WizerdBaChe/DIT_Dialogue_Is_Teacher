/**
 * R11.2 R1 measurement script.
 *
 * `scan-codex-sessions.mjs` (R9-A) reports *shape* — which record types exist, how many lines
 * are unhandled — but never runs the actual index pipeline, so it cannot answer "what does the
 * picker show". This script does: it boots Vite in middleware mode, loads the real
 * `buildSessionIndex` from `src/core/index/sessionIndexer.ts` via `ssrLoadModule` (so it is the
 * exact production code path, not a reimplementation that could silently drift from it), points
 * it at a real directory on disk through a small Node-fs-backed `DirectorySource`, and reports
 * the classification (`kind`) and title (`titleSource`) distribution over every indexed entry.
 *
 * Usage:
 *   node scripts/measure-codex-index.mjs "C:\Users\<you>\.codex\sessions"
 *
 * Privacy: this only tabulates `kind` / `kindReason` / `titleSource` counts. It never prints a
 * session's title, path, or any message content — only aggregate counts and one example
 * kindReason breakdown by count.
 */
import { createServer } from "vite";
import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

const rootDir = process.argv[2];
if (!rootDir) {
  console.error("Usage: node scripts/measure-codex-index.mjs <sessions directory>");
  process.exit(1);
}

const resolvedRoot = resolve(rootDir);
let rootStat;
try {
  rootStat = statSync(resolvedRoot);
} catch {
  console.error(`FINDING: ${resolvedRoot} does not exist or is not readable — cannot measure. Reporting this, not a fabricated number.`);
  process.exit(1);
}
if (!rootStat.isDirectory()) {
  console.error(`FINDING: ${resolvedRoot} is not a directory — cannot measure.`);
  process.exit(1);
}

function walk(dir, found = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    console.warn(`Skipping unreadable directory ${dir}: ${error.message}`);
    return found;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

function nodeFileOf(absPath, relPath) {
  const size = statSync(absPath).size;
  return {
    path: relPath,
    size,
    read: async (range) => {
      if (!range) return new Blob([readFileSync(absPath)]);
      const len = range.end - range.start;
      const buf = Buffer.alloc(len);
      const fd = openSync(absPath, "r");
      try {
        readSync(fd, buf, 0, len, range.start);
      } finally {
        closeSync(fd);
      }
      return new Blob([buf]);
    },
  };
}

async function main() {
  const files = walk(resolvedRoot);
  if (files.length === 0) {
    console.error(`FINDING: no files found under ${resolvedRoot}.`);
    process.exit(1);
  }

  const server = await createServer({
    root: projectRoot,
    configFile: join(projectRoot, "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "warn",
  });

  let buildSessionIndex;
  try {
    ({ buildSessionIndex } = await server.ssrLoadModule("/src/core/index/sessionIndexer.ts"));
  } finally {
    // keep server open until after buildSessionIndex runs; closed in finally below
  }

  const source = {
    kind: "fsa",
    name: "measure",
    list: async () => files.map((abs) => nodeFileOf(abs, relative(resolvedRoot, abs).split("\\").join("/"))),
  };

  const start = Date.now();
  const { entries, diagnostics } = await buildSessionIndex(source, { maxFiles: 100000 });
  const elapsedMs = Date.now() - start;

  await server.close();

  const total = entries.length;
  const bySource = new Map();
  const byKind = new Map();
  const byKindReason = new Map();
  const byTitleSource = new Map();

  for (const entry of entries) {
    const srcKey = entry.source ?? "(unresolved)";
    bySource.set(srcKey, (bySource.get(srcKey) ?? 0) + 1);
    byKind.set(entry.kind, (byKind.get(entry.kind) ?? 0) + 1);
    byKindReason.set(entry.kindReason, (byKindReason.get(entry.kindReason) ?? 0) + 1);
    byTitleSource.set(entry.titleSource, (byTitleSource.get(entry.titleSource) ?? 0) + 1);
  }

  const codexEntries = entries.filter((e) => e.source === "codex");
  const codexTotal = codexEntries.length;
  const codexClassified = codexEntries.filter((e) => e.kind !== "unknown").length;
  const codexTitled = codexEntries.filter((e) => e.titleSource !== "filename").length;

  const pct = (n, d) => (d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`);

  console.log("══════════ measure-codex-index ══════════");
  console.log(`root scanned: ${resolvedRoot}`);
  console.log(`files walked: ${files.length}  |  index entries: ${total}  |  build time: ${elapsedMs}ms`);
  console.log("");
  console.log("by resolved source:", Object.fromEntries(bySource));
  console.log("by kind (all entries):", Object.fromEntries(byKind));
  console.log("by kindReason (all entries):", Object.fromEntries(byKindReason));
  console.log("by titleSource (all entries):", Object.fromEntries(byTitleSource));
  console.log("diagnostics:", diagnostics.map((d) => `${d.tier}/${d.code}${d.count !== undefined ? `×${d.count}` : ""}`).join(", ") || "(none)");
  console.log("");
  console.log("══════════ Codex-only summary (N =", codexTotal, ") ══════════");
  console.log(`classified as something other than "unknown": ${codexClassified} / ${codexTotal} = ${pct(codexClassified, codexTotal)}`);
  console.log(`titleSource !== "filename": ${codexTitled} / ${codexTotal} = ${pct(codexTitled, codexTotal)}`);
  const codexKindReasons = new Map();
  for (const e of codexEntries) codexKindReasons.set(e.kindReason, (codexKindReasons.get(e.kindReason) ?? 0) + 1);
  console.log("Codex kindReason breakdown:", Object.fromEntries(codexKindReasons));
}

main().catch((error) => {
  console.error("measure-codex-index failed:", error);
  process.exit(1);
});
