import { describe, expect, it } from "vitest";
import {
  selectActiveSurface,
  selectQueuedSurfaces,
  SURFACE_POLICY,
  SURFACE_PRIORITY,
  type SurfaceId,
  type SurfaceWants,
} from "./blockingSurface";

const none: SurfaceWants = {
  "fatal-notice": false,
  "privacy-review": false,
  welcome: false,
  "session-browser": false,
  settings: false,
  "session-map": false,
  "structure-drawer": false,
};

const wanting = (...ids: SurfaceId[]): SurfaceWants =>
  ids.reduce((acc, id) => ({ ...acc, [id]: true }), { ...none });

describe("blocking surface arbitration (DSM-3)", () => {
  it("nothing wanting means nothing open", () => {
    expect(selectActiveSurface(none)).toBeNull();
    expect(selectQueuedSurfaces(none)).toEqual([]);
  });

  it("a single wanting surface is the active one", () => {
    for (const id of SURFACE_PRIORITY) {
      expect(selectActiveSurface(wanting(id))).toBe(id);
    }
  });

  /**
   * RC-4 的直接回歸：首次啟動 + 載入一個會產生 fatal 的檔案。R9 之前 welcomeOpen 與
   * fatal 兩個 boolean 互不知情，兩個 <dialog> 都會 showModal()，一起疊在 top layer 裡。
   */
  it("REGRESSION: welcome + a fatal notice yields exactly one open surface", () => {
    const wants = wanting("welcome", "fatal-notice");
    expect(selectActiveSurface(wants)).toBe("fatal-notice");
    expect(selectQueuedSurfaces(wants)).toEqual(["welcome"]);
  });

  it("at most one surface is ever active, for every combination", () => {
    // 全部 2^7 種組合窮舉：任何一種都只能有一個 active，且 active 必為想開的其中之一。
    const total = 1 << SURFACE_PRIORITY.length;
    for (let mask = 0; mask < total; mask += 1) {
      const wants = { ...none };
      SURFACE_PRIORITY.forEach((id, index) => {
        if (mask & (1 << index)) wants[id] = true;
      });
      const active = selectActiveSurface(wants);
      const wantingIds = SURFACE_PRIORITY.filter((id) => wants[id]);
      if (wantingIds.length === 0) {
        expect(active).toBeNull();
      } else {
        expect(active).not.toBeNull();
        expect(wantingIds).toContain(active as SurfaceId);
        expect(selectQueuedSurfaces(wants)).toEqual(wantingIds.filter((id) => id !== active));
      }
    }
  });

  it("a queued surface becomes active as soon as the one above it stops wanting", () => {
    const both = wanting("fatal-notice", "session-browser");
    expect(selectActiveSurface(both)).toBe("fatal-notice");
    expect(selectActiveSurface({ ...both, "fatal-notice": false })).toBe("session-browser");
  });

  it("system-initiated surfaces outrank user-invoked ones", () => {
    const system: SurfaceId[] = ["fatal-notice", "privacy-review", "welcome"];
    const user: SurfaceId[] = ["session-browser", "settings", "session-map", "structure-drawer"];
    for (const s of system) {
      for (const u of user) {
        expect(selectActiveSurface(wanting(s, u))).toBe(s);
      }
    }
  });

  it("dismissal policy is data, and the two must-acknowledge surfaces are action-only", () => {
    expect(SURFACE_POLICY["fatal-notice"]).toBe("action-only");
    expect(SURFACE_POLICY["privacy-review"]).toBe("action-only");
    // 其餘都必須是可退出的：沒有復原路徑的阻斷面就是死路。
    for (const id of SURFACE_PRIORITY) {
      if (id === "fatal-notice" || id === "privacy-review") continue;
      expect(SURFACE_POLICY[id]).toBe("escapable");
    }
  });

  it("every surface id has a policy and a priority slot — no surface can slip in unarbitrated", () => {
    expect(new Set(SURFACE_PRIORITY).size).toBe(SURFACE_PRIORITY.length);
    expect(Object.keys(SURFACE_POLICY).sort()).toEqual([...SURFACE_PRIORITY].sort());
  });
});
