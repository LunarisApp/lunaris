import type { SyncBlocker } from "@repo/data/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listenMock, listener, unlistenMock } = vi.hoisted(() => ({
  listenMock: vi.fn(),
  listener: { current: null as ((event: { payload: unknown }) => void) | null },
  unlistenMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

import { subscribeToPowerSyncUploads } from "./powersync-events";

function createBlocker(): SyncBlocker {
  return {
    getSnapshot: vi.fn(() => ({
      blocked: false,
      consecutiveClientErrors: 0,
      lastClientErrorStatus: null,
    })),
    isBlocked: vi.fn(() => false),
    recordClientError: vi.fn(),
    recordNonClientError: vi.fn(),
    recordSuccess: vi.fn(),
    reset: vi.fn(),
    resume: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  };
}

describe("native PowerSync upload events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listener.current = null;
    listenMock.mockImplementation((_event, callback) => {
      listener.current = callback;
      return unlistenMock;
    });
  });

  it("maps only matching handle outcomes", async () => {
    const blocker = createBlocker();
    await subscribeToPowerSyncUploads(7, blocker);

    listener.current?.({
      payload: { handle: 7, status: 422, type: "client-error" },
    });
    listener.current?.({ payload: { handle: 7, type: "success" } });
    listener.current?.({ payload: { handle: 7, type: "error" } });
    listener.current?.({ payload: { handle: 9, type: "error" } });

    expect(blocker.recordClientError).toHaveBeenCalledWith(422);
    expect(blocker.recordSuccess).toHaveBeenCalledTimes(1);
    expect(blocker.recordNonClientError).toHaveBeenCalledTimes(1);
  });

  it("stops listening idempotently", async () => {
    const stop = await subscribeToPowerSyncUploads(7, createBlocker());

    stop();
    stop();

    expect(unlistenMock).toHaveBeenCalledTimes(1);
  });

  it("propagates listener setup failures", async () => {
    listenMock.mockRejectedValueOnce(new Error("listener unavailable"));

    await expect(
      subscribeToPowerSyncUploads(7, createBlocker()),
    ).rejects.toThrow("listener unavailable");
  });
});
