#!/usr/bin/env node
/**
 * Re-measure the corpus claims R12's records depend on.
 *
 * Every RESEARCH document in `docs/rounds/r12-source-first-navigation/` says its numbers can be
 * re-checked. Evidence audit 2026-08-27 pointed out that was not strictly true: the probes lived
 * in a scratchpad and never entered version control, so a prose description of the method was
 * all anyone had. A claim nobody else can reproduce is not evidence, it is a memo. This is the
 * missing half.
 *
 * These read the LOCAL corpora directly and do not import DIT's own source — deliberately, so a
 * run here is an independent check of the app rather than a restatement of it. Numbers therefore
 * drift as the corpora grow; what should hold is the RATIO and the structural facts.
 *
 *   node scripts/measure-corpus.mjs sidecar       Codex sidecar join (D-018's load-bearing claim)
 *   node scripts/measure-corpus.mjs attribution   Claude Code attribution fields (M4)
 *   node scripts/measure-corpus.mjs picks         both Codex roots index the same sessions (M3)
 */
import { createReadStream, readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { homedir } from "node:os";

const CODEX = join(homedir(), ".codex");
const CLAUDE = join(homedir(), ".claude", "projects");

function walk(dir, test, out = [], prefix = "") {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    const abs = join(dir, e.name);
    if (e.isDirectory()) walk(abs, test, out, rel);
    else if (test(e.name)) out.push({ abs, rel });
  }
  return out;
}

async function* records(abs) {
  const rl = createInterface({ input: createReadStream(abs), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r && typeof r === "object") yield r;
    } catch { /* a bad line is skipped, exactly as the adapters do */ }
  }
}

/** D-018: the join key is `payload.id`, and `session_id` looks better while being wrong. */
async function sidecar() {
  const state = JSON.parse(readFileSync(join(CODEX, ".codex-global-state.json"), "utf8"));
  const descriptions = state["electron-persisted-atom-state"]?.["thread-descriptions-v1"] ?? {};
  const keys = new Set(Object.keys(descriptions));
  const files = walk(join(CODEX, "sessions"), (n) => /^rollout-.*\.jsonl$/i.test(n));

  let byId = 0, bySessionId = 0, forkedWithOwn = 0, forkedInheriting = 0, forked = 0;
  for (const { abs } of files) {
    for await (const r of records(abs)) {
      if (r.type !== "session_meta") continue;
      const p = r.payload ?? {};
      const isFork = p.id !== p.session_id;
      if (isFork) forked += 1;
      if (keys.has(p.id)) { byId += 1; if (isFork) forkedWithOwn += 1; }
      if (keys.has(p.session_id)) { bySessionId += 1; if (isFork) forkedInheriting += 1; }
      break; // session_meta is the head record
    }
  }
  console.log(`rollouts                       ${files.length}`);
  console.log(`descriptions in the sidecar    ${keys.size}`);
  console.log(`forked threads (id!==session)  ${forked}`);
  console.log(``);
  console.log(`join on payload.id             ${byId} hits`);
  console.log(`join on payload.session_id     ${bySessionId} hits`);
  console.log(`  of which forks inheriting a PARENT's description   ${forkedInheriting}  <- all wrong`);
  console.log(`forks with a description of their own                ${forkedWithOwn}`);
  console.log(``);
  console.log(`D-018 holds if session_id scores HIGHER and its excess is entirely inherited.`);
}

/** M4: the four attribution fields, their shape and their reach. */
async function attribution() {
  const FIELDS = ["attributionSkill", "attributionAgent", "attributionMcpServer", "attributionMcpTool"];
  const files = walk(CLAUDE, (n) => /\.jsonl$/i.test(n));
  let total = 0, attributed = 0, onAssistant = 0, offAssistant = 0, server = 0, tool = 0;
  const filesWith = new Set();
  for (const { abs, rel } of files) {
    for await (const r of records(abs)) {
      total += 1;
      const present = FIELDS.filter((f) => typeof r[f] === "string" && r[f].trim());
      if (!present.length) continue;
      attributed += 1;
      filesWith.add(rel);
      if (r.type === "assistant") onAssistant += 1; else offAssistant += 1;
      if (typeof r.attributionMcpServer === "string") server += 1;
      if (typeof r.attributionMcpTool === "string") tool += 1;
    }
  }
  const pct = (n, d) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
  console.log(`files                    ${files.length}`);
  console.log(`records                  ${total}`);
  console.log(`attributed records       ${attributed} (${pct(attributed, total)})`);
  console.log(`files with attribution   ${filesWith.size} (${pct(filesWith.size, files.length)})`);
  console.log(``);
  console.log(`F-1  on an assistant record   ${onAssistant}    elsewhere ${offAssistant}  <- must be 0`);
  console.log(`F-4  mcp server ${server} vs tool ${tool}  <- must be equal (they never appear apart)`);
}

/** M3: picking `~/.codex` and `~/.codex/sessions` must yield the same sessions. */
function picks() {
  const PATTERN = /^rollout-.*\.jsonl$/i;
  for (const [label, root] of [["~/.codex", CODEX], ["~/.codex/sessions", join(CODEX, "sessions")]]) {
    if (!existsSync(root)) { console.log(`${label.padEnd(20)} MISSING`); continue; }
    const all = walk(root, () => true);
    const jsonl = all.filter((f) => /\.jsonl$/i.test(f.rel));
    const matched = jsonl.filter((f) => PATTERN.test(f.rel.split("/").pop()));
    const sidecarReachable = all.some((f) => f.rel === ".codex-global-state.json");
    console.log(
      `${label.padEnd(20)} files=${String(all.length).padStart(5)} .jsonl=${String(jsonl.length).padStart(4)} ` +
        `rollout=${String(matched.length).padStart(4)} excluded-by-name=${String(jsonl.length - matched.length).padStart(3)} ` +
        `sidecar=${sidecarReachable ? "REACHABLE" : "out of reach"}`,
    );
  }
  console.log(`\nM3 holds if the rollout counts match and only the root pick reaches the sidecar.`);
}

const mode = process.argv[2];
const modes = { sidecar, attribution, picks };
if (!modes[mode]) {
  console.error(`usage: node scripts/measure-corpus.mjs <${Object.keys(modes).join("|")}>`);
  process.exit(2);
}
void statSync; // keep the import honest if a mode stops using it
await modes[mode]();
