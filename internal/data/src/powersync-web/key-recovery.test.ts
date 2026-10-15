import { describe, expect, it, vi } from "vitest";
import {
  OfflineEncryptionKeyError,
  type ResolvedEncryptionKey,
} from "../core/encryption-key";
import { openDatabaseWithKeyRecovery } from "./key-recovery";

const MISMATCH = new Error("file is not a database");
const CACHED_KEY: ResolvedEncryptionKey = {
  cacheId: "scope",
  key: "a".repeat(64),
  source: "persistent",
};
const NETWORK_KEY: ResolvedEncryptionKey = {
  cacheId: "scope",
  key: "b".repeat(64),
  source: "network",
};
const isKeyMismatch = (error: unknown) => error === MISMATCH;

describe("openDatabaseWithKeyRecovery", () => {
  it("never wipes when cached-key verification cannot reach server", async () => {
    const wipe = vi.fn();

    await expect(
      openDatabaseWithKeyRecovery({
        initialKey: CACHED_KEY,
        isKeyMismatch,
        open: vi.fn().mockRejectedValue(MISMATCH),
        refreshKey: vi.fn().mockRejectedValue(new TypeError("offline")),
        wipe,
      }),
    ).rejects.toBeInstanceOf(OfflineEncryptionKeyError);
    expect(wipe).not.toHaveBeenCalled();
  });

  it("retries with authoritative key before considering a wipe", async () => {
    const database = {};
    const open = vi
      .fn()
      .mockRejectedValueOnce(MISMATCH)
      .mockResolvedValueOnce(database);
    const wipe = vi.fn();

    await expect(
      openDatabaseWithKeyRecovery({
        initialKey: CACHED_KEY,
        isKeyMismatch,
        open,
        refreshKey: vi.fn().mockResolvedValue(NETWORK_KEY),
        wipe,
      }),
    ).resolves.toEqual({ database, key: NETWORK_KEY });
    expect(open).toHaveBeenNthCalledWith(1, CACHED_KEY.key);
    expect(open).toHaveBeenNthCalledWith(2, NETWORK_KEY.key);
    expect(wipe).not.toHaveBeenCalled();
  });

  it("wipes once only after authoritative key also mismatches", async () => {
    const database = {};
    const open = vi
      .fn()
      .mockRejectedValueOnce(MISMATCH)
      .mockRejectedValueOnce(MISMATCH)
      .mockResolvedValueOnce(database);
    const wipe = vi.fn().mockResolvedValue(undefined);

    await expect(
      openDatabaseWithKeyRecovery({
        initialKey: CACHED_KEY,
        isKeyMismatch,
        open,
        refreshKey: vi.fn().mockResolvedValue(NETWORK_KEY),
        wipe,
      }),
    ).resolves.toEqual({ database, key: NETWORK_KEY });
    expect(wipe).toHaveBeenCalledTimes(1);
  });

  it("preserves non-key database errors", async () => {
    const error = new Error("opfs unavailable");
    const wipe = vi.fn();

    await expect(
      openDatabaseWithKeyRecovery({
        initialKey: CACHED_KEY,
        isKeyMismatch,
        open: vi.fn().mockRejectedValue(error),
        refreshKey: vi.fn(),
        wipe,
      }),
    ).rejects.toBe(error);
    expect(wipe).not.toHaveBeenCalled();
  });
});
