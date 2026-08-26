/**
 * R12 M5 — the sidecar reader.
 *
 * Shapes here are the ones measured on the author's `~/.codex` corpus on 2026-08-26 and written
 * up in `docs/rounds/r12-source-first-navigation/RESEARCH_R12_CODEX_SIDECAR_2026-08-26.md`:
 * two nested plain objects (NOT a JSON-encoded string, which M1 had flagged as unverified),
 * with plain string values (not objects carrying a `description` field).
 */
import { describe, expect, it } from "vitest";
import { readSidecars } from "./sidecarReader";
import type { SidecarSpec } from "@/core/source/profiles";
import type { DirectoryFile } from "./contracts";

const SPEC: SidecarSpec = {
  path: ".codex-global-state.json",
  recordsAt: ["electron-persisted-atom-state", "thread-descriptions-v1"],
  joinKey: ["session_meta", "payload", "id"],
};

const fileOf = (path: string, content: string): DirectoryFile => {
  const blob = new Blob([content]);
  return { path, size: blob.size, read: async () => blob };
};

const sidecarFile = (descriptions: unknown): DirectoryFile =>
  fileOf(SPEC.path, JSON.stringify({
    "desktop-first-seen-at-ms": 1,
    "electron-persisted-atom-state": { "prompt-history": [], "thread-descriptions-v1": descriptions },
  }));

describe("readSidecars (R12 M5)", () => {
  it("reads descriptions keyed by thread id", async () => {
    const { descriptions, diagnostics } = await readSidecars([SPEC], [
      sidecarFile({ "019f4cf8-452d-77a1-808c-cb4770c2bd00": "將 Claude 規則內容移植到 Codex 環境" }),
    ]);
    expect(descriptions.get("019f4cf8-452d-77a1-808c-cb4770c2bd00")).toBe("將 Claude 規則內容移植到 Codex 環境");
    expect(diagnostics).toEqual([]);
  });

  it("does nothing at all for a source that declares no sidecar", async () => {
    const { descriptions, diagnostics } = await readSidecars([], [sidecarFile({ a: "x" })]);
    expect(descriptions.size).toBe(0);
    expect(diagnostics).toEqual([]);
  });

  it("stays quiet when the sidecar is not in the listing", async () => {
    // Out of reach is already reported by name at index time (INDEX_SIDECAR_OUT_OF_REACH).
    // Saying it twice would read as two separate problems.
    const { descriptions, diagnostics } = await readSidecars([SPEC], [fileOf("2026/08/rollout-a.jsonl", "{}")]);
    expect(descriptions.size).toBe(0);
    expect(diagnostics).toEqual([]);
  });

  it("reports an unreadable sidecar and does not throw", async () => {
    const { descriptions, diagnostics } = await readSidecars([SPEC], [fileOf(SPEC.path, "{ not json at all")]);
    expect(descriptions.size).toBe(0);
    expect(diagnostics[0]).toMatchObject({ tier: "warn", code: "INDEX_SIDECAR_UNREADABLE" });
  });

  it("reports a changed shape distinctly from a broken file", async () => {
    /*
     * The upstream tool moving where it stores this is a fact the PROFILE has to catch up with,
     * not something the user did. Collapsing it into "unreadable" would send them looking at
     * their own file for a problem that is not there.
     */
    const { diagnostics } = await readSidecars([SPEC], [
      fileOf(SPEC.path, JSON.stringify({ "electron-persisted-atom-state": { "something-else-v2": {} } })),
    ]);
    expect(diagnostics[0]).toMatchObject({
      tier: "warn",
      code: "INDEX_SIDECAR_SHAPE_CHANGED",
      detail: "electron-persisted-atom-state.thread-descriptions-v1",
    });
  });

  it("survives the chain being a string rather than an object", async () => {
    // M1 flagged this exact possibility as unverified. It measured as an object, but a future
    // version could encode it — that must degrade, not crash.
    const { descriptions, diagnostics } = await readSidecars([SPEC], [
      fileOf(SPEC.path, JSON.stringify({ "electron-persisted-atom-state": "{\"thread-descriptions-v1\":{}}" })),
    ]);
    expect(descriptions.size).toBe(0);
    expect(diagnostics[0]?.code).toBe("INDEX_SIDECAR_SHAPE_CHANGED");
  });

  it("skips entries whose value is not a usable string, counting them", async () => {
    const { descriptions, diagnostics } = await readSidecars([SPEC], [
      sidecarFile({ good: "a real purpose", blank: "   ", structured: { description: "x" }, nothing: null }),
    ]);
    expect([...descriptions.keys()]).toEqual(["good"]);
    expect(diagnostics.find((d) => d.code === "INDEX_SIDECAR_ENTRY_SKIPPED")).toMatchObject({ tier: "info", count: 3 });
  });

  it("never throws, whatever the file contains", async () => {
    for (const content of ["", "null", "[]", '"a string"', "123"]) {
      await expect(readSidecars([SPEC], [fileOf(SPEC.path, content)])).resolves.toBeDefined();
    }
  });
});
