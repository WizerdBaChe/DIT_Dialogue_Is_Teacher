import { describe, expect, it } from "vitest";
import { shouldHandleMapShortcut, type MapShortcutEventLike, type MapShortcutState } from "./mapShortcut";

const baseEvent: MapShortcutEventLike = {
  key: "m",
  defaultPrevented: false,
  repeat: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  target: null,
};

const baseState: MapShortcutState = {
  mapShortcutEnabled: true,
  hasDocument: true,
  privacyReviewOpen: false,
  structureDrawerOpen: false,
  otherBlockingModalOpen: false,
};

describe("map shortcut guard", () => {
  it.each(["m", "M"])("accepts %s without modifiers", (key) => {
    expect(shouldHandleMapShortcut({ ...baseEvent, key }, baseState)).toBe(true);
  });

  it("rejects repeats and previously handled events", () => {
    expect(shouldHandleMapShortcut({ ...baseEvent, repeat: true }, baseState)).toBe(false);
    expect(shouldHandleMapShortcut({ ...baseEvent, defaultPrevented: true }, baseState)).toBe(false);
  });

  it.each(["ctrlKey", "altKey", "metaKey"] as const)("rejects the %s modifier", (modifier) => {
    expect(shouldHandleMapShortcut({ ...baseEvent, [modifier]: true }, baseState)).toBe(false);
  });

  it("allows Shift because it does not change the shortcut function", () => {
    expect(shouldHandleMapShortcut({ ...baseEvent, shiftKey: true }, baseState)).toBe(true);
  });

  it("rejects editable targets and editable ancestors", () => {
    const editable = { closest: () => ({ tagName: "INPUT" }) } as unknown as EventTarget;
    const plain = { closest: () => null } as unknown as EventTarget;
    expect(shouldHandleMapShortcut({ ...baseEvent, target: editable }, baseState)).toBe(false);
    expect(shouldHandleMapShortcut({ ...baseEvent, target: plain }, baseState)).toBe(true);
  });

  it("rejects disabled, no-document, and blocking-modal states", () => {
    expect(shouldHandleMapShortcut(baseEvent, { ...baseState, mapShortcutEnabled: false })).toBe(false);
    expect(shouldHandleMapShortcut(baseEvent, { ...baseState, hasDocument: false })).toBe(false);
    expect(shouldHandleMapShortcut(baseEvent, { ...baseState, privacyReviewOpen: true })).toBe(false);
    expect(shouldHandleMapShortcut(baseEvent, { ...baseState, structureDrawerOpen: true })).toBe(false);
    expect(shouldHandleMapShortcut(baseEvent, { ...baseState, otherBlockingModalOpen: true })).toBe(false);
  });

  it("rejects unrelated keys", () => {
    expect(shouldHandleMapShortcut({ ...baseEvent, key: "n" }, baseState)).toBe(false);
  });
});
