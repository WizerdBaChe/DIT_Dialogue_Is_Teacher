#!/usr/bin/env node

/**
 * Keep Codex's native AGENTS.md entrypoint aligned with the authoritative CLAUDE.md.
 *
 * The two files intentionally use different amounts of prose, so comparing paragraphs would
 * reward copy-paste and make the thin pointer brittle. Instead, each costly invariant carries a
 * one-line `dit-contract` marker. The marker payload is deliberately exact and machine-readable;
 * surrounding prose may remain concise in AGENTS.md and explanatory in CLAUDE.md.
 *
 * `--probe-desync` mutates the round-id marker in memory. It is the required positive control:
 * the command must name `round-id` and exit non-zero without modifying either instruction file.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const AGENTS_PATH = join(ROOT, "AGENTS.md");
const CLAUDE_PATH = join(ROOT, "CLAUDE.md");
const DEFAULT_PROJECT_DOC_MAX_BYTES = 32 * 1024;
const MARKER_RE = /<!--\s*dit-contract:\s*([a-z0-9-]+)\s*\|\s*([^\r\n]*?)\s*-->/g;

function readUtf8(path) {
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
}

function extractMarkers(label, source, errors) {
  const markers = new Map();

  for (const match of source.matchAll(MARKER_RE)) {
    const [, id, payload] = match;
    if (markers.has(id)) {
      errors.push(`${label}: duplicate contract marker "${id}"`);
      continue;
    }
    markers.set(id, payload.trim());
  }

  if (markers.size === 0) errors.push(`${label}: no dit-contract markers found`);
  return markers;
}

function compareMarkers(agentsMarkers, claudeMarkers, errors) {
  for (const [id, agentsPayload] of agentsMarkers) {
    if (!claudeMarkers.has(id)) {
      errors.push(`contract "${id}": present in AGENTS.md but missing from CLAUDE.md`);
      continue;
    }

    const claudePayload = claudeMarkers.get(id);
    if (agentsPayload !== claudePayload) {
      errors.push(
        `contract "${id}": payload differs\n` +
        `  AGENTS.md: ${agentsPayload}\n` +
        `  CLAUDE.md: ${claudePayload}`,
      );
    }
  }

  for (const id of claudeMarkers.keys()) {
    if (!agentsMarkers.has(id)) {
      errors.push(`contract "${id}": present in CLAUDE.md but missing from AGENTS.md`);
    }
  }
}

function validate(agentsSource, claudeSource) {
  const errors = [];
  const agentsMarkers = extractMarkers("AGENTS.md", agentsSource, errors);
  const claudeMarkers = extractMarkers("CLAUDE.md", claudeSource, errors);

  compareMarkers(agentsMarkers, claudeMarkers, errors);

  if (!/does not natively include `CLAUDE\.md`/.test(agentsSource)) {
    errors.push("AGENTS.md: missing the native-loader boundary for CLAUDE.md");
  }
  if (!/read `CLAUDE\.md`[\s\S]*in full with a file-reading\s+tool/.test(agentsSource)) {
    errors.push("AGENTS.md: missing the executable instruction to read CLAUDE.md in full");
  }

  return { errors, markerCount: agentsMarkers.size };
}

const probeDesync = process.argv.includes("--probe-desync");
let agentsSource = readUtf8(AGENTS_PATH);
const claudeSource = readUtf8(CLAUDE_PATH);

if (probeDesync) {
  const seeded = agentsSource.replace("new=<YYYY-MM>-<slug>", "new=r<N>-<slug>");
  if (seeded === agentsSource) {
    console.error('[instruction-drift] positive control could not seed contract "round-id"');
    process.exit(2);
  }
  agentsSource = seeded;
}

const { errors, markerCount } = validate(agentsSource, claudeSource);
const agentsBytes = Buffer.byteLength(readUtf8(AGENTS_PATH), "utf8");
if (agentsBytes > DEFAULT_PROJECT_DOC_MAX_BYTES) {
  errors.push(
    `AGENTS.md: ${agentsBytes} bytes exceeds Codex's default project_doc_max_bytes ` +
    `(${DEFAULT_PROJECT_DOC_MAX_BYTES}); portable loading is not assured`,
  );
}

if (errors.length > 0) {
  console.error(`[instruction-drift] FAIL (${errors.length} issue${errors.length === 1 ? "" : "s"})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `[instruction-drift] PASS (${markerCount} contracts aligned; AGENTS.md ${agentsBytes} bytes)`,
);
