export const PRIMARY_VIEWS = ["overview", "reader", "subagents"] as const;

export type PrimaryView = (typeof PRIMARY_VIEWS)[number];
export type SessionOrigin = "sample" | "user";

export function primaryViewAfterKey(current: PrimaryView, key: string): PrimaryView | null {
  const index = PRIMARY_VIEWS.indexOf(current);
  if (key === "Home") return PRIMARY_VIEWS[0];
  if (key === "End") return PRIMARY_VIEWS[PRIMARY_VIEWS.length - 1];
  if (key === "ArrowRight") return PRIMARY_VIEWS[(index + 1) % PRIMARY_VIEWS.length];
  if (key === "ArrowLeft") return PRIMARY_VIEWS[(index - 1 + PRIMARY_VIEWS.length) % PRIMARY_VIEWS.length];
  return null;
}
