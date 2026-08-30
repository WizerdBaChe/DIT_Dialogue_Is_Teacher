#!/usr/bin/env node
/**
 * Round-id allocation checker.
 *
 * Why this exists: DIT has collided round ids twice. Once when two different rounds both
 * called themselves R9, and once on 2026-08-26 when records deferred work "to R12" while
 * R12 was still unallocated, and R12 was later given to an unrelated theme. Both times the
 * rule ("allocate the id before writing any file") existed and was correct; nothing made it
 * checkable, so it lived only in the memory of whoever was writing at the time.
 *
 * The property this enforces is a property of the ASSET, not an instruction to a reader:
 *
 *   P1  Every round id referenced in a LIVE RECORD is allocated in docs/rounds/ROUNDS.md.
 *   P2  No id is allocated twice, and no two ids share a directory.
 *   P3  The registry and docs/rounds/ agree in both directions.
 *   P4  Every `home` cell in docs/DEFERRED.md is `unassigned` or an allocated id.
 *
 * What it deliberately does NOT rule on, because it cannot determine it:
 *   - Whether an `R<N>` reference MEANS the round it names. R11.2's work cards are also
 *     numbered R1..R8, so "R2 followed it" resolves to an allocated id and stays silent.
 *     This checker rules on allocation only, and says so in its output.
 *   - Anything under docs/rounds/**. Those are frozen round documents; "R12 候選" written
 *     before R12 was allocated was true when written, and rewriting the evidence a
 *     post-mortem would use is worse than the ambiguity. Misreading risk there is handled
 *     by dated correction notes, not by edits.
 *
 * Usage:
 *   node scripts/check-round-ids.mjs             check the repo
 *   node scripts/check-round-ids.mjs --selftest  run the positive/negative controls only
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const REGISTRY = "docs/rounds/ROUNDS.md";
const REGISTER = "docs/DEFERRED.md";
const ROUNDS_DIR = "docs/rounds";

/** Files the next session reads to decide what to do. A stale id here misdirects work. */
const LIVE_RECORDS = [
  "references/DIT-decisions.md",
  "references/DIT-phase-log.md",
  "references/DIT-tickets.md",
  "references/DIT-context.md",
  "docs/DEFERRED.md",
  "CLAUDE.md",
];

/** `R12`, `R9.1`, and the `R11-Q3` / `R7B-05` / `INV-R12-1` shapes, which carry a bare number. */
const ROUND_REF = /\bR(\d+(?:\.\d+)?)\b/g;

/**
 * The two id shapes. `R<N>` is the CLOSED legacy namespace (R1..R12, author ruling 2026-08-26);
 * `<YYYY-MM>-<slug>` is what every round from the next one on uses. The new shape is why P1 below
 * is now a guard over old ids only: you cannot forward-reference an id whose slug names a theme
 * nobody has chosen yet, so there is nothing left for that rule to catch on new rounds.
 */
const ROW_ID = /^\|\s*(R\d+(?:\.\d+)?|\d{4}-\d{2}-[a-z0-9][a-z0-9-]*)\s*\|\s*([^|]*?)\s*\|/;

const read = (rel) => readFileSync(join(repoRoot, rel), "utf8").replace(/^﻿/, "");

/** Parse the registry table. Returns Map<id, {dir, line}>; `dir` is null for a round with no directory. */
function parseRegistry(text) {
  const rows = new Map();
  const duplicates = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const m = ROW_ID.exec(line);
    if (!m) return;
    const [, id, dirCell] = m;
    const dir = /^[—-]$/.test(dirCell.trim()) ? null : dirCell.replace(/`/g, "").trim();
    if (rows.has(id)) duplicates.push({ id, line: i + 1, first: rows.get(id).line });
    else rows.set(id, { dir, line: i + 1 });
  });
  return { rows, duplicates };
}

/** The bare numbers of the legacy R ids, which are the only ids P1 can rule on. */
const legacyNumbers = (rows) =>
  new Set([...rows.keys()].filter((id) => id.startsWith("R")).map((id) => id.slice(1)));

/** Collect every round id referenced in `text`, with the line each was seen on. */
function collectRefs(text) {
  const refs = new Map();
  text.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(ROUND_REF)) {
      if (!refs.has(m[1])) refs.set(m[1], i + 1);
    }
  });
  return refs;
}

function checkLiveRecords(allocated, files) {
  const violations = [];
  for (const rel of files) {
    if (!existsSync(join(repoRoot, rel))) continue;
    for (const [id, line] of collectRefs(read(rel))) {
      if (!allocated.has(id)) {
        violations.push({ rel, line, id });
      }
    }
  }
  return violations;
}

/**
 * Two-sided calibration. A gate that never fails scores 100% on a one-sided check, so the
 * negative control alone proves nothing. Both must behave or the checker is broken.
 */
function selftest() {
  const allocated = new Set(["11", "11.2", "12"]);
  const clean = "R11.2 lands before R12; see R11 for the merge gate.";
  const dirty = "the ten findings are deferred to R13, alongside R12 work.";

  const negative = checkLiveRecords(allocated, []).length === 0
    && [...collectRefs(clean)].every(([id]) => allocated.has(id));
  const positive = [...collectRefs(dirty)].some(([id]) => !allocated.has(id));

  // The registry parser has to read both id shapes, or a new-style round silently vanishes
  // from the table and every one of P2/P3/P4 goes quiet about it.
  const parsed = parseRegistry(
    "| R11.2 | `r11.2-uat-repairs` | x | y |\n| 2026-09-codex-provenance | `2026-09-codex-provenance` | x | y |\n| id | dir | x | y |",
  ).rows;
  const bothShapes = parsed.size === 2 && parsed.has("R11.2") && parsed.has("2026-09-codex-provenance");

  const failures = [];
  if (!negative) failures.push("negative control FAILED: a clean input was flagged");
  if (!positive) failures.push("positive control FAILED: a deferral to an unallocated R id was NOT flagged");
  if (!bothShapes) failures.push(`registry parser FAILED: expected both id shapes, got [${[...parsed.keys()]}]`);
  return { negative, positive, failures };
}

function main() {
  const selftestOnly = process.argv.includes("--selftest");

  const controls = selftest();
  if (controls.failures.length) {
    console.error("check:rounds — INSTRUMENT BROKEN, no verdict issued");
    controls.failures.forEach((f) => console.error(`  ${f}`));
    process.exit(2);
  }
  console.log("check:rounds — controls: positive fires, negative silent");
  if (selftestOnly) return;

  const { rows, duplicates } = parseRegistry(read(REGISTRY));
  const allocated = legacyNumbers(rows);
  const problems = [];

  // P2 — no id allocated twice, no directory claimed twice.
  for (const d of duplicates) {
    // `d.id` already carries its prefix (the row regex captures `R12` or `2026-09-slug` whole),
    // so the extra `R` here printed `RR1 is allocated twice`. Display only — detection was right.
    problems.push(`${REGISTRY}:${d.line} ${d.id} is allocated twice (first at line ${d.first})`);
  }
  const byDir = new Map();
  for (const [id, { dir, line }] of rows) {
    if (!dir) continue;
    if (byDir.has(dir)) problems.push(`${REGISTRY}:${line} directory \`${dir}\` is claimed by both ${byDir.get(dir)} and ${id}`);
    else byDir.set(dir, id);
  }

  // P3 — registry and filesystem agree in both directions.
  for (const [id, { dir, line }] of rows) {
    if (dir && !existsSync(join(repoRoot, ROUNDS_DIR, dir))) {
      problems.push(`${REGISTRY}:${line} ${id} names \`${dir}\`, which does not exist`);
    }
  }
  const onDisk = readdirSync(join(repoRoot, ROUNDS_DIR), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  for (const dir of onDisk) {
    if (!byDir.has(dir)) problems.push(`${ROUNDS_DIR}/${dir}/ exists but is not allocated in ${REGISTRY}`);
  }

  // P1 — live records may only reference allocated ids.
  for (const v of checkLiveRecords(allocated, LIVE_RECORDS)) {
    problems.push(
      `${v.rel}:${v.line} references R${v.id}, which is NOT allocated. ` +
        `Deferred work takes a DW id in ${REGISTER}; it does not reserve the next number.`,
    );
  }

  // P4 — DEFERRED.md `home` cells resolve.
  if (existsSync(join(repoRoot, REGISTER))) {
    read(REGISTER).split(/\r?\n/).forEach((line, i) => {
      const m = /^\|\s*DW-(\d+)\s*\|\s*([^|]*?)\s*\|/.exec(line);
      if (!m) return;
      const home = m[2].replace(/`/g, "").trim();
      if (home === "unassigned" || rows.has(home)) return;
      problems.push(`${REGISTER}:${i + 1} DW-${m[1]} has home \`${home}\`; expected \`unassigned\` or an id listed in ${REGISTRY}`);
    });
  }

  const scanned = LIVE_RECORDS.filter((f) => existsSync(join(repoRoot, f)));
  console.log(`check:rounds — ${rows.size} ids allocated, ${onDisk.length} round directories, ${scanned.length} live records scanned`);
  console.log("check:rounds — rules on ALLOCATION only; it cannot tell whether a reference means the round it names");
  console.log(`check:rounds — docs/rounds/** is exempt by design: frozen round documents are evidence, not live records`);

  if (problems.length) {
    console.error(`\ncheck:rounds — ${problems.length} problem(s):`);
    problems.forEach((p) => console.error(`  ${p}`));
    process.exit(1);
  }
  console.log("check:rounds — OK");
}

main();
