import { describe, expect, it } from "vitest";
import { __copyTables, diagnosticFatalCopy, diagnosticLine } from "./diagnosticCopy";
import { LOCALE_ORDER } from "./locales";
import type { Diagnostic, DiagnosticCode } from "@/core/diagnostics/contracts";

/**
 * SM-12 rule 2：文案由代碼驅動，只有一張表。這裡把「表是完整的」變成編譯期以外的
 * 第二道保證——新增一個 DiagnosticCode 卻忘了寫文案，會在這裡被抓到，而不是在使用者
 * 面前退化成一句「未列在說明表裡的狀況」。
 */
const ALL_CODES = Object.keys(__copyTables["zh-TW"]) as DiagnosticCode[];

const FATAL_CODES: DiagnosticCode[] = [
  "NO_MAIN_TRANSCRIPT",
  "MULTIPLE_SESSIONS",
  "NO_RENDERABLE_CONTENT",
  "EMPTY_INPUT",
  "LOAD_FAILED",
  "INDEX_PERMISSION_LOST",
];

describe("diagnostic copy table", () => {
  it("covers the same code set in every locale", () => {
    for (const locale of LOCALE_ORDER) {
      expect(Object.keys(__copyTables[locale]).sort()).toEqual([...ALL_CODES].sort());
    }
  });

  it("renders a non-empty line for every code in every locale", () => {
    for (const locale of LOCALE_ORDER) {
      for (const code of ALL_CODES) {
        const diagnostic: Diagnostic = { tier: "warn", code, detail: "X", count: 2, path: "p.jsonl" };
        expect(diagnosticLine(locale, diagnostic).trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("gives every fatal code a title AND a body — a fatal with no recovery is a dead end", () => {
    for (const locale of LOCALE_ORDER) {
      for (const code of FATAL_CODES) {
        const { title, body } = diagnosticFatalCopy(locale, { tier: "fatal", code, detail: "2" });
        expect(title.trim().length).toBeGreaterThan(0);
        expect(body.trim().length).toBeGreaterThan(20);
      }
    }
  });

  it("degrades an unmapped code to generic copy plus the code — never to a raw message", () => {
    const rogue: Diagnostic = { tier: "fatal", code: "NOT_A_REAL_CODE" as DiagnosticCode, detail: "TypeError: x is not a function" };
    for (const locale of LOCALE_ORDER) {
      expect(diagnosticLine(locale, rogue)).toContain("NOT_A_REAL_CODE");
      expect(diagnosticLine(locale, rogue)).not.toContain("TypeError");
      expect(diagnosticFatalCopy(locale, rogue).body).not.toContain("TypeError");
    }
  });
});
