// Temporary one-off measurement script for PSM R7.5 M0 baseline.
// Not part of the build; run manually with `node scripts/baseline-r7_5.mjs` after `npm run build`
// is NOT required — this uses ts-node-free approach: it re-implements just enough of the current
// codexJsonlAdapter dispatch logic (top-level type + payload.type) to count event categories,
// mirroring src/core/adapters/codexJsonl.ts as of this baseline. Read-only; touches no app files.
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const XML_BLOCK_RE = /^<([A-Za-z_][\w-]*)>[\s\S]*?<\/\1>/;

function flattenTextBlocks(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object" && "text" in block) return String(block.text ?? "");
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

const NOISE_TOP = new Set(["inter_agent_communication_metadata"]);
const NOISE_EVENT_MSG = new Set(["sub_agent_activity"]);
const NOISE_RESPONSE_ITEM = new Set(["agent_message"]);

function hasEnvInjectPreamble(text) {
  const trimmed = text.replace(/^\s+/, "");
  const m = XML_BLOCK_RE.exec(trimmed);
  return Boolean(m);
}

function analyzeFile(path) {
  const raw = readFileSync(path, "utf8");
  const lines = raw.split(/\r?\n/);
  let totalLines = 0;
  let noiseCount = 0; // inter_agent_communication_metadata + sub_agent_activity + agent_message
  let unknownOther = 0;
  const unknownByType = new Map();
  let firstUserTextHasPreamble = false;
  let sawFirstUserText = false;
  let userTextEnvInjectCards = 0;
  let userTextTotal = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    totalLines += 1;
    let record;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const topType = record.type;
    const payload = record.payload;
    if (!topType) continue;

    if (NOISE_TOP.has(topType)) {
      noiseCount += 1;
      continue;
    }
    if (topType === "event_msg" && payload && NOISE_EVENT_MSG.has(payload.type)) {
      noiseCount += 1;
      continue;
    }
    if (topType === "response_item" && payload && NOISE_RESPONSE_ITEM.has(payload.type)) {
      noiseCount += 1;
      continue;
    }
    if (topType === "response_item" && payload?.type === "message") {
      const role = payload.role;
      if (role !== "developer") {
        const text = flattenTextBlocks(payload.content);
        if (text.trim() && role !== "assistant") {
          userTextTotal += 1;
          if (hasEnvInjectPreamble(text)) {
            userTextEnvInjectCards += 1;
            if (!sawFirstUserText) firstUserTextHasPreamble = true;
          }
          sawFirstUserText = true;
        }
      }
      continue;
    }
    // everything else: count as "known handled" (not tallied further for this baseline)
  }

  return {
    file: path,
    totalLines,
    noiseCount,
    userTextTotal,
    userTextEnvInjectCards,
    firstUserTextHasPreamble,
  };
}

const dir = join(homedir(), ".codex", "sessions", "2026", "07", "23");
const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort();

console.log(`# M0 baseline raw scan — ${dir}`);
console.log(`# ${files.length} files\n`);

let totalNoise = 0;
let totalEnvInject = 0;
const rows = [];
for (const f of files) {
  const stats = analyzeFile(join(dir, f));
  rows.push({ name: f, ...stats });
  totalNoise += stats.noiseCount;
  totalEnvInject += stats.userTextEnvInjectCards;
}

for (const r of rows) {
  console.log(
    `${r.name}\tlines=${r.totalLines}\tsubagent_noise=${r.noiseCount}\tuser_text=${r.userTextTotal}\tenv_inject_user_cards=${r.userTextEnvInjectCards}\tfirst_is_preamble=${r.firstUserTextHasPreamble}`,
  );
}
console.log(`\nTOTAL subagent_noise=${totalNoise} TOTAL env_inject_user_cards=${totalEnvInject}`);
