/**
 * SessionLibrary 型別保鮮 (D-R6-03 / RPD D-5)。
 *
 * 本模組存在的唯一理由是 RPD D-5「多 session 個人技能庫」的架構預留：
 * 確保 `SessionLibrary` 沒有隨 `SessionDocument` 演進而腐化。D-5 本身維持凍結——
 * 解凍前，此模組不得長出任何 runtime 行為，也不得被接進 UI 或 store。
 */
import { SCHEMA_VERSION, type SessionDocument, type SessionLibrary } from "@/types/spanTree";

/** 純函式，僅組裝 `{ schemaVersion, documents }`。不接進任何 UI、不進 store。 */
export function toSessionLibrary(documents: SessionDocument[]): SessionLibrary {
  return {
    schemaVersion: SCHEMA_VERSION,
    documents,
  };
}

/**
 * 編譯期型別斷言：確保 `SessionLibrary["documents"][number]` 與目前 `SessionDocument` 相容，
 * 且兩者 `schemaVersion` 同源於 `SCHEMA_VERSION`。`SessionDocument` 日後增刪必填欄位時，
 * 這裡會編譯失敗——這正是「保鮮」的作用，不對應任何 runtime 行為。
 */
type AssertExtends<T, U extends T> = U;
export type AssertDocumentsMatch = AssertExtends<SessionDocument, SessionLibrary["documents"][number]>;
export type AssertLibrarySchemaVersion = AssertExtends<typeof SCHEMA_VERSION, SessionLibrary["schemaVersion"]>;
export type AssertDocumentSchemaVersion = AssertExtends<typeof SCHEMA_VERSION, SessionDocument["schemaVersion"]>;
