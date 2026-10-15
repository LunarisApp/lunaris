import { describe, expect, it } from "bun:test";
import {
  decodeCursor,
  encodeCursor,
  paginationQuerySchema,
  toPage,
} from "./pagination";

describe("paginationQuerySchema", () => {
  it("applies bounded pagination defaults", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(paginationQuerySchema.parse({ limit: "100" }).limit).toBe(100);
    expect(paginationQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});

describe("pagination cursors", () => {
  it("round-trips opaque cursor payloads", () => {
    const cursor = encodeCursor({ id: "row_1" });
    expect(decodeCursor(cursor, (value) => value)).toEqual({ id: "row_1" });
  });

  it("rejects malformed cursors", () => {
    expect(() => decodeCursor("not-json", (value) => value)).toThrow(
      "Invalid pagination cursor",
    );
  });

  it("returns limit-sized pages and next cursors", () => {
    const page = toPage({
      encode: (row: { id: string }) => row,
      limit: 1,
      map: (row) => row.id,
      rows: [{ id: "a" }, { id: "b" }],
    });
    expect(page.items).toEqual(["a"]);
    expect(page.nextCursor).not.toBeNull();
  });
});
