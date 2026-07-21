export interface MapShortcutEventLike {
  key: string;
  defaultPrevented: boolean;
  repeat: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
}

export interface MapShortcutState {
  mapShortcutEnabled: boolean;
  hasDocument: boolean;
  privacyReviewOpen: boolean;
  structureDrawerOpen: boolean;
  otherBlockingModalOpen: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const candidate = target as EventTarget & { closest?: (selector: string) => unknown };
  return Boolean(candidate.closest?.('input, textarea, select, [contenteditable="true"]'));
}

export function shouldHandleMapShortcut(event: MapShortcutEventLike, state: MapShortcutState): boolean {
  if (event.key.toLowerCase() !== "m") return false;
  if (!state.mapShortcutEnabled || !state.hasDocument) return false;
  if (event.defaultPrevented || event.repeat) return false;
  if (event.ctrlKey || event.altKey || event.metaKey) return false;
  if (isEditableTarget(event.target)) return false;
  if (state.privacyReviewOpen || state.structureDrawerOpen || state.otherBlockingModalOpen) return false;
  return true;
}
