import { describe, expect, it } from "bun:test";
import { LIMIT, PLAN, resolveEntitlements } from "@repo/auth/entitlements";
import { formatStorageBytes } from "@repo/auth/storage";
import {
  assertStorageCapacity,
  partLength,
  UPLOAD_PART_BYTES,
  verifyUploadParts,
} from "./storage-policy";
import { createUploadSessionSchema } from "./files.schema";

describe("organization storage policy", () => {
  for (const [plan, pool, cap] of [
    [PLAN.free, 250_000_000, 25_000_000],
    [PLAN.plus, 10_000_000_000, 500_000_000],
    [PLAN.business, 100_000_000_000, 5_000_000_000],
    [PLAN.enterprise, 1_000_000_000_000, 5_000_000_000],
  ] as const) {
    it(`${plan} enforces exact decimal file and pool boundaries`, () => {
      const limits = resolveEntitlements(plan);
      expect(limits.limit(LIMIT.maxStorageBytes)).toBe(pool);
      expect(limits.limit(LIMIT.maxFileBytes)).toBe(cap);
      const input = {
        size: cap,
        credit: 0,
        committed: pool - cap,
        reserved: 0,
        maxStorage: pool,
        maxFile: cap,
      };
      expect(assertStorageCapacity(input)).toBe(cap);
      expect(() =>
        assertStorageCapacity({ ...input, size: cap + 1 })
      ).toThrow();
      expect(() =>
        assertStorageCapacity({ ...input, committed: pool - cap + 1 })
      ).toThrow();
    });
  }
  it("only applies contract storage overrides to Enterprise", () => {
    expect(
      resolveEntitlements(PLAN.enterprise, 2_000_000_000_000).limits
        .max_storage_bytes
    ).toBe(2_000_000_000_000);
    for (const [plan, pool] of [
      [PLAN.free, 250_000_000],
      [PLAN.plus, 10_000_000_000],
      [PLAN.business, 100_000_000_000],
    ] as const) {
      expect(resolveEntitlements(plan, 1).limits.max_storage_bytes).toBe(pool);
    }
    for (const invalid of [
      -1,
      1.5,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => resolveEntitlements(PLAN.enterprise, invalid)).toThrow();
    }
  });
  it("allows zero growth while over quota and charges only positive replacement growth", () => {
    const input = {
      size: 50,
      credit: 100,
      committed: 200,
      reserved: 0,
      maxStorage: 100,
      maxFile: 100,
    };
    expect(assertStorageCapacity(input)).toBe(0);
    expect(() =>
      assertStorageCapacity({ ...input, size: 101, maxFile: 200 })
    ).toThrow();
    expect(
      assertStorageCapacity({ ...input, size: 100, credit: 90, committed: 90 })
    ).toBe(10);
  });
  it("verifies provider part sizes, count, order and ETags", () => {
    const size = UPLOAD_PART_BYTES + 3;
    const valid = [
      { PartNumber: 1, Size: UPLOAD_PART_BYTES, ETag: "a" },
      { PartNumber: 2, Size: 3, ETag: "b" },
    ];
    expect(() => verifyUploadParts(size, valid)).not.toThrow();
    expect(() => verifyUploadParts(size, valid.slice(0, 1))).toThrow();
    expect(() => verifyUploadParts(size, [...valid, valid[0]!])).toThrow();
    expect(() => verifyUploadParts(size, [...valid].reverse())).toThrow();
    expect(() =>
      verifyUploadParts(size, [{ ...valid[0]!, Size: 1 }, valid[1]!])
    ).toThrow();
    expect(() =>
      verifyUploadParts(size, [{ ...valid[0]!, ETag: undefined }, valid[1]!])
    ).toThrow();
    expect(partLength(5_000_000_000, 299)).toBe(
      5_000_000_000 - 298 * UPLOAD_PART_BYTES
    );
    expect(() => partLength(size, 3)).toThrow();
  });
  it("uses decimal unit formatting and accepts existing file types", () => {
    expect(formatStorageBytes(1_000_000, "en")).toBe("1 MB");
    expect(formatStorageBytes(5_000_000_000, "en")).toBe("5 GB");
    expect(formatStorageBytes(0, "en")).toBe("0 B");
    expect(() => formatStorageBytes(-1)).toThrow();
    for (const mediaType of [
      "application/octet-stream",
      "text/html",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]) {
      expect(
        createUploadSessionSchema.safeParse({
          id: crypto.randomUUID(),
          fileId: "att_1",
          workspaceId: "ws_1",
          sizeBytes: 0,
          mediaType,
        }).success
      ).toBe(true);
    }
  });
});
