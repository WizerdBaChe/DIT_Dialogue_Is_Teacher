/**
 * 阻斷面仲裁 (DSM-3)。
 *
 * R9 RC-4：DIT 掛了 6 個阻斷面，各自持有一個 boolean、各自呼叫 showModal()。其中三個
 * (map / settings / structure drawer) 靠 store 動作手動互清來「假裝」互斥，另外三個
 * (fatal notice / welcome / privacy review) 完全不在互清網內——首次啟動載入一個有 fatal
 * 的檔案，歡迎彈窗與錯誤彈窗會同時進入 top layer 疊在一起。「有沒有阻斷面開著」有六個答案。
 *
 * 這裡刻意**不引入新的可變狀態**（那正是我們在修的缺陷類型）。誰該開著是從既有的領域狀態
 * *推導*出來的：每個表面說「我想開」，優先序決定誰真的開，其餘自動排隊——上面的關掉，
 * 下一個就自己浮出來。沒有 queue 陣列，就沒有 queue 會殘留。
 */

export type SurfaceId =
  | "fatal-notice"
  | "privacy-review"
  | "welcome"
  | "session-browser"
  | "settings"
  | "session-map"
  | "structure-drawer";

/**
 * 關閉方式是**呼叫端的資料，不是元件自己的決定**。
 * - `action-only`：Escape 與 backdrop 都不能關，必須按下明確的按鈕。用於「你得看過」與
 *   「你得同意」兩種語意。
 * - `escapable`：Escape／backdrop 等同取消。用於沒有破壞性後果的表面。
 */
export type DismissalPolicy = "action-only" | "escapable";

export const SURFACE_POLICY: Record<SurfaceId, DismissalPolicy> = {
  "fatal-notice": "action-only",
  "privacy-review": "action-only",
  welcome: "escapable",
  "session-browser": "escapable",
  settings: "escapable",
  "session-map": "escapable",
  "structure-drawer": "escapable",
};

/**
 * 由高到低。系統發起的表面排在使用者發起的之前：前者代表「有事情擋著你」或「有東西在等
 * 你同意」，蓋掉它會讓使用者看不到自己被擋在哪裡。
 */
export const SURFACE_PRIORITY: SurfaceId[] = [
  "fatal-notice",
  "privacy-review",
  "welcome",
  "session-browser",
  "settings",
  "session-map",
  "structure-drawer",
];

/** 每個表面「想不想開」。由既有領域狀態推導，不是另一份狀態。 */
export type SurfaceWants = Record<SurfaceId, boolean>;

/** 目前真正該開著的那一個；沒有就是 null。 */
export function selectActiveSurface(wants: SurfaceWants): SurfaceId | null {
  return SURFACE_PRIORITY.find((id) => wants[id]) ?? null;
}

/** 想開但被壓著的，依優先序排列。純粹供測試與偵錯觀察排隊行為。 */
export function selectQueuedSurfaces(wants: SurfaceWants): SurfaceId[] {
  const active = selectActiveSurface(wants);
  return SURFACE_PRIORITY.filter((id) => wants[id] && id !== active);
}
