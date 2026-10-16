import { afterEach, describe, expect, it, vi } from "vitest";
import { logout } from "./logout";

const {
  clearEncryptionKeyCache,
  clearEntitlementSnapshots,
  deleteFileStorageDatabases,
  getFileStorageWorkspaceIds,
  posthogCapture,
  posthogReset,
} = vi.hoisted(() => ({
  clearEncryptionKeyCache: vi.fn(),
  clearEntitlementSnapshots: vi.fn(),
  deleteFileStorageDatabases: vi.fn().mockResolvedValue(undefined),
  getFileStorageWorkspaceIds: vi
    .fn()
    .mockResolvedValue(["workspace_1", "workspace_2"]),
  posthogCapture: vi.fn(),
  posthogReset: vi.fn(),
}));

vi.mock("@repo/data/core", () => ({
  clearEncryptionKeyCache,
}));

vi.mock("@repo/data/features/attachments", () => ({
  deleteFileStorageDatabases,
  getFileStorageWorkspaceIds,
}));

vi.mock("../entitlements", () => ({
  clearEntitlementSnapshots,
}));

vi.mock("posthog-js", () => ({
  default: { capture: posthogCapture, reset: posthogReset },
}));

describe("logout", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("purges file stores with the PowerSync db before signing out", async () => {
    const beforeSignOut = vi.fn();
    const powerSyncSession = {
      database: {},
      purge: vi.fn().mockResolvedValue(undefined),
    };
    const authClient = {
      signOut: vi.fn().mockResolvedValue(undefined),
    };

    await logout({
      authClient: authClient as never,
      beforeSignOut,
      powerSyncSession: powerSyncSession as never,
    });

    expect(getFileStorageWorkspaceIds).toHaveBeenCalledWith(
      powerSyncSession.database
    );
    expect(powerSyncSession.purge).toHaveBeenCalledTimes(1);
    expect(deleteFileStorageDatabases).toHaveBeenCalledWith([
      "workspace_1",
      "workspace_2",
    ]);
    expect(beforeSignOut).toHaveBeenCalledTimes(1);
    expect(beforeSignOut.mock.invocationCallOrder[0]).toBeLessThan(
      authClient.signOut.mock.invocationCallOrder[0] ?? 0
    );
    expect(authClient.signOut).toHaveBeenCalledTimes(1);
    expect(posthogReset).toHaveBeenCalledTimes(1);
    expect(authClient.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      posthogReset.mock.invocationCallOrder[0] ?? 0
    );
    expect(clearEncryptionKeyCache).toHaveBeenCalledTimes(1);
    expect(clearEntitlementSnapshots).toHaveBeenCalledTimes(1);
  });

  it("does not clear auth when local purge fails", async () => {
    const powerSyncSession = {
      database: {},
      purge: vi.fn().mockRejectedValue(new Error("stale db")),
    };
    const authClient = {
      signOut: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      logout({
        authClient: authClient as never,
        powerSyncSession: powerSyncSession as never,
      })
    ).rejects.toThrow("stale db");

    expect(deleteFileStorageDatabases).not.toHaveBeenCalled();
    expect(authClient.signOut).not.toHaveBeenCalled();
    expect(posthogReset).not.toHaveBeenCalled();
  });

  it("retains the analytics identity when sign-out fails", async () => {
    const authClient = {
      signOut: vi.fn().mockRejectedValue(new Error("network error")),
    };

    await expect(
      logout({
        authClient: authClient as never,
        powerSyncSession: null,
      })
    ).rejects.toThrow("network error");

    expect(posthogReset).not.toHaveBeenCalled();
  });
});
