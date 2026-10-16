import { describe, expect, it } from "vitest";
import { cloneSandboxJsonValue } from "./sandbox-protocol";

describe("sandbox JSON values", () => {
  it.each([
    new Date(),
    new Map(),
    new ArrayBuffer(1),
    { missing: undefined },
    { callback: () => undefined },
    Number.NaN,
  ])("rejects non-JSON metadata", (value) => {
    expect(() => cloneSandboxJsonValue(value, "Extension metadata")).toThrow(
      "must contain only JSON values"
    );
  });

  it("rejects cycles", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => cloneSandboxJsonValue(value, "Extension metadata")).toThrow(
      "must not contain cycles"
    );
  });
});
