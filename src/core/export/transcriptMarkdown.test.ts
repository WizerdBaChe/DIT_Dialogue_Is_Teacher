import { describe, expect, it } from "vitest";
import { normalize } from "@/core/normalize/normalizer";
import { MESSAGES } from "@/i18n/locales";
import type { RawEvent } from "@/core/adapters/types";
import { buildTranscript } from "./transcript";
import { renderTranscriptMarkdown } from "./transcriptMarkdown";
import { DEFAULT_TRANSCRIPT_OPTIONS, type TranscriptLabels, type TranscriptOptions } from "./contracts";

/** 型別斷言：字典必須滿足渲染器的文案契約，缺鍵會在編譯期就報錯。 */
const zh: TranscriptLabels = MESSAGES["zh-TW"].transcript;
const en: TranscriptLabels = MESSAGES.en.transcript;

const BUILD = { exportedAt: "2026-08-11T12:30:00.000Z", appVersion: "0.3.1" };

function render(events: RawEvent[], options: Partial<TranscriptOptions> = {}, labels: TranscriptLabels = zh): string {
  const doc = normalize({
    meta: {
      id: "demo-todo",
      title: "修好刪除待辦後列表不更新",
      projectPath: "D:\\demo\\todo-app",
      model: "claude-opus-4-8",
      startedAt: events[0]?.timestamp ?? null,
    },
    events,
    diagnostics: [],
  });
  return renderTranscriptMarkdown(
    buildTranscript(doc, { ...BUILD, options: { ...DEFAULT_TRANSCRIPT_OPTIONS, ...options } }),
    labels,
  );
}

const BASIC: RawEvent[] = [
  { kind: "user_text", uuid: "u1", timestamp: "2026-06-25T10:00:00.000Z", text: "列表沒更新，幫我修。", raw: {} },
  { kind: "thinking", uuid: "a1", parentUuid: "u1", timestamp: "2026-06-25T10:00:08.000Z", text: "可能是就地修改了陣列。", raw: {} },
  { kind: "assistant_text", uuid: "a2", parentUuid: "u1", timestamp: "2026-06-25T10:00:08.000Z", text: "我先讀 TodoList.jsx。", raw: {} },
];

describe("renderTranscriptMarkdown — 標頭", () => {
  it("標題、後設欄位與內容統計都在", () => {
    const md = render(BASIC);
    expect(md).toContain("# 修好刪除待辦後列表不更新");
    expect(md).toContain("- **Session**：`demo-todo`");
    expect(md).toContain("- **來源**：claude-code · claude-opus-4-8");
    expect(md).toContain("- **專案**：`D:\\demo\\todo-app`");
    expect(md).toContain("- **開始時間**：2026-06-25 10:00");
    expect(md).toContain("- **匯出時間**：2026-08-11 12:30（DIT v0.3.1）");
    expect(md).toContain("- **內容**：1 輪 · 提問 1 · 回覆 1 · 思考 1");
  });

  it("沒有 projectPath / startedAt 時直接省略該列，不印出空值", () => {
    const md = render([{ kind: "user_text", uuid: "u1", text: "Q", raw: {} }]);
    expect(md).not.toContain("**開始時間**");
  });

  it("時間原樣取自 ISO，不做時區換算", () => {
    expect(render(BASIC)).toContain("## 第 1 輪 · 10:00");
  });
});

describe("renderTranscriptMarkdown — 內文", () => {
  it("三種角色各自標記", () => {
    const md = render(BASIC);
    expect(md).toContain("**👤 使用者**");
    expect(md).toContain("**💭 思考**");
    expect(md).toContain("**🤖 回覆**");
    expect(md).toContain("列表沒更新，幫我修。");
    expect(md).toContain("可能是就地修改了陣列。");
  });

  it("連續的工具摘要併成一行，不把對話沖散", () => {
    const md = render([
      ...BASIC,
      { kind: "tool_use", uuid: "t1", toolName: "Read", toolInput: { file_path: "src/TodoList.jsx" }, toolUseId: "t1", raw: {} },
      { kind: "tool_use", uuid: "t2", toolName: "Edit", toolInput: { file_path: "src/TodoList.jsx" }, toolUseId: "t2", raw: {} },
      { kind: "tool_use", uuid: "t3", toolName: "Bash", toolInput: { command: "npm test" }, toolUseId: "t3", raw: {} },
    ]);
    expect(md).toContain("> ⚙️ 工具活動：Read TodoList.jsx → Edit TodoList.jsx → Bash npm test");
  });

  it("關掉的內容在統計裡標明未納入，而不是假裝不存在", () => {
    const md = render(BASIC, { includeThinking: false });
    expect(md).toContain("思考 1（未納入）");
    expect(md).not.toContain("**💭 思考**");
  });

  it("子代理訊息帶標記", () => {
    const md = render([
      { kind: "user_text", uuid: "u1", text: "Q", raw: {} },
      { kind: "assistant_text", uuid: "a1", parentUuid: "u1", text: "派子代理", raw: {} },
      { kind: "assistant_text", uuid: "s1", parentUuid: "a1", isSidechain: true, text: "掃描完成", raw: {} },
    ], { includeSubagents: true });
    expect(md).toContain("**🤖 回覆** _(子代理)_");
  });

  it("內容裡的 Markdown 原樣保留（程式碼區塊不被跳脫）", () => {
    const md = render([
      { kind: "user_text", uuid: "u1", text: "看這段：\n```js\nconst a = 1;\n```", raw: {} },
    ]);
    expect(md).toContain("```js\nconst a = 1;\n```");
  });

  it("收斂多餘空行", () => {
    const md = render([{ kind: "user_text", uuid: "u1", text: "第一段\n\n\n\n第二段", raw: {} }]);
    expect(md).toContain("第一段\n\n第二段");
  });

  it("以換行結尾，輪次之間有分隔線", () => {
    const md = render([
      { kind: "user_text", uuid: "u1", text: "Q1", raw: {} },
      { kind: "user_text", uuid: "u2", text: "Q2", raw: {} },
    ]);
    expect(md.endsWith("\n")).toBe(true);
    expect(md).toContain("## 第 2 輪");
    expect((md.match(/^---$/gm) ?? [])).toHaveLength(2);
  });
});

describe("renderTranscriptMarkdown — i18n", () => {
  it("英文語序由字典自己決定，不是把標籤和數字硬拼", () => {
    const md = render(BASIC, {}, en);
    expect(md).toContain("- **Contents**：1 turns · 1 prompts · 1 replies · 1 thinking");
    expect(md).toContain("## Turn 1 · 10:00");
    expect(md).toContain("**👤 User**");
  });

  it("沒有對話內容時給出說明而不是空白檔案", () => {
    const md = render([{ kind: "tool_result", uuid: "x", text: "只有工具結果", raw: {} }]);
    expect(md).toContain("這個 session 沒有可輸出的對話內容。");
  });
});
