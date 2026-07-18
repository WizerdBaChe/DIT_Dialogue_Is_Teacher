import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AnnotationRecord, AnnotationRepository } from "./contracts";

const DATABASE_NAME = "dit-annotations";
const DATABASE_VERSION = 1;

interface AnnotationDatabase extends DBSchema {
  annotations: {
    key: string;
    value: AnnotationRecord;
    indexes: { "by-session": string; "by-created": string };
  };
}

export class MemoryAnnotationRepository implements AnnotationRepository {
  private readonly records = new Map<string, AnnotationRecord>();

  async get(cacheKey: string): Promise<AnnotationRecord | undefined> {
    return this.records.get(cacheKey);
  }

  async getBySession(sessionFingerprint: string): Promise<AnnotationRecord[]> {
    return [...this.records.values()].filter((record) => record.sessionFingerprint === sessionFingerprint);
  }

  async put(record: AnnotationRecord): Promise<void> {
    this.records.set(record.cacheKey, structuredClone(record));
  }

  async deleteSession(sessionFingerprint: string): Promise<void> {
    for (const [key, record] of this.records) {
      if (record.sessionFingerprint === sessionFingerprint) this.records.delete(key);
    }
  }
}

export class IndexedDbAnnotationRepository implements AnnotationRepository {
  private readonly database: Promise<IDBPDatabase<AnnotationDatabase>>;

  constructor(databaseName = DATABASE_NAME) {
    this.database = openDB<AnnotationDatabase>(databaseName, DATABASE_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore("annotations", { keyPath: "cacheKey" });
        store.createIndex("by-session", "sessionFingerprint");
        store.createIndex("by-created", "provenance.createdAt");
      },
    });
  }

  async get(cacheKey: string): Promise<AnnotationRecord | undefined> {
    return (await this.database).get("annotations", cacheKey);
  }

  async getBySession(sessionFingerprint: string): Promise<AnnotationRecord[]> {
    return (await this.database).getAllFromIndex("annotations", "by-session", sessionFingerprint);
  }

  async put(record: AnnotationRecord): Promise<void> {
    await (await this.database).put("annotations", record);
  }

  async deleteSession(sessionFingerprint: string): Promise<void> {
    const db = await this.database;
    const tx = db.transaction("annotations", "readwrite");
    let cursor = await tx.store.index("by-session").openCursor(sessionFingerprint);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  async close(): Promise<void> {
    (await this.database).close();
  }
}

export class FallbackAnnotationRepository implements AnnotationRepository {
  private degraded = false;

  constructor(
    private readonly primary: AnnotationRepository,
    private readonly fallback: AnnotationRepository = new MemoryAnnotationRepository(),
    private readonly onDegraded?: (error: Error) => void,
  ) {}

  private async run<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    if (this.degraded) return fallback();
    try {
      return await primary();
    } catch (error) {
      this.degraded = true;
      this.onDegraded?.(error as Error);
      return fallback();
    }
  }

  get(cacheKey: string): Promise<AnnotationRecord | undefined> {
    return this.run(() => this.primary.get(cacheKey), () => this.fallback.get(cacheKey));
  }

  getBySession(sessionFingerprint: string): Promise<AnnotationRecord[]> {
    return this.run(() => this.primary.getBySession(sessionFingerprint), () => this.fallback.getBySession(sessionFingerprint));
  }

  put(record: AnnotationRecord): Promise<void> {
    return this.run(() => this.primary.put(record), () => this.fallback.put(record));
  }

  deleteSession(sessionFingerprint: string): Promise<void> {
    return this.run(() => this.primary.deleteSession(sessionFingerprint), () => this.fallback.deleteSession(sessionFingerprint));
  }
}

export function createAnnotationRepository(onDegraded?: (error: Error) => void): AnnotationRepository {
  const memory = new MemoryAnnotationRepository();
  if (typeof indexedDB === "undefined") return memory;
  return new FallbackAnnotationRepository(new IndexedDbAnnotationRepository(), memory, onDegraded);
}
