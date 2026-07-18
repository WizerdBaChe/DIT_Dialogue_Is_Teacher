import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { deleteDB } from "idb";
import type { AnnotationRecord, AnnotationRepository } from "./contracts";
import { FallbackAnnotationRepository, IndexedDbAnnotationRepository, MemoryAnnotationRepository } from "./repository";
import { AnnotationJobController } from "./jobController";

const record: AnnotationRecord = {
  cacheKey: "cache-1",
  sessionFingerprint: "session-1",
  itemFingerprint: "item-1",
  itemId: "node-1",
  annotation: { what: "What", why: "Why", generalLesson: "Lesson", confidence: 0.8, provider: "ollama" },
  provenance: {
    providerId: "ollama",
    modelId: "qwen2.5-coder:7b",
    promptVersion: "2.0.0",
    locale: "zh-TW",
    privacyPolicyId: null,
    privacyPolicyVersion: null,
    createdAt: "2026-07-18T00:00:00.000Z",
  },
};

describe("IndexedDbAnnotationRepository", () => {
  it("persists, queries by session, and deletes only the selected session", async () => {
    const name = `dit-test-${crypto.randomUUID()}`;
    const repository = new IndexedDbAnnotationRepository(name);
    await repository.put(record);
    await repository.put({ ...record, cacheKey: "cache-2", sessionFingerprint: "session-2" });

    await expect(repository.get("cache-1")).resolves.toEqual(record);
    await expect(repository.getBySession("session-1")).resolves.toEqual([record]);
    await repository.deleteSession("session-1");
    await expect(repository.get("cache-1")).resolves.toBeUndefined();
    await expect(repository.get("cache-2")).resolves.toBeDefined();
    await repository.close();
    await deleteDB(name);
  });

  it("degrades visibly to memory when the primary repository fails", async () => {
    const primary: AnnotationRepository = {
      get: vi.fn().mockRejectedValue(new Error("quota")),
      getBySession: vi.fn().mockRejectedValue(new Error("quota")),
      put: vi.fn().mockRejectedValue(new Error("quota")),
      deleteSession: vi.fn().mockRejectedValue(new Error("quota")),
    };
    const degraded = vi.fn();
    const repository = new FallbackAnnotationRepository(primary, new MemoryAnnotationRepository(), degraded);
    await repository.put(record);
    await expect(repository.get("cache-1")).resolves.toEqual(record);
    expect(degraded).toHaveBeenCalledTimes(1);
  });

  it("reopens persisted annotations and produces zero provider calls for a missing-only job", async () => {
    const name = `dit-reload-${crypto.randomUUID()}`;
    const writer = new IndexedDbAnnotationRepository(name);
    await writer.put(record);
    await writer.close();

    const reader = new IndexedDbAnnotationRepository(name);
    const restored = await reader.getBySession(record.sessionFingerprint);
    const providerCall = vi.fn().mockResolvedValue(true);
    const result = await new AnnotationJobController().start({
      mode: "missing",
      items: [{ id: record.itemId, cached: restored.some((item) => item.itemId === record.itemId), failed: false }],
      runItem: providerCall,
    });

    expect(restored).toEqual([record]);
    expect(providerCall).not.toHaveBeenCalled();
    expect(result).toMatchObject({ total: 0, cached: 1, done: 0, status: "completed" });
    await reader.close();
    await deleteDB(name);
  });
});
