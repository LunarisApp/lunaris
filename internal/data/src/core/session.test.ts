import { describe, expect, it, vi } from "vitest";
import { createManagedPowerSyncSession } from "./session";

function createHooks() {
  return {
    database: {} as never,
    estimateStorage: vi.fn().mockResolvedValue({ quota: null, usage: 1 }),
    onClose: vi.fn().mockResolvedValue(undefined),
    onConnect: vi.fn().mockResolvedValue(undefined),
    onDisconnect: vi.fn().mockResolvedValue(undefined),
    onPurge: vi.fn().mockResolvedValue(undefined),
    storageName: "lunaris.v2.test.db",
  };
}

describe("createManagedPowerSyncSession", () => {
  it("serializes and deduplicates connection transitions", async () => {
    const hooks = createHooks();
    const session = createManagedPowerSyncSession(hooks);

    await Promise.all([session.connect(), session.connect()]);
    await Promise.all([session.disconnect(), session.disconnect()]);

    expect(hooks.onConnect).toHaveBeenCalledOnce();
    expect(hooks.onDisconnect).toHaveBeenCalledOnce();
  });

  it("waits for pending work before closing", async () => {
    const hooks = createHooks();
    let finishConnect: (() => void) | undefined;
    hooks.onConnect.mockImplementation(
      () => new Promise<void>((resolve) => (finishConnect = resolve))
    );
    const session = createManagedPowerSyncSession(hooks);

    const connecting = session.connect();
    const closing = session.close();
    await Promise.resolve();
    expect(hooks.onClose).not.toHaveBeenCalled();

    finishConnect?.();
    await Promise.all([connecting, closing]);
    expect(hooks.onClose).toHaveBeenCalledOnce();
  });

  it("recovers queue after failed transitions", async () => {
    const hooks = createHooks();
    hooks.onConnect.mockRejectedValueOnce(new Error("connect failed"));
    const session = createManagedPowerSyncSession(hooks);

    await expect(session.connect()).rejects.toThrow("connect failed");
    await expect(session.connect()).resolves.toBeUndefined();
    hooks.onDisconnect.mockRejectedValueOnce(new Error("disconnect failed"));
    await expect(session.disconnect()).rejects.toThrow("disconnect failed");
    await expect(session.connect()).resolves.toBeUndefined();

    expect(hooks.onConnect).toHaveBeenCalledTimes(3);
  });

  it("makes close and purge terminal and mutually exclusive", async () => {
    const closeHooks = createHooks();
    const closed = createManagedPowerSyncSession(closeHooks);
    await Promise.all([closed.close(), closed.close()]);
    await closed.connect();
    await closed.purge();

    expect(closeHooks.onClose).toHaveBeenCalledOnce();
    expect(closeHooks.onPurge).not.toHaveBeenCalled();
    expect(closeHooks.onConnect).not.toHaveBeenCalled();

    const purgeHooks = createHooks();
    const purged = createManagedPowerSyncSession(purgeHooks);
    await Promise.all([purged.purge(), purged.purge()]);
    await purged.close();

    expect(purgeHooks.onPurge).toHaveBeenCalledOnce();
    expect(purgeHooks.onClose).not.toHaveBeenCalled();
  });

  it("stays terminal when cleanup fails", async () => {
    const hooks = createHooks();
    hooks.onClose.mockRejectedValueOnce(new Error("close failed"));
    const session = createManagedPowerSyncSession(hooks);

    await expect(session.close()).rejects.toThrow("close failed");
    await session.connect();
    await session.close();

    expect(hooks.onConnect).not.toHaveBeenCalled();
    expect(hooks.onClose).toHaveBeenCalledOnce();
  });
});
