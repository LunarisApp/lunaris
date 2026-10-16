import { beforeEach, describe, expect, it, vi } from "vitest";

const { hashUserIdMock } = vi.hoisted(() => ({
  hashUserIdMock: vi.fn(async (value: string) => {
    if (value === '["eu","user"]') {
      return "fedcba9876543210";
    }
    if (value === '["us","user"]') {
      return "1111111111111111";
    }
    return "0123456789abcdef";
  }),
}));

vi.mock("@repo/data/core", () => ({ hashUserId: hashUserIdMock }));

import { resolveNativePowerSyncStorageName } from "./powersync-storage";

describe("native PowerSync storage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves region-scoped storage names", async () => {
    await expect(resolveNativePowerSyncStorageName("eu", "user")).resolves.toBe(
      "lunaris.v2.fedcba9876543210.db"
    );
    await expect(resolveNativePowerSyncStorageName("us", "user")).resolves.toBe(
      "lunaris.v2.1111111111111111.db"
    );
    expect(hashUserIdMock.mock.calls).toEqual([
      ['["eu","user"]'],
      ['["us","user"]'],
    ]);
  });
});
