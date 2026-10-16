import { describe, expect, it } from "bun:test";
import { syncRequestSchema } from "./sync.schema";

describe("syncRequestSchema", () => {
  it("parses valid full payload", () => {
    const result = syncRequestSchema.safeParse({
      transactions: [
        {
          transactionId: 1,
          crud: [
            { op: "PUT", type: "workspaces", id: "p1", data: { name: "Test" } },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("parses DELETE without data", () => {
    const result = syncRequestSchema.safeParse({
      transactions: [
        { crud: [{ op: "DELETE", type: "workspaces", id: "p1" }] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid op", () => {
    const result = syncRequestSchema.safeParse({
      transactions: [
        { crud: [{ op: "UPSERT", type: "workspaces", id: "p1" }] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing type", () => {
    const result = syncRequestSchema.safeParse({
      transactions: [{ crud: [{ op: "PUT", id: "p1", data: {} }] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing id", () => {
    const result = syncRequestSchema.safeParse({
      transactions: [{ crud: [{ op: "PUT", type: "workspaces", data: {} }] }],
    });
    expect(result.success).toBe(false);
  });
});
