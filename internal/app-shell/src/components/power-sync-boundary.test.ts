import type { PowerSyncSession } from "@repo/data/core";
import { describe, expect, it, vi } from "vitest";
import { PowerSyncSessionCoordinator } from "./power-sync-session-coordinator";

function createSession(): PowerSyncSession {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    database: {} as never,
    disconnect: vi.fn().mockResolvedValue(undefined),
    estimateStorage: vi.fn().mockResolvedValue({ quota: null, usage: 0 }),
    purge: vi.fn().mockResolvedValue(undefined),
    storageName: "lunaris.v2.test.db",
  };
}

describe("PowerSyncSessionCoordinator", () => {
  it("cleans up a cancelled boot after creation resolves", async () => {
    const coordinator = new PowerSyncSessionCoordinator();
    const session = createSession();
    let finishBoot: ((session: PowerSyncSession) => void) | undefined;
    const creation = coordinator.create(
      () =>
        new Promise<PowerSyncSession>((resolve) => {
          finishBoot = resolve;
        })
    );

    const cleanup = coordinator.release(creation);
    await Promise.resolve();
    finishBoot?.(session);
    await cleanup;

    expect(session.close).toHaveBeenCalledOnce();
    expect(coordinator.getActive()).toBeNull();
  });

  it("closes old region before creating the next", async () => {
    const coordinator = new PowerSyncSessionCoordinator();
    const first = createSession();
    let finishClose: (() => void) | undefined;
    vi.mocked(first.close).mockImplementation(
      () => new Promise<void>((resolve) => (finishClose = resolve))
    );
    const firstCreation = coordinator.create(async () => first);
    coordinator.activate(await firstCreation);
    const cleanup = coordinator.release(firstCreation);
    const createNext = vi.fn(async () => createSession());
    const nextCreation = coordinator.create(createNext);

    await Promise.resolve();
    expect(createNext).not.toHaveBeenCalled();
    finishClose?.();
    await cleanup;
    await nextCreation;

    expect(createNext).toHaveBeenCalledOnce();
    expect(coordinator.getActive()).toBeNull();
  });

  it("propagates boot errors without blocking later creation", async () => {
    const coordinator = new PowerSyncSessionCoordinator();
    const failedCreation = coordinator.create(async () => {
      throw new Error("boot failed");
    });

    await expect(failedCreation).rejects.toThrow("boot failed");
    await coordinator.release(failedCreation);
    const session = createSession();
    await expect(coordinator.create(async () => session)).resolves.toBe(
      session
    );
  });

  it("blocks later creation when session cleanup fails", async () => {
    const coordinator = new PowerSyncSessionCoordinator();
    const session = createSession();
    const cleanupError = new Error("close failed");
    vi.mocked(session.close).mockRejectedValue(cleanupError);
    const creation = coordinator.create(async () => session);
    coordinator.activate(await creation);

    await expect(coordinator.release(creation)).rejects.toBe(cleanupError);

    const createNext = vi.fn(async () => createSession());
    await expect(coordinator.create(createNext)).rejects.toBe(cleanupError);
    expect(createNext).not.toHaveBeenCalled();
    expect(coordinator.getActive()).toBeNull();
  });

  it("tracks and clears active session", () => {
    const coordinator = new PowerSyncSessionCoordinator();
    const session = createSession();

    coordinator.activate(session);
    expect(coordinator.getActive()).toBe(session);
    coordinator.clearActive();
    expect(coordinator.getActive()).toBeNull();
  });
});
