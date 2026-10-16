import { describe, expect, it, vi } from "vitest";
import { createDeviceReadCoordinator } from "./read-coordinator";

function syncedDatabase(
  options: {
    connected?: boolean;
    hasSynced?: boolean;
    lastSyncedAt?: Date;
    retained?: boolean;
  } = {}
) {
  const subscriptionStatus = {
    active: options.retained ?? true,
    expiresAt: null,
    hasExplicitSubscription: true,
    hasSynced: options.hasSynced ?? true,
    isDefault: false,
    lastSyncedAt: options.lastSyncedAt ?? new Date("2026-07-23T10:00:00.000Z"),
    name: "workspace_index",
    parameters: null,
  };
  const subscription = {
    name: "workspace_index",
    parameters: null,
    unsubscribe: vi.fn(),
    waitForFirstSync: vi.fn(async () => undefined),
  };
  const stream = {
    name: "workspace_index",
    parameters: null,
    subscribe: vi.fn(async () => subscription),
    unsubscribeAll: vi.fn(),
  };
  const currentStatus = {
    connected: options.connected ?? true,
    dataFlowStatus: {},
    forStream: vi.fn(() => ({
      priority: 0,
      progress: null,
      subscription: subscriptionStatus,
    })),
  };
  const db = {
    currentStatus,
    syncStream: vi.fn(
      (_name?: string, _parameters?: Record<string, string>) => stream
    ),
    waitForStatus: vi.fn(async () => undefined),
  };
  return { db, stream, subscription };
}

describe("createDeviceReadCoordinator", () => {
  it("subscribes, waits, and reports a confirmed stream snapshot", async () => {
    const { db, stream, subscription } = syncedDatabase();
    const coordinator = createDeviceReadCoordinator(db as never);

    await expect(coordinator.resolve({ kind: "workspaces" })).resolves.toEqual({
      completeness: "complete",
      confirmedAt: "2026-07-23T10:00:00.000Z",
      syncState: "current",
    });
    expect(stream.subscribe).toHaveBeenCalledWith({
      priority: 0,
      ttl: 300,
    });
    expect(subscription.waitForFirstSync).toHaveBeenCalledOnce();
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it("coalesces concurrent confirmation for the same workspace stream bundle", async () => {
    let finishSync: (() => void) | undefined;
    const sync = new Promise<void>((resolve) => {
      finishSync = resolve;
    });
    const { db, stream, subscription } = syncedDatabase();
    subscription.waitForFirstSync.mockImplementation(async () => {
      await sync;
    });
    const coordinator = createDeviceReadCoordinator(db as never);
    const target = {
      kind: "workspace-content",
      workspaceId: "workspace-1",
    } as const;

    const first = coordinator.resolve(target);
    const second = coordinator.resolve(target);
    await vi.waitFor(() => {
      expect(stream.subscribe).toHaveBeenCalledTimes(2);
    });
    finishSync?.();

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(stream.subscribe).toHaveBeenCalledTimes(2);
    expect(subscription.waitForFirstSync).toHaveBeenCalledTimes(2);
    expect(db.syncStream.mock.calls).toEqual([
      ["workspace_content", { workspace_id: "workspace-1" }],
      ["workspace_index"],
    ]);
  });

  it("shares organization item confirmation across workspace reads", async () => {
    const { db, stream } = syncedDatabase();
    const coordinator = createDeviceReadCoordinator(db as never);

    await Promise.all([
      coordinator.resolve({
        kind: "workspace-content",
        workspaceId: "workspace-1",
      }),
      coordinator.resolve({
        kind: "workspace-content",
        workspaceId: "workspace-2",
      }),
    ]);

    expect(
      db.syncStream.mock.calls.filter(([name]) => name === "workspace_index")
    ).toHaveLength(1);
    expect(stream.subscribe).toHaveBeenCalledTimes(3);
  });

  it("returns marked cache without creating a subscription", async () => {
    const { db, stream } = syncedDatabase({
      connected: false,
      retained: false,
    });
    const coordinator = createDeviceReadCoordinator(db as never);

    await expect(
      coordinator.resolve({ kind: "workspaces" }, { consistency: "cached" })
    ).resolves.toEqual({
      completeness: "partial",
      confirmedAt: "2026-07-23T10:00:00.000Z",
      syncState: "stale",
    });
    expect(stream.subscribe).not.toHaveBeenCalled();
  });

  it("handles an invalid cached sync timestamp", async () => {
    const { db } = syncedDatabase({
      connected: false,
      hasSynced: false,
      lastSyncedAt: new Date(Number.NaN),
    });
    const coordinator = createDeviceReadCoordinator(db as never);

    await expect(
      coordinator.resolve(
        { kind: "organization-resources" },
        { consistency: "cached" }
      )
    ).resolves.toEqual({
      completeness: "partial",
      confirmedAt: null,
      syncState: "unknown",
    });
  });

  it("fails closed when Desktop sync is offline", async () => {
    const { db } = syncedDatabase({ connected: false });
    const coordinator = createDeviceReadCoordinator(db as never);

    await expect(
      coordinator.resolve({ kind: "workspaces" })
    ).rejects.toMatchObject({
      code: "INCOMPLETE_SYNC",
      status: 409,
    });
  });

  it("cancels pending reads when disposed", async () => {
    const { db, subscription } = syncedDatabase();
    subscription.waitForFirstSync.mockImplementation(
      (_signal?: AbortSignal) => new Promise(() => undefined)
    );
    const coordinator = createDeviceReadCoordinator(db as never);
    const pending = coordinator.resolve({ kind: "workspaces" });

    await vi.waitFor(() => {
      expect(subscription.waitForFirstSync).toHaveBeenCalledOnce();
    });
    coordinator.dispose();

    await expect(pending).rejects.toMatchObject({
      code: "INCOMPLETE_SYNC",
      status: 409,
    });
  });
});
