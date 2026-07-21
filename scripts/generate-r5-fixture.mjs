import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, statSync, writeSync } from "node:fs";
import { resolve } from "node:path";

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const entry = process.argv.find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

function deterministicUuid(index) {
  const hex = createHash("sha256").update(`dit-r5-${index}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const outputDirectory = resolve(readArg("output", ".tmp/r5-50mib"));
const targetMiB = Number(readArg("mib", "50"));
if (!Number.isFinite(targetMiB) || targetMiB <= 0) throw new Error("--mib must be a positive number");

const mainPath = resolve(outputDirectory, "main.jsonl");
const subagentDirectory = resolve(outputDirectory, "subagents");
const subagentPath = resolve(subagentDirectory, "agent-1.jsonl");
mkdirSync(subagentDirectory, { recursive: true });

for (const path of [mainPath, subagentPath]) {
  try {
    statSync(path);
    throw new Error(`Refusing to overwrite existing fixture: ${path}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const main = openSync(mainPath, "wx");
const subagent = openSync(subagentPath, "wx");
const targetBytes = Math.round(targetMiB * 1024 * 1024);
const payload = "deterministic-performance-payload ".repeat(128);
const digests = { main: createHash("sha256"), subagent: createHash("sha256") };
let bytes = 0;
let records = 0;

function writeRecord(handle, digest, record) {
  const line = `${JSON.stringify(record)}\n`;
  writeSync(handle, line);
  digest.update(line);
  bytes += Buffer.byteLength(line);
  records += 1;
}

writeRecord(main, digests.main, {
  type: "ai-title",
  sessionId: "dit-r5-50mib",
  aiTitle: "DIT R5 deterministic 50 MiB fixture",
});

let iteration = 0;
while (bytes < targetBytes) {
  const userId = deterministicUuid(iteration * 4);
  const assistantId = deterministicUuid(iteration * 4 + 1);
  const resultId = deterministicUuid(iteration * 4 + 2);
  const toolUseId = `tool-${String(iteration).padStart(6, "0")}`;
  const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, iteration * 3));

  writeRecord(main, digests.main, {
    type: "user",
    uuid: userId,
    parentUuid: iteration === 0 ? null : deterministicUuid((iteration - 1) * 4 + 2),
    timestamp: timestamp.toISOString(),
    sessionId: "dit-r5-50mib",
    cwd: "D:/fixture",
    message: { role: "user", content: `Inspect deterministic item ${iteration}.` },
  });
  writeRecord(main, digests.main, {
    type: "assistant",
    uuid: assistantId,
    parentUuid: userId,
    timestamp: new Date(timestamp.getTime() + 1_000).toISOString(),
    sessionId: "dit-r5-50mib",
    message: {
      role: "assistant",
      model: "fixture-model",
      content: [
        { type: "thinking", thinking: `Plan deterministic inspection ${iteration}.` },
        {
          type: "tool_use",
          id: toolUseId,
          name: iteration % 2 === 0 ? "Read" : "Grep",
          input: { path: `src/item-${iteration}.ts`, pattern: "fixture" },
        },
      ],
    },
  });
  writeRecord(main, digests.main, {
    type: "user",
    uuid: resultId,
    parentUuid: assistantId,
    timestamp: new Date(timestamp.getTime() + 2_000).toISOString(),
    sessionId: "dit-r5-50mib",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUseId, content: `Result ${iteration}: ${payload}` }],
    },
  });

  if (iteration % 250 === 0) {
    writeRecord(subagent, digests.subagent, {
      type: "assistant",
      uuid: deterministicUuid(iteration * 4 + 3),
      parentUuid: assistantId,
      timestamp: new Date(timestamp.getTime() + 1_500).toISOString(),
      sessionId: "dit-r5-50mib",
      isSidechain: true,
      message: {
        role: "assistant",
        model: "fixture-subagent",
        content: [{ type: "text", text: `Subagent observation ${iteration}.` }],
      },
    });
  }
  iteration += 1;
}

closeSync(main);
closeSync(subagent);

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  outputDirectory,
  files: [mainPath, subagentPath],
  bytes,
  mebibytes: bytes / 1024 / 1024,
  records,
  iterations: iteration,
  sha256: {
    main: digests.main.digest("hex"),
    subagent: digests.subagent.digest("hex"),
  },
})}\n`);
