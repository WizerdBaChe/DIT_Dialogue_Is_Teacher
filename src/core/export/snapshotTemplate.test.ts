import { describe, expect, it } from "vitest";
import { injectSnapshotPayload, SnapshotTemplateError } from "./snapshotTemplate";
import { buildSessionExport } from "./buildExport";
import { buildSessionDocument } from "@/core/pipeline";
import { sampleSession } from "@/fixtures";

const TEMPLATE = `<html><script type="application/json" id="dit-snapshot">/*DIT_SNAPSHOT_PAYLOAD*/null</script></html>`;

describe("injectSnapshotPayload", () => {
  const { doc } = buildSessionDocument(sampleSession);
  const basePayload = buildSessionExport(doc, { exportedAt: "2026-07-21T00:00:00.000Z", appVersion: "0.1.0", annotations: {} });

  it("取代佔位符，注入合法 JSON", () => {
    const result = injectSnapshotPayload(TEMPLATE, basePayload);
    expect(result).not.toContain("DIT_SNAPSHOT_PAYLOAD");
    const match = result.match(/id="dit-snapshot">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(parsed.document.session.id).toBe(doc.session.id);
  });

  it("含 </script> 與 <!-- 的惡意字串經注入後，模板不被提前關閉且 round-trip 解析回原值", () => {
    const malicious = "</script><script>alert(1)</script><!--break-->";
    const payload = {
      ...basePayload,
      document: { ...doc, session: { ...doc.session, title: malicious } },
    };
    const result = injectSnapshotPayload(TEMPLATE, payload);
    expect(result).toContain("</html>");
    // 只有一組真正的 </script> 出現在模板尾端 (原本的收尾標籤)，注入內容裡的都已被轉義。
    expect(result.split("</script>").length - 1).toBe(1);
    const match = result.match(/id="dit-snapshot">([\s\S]*?)<\/script>/);
    const parsed = JSON.parse(match![1]);
    expect(parsed.document.session.title).toBe(malicious);
  });

  it("佔位符缺失時 throw", () => {
    expect(() => injectSnapshotPayload("<html></html>", basePayload)).toThrow(SnapshotTemplateError);
  });

  it("即使佔位符文字本身也出現在 bundle 字串常數裡 (自我引用)，仍只取代真正的 payload script 標籤", () => {
    // 模擬快照 bundle 內聯了本模組原始碼，佔位符文字字面值先出現一次，且排在真正的標籤之前。
    const selfReferencing = `<script>const PLACEHOLDER="/*DIT_SNAPSHOT_PAYLOAD*/null";</script>${TEMPLATE}`;
    const result = injectSnapshotPayload(selfReferencing, basePayload);
    expect(result).toContain('const PLACEHOLDER="/*DIT_SNAPSHOT_PAYLOAD*/null";');
    const match = result.match(/id="dit-snapshot">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    expect(JSON.parse(match![1]).document.session.id).toBe(doc.session.id);
  });
});
