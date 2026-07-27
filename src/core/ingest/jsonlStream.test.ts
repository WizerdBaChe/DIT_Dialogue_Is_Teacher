import { describe, expect, it } from "vitest";
import { parseJsonlChunks, StreamCancelledError } from "./jsonlStream";
import { buildSessionDocumentFromFiles, buildSessionDocumentFromParsedFiles } from "@/core/pipeline";
import { r4MainSession, r4SubagentSession } from "@/fixtures";
import type { JsonlStreamResult } from "./jsonlStream";
import type { ParsedFileOutcome } from "@/core/pipeline";

/** 串流結果現在是 union；測試裡先斷言它是 recognized，再取內容。 */
function recognized(result: JsonlStreamResult): Extract<JsonlStreamResult, { status: "recognized" }> {
  expect(result.status).toBe("recognized");
  return result as Extract<JsonlStreamResult, { status: "recognized" }>;
}

function asOutcome(path: string, result: JsonlStreamResult): ParsedFileOutcome {
  const ok = recognized(result);
  return { status: "parsed", path, parsed: ok.parsed, inputBytes: ok.inputBytes };
}

async function* chunksOf(chunks: Uint8Array[]): AsyncGenerator<Uint8Array> {
  for (const chunk of chunks) yield chunk;
}

function assistantLine(text: string): string {
  return JSON.stringify({
    type: "assistant",
    uuid: "00000000-0000-4000-a000-000000000001",
    parentUuid: null,
    timestamp: "2026-07-19T00:00:00.000Z",
    sessionId: "stream-test",
    message: { role: "assistant", model: "fixture", content: [{ type: "text", text }] },
  });
}

describe("parseJsonlChunks", () => {
  it("preserves a UTF-8 code point split across chunks", async () => {
    const bytes = new TextEncoder().encode(`${assistantLine("繁體🙂文字")}\n`);
    const emojiStart = bytes.findIndex((value, index) => value === 0xf0 && bytes[index + 1] === 0x9f);
    const result = await parseJsonlChunks(chunksOf([
      bytes.slice(0, emojiStart + 2),
      bytes.slice(emojiStart + 2),
    ]));

    expect(recognized(result).parsed.events).toHaveLength(1);
    expect(recognized(result).parsed.events[0].text).toBe("繁體🙂文字");
  });

  it("preserves JSONL records split across arbitrary chunks", async () => {
    const input = `${assistantLine("first")}\r\n${assistantLine("second")}\n`;
    const bytes = new TextEncoder().encode(input);
    const result = await parseJsonlChunks(chunksOf([
      bytes.slice(0, 7),
      bytes.slice(7, 91),
      bytes.slice(91),
    ]));

    expect(recognized(result).parsed.events.map((event) => event.text)).toEqual(["first", "second"]);
    expect(result.lineCount).toBe(2);
  });

  it("reports malformed line numbers without losing later records", async () => {
    const input = `${assistantLine("first")}\n{broken-json}\n${assistantLine("third")}\n`;
    const result = await parseJsonlChunks(chunksOf([new TextEncoder().encode(input)]));

    expect(recognized(result).parsed.events.map((event) => event.text)).toEqual(["first", "third"]);
    expect(recognized(result).parsed.diagnostics).toContainEqual({ tier: "warn", code: "LINE_PARSE_FAILED", count: 1 });
  });

  it("attributes streamed malformed-line diagnostics to their source path", async () => {
    const input = `${assistantLine("first")}\n{broken-json}\n`;
    const streamed = await parseJsonlChunks(chunksOf([new TextEncoder().encode(input)]));
    const result = buildSessionDocumentFromParsedFiles([asOutcome("main.jsonl", streamed)]);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "LINE_PARSE_FAILED", path: "main.jsonl" }),
    );
  });

  it("keeps streamed multi-file ordering identical to the synchronous R4 pipeline", async () => {
    const mainBytes = new TextEncoder().encode(r4MainSession);
    const subagentBytes = new TextEncoder().encode(r4SubagentSession);
    const [main, subagent] = await Promise.all([
      parseJsonlChunks(chunksOf([mainBytes.slice(0, 37), mainBytes.slice(37)])),
      parseJsonlChunks(chunksOf([subagentBytes.slice(0, 51), subagentBytes.slice(51)])),
    ]);
    const streamed = buildSessionDocumentFromParsedFiles([
      asOutcome("main.jsonl", main),
      asOutcome("subagents/agent-1.jsonl", subagent),
    ]);
    const synchronous = buildSessionDocumentFromFiles([
      { path: "main.jsonl", content: r4MainSession },
      { path: "subagents/agent-1.jsonl", content: r4SubagentSession },
    ]);

    expect(streamed).toEqual(synchronous);
  });

  it("stops at a cancellation boundary", async () => {
    let cancelled = false;
    const input = new TextEncoder().encode(`${assistantLine("first")}\n${assistantLine("second")}\n`);
    const chunks = chunksOf([input.slice(0, 20), input.slice(20)]);

    await expect(parseJsonlChunks(chunks, {
      isCancelled: () => cancelled,
      onProgress: () => { cancelled = true; },
    })).rejects.toBeInstanceOf(StreamCancelledError);
  });

  // R9 (RC-1a)：偵測失敗從「拋例外」降為一個結果值。真實 subagents/ 目錄裡就有 .meta.json，
  // 讓它炸掉整批載入正是「選真實資料夾必定失敗」的成因。R7-INV-9 仍成立：不猜測來源。
  it("returns status=unrecognized (never throws) when no registered adapter recognizes the content", async () => {
    const input = new TextEncoder().encode(`${JSON.stringify({ nothing: "recognizable", here: true })}\n`);
    const result = await parseJsonlChunks(chunksOf([input]));
    expect(result.status).toBe("unrecognized");
  });

  it("returns status=unrecognized for a completely blank stream (no line ever detectable)", async () => {
    const input = new TextEncoder().encode("   \n\n\t\n");
    const result = await parseJsonlChunks(chunksOf([input]));
    expect(result.status).toBe("unrecognized");
  });

  it("stops feeding lines after detection fails, so a later valid-looking line cannot revive it", async () => {
    const input = new TextEncoder().encode(`${JSON.stringify({ nothing: "recognizable" })}\n${assistantLine("late")}\n`);
    const result = await parseJsonlChunks(chunksOf([input]));
    expect(result.status).toBe("unrecognized");
  });

  it("detects the source from the first non-empty line even when it arrives split across chunks, and replays any blank lead lines", async () => {
    const input = `\n  \n${assistantLine("first")}\n${assistantLine("second")}\n`;
    const bytes = new TextEncoder().encode(input);
    // Split mid-way through the first real (non-blank) line so detection must wait for it to complete.
    const splitPoint = input.indexOf(assistantLine("first")) + 10;
    const result = await parseJsonlChunks(chunksOf([bytes.slice(0, splitPoint), bytes.slice(splitPoint)]));

    expect(recognized(result).parsed.events.map((event) => event.text)).toEqual(["first", "second"]);
    // 2 blank lead lines + 2 real lines.
    expect(result.lineCount).toBe(4);
  });
});
