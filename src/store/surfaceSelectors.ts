/**
 * 「每個阻斷面想不想開」的唯一推導處 (DSM-3)。
 *
 * 刻意是一個純函式選擇器，而不是新的 state 欄位：想開與否本來就是既有領域狀態的函式，
 * 另存一份就會有第二個擁有者，也就是我們正在修的那類缺陷。
 */
import type { SurfaceWants } from "@/core/surface/blockingSurface";
import { hasFatal } from "@/core/diagnostics/contracts";
import type { SessionState } from "./sessionStore";

export function selectSurfaceWants(state: SessionState): SurfaceWants {
  return {
    // fatal 有兩個來源（批次層丟出的走 error，文件層自帶的走 diagnostics），但只有一個表面。
    "fatal-notice": !state.parseNoticeAcknowledged && (state.error !== null || hasFatal(state.diagnostics)),
    "privacy-review": state.privacyReview !== null,
    welcome: state.welcomeOpen && !state.snapshotMode,
    "session-browser": state.browseState !== "no_directory",
    settings: state.settingsOpen,
    "session-map": state.mapOpen,
    "structure-drawer": state.structureDrawerOpen,
  };
}
