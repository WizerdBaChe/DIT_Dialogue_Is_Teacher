import { describe, expect, it } from "vitest";
import { normalize } from "@/core/normalize/normalizer";
import { MESSAGES } from "@/i18n/locales";
import type { RawEvent } from "@/core/adapters/types";
import { buildTranscript } from "./transcript";
import { redactTranscript } from "./transcriptRedact";
import { renderTranscriptMarkdown } from "./transcriptMarkdown";
import { renderTranscriptHtml } from "./transcriptHtml";
import { DEFAULT_TRANSCRIPT_OPTIONS, type TranscriptLabels } from "./contracts";

const zh: TranscriptLabels = MESSAGES["zh-TW"].transcript;
const BUILD = { exportedAt: "2026-08-11T12:30:00.000Z", appVersion: "0.3.1" };

async function redactedOf(events: RawEvent[], meta: Record<string, unknown> = {}) {
  const doc = normalize({ meta: { id: "s1", title: "T", ...meta }, events, diagnostics: [] });
  return redactTranscript(buildTranscript(doc, { ...BUILD, options: DEFAULT_TRANSCRIPT_OPTIONS }));
}

describe("redactTranscript — 密鑰", () => {
  it("密鑰換成佔位符而不是讓整份檔案匯不出來", async () => {
    const transcript = await redactedOf([
      { kind: "user_text", uuid: "u1", text: "用這把 key：sk-abcdefghijklmnopqrstuvwxyz123456", raw: {} },
    ]);

    const text = transcript.turns[0].user?.text ?? "";
    expect(text).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(text).toContain("<SECRET_1>");
    expect(transcript.redaction?.summary.secret).toBe(1);
    expect(transcript.redaction?.residualSecretBlocks).toBe(0);
  });

  it("connection string 裡的密碼只遮密碼，不遮整條 URL", async () => {
    const transcript = await redactedOf([
      { kind: "user_text", uuid: "u1", text: "postgres://admin:hunter2secret@db.internal:5432/app", raw: {} },
    ]);
    // email 規則也會命中 `密碼@db.internal`；密鑰必須贏，否則主機名會被一起吃掉並標成信箱。
    expect(transcript.turns[0].user?.text).toBe("postgres://admin:<SECRET_1>@db.internal:5432/app");
    expect(transcript.redaction?.summary.secret).toBe(1);
  });

  it("複查不把自己塞的佔位符當成漏網密鑰——否則含連線字串的檔案會常態誤報", async () => {
    const transcript = await redactedOf([
      { kind: "user_text", uuid: "u1", text: "postgres://admin:hunter2secret@db.internal:5432/app", raw: {} },
    ]);
    expect(transcript.redaction?.residualSecretBlocks).toBe(0);
  });

  it("`password:password` 這種重複值遮到的是值不是標籤", async () => {
    const transcript = await redactedOf([
      { kind: "user_text", uuid: "u1", text: "password:password123", raw: {} },
    ]);
    expect(transcript.turns[0].user?.text).toBe("password:<SECRET_1>");
  });
});

describe("redactTranscript — 直接識別資訊", () => {
  it("信箱、電話、使用者路徑、IP 都換成佔位符", async () => {
    const transcript = await redactedOf([
      { kind: "user_text", uuid: "u1", text: "寄到 alice@example.com，或打 0912-345-678", raw: {} },
      { kind: "assistant_text", uuid: "a1", text: "檔案在 /home/nathan/project，伺服器 192.168.11.20", raw: {} },
    ]);

    const all = JSON.stringify(transcript);
    expect(all).not.toContain("alice@example.com");
    expect(all).not.toContain("0912-345-678");
    expect(all).not.toContain("/home/nathan/");
    expect(all).not.toContain("192.168.11.20");
    expect(transcript.turns[0].user?.text).toContain("<EMAIL_1>");
    expect(transcript.turns[0].messages[0].text).toContain("/home/<USER_PATH_1>/project");
  });

  it("session 標題與專案路徑也一起遮", async () => {
    const transcript = await redactedOf(
      [{ kind: "user_text", uuid: "u1", text: "Q", raw: {} }],
      { title: "修 alice@example.com 的問題", projectPath: "/home/nathan/api-service" },
    );
    expect(transcript.session.title).toBe("修 <EMAIL_1> 的問題");
    expect(transcript.session.projectPath).toBe("/home/<USER_PATH_1>/api-service");
  });

  it("session.id 不遮——它是隨機識別碼，也是回指節點視圖的錨點", async () => {
    const transcript = await redactedOf([{ kind: "user_text", uuid: "u1", text: "Q", raw: {} }]);
    expect(transcript.session.id).toBe("s1");
  });
});

describe("redactTranscript — 整份文件的一致性", () => {
  it("同一個值在不同輪次對到同一個佔位符", async () => {
    const transcript = await redactedOf([
      { kind: "user_text", uuid: "u1", text: "問 alice@example.com", raw: {} },
      { kind: "assistant_text", uuid: "a1", text: "我寄給 alice@example.com 了", raw: {} },
      { kind: "user_text", uuid: "u2", text: "改寄 bob@example.com", raw: {} },
      { kind: "assistant_text", uuid: "a2", text: "好，改寄 bob@example.com，不再寄 alice@example.com", raw: {} },
    ]);

    expect(transcript.turns[0].user?.text).toBe("問 <EMAIL_1>");
    expect(transcript.turns[0].messages[0].text).toBe("我寄給 <EMAIL_1> 了");
    expect(transcript.turns[1].user?.text).toBe("改寄 <EMAIL_2>");
    expect(transcript.turns[1].messages[0].text).toBe("好，改寄 <EMAIL_2>，不再寄 <EMAIL_1>");
  });
});

describe("redactTranscript — 不破壞原資料", () => {
  it("回傳新的一份，原逐字稿不被就地修改", async () => {
    const doc = normalize({
      meta: { id: "s1", title: "T" },
      events: [{ kind: "user_text", uuid: "u1", text: "寄到 alice@example.com", raw: {} }],
      diagnostics: [],
    });
    const original = buildTranscript(doc, { ...BUILD, options: DEFAULT_TRANSCRIPT_OPTIONS });
    const snapshot = JSON.stringify(original);

    const redacted = await redactTranscript(original);

    expect(JSON.stringify(original)).toBe(snapshot);
    expect(original.redaction).toBeUndefined();
    expect(redacted.turns[0].user?.text).toContain("<EMAIL_1>");
  });

  it("沒有敏感資訊時內容原樣，但仍記錄「有跑過遮蔽」", async () => {
    const transcript = await redactedOf([{ kind: "user_text", uuid: "u1", text: "就是個普通問題", raw: {} }]);
    expect(transcript.turns[0].user?.text).toBe("就是個普通問題");
    expect(transcript.redaction?.summary).toEqual({});
    expect(transcript.redaction?.policyId).toBe("export-redact");
  });
});

describe("遮蔽後的輸出必須自我標示", () => {
  const SENSITIVE: RawEvent[] = [
    { kind: "user_text", uuid: "u1", text: "寄到 alice@example.com", raw: {} },
  ];

  it("Markdown 標頭寫出遮蔽了什麼", async () => {
    const md = renderTranscriptMarkdown(await redactedOf(SENSITIVE), zh);
    expect(md).toContain("已在本機遮蔽敏感資訊：信箱 1");
  });

  it("HTML 資訊欄寫出遮蔽了什麼", async () => {
    const html = renderTranscriptHtml(await redactedOf(SENSITIVE), zh, { lang: "zh-TW" });
    expect(html).toContain('<div class="tx-redaction">');
    expect(html).toContain("已在本機遮蔽敏感資訊：信箱 1");
  });

  it("沒開遮蔽時完全不提這件事，不放空殼欄位", async () => {
    const doc = normalize({ meta: { id: "s1", title: "T" }, events: SENSITIVE, diagnostics: [] });
    const transcript = buildTranscript(doc, { ...BUILD, options: DEFAULT_TRANSCRIPT_OPTIONS });
    expect(transcript.redaction).toBeUndefined();
    expect(renderTranscriptMarkdown(transcript, zh)).not.toContain("遮蔽");
    // `tx-redaction` 這個字串在 <style> 裡本來就有，要斷言的是沒有產生那個區塊。
    expect(renderTranscriptHtml(transcript, zh, { lang: "zh-TW" })).not.toContain('<div class="tx-redaction">');
  });
});
