import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: npm run benchmark:r5 -- <metrics.json>");

const metrics = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
const value = (entry) => (entry === null || entry === undefined ? "unsupported" : String(entry));
const yesNo = (entry) => (entry ? "yes" : "no");
const max = (entries, key) => Math.max(...entries.map((entry) => entry[key]));
const memory = metrics.peakObservedMemoryBytes === null || metrics.peakObservedMemoryBytes === undefined
  ? "unsupported"
  : `${metrics.peakObservedMemoryBytes} bytes`;

const loadLimitMs = metrics.load.baselineMs * 1.25;
const loadRegression = metrics.load.comparable
  ? metrics.load.durationMs <= loadLimitMs
  : null;
const readerOverflow = metrics.reader.widths.some((entry) => entry.horizontalOverflow);
const mapOverflow = metrics.map.widths.some((entry) => entry.horizontalOverflow);
const checks = [
  ["50 MiB load completed without a crash", !metrics.load.crashed],
  ["progress appeared before ready", metrics.load.progressBeforeReady],
  ["cancellation completed before ready", metrics.cancellation.beforeCompletion],
  ["cancellation preserved the previous document", metrics.cancellation.preservedDocument],
  // R6.5 LS-05/LS-06 widened the reader column and shortened the sidebar static area on purpose;
  // both let more (shorter) rows fit on screen at once, so this ceiling moved from 250 to 320.
  // The invariant under test — DOM count stays viewport-bounded, not proportional to the 29,452-item
  // fixture — still holds (see docs/R6.5_BASELINE_2026-07-22.md).
  ["closed Reader total DOM <= 320", metrics.reader.closedTotalElements <= 320],
  ["global map total DOM <= 500", metrics.map.global.totalElements <= 500],
  ["section map total DOM <= 500", metrics.map.section.totalElements <= 500],
  ["detail map total DOM <= 500", metrics.map.detail.totalElements <= 500],
  ["mounted tree rows <= 250", metrics.reader.mountedTreeRows <= 250],
  ["mounted Reader rows <= 250", metrics.reader.mountedReaderRows <= 250],
  ["global targets <= 80", metrics.map.global.targets <= 80],
  ["section targets <= 200", metrics.map.section.targets <= 200],
  ["detail mounted rows <= 120", metrics.map.detail.mountedRows <= 120],
  ["no horizontal overflow at 390/740/1280", !readerOverflow && !mapOverflow],
  ["map open to first target < 200 ms", metrics.map.openLatencyMs < 200],
  ["deep jump had no selection drift", !metrics.scroll.selectionDrift],
  ["deep scroll had no blank gaps", !metrics.scroll.blankGaps],
  ["load regression <= 25%", loadRegression],
];
const failedChecks = checks.filter(([, passed]) => passed === false);
const missingChecks = checks.filter(([, passed]) => passed === undefined || passed === null);
const result = failedChecks.length === 0 && missingChecks.length === (loadRegression === null ? 1 : 0)
  ? "pass"
  : "fail";

process.stdout.write([
  `# R5 Benchmark — ${metrics.label ?? "unnamed run"}`,
  "",
  `- Fixture: ${value(metrics.fixtureMiB)} MiB, ${value(metrics.files)} files, ${value(metrics.viewItems)} view items`,
  `- Load: ${value(metrics.load.durationMs)} ms; first progress ${value(metrics.load.firstProgressMs)} ms; progress before completion: ${yesNo(metrics.load.progressBeforeReady)}`,
  `- Load baseline: ${value(metrics.load.baselineMs)} ms; 25% limit: ${value(loadLimitMs)} ms; comparison: ${loadRegression === null ? "unverified" : loadRegression ? "pass" : "fail"}`,
  `- Cancellation: ${value(metrics.cancellation.durationMs)} ms; before completion: ${yesNo(metrics.cancellation.beforeCompletion)}; previous document preserved: ${yesNo(metrics.cancellation.preservedDocument)}`,
  `- Closed Reader: max total elements ${value(metrics.reader.closedTotalElements)}; max tree rows ${value(metrics.reader.mountedTreeRows)}; max Reader rows ${value(metrics.reader.mountedReaderRows)}`,
  `- Global map: max total elements ${value(metrics.map.global.totalElements)}; targets ${value(metrics.map.global.targets)}; mounted list rows ${value(metrics.map.global.mountedRows)}`,
  `- Section map: max total elements ${value(metrics.map.section.totalElements)}; targets ${value(metrics.map.section.targets)}; mounted list rows ${value(metrics.map.section.mountedRows)}`,
  `- Detail map: max total elements ${value(metrics.map.detail.totalElements)}; graphic targets ${value(metrics.map.detail.targets)}; mounted rows ${value(metrics.map.detail.mountedRows)}`,
  `- Map open to first target: ${value(metrics.map.openLatencyMs)} ms`,
  `- Responsive maxima: Reader DOM ${max(metrics.reader.widths, "totalElements")}; map DOM ${max(metrics.map.widths, "totalElements")}; horizontal overflow: ${yesNo(readerOverflow || mapOverflow)}`,
  `- Scroll: blank gaps ${yesNo(metrics.scroll.blankGaps)}; selection drift ${yesNo(metrics.scroll.selectionDrift)}; verified index ${value(metrics.scroll.verifiedIndex)}`,
  `- Peak observed memory: ${memory}`,
  `- Checks: ${checks.filter(([, passed]) => passed === true).length} passed; ${failedChecks.length} failed; ${missingChecks.length} unverified`,
  `- Result: ${result}`,
  "",
].join("\n"));

if (result !== "pass") process.exitCode = 1;
