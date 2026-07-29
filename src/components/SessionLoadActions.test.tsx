// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SessionLoadActions } from "./SessionLoadActions";
import { useSessionStore } from "@/store/sessionStore";

afterEach(() => {
  cleanup();
  useSessionStore.setState({ snapshotMode: false });
});

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
    const { container } = render(<SessionLoadActions />);
    const controls = [...container.querySelectorAll(".session-load-actions > *")];

    expect(controls).toHaveLength(2);
    expect(controls[0].tagName).toBe("BUTTON");
    expect(controls[0].className).toContain("primary");
    expect(controls[1].tagName).toBe("LABEL");
    expect(controls[1].className).not.toContain("primary");
  });

  it("keeps the single-file entry a real file input rather than a decorative button", () => {
    const { container } = render(<SessionLoadActions />);
    expect(container.querySelector("label.file-btn input[type='file']")).not.toBeNull();
  });
});
