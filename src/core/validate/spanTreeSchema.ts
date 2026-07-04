/**
 * Span Tree 自檢 (可自檢)
 * 檢查 invariant 並回傳問題清單；不拋例外、不修改資料。
 * pipeline 會把問題併入 warnings，UI 可顯示，方便追蹤資料流哪裡出錯。
 */
import { SCHEMA_VERSION, type SessionDocument } from "@/types/spanTree";

export interface ValidationResult {
  ok: boolean;
  issues: string[];
}

export function validateSessionDocument(doc: SessionDocument): ValidationResult {
  const issues: string[] = [];

  if (doc.schemaVersion !== SCHEMA_VERSION) {
    issues.push(`schemaVersion 不符：預期 ${SCHEMA_VERSION}，實際 ${doc.schemaVersion}。`);
  }

  const ids = new Set<string>();
  doc.spans.forEach((s, i) => {
    if (ids.has(s.id)) issues.push(`重複的 span id：${s.id}`);
    ids.add(s.id);
    if (s.order !== i) issues.push(`span ${s.id} 的 order (${s.order}) 與索引 (${i}) 不一致。`);
  });

  // parentId 必須指向存在的 span。
  for (const s of doc.spans) {
    if (s.parentId !== null && !ids.has(s.parentId)) {
      issues.push(`span ${s.id} 的 parentId (${s.parentId}) 不存在。`);
    }
  }

  // group 的 spanIds 必須都存在。
  for (const g of doc.groups) {
    for (const sid of g.spanIds) {
      if (!ids.has(sid)) issues.push(`group ${g.id} 參照了不存在的 span：${sid}`);
    }
  }

  return { ok: issues.length === 0, issues };
}
