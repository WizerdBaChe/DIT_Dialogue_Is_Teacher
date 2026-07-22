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
