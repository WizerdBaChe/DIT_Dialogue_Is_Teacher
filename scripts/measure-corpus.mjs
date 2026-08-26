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
 *   node scripts/measure-corpus.mjs titles        what a Codex derived title is actually made of
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

/**
 * The author's B1 verdict was "未通過 … 甚至出現 `1.混用` 還有一些 `<>` 的東西": Codex titles are
 * mostly the filename, and the ones that are not are sometimes machine text. This asks the corpus
 * what the FIRST human message of a rollout actually begins with, so the cleanliness rule is
 * written against observed shapes rather than imagined ones.
 *
 * `INJECTION_TAGS` below is a copy of `src/core/text/preamble.ts`'s whitelist, on purpose — the
 * question here is "what survives the shipping whitelist", so an independent copy is what shows a
 * gap between the whitelist and the data instead of hiding it.
 */
const INJECTION_TAGS = [
  "recommended_plugins", "INSTRUCTIONS", "environment_context", "command-name",
  "command-message", "command-args", "local-command-stdout", "system-reminder",
];

function stripPreamble(text) {
  const tagRe = new RegExp(`^<(${INJECTION_TAGS.join("|")})>[\\s\\S]*?<\\/\\1>`);
  let out = text.replace(/^\s+/, "");
  for (let i = 0; i < 50; i += 1) {
    const m = tagRe.exec(out);
    if (m) { out = out.slice(m[0].length).replace(/^\s+/, ""); continue; }
    const h = /^#[^\n]*\n?/.exec(out);
    if (h) {
      let rest = out.slice(h[0].length);
      let c;
      while ((c = /^(?:[ \t]+[^\n]*\n?|[-*][ \t][^\n]*\n?|\d+[.)][ \t][^\n]*\n?|[ \t]*\n)/.exec(rest))) rest = rest.slice(c[0].length);
      out = rest.replace(/^\s+/, "");
      continue;
    }
    break;
  }
  return out;
}

const flatten = (content) => (Array.isArray(content) ? content : [])
  .map((block) => (block && typeof block.text === "string" ? block.text : ""))
  .join("")
  .trim();

async function titles() {
  const state = JSON.parse(readFileSync(join(CODEX, ".codex-global-state.json"), "utf8"));
  const descriptions = state["electron-persisted-atom-state"]?.["thread-descriptions-v1"] ?? {};
  const files = walk(join(CODEX, "sessions"), (n) => /^rollout-.*\.jsonl$/i.test(n));

  const leadingTag = new Map();
  let total = 0, withSidecar = 0, withDerived = 0, noText = 0;
  let startsWithTag = 0, startsWithSlash = 0, veryShort = 0;
  let forks = 0, forkParentDescribed = 0, forkOwnDescribed = 0;
  const samples = [];

  for (const { abs } of files) {
    total += 1;
    let meta = null, first = null;
    for await (const r of records(abs)) {
      if (r.type === "session_meta" && !meta) meta = r.payload ?? {};
      if (first === null && r.type === "response_item") {
        const p = r.payload ?? {};
        if (p.type === "message" && p.role === "user") {
          const text = flatten(p.content);
          // The auto-review dump wears a user envelope; its own detector lives in the adapter.
          if (text && !/^#{0,3}\s*(Auto-review|Reviewing changes)/i.test(text)) first = text;
        }
      }
      if (meta && first !== null) break;
    }
    const id = meta?.id, parent = meta?.session_id;
    if (id && descriptions[id]) withSidecar += 1;
    if (id && parent && id !== parent) {
      forks += 1;
      if (descriptions[id]) forkOwnDescribed += 1;
      else if (descriptions[parent]) forkParentDescribed += 1;
    }

    if (first === null) { noText += 1; continue; }
    const stripped = stripPreamble(first);
    if (!stripped) { noText += 1; continue; }
    withDerived += 1;
    const head = stripped.split("\n")[0].trim();
    if (head.startsWith("<")) {
      startsWithTag += 1;
      const tag = (/^<\/?([A-Za-z0-9_.:-]+)/.exec(head) ?? [])[1] ?? "(malformed)";
      leadingTag.set(tag, (leadingTag.get(tag) ?? 0) + 1);
      if (samples.length < 8) samples.push(head.slice(0, 90));
    } else if (head.startsWith("/")) {
      startsWithSlash += 1;
      if (samples.length < 8) samples.push(head.slice(0, 90));
    } else if (head.replace(/[\s\p{P}\p{S}\d]/gu, "").length < 4) {
      veryShort += 1;
      if (samples.length < 8) samples.push(head.slice(0, 90));
    }
  }

  const pct = (n) => `${((100 * n) / Math.max(1, total)).toFixed(1)}%`;
  console.log(`rollouts                                 ${total}`);
  console.log(`rung 1 · sidecar description (own id)    ${withSidecar}  ${pct(withSidecar)}`);
  console.log(`rung 2 · derived, some text survives     ${withDerived}  ${pct(withDerived)}`);
  console.log(`rung 3 · nothing usable -> filename      ${noText}  ${pct(noText)}`);
  console.log(``);
  console.log(`DIRTY derived titles (of ${withDerived} derived):`);
  console.log(`  still opens with a <tag>               ${startsWithTag}`);
  console.log(`  opens with a /slash-command            ${startsWithSlash}`);
  console.log(`  <4 word characters (e.g. "1.")         ${veryShort}`);
  console.log(`  leading tags seen: ${[...leadingTag.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}=${n}`).join(" ") || "(none)"}`);
  for (const s of samples) console.log(`    e.g. ${JSON.stringify(s)}`);
  console.log(``);
  console.log(`FORKS (payload.id !== payload.session_id): ${forks}`);
  console.log(`  with a description of their own        ${forkOwnDescribed}`);
  console.log(`  whose PARENT has one (the expansion)   ${forkParentDescribed}`);
  console.log(`  sidecar coverage if parents count      ${withSidecar + forkParentDescribed}  ${pct(withSidecar + forkParentDescribed)}`);
}

/**
 * Blast radius of the derived-title cleanliness gate on Claude Code, whose ladder reaches
 * `derived` only after `custom` and `ai` both miss. Applying a rule to one source and measuring
 * it on the other is the whole point: the gate is a property of the TEXT, so it will run here too.
 */
async function titlesClaude() {
  const files = walk(CLAUDE, (n) => /\.jsonl$/i.test(n)).filter((f) => !/\/subagents\//i.test(f.rel));
  let total = 0, named = 0, derived = 0, dirty = 0, none = 0;
  const samples = [];
  for (const { abs } of files) {
    total += 1;
    let custom = null, ai = null, first = null;
    for await (const r of records(abs)) {
      if (typeof r.customTitle === "string" && r.customTitle.trim() && !custom) custom = r.customTitle;
      if (typeof r.aiTitle === "string" && r.aiTitle.trim() && !ai) ai = r.aiTitle;
      if (first === null && r.type === "user" && !r.isMeta) {
        const c = r.message?.content;
        const text = typeof c === "string" ? c : flatten(c);
        if (text) first = text;
      }
      if ((custom || ai) && first !== null) break;
    }
    if (custom || ai) { named += 1; continue; }
    const stripped = first ? stripPreamble(first) : "";
    if (!stripped.trim()) { none += 1; continue; }
    derived += 1;
    const head = stripped.split("\n")[0].trim();
    const isDirty = head.startsWith("<") || head.startsWith("/")
      || head.replace(/[\s\p{P}\p{S}\d]/gu, "").length < 4;
    if (isDirty) { dirty += 1; if (samples.length < 10) samples.push(head.slice(0, 70)); }
  }
  console.log(`claude-code transcripts (non-subagent)   ${total}`);
  console.log(`  titled before the derived rung         ${named}`);
  console.log(`  would USE the derived rung             ${derived}`);
  console.log(`  of those, the gate would REJECT        ${dirty}   <- blast radius`);
  console.log(`  no text at all -> filename anyway      ${none}`);
  for (const s of samples) console.log(`    e.g. ${JSON.stringify(s)}`);
}

const mode = process.argv[2];
const modes = { sidecar, attribution, picks, titles, "titles-claude": titlesClaude };
if (!modes[mode]) {
  console.error(`usage: node scripts/measure-corpus.mjs <${Object.keys(modes).join("|")}>`);
  process.exit(2);
}
void statSync; // keep the import honest if a mode stops using it
await modes[mode]();
