import { describe, expect, it } from "bun:test";
import { serializeAgentWire } from "./wire";

describe("agent wire path interpolation", () => {
  it("encodes substituted values without interpreting them as placeholders", () => {
    expect(
      serializeAgentWire(
        { method: "GET", path: "/resources/{resourceId}/{resourceId}" },
        { resourceId: "folder/{other}?a=1&b=2" },
      ).path,
    ).toBe("/resources/folder%2F%7Bother%7D%3Fa%3D1%26b%3D2/folder%2F%7Bother%7D%3Fa%3D1%26b%3D2");
  });

  it("handles long unmatched opening braces without backtracking", () => {
    const path = `/resources/${"{{|".repeat(100_000)}`;
    expect(serializeAgentWire({ method: "GET", path }, {}).path).toBe(path);
  });

  it("still rejects missing placeholder values", () => {
    expect(() =>
      serializeAgentWire({ method: "GET", path: "/resources/{resourceId}" }, {}),
    ).toThrow("resourceId is required");
  });
});
