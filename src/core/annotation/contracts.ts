import type { Annotation } from "@/types/spanTree";

export type AnalysisProviderId = "ollama" | "opencode";
export type AnnotationRunMode = "missing" | "failed" | "all";

export interface AnnotationProvenance {
  providerId: AnalysisProviderId;
  modelId: string;
  promptVersion: string;
  locale: "zh-TW" | "en";
  privacyPolicyId: string | null;
  privacyPolicyVersion: string | null;
  createdAt: string;
}

export interface AnnotationRecord {
  cacheKey: string;
  sessionFingerprint: string;
  itemFingerprint: string;
  itemId: string;
  annotation: Annotation;
  provenance: AnnotationProvenance;
}

export interface AnnotationRepository {
  get(cacheKey: string): Promise<AnnotationRecord | undefined>;
  getBySession(sessionFingerprint: string): Promise<AnnotationRecord[]>;
  put(record: AnnotationRecord): Promise<void>;
  deleteSession(sessionFingerprint: string): Promise<void>;
}

export interface AnnotationJobItem {
  id: string;
  cached: boolean;
  failed: boolean;
}

export interface AnnotationJobSnapshot {
  mode: AnnotationRunMode;
  status: "running" | "stopped" | "completed";
  total: number;
  done: number;
  cached: number;
  failed: number;
  currentId: string | null;
  pendingIds: string[];
}
