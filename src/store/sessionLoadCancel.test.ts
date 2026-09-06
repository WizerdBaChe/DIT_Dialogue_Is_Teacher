/**
 * 取消載入之後，畫面上必須有交代 (2026-09 UX 走查 F8)。
 *
 * 走查的證據：`cancelSessionLoad` 只呼叫 `task.cancel()`，進度列隨即消失，沒有任何一句話。
 * 使用者當下有兩個問題——取消成功了嗎、我原本在看的東西還在不在——而狀態列上那句「載入期間
 * 保留目前文件」正是後者的答案，卻跟著進度列一起走了。
 *
 * 這裡釘住三件事（走查工程檢查第 4 項）：`sessionLoadProgress` 清空、`doc` 不變、有一則
 * 告知。第三件是新的；前兩件之前就成立，一起釘是因為新增告知的最糟改法就是順手動到它們。
 *
 * 證據等級：rung 0（情境），這是一條狀態轉移序列而不是一個性質。附一個已知為真的正對照
 * （取消**不是**使用者按的那條路徑，不得留下告知），因為那正是這個修法最容易踩空的地方。
 */
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineResult } from "@/core/pipeline";

const startSessionLoadMock = vi.fn();

vi.mock("@/core/ingest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/ingest")>();
  return { ...actual, startSessionLoad: (...args: unknown[]) => startSessionLoadMock(...args) };
});

const { useSessionStore } = await import("./sessionStore");
const { SessionLoadCancelledError } = await import("@/core/ingest");

/** 一次永遠不會自己完成的載入：只有 cancel() 能結束它——正是「取消」要作用的那個時刻。 */
function pendingLoad(): { cancel: () => void; started: Promise<void> } {
  let reject!: (error: unknown) => void;
  const promise = new Promise<PipelineResult>((_resolve, r) => { reject = r; });
  // 未處理的 rejection 會在 cancel 之前就吵起來；store 自己的 catch 才是真正的處理者。
  promise.catch(() => {});
  const cancel = vi.fn(() => reject(new SessionLoadCancelledError()));
  startSessionLoadMock.mockReturnValue({ promise, cancel });
  return { cancel, started: Promise.resolve() };
}

beforeEach(() => {
  startSessionLoadMock.mockReset();
  useSessionStore.getState().resetToSample();
});

afterEach(() => {
  useSessionStore.setState({ sessionLoadNotice: null, sessionLoadProgress: null });
});

describe("cancelling a load says so, and says the document survived (F8)", () => {
  it("clears progress, keeps the document, and leaves a notice", async () => {
    pendingLoad();
    const docBefore = useSessionStore.getState().doc;
    expect(docBefore).not.toBeNull();

    const loading = useSessionStore.getState().loadFromBlobs(
      [{ path: "a.jsonl", blob: new Blob(["{}"]) }],
      "user",
    );
    // 載入真的在進行中：進度列在畫面上，取消鈕是它的一部分。
    expect(useSessionStore.getState().sessionLoadProgress).not.toBeNull();

    useSessionStore.getState().cancelSessionLoad();
    await loading;

    const state = useSessionStore.getState();
    expect(state.sessionLoadProgress).toBeNull();
    expect(state.doc).toBe(docBefore);
    expect(state.error).toBeNull();
    expect(state.sessionLoadNotice).toBe("cancelled");
  });

  it("dismissing the notice clears it", async () => {
    pendingLoad();
    const loading = useSessionStore.getState().loadFromBlobs([{ path: "a.jsonl", blob: new Blob(["{}"]) }], "user");
    useSessionStore.getState().cancelSessionLoad();
    await loading;

    useSessionStore.getState().dismissSessionLoadStatus();
    expect(useSessionStore.getState().sessionLoadNotice).toBeNull();
  });

  it("a new load attempt replaces the previous outcome instead of showing both", async () => {
    pendingLoad();
    const first = useSessionStore.getState().loadFromBlobs([{ path: "a.jsonl", blob: new Blob(["{}"]) }], "user");
    useSessionStore.getState().cancelSessionLoad();
    await first;
    expect(useSessionStore.getState().sessionLoadNotice).toBe("cancelled");

    pendingLoad();
    const second = useSessionStore.getState().loadFromBlobs([{ path: "b.jsonl", blob: new Blob(["{}"]) }], "user");
    expect(useSessionStore.getState().sessionLoadNotice).toBeNull();

    useSessionStore.getState().cancelSessionLoad();
    await second;
  });

  /**
   * 已知為真的正對照。`reset()` 與「開始下一次載入」也都會呼叫 `task.cancel()`，所以若把
   * 判準放在 `SessionLoadCancelledError` 上，重置之後會冒出一句「仍顯示原本的文件」——而那
   * 時文件已經被換掉了。判準必須是「使用者按了那顆鈕」，這條就是在量這件事。
   */
  it("does not claim a cancellation when reset() is what stopped the load", async () => {
    pendingLoad();
    const loading = useSessionStore.getState().loadFromBlobs([{ path: "a.jsonl", blob: new Blob(["{}"]) }], "user");

    useSessionStore.getState().reset();
    await loading;

    expect(useSessionStore.getState().sessionLoadNotice).toBeNull();
  });

  it("does nothing when there is no load in flight", () => {
    expect(useSessionStore.getState().sessionLoadProgress).toBeNull();
    useSessionStore.getState().cancelSessionLoad();
    expect(useSessionStore.getState().sessionLoadNotice).toBeNull();
  });
});
