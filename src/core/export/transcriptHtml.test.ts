import { describe, expect, it } from "vitest";
import { normalize } from "@/core/normalize/normalizer";
import { buildSessionDocument } from "@/core/pipeline";
import { sampleSession } from "@/fixtures";
import { MESSAGES } from "@/i18n/locales";
import type { RawEvent } from "@/core/adapters/types";
import { buildTranscript } from "./transcript";
import { renderTranscriptHtml } from "./transcriptHtml";
import { DEFAULT_TRANSCRIPT_OPTIONS, type TranscriptLabels, type TranscriptOptions } from "./contracts";

const zh: TranscriptLabels = MESSAGES["zh-TW"].transcript;
const BUILD = { exportedAt: "2026-08-11T12:30:00.000Z", appVersion: "0.3.1" };

function render(events: RawEvent[], options: Partial<TranscriptOptions> = {}, lang = "zh-TW"): string {
  const doc = normalize({ meta: { id: "demo-todo", title: "修好列表不更新" }, events, diagnostics: [] });
  return renderTranscriptHtml(
    buildTranscript(doc, { ...BUILD, options: { ...DEFAULT_TRANSCRIPT_OPTIONS, ...options } }),
    zh,
    { lang },
  );
}

const BASIC: RawEvent[] = [
  { kind: "user_text", uuid: "u1", timestamp: "2026-06-25T10:00:00.000Z", text: "列表沒更新。", raw: {} },
  { kind: "thinking", uuid: "a1", parentUuid: "u1", text: "可能是就地修改。", raw: {} },
  { kind: "assistant_text", uuid: "a2", parentUuid: "u1", text: "我先讀檔案。", raw: {} },
];

describe("renderTranscriptHtml — 頁面骨架", () => {
  it("是完整的自足文件，語言跟著介面走", () => {
    const html = render(BASIC, {}, "en");
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<title>修好列表不更新</title>");
    expect(html).toContain("</html>");
  });

  it("完全不含 JavaScript，CSP 直接禁掉 script", () => {
    const html = render(BASIC);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).toContain("default-src 'none'");
  });

  it("樣式內聯，不依賴任何外部資源", () => {
    const html = render(BASIC);
    expect(html).toContain("<style>");
    expect(html).not.toMatch(/<link[^>]+href/i);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("只有左側資訊欄與對話區——沒有功能列、沒有 map、沒有任何控制項", () => {
    const html = render(BASIC);
    expect(html).toContain('<aside class="tx-panel">');
    expect(html).toContain('<main class="tx-reader">');
    expect(html).not.toMatch(/<button|<input|<select|<form/i);
  });
});

describe("renderTranscriptHtml — 目錄與內容", () => {
  it("目錄的錨點對得上輪次區塊", () => {
    const html = render([
      { kind: "user_text", uuid: "u1", text: "第一個問題", raw: {} },
      { kind: "user_text", uuid: "u2", text: "第二個問題", raw: {} },
    ]);
    expect(html).toContain('<a href="#turn-1">');
    expect(html).toContain('<section class="tx-turn" id="turn-1">');
    expect(html).toContain('<a href="#turn-2">');
    expect(html).toContain('<section class="tx-turn" id="turn-2">');
    expect(html).toContain("第一個問題");
  });

  it("目錄標題過長時截斷", () => {
    const html = render([{ kind: "user_text", uuid: "u1", text: "問".repeat(120), raw: {} }]);
    expect(html).toContain(`${"問".repeat(64)}…`);
  });

  it("三種角色各有自己的區塊樣式", () => {
    const html = render(BASIC);
    expect(html).toContain('class="tx-msg tx-msg-user"');
    expect(html).toContain('class="tx-msg tx-msg-thinking"');
    expect(html).toContain('class="tx-msg tx-msg-assistant"');
  });

  it("連續工具摘要併成一列", () => {
    const html = render([
      ...BASIC,
      { kind: "tool_use", uuid: "t1", toolName: "Read", toolInput: { file_path: "a.ts" }, toolUseId: "t1", raw: {} },
      { kind: "tool_use", uuid: "t2", toolName: "Edit", toolInput: { file_path: "a.ts" }, toolUseId: "t2", raw: {} },
    ]);
    const tools = /<div class="tx-tools">[\s\S]*?<\/div>/.exec(html)?.[0] ?? "";
    expect(tools).toContain("<li>Read a.ts</li>");
    expect(tools).toContain("<li>Edit a.ts</li>");
  });
});

describe("renderTranscriptHtml — 跳脫與程式碼", () => {
  it("內容中的標記一律跳脫，不會變成真的元素", () => {
    const html = render([
      { kind: "user_text", uuid: "u1", text: '<script>alert("x")</script> & <b>bold</b>', raw: {} },
    ]);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("session 標題裡的標記也跳脫", () => {
    const doc = normalize({ meta: { id: "x", title: '<img src=x>' }, events: BASIC, diagnostics: [] });
    const html = renderTranscriptHtml(buildTranscript(doc, { ...BUILD, options: DEFAULT_TRANSCRIPT_OPTIONS }), zh, { lang: "zh-TW" });
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;img src=x&gt;");
  });

  it("``` 圍籬的程式碼用等寬區塊呈現，其餘文字原樣保留", () => {
    const html = render([
      { kind: "user_text", uuid: "u1", text: "看這段：\n```ts\nconst a = 1;\n```\n就這樣。", raw: {} },
    ]);
    expect(html).toContain('<pre class="tx-code" data-lang="ts"><code>const a = 1;</code></pre>');
    expect(html).toContain("看這段：");
    expect(html).toContain("就這樣。");
  });

  it("未閉合的圍籬不吃掉內容", () => {
    const html = render([{ kind: "user_text", uuid: "u1", text: "```\nnever closed", raw: {} }]);
    expect(html).toContain("never closed");
  });

  it("沒有圍籬時整段當一般文字，不誤判", () => {
    const html = render([{ kind: "user_text", uuid: "u1", text: "沒有程式碼的一段話", raw: {} }]);
    expect(html).toContain('<p class="tx-text">沒有程式碼的一段話</p>');
    // `tx-code` 這個字串在 <style> 裡本來就有，要斷言的是沒有產生程式碼「元素」。
    expect(html).not.toContain('<pre class="tx-code"');
  });
});

describe("renderTranscriptHtml — 真實 fixture", () => {
  it("sampleSession 的每一輪都渲染得出來", () => {
    const { doc } = buildSessionDocument(sampleSession);
    const transcript = buildTranscript(doc, { ...BUILD, options: DEFAULT_TRANSCRIPT_OPTIONS });
    const html = renderTranscriptHtml(transcript, zh, { lang: "zh-TW" });

    for (const turn of transcript.turns) expect(html).toContain(`id="turn-${turn.index}"`);
    expect(html).toContain("刪除待辦後，畫面列表沒有更新");
    expect(html).not.toMatch(/<script/i);
  });

  it("沒有對話內容時給出說明區塊", () => {
    const html = render([{ kind: "tool_result", uuid: "x", text: "只有工具結果", raw: {} }]);
    expect(html).toContain('<p class="tx-empty">');
    expect(html).toContain("這個 session 沒有可輸出的對話內容。");
  });
});
