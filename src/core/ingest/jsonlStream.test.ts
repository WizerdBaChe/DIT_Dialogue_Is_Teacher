import { describe, expect, it } from "vitest";
import { parseJsonlChunks, StreamCancelledError, UnknownSourceError } from "./jsonlStream";
import { buildSessionDocumentFromFiles, buildSessionDocumentFromParsedFiles } from "@/core/pipeline";
import { r4MainSession, r4SubagentSession } from "@/fixtures";

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

    expect(result.parsed.events).toHaveLength(1);
    expect(result.parsed.events[0].text).toBe("繁體🙂文字");
  });

  it("preserves JSONL records split across arbitrary chunks", async () => {
    const input = `${assistantLine("first")}\r\n${assistantLine("second")}\n`;
    const bytes = new TextEncoder().encode(input);
    const result = await parseJsonlChunks(chunksOf([
      bytes.slice(0, 7),
      bytes.slice(7, 91),
      bytes.slice(91),
    ]));

    expect(result.parsed.events.map((event) => event.text)).toEqual(["first", "second"]);
    expect(result.lineCount).toBe(2);
  });

  it("reports malformed line numbers without losing later records", async () => {
    const input = `${assistantLine("first")}\n{broken-json}\n${assistantLine("third")}\n`;
    const result = await parseJsonlChunks(chunksOf([new TextEncoder().encode(input)]));

    expect(result.parsed.events.map((event) => event.text)).toEqual(["first", "third"]);
    expect(result.parsed.warnings).toContain("第 2 行 JSON 解析失敗，已略過。");
  });

  it("adds the source path to streamed malformed-line warnings", async () => {
    const input = `${assistantLine("first")}\n{broken-json}\n`;
    const streamed = await parseJsonlChunks(chunksOf([new TextEncoder().encode(input)]));
    const result = buildSessionDocumentFromParsedFiles([
      { path: "subagents/agent-broken.jsonl", parsed: streamed.parsed, inputBytes: streamed.inputBytes },
    ]);

    expect(result.warnings).toContain("subagents/agent-broken.jsonl: 第 2 行 JSON 解析失敗，已略過。");
  });

  it("keeps streamed multi-file ordering identical to the synchronous R4 pipeline", async () => {
    const mainBytes = new TextEncoder().encode(r4MainSession);
    const subagentBytes = new TextEncoder().encode(r4SubagentSession);
    const [main, subagent] = await Promise.all([
      parseJsonlChunks(chunksOf([mainBytes.slice(0, 37), mainBytes.slice(37)])),
      parseJsonlChunks(chunksOf([subagentBytes.slice(0, 51), subagentBytes.slice(51)])),
    ]);
    const streamed = buildSessionDocumentFromParsedFiles([
      { path: "main.jsonl", parsed: main.parsed, inputBytes: main.inputBytes },
      { path: "subagents/agent-1.jsonl", parsed: subagent.parsed, inputBytes: subagent.inputBytes },
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

  it("throws UnknownSourceError when no registered adapter recognizes the content", async () => {
    const input = new TextEncoder().encode(`${JSON.stringify({ nothing: "recognizable", here: true })}\n`);
    await expect(parseJsonlChunks(chunksOf([input]))).rejects.toBeInstanceOf(UnknownSourceError);
  });

  it("throws UnknownSourceError for a completely blank stream (no line ever detectable)", async () => {
    const input = new TextEncoder().encode("   \n\n\t\n");
    await expect(parseJsonlChunks(chunksOf([input]))).rejects.toBeInstanceOf(UnknownSourceError);
  });

  it("detects the source from the first non-empty line even when it arrives split across chunks, and replays any blank lead lines", async () => {
    const input = `\n  \n${assistantLine("first")}\n${assistantLine("second")}\n`;
    const bytes = new TextEncoder().encode(input);
    // Split mid-way through the first real (non-blank) line so detection must wait for it to complete.
    const splitPoint = input.indexOf(assistantLine("first")) + 10;
    const result = await parseJsonlChunks(chunksOf([bytes.slice(0, splitPoint), bytes.slice(splitPoint)]));

    expect(result.parsed.events.map((event) => event.text)).toEqual(["first", "second"]);
    // 2 blank lead lines + 2 real lines.
    expect(result.lineCount).toBe(4);
  });
});
