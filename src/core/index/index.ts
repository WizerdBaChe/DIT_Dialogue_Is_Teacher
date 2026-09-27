export type {
  ChainHead,
  ChainLink,
  DirectoryFile,
  DirectorySource,
  SessionIndex,
  SessionIndexEntry,
  SessionKind,
  SessionKindReason,
  TitleSource,
} from "./contracts";
export { chainMembers, foldChains, resolveChains, type FoldedEntry } from "./chains";
export { classifySession, isSubagentPath, isSyntheticPrompt } from "./classifySession";
export {
  buildSessionIndex,
  INDEX_MAX_FILES,
  INDEX_SCAN_HEAD_BYTES,
  INDEX_SCAN_TAIL_BYTES,
  type BuildIndexOptions,
} from "./sessionIndexer";
export {
  directorySourceFromFileList,
  directorySourceFromHandle,
  DirectoryPermissionError,
  DirectoryPickCancelledError,
  isDirectoryPickerSupported,
  pickDirectory,
  restoreDirectorySource,
} from "./directorySource";
export { clearDirectoryHandle, readDirectoryHandles, saveDirectoryHandle } from "./handleRepository";
export type { StoredDirectoryHandles } from "./handleRepository";
