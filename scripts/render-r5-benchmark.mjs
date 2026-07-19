import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: npm run benchmark:r5 -- <metrics.json>");

const metrics = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
const value = (entry) => (entry === null || entry === undefined ? "unsupported" : String(entry));
const yesNo = (entry) => (entry ? "yes" : "no");
const memory = metrics.peakObservedMemoryBytes === null || metrics.peakObservedMemoryBytes === undefined
  ? "unsupported"
  : `${metrics.peakObservedMemoryBytes} bytes`;

process.stdout.write([
  `# R5 Benchmark — ${metrics.label ?? "unnamed run"}`,
  "",
  `- Fixture: ${value(metrics.fixtureMiB)} MiB, ${value(metrics.files)} files, ${value(metrics.viewItems)} view items`,
  `- Load: ${value(metrics.loadDurationMs)} ms; progress before completion: ${yesNo(metrics.progressBeforeReady)}; cancellation responsive: ${yesNo(metrics.cancellationResponsive)}`,
  `- Mounted list DOM: sidebar ${value(metrics.sidebarMounted)}; dense ${value(metrics.denseMounted)}; total elements ${value(metrics.totalElements)}`,
  `- Scroll: blank gaps ${yesNo(metrics.blankGaps)}; selection drift ${yesNo(metrics.selectionDrift)}`,
  `- Peak observed memory: ${memory}`,
  `- Result: ${metrics.result ?? "unverified"}`,
  "",
].join("\n"));
