import { describe, expect, it } from "vitest";
import { buildSessionDocument } from "@/core/pipeline";
import { sampleSession, subagentSession } from "@/fixtures";
import { SCHEMA_VERSION } from "@/types/spanTree";
import { toSessionLibrary } from "./library";

describe("toSessionLibrary", () => {
  it("空陣列", () => {
    const library = toSessionLibrary([]);
    expect(library).toEqual({ schemaVersion: SCHEMA_VERSION, documents: [] });
  });

  it("多份文件", () => {
    const { doc: docA } = buildSessionDocument(sampleSession);
    const { doc: docB } = buildSessionDocument(subagentSession);
    const library = toSessionLibrary([docA, docB]);
    expect(library.documents).toEqual([docA, docB]);
  });

  it("schemaVersion 一致", () => {
    const { doc } = buildSessionDocument(sampleSession);
    const library = toSessionLibrary([doc]);
    expect(library.schemaVersion).toBe(doc.schemaVersion);
    expect(library.schemaVersion).toBe(SCHEMA_VERSION);
  });
});
