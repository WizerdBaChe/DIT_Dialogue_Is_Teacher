// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SessionLoadActions } from "./SessionLoadActions";
import { useSessionStore } from "@/store/sessionStore";

afterEach(() => {
  cleanup();
  useSessionStore.setState({ snapshotMode: false, activeSource: null });
});

/** R12 M2: the two load entries only exist at level 2, so these tests start by choosing a system. */
const atLevelTwo = (): void => useSessionStore.setState({ activeSource: "claude-code" });

/** The load entries, with level-2 navigation chrome (`data-role`) excluded. */
const loadEntries = (container: HTMLElement): Element[] =>
  [...container.querySelectorAll(".session-load-actions > *")].filter((el) => !el.hasAttribute("data-role"));

describe("SessionLoadActions snapshot gating (LS-10, LS-INV-7, ACC §19)", () => {
  it("renders load actions when not in snapshot mode", () => {
    useSessionStore.setState({ snapshotMode: false });
    const { container } = render(<SessionLoadActions />);
    expect(container.querySelector(".session-load-actions")).not.toBeNull();
  });

  it("renders nothing in snapshot mode, without relying on any caller-side check", () => {
    useSessionStore.setState({ snapshotMode: true });
    const { container } = render(<SessionLoadActions />);
    expect(container.firstChild).toBeNull();
  });
});

/**
 * R9.1 F1（作者裁決）：Session 瀏覽器上線後，「挑選 Session」才是常態入口，
 * 單檔載入退為「已經知道是哪個檔」的路徑。順序與主次是設計決定，因此釘住。
 */
describe("load-entry priority (R9.1 F1)", () => {
  it("puts the folder entry first and marks it as the primary action", () => {
    atLevelTwo();
    const { container } = render(<SessionLoadActions />);
    const controls = loadEntries(container);

    // R9 D3 fixed the count at two. R12 M2 moved them under a level-1 choice but did not add
    // a third — this still fails if one appears.
    expect(controls).toHaveLength(2);
    expect(controls[0].tagName).toBe("BUTTON");
    expect(controls[0].className).toContain("primary");
    expect(controls[1].tagName).toBe("LABEL");
    expect(controls[1].className).not.toContain("primary");
  });

  it("keeps the single-file entry a real file input rather than a decorative button", () => {
    atLevelTwo();
    const { container } = render(<SessionLoadActions />);
    expect(container.querySelector("label.file-btn input[type='file']")).not.toBeNull();
  });
});

/**
 * R12 M2 — source-first navigation. The level-1 choice is not decoration: until it is made,
 * discovery has no idea which harness's layout or title rules to use, which is what made every
 * Codex session show an excerpt of its first message instead of a purpose.
 */
describe("source-first navigation (R12 M2)", () => {
  it("offers no way to reach a folder or a file before a system is chosen", () => {
    const { container } = render(<SessionLoadActions />);
    expect(container.querySelector("[data-level='1']")).not.toBeNull();
    // Not disabled — absent. A button you cannot press still invites you to press it.
    expect(container.querySelector("label.file-btn")).toBeNull();
    expect(loadEntries(container)).toHaveLength(0);
  });

  it("offers exactly the two supported systems, Claude Code first", () => {
    const { container } = render(<SessionLoadActions />);
    const choices = [...container.querySelectorAll(".source-choice")];
    expect(choices.map((el) => el.getAttribute("data-source"))).toEqual(["claude-code", "codex"]);
  });

  it("shows each system's own root, so the choice helps the user land in the right place", () => {
    const { container } = render(<SessionLoadActions />);
    const roots = [...container.querySelectorAll(".source-choice code")].map((el) => el.textContent);
    // ~/.codex and NOT ~/.codex/sessions — the sidecar lives above the transcripts and a
    // browser cannot read the parent of a picked directory.
    expect(roots).toEqual(["~/.claude/projects", "~/.codex"]);
  });

  it("reveals the two load entries once a system is chosen, and names the chosen one", () => {
    atLevelTwo();
    const { container } = render(<SessionLoadActions />);
    const root = container.querySelector(".session-load-actions");
    expect(root?.getAttribute("data-level")).toBe("2");
    expect(root?.getAttribute("data-source")).toBe("claude-code");
    expect(loadEntries(container)).toHaveLength(2);
  });

  it("carries the chosen system's root hint into level 2", () => {
    useSessionStore.setState({ activeSource: "codex" });
    const { container } = render(<SessionLoadActions />);
    expect(container.querySelector("[data-root-hint]")?.getAttribute("data-root-hint")).toBe("~/.codex");
  });

  it("drops the index when going back, because that list belongs to the other system", () => {
    useSessionStore.setState({
      activeSource: "codex",
      browseState: "indexed",
      indexEntries: [{ path: "sessions/rollout-x.jsonl" } as never],
    });
    useSessionStore.getState().clearSource();

    const state = useSessionStore.getState();
    expect(state.activeSource).toBeNull();
    expect(state.indexEntries).toEqual([]);
    expect(state.browseState).toBe("closed");
  });
});
