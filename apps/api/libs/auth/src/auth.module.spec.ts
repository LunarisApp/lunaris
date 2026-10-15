import { describe, expect, it } from "bun:test";
import { isNonProductionFlagEnabled } from "./flag.utils";

describe("isNonProductionFlagEnabled", () => {
  it("enables flags outside production", () => {
    expect(isNonProductionFlagEnabled("development", true)).toBe(true);
    expect(isNonProductionFlagEnabled("test", true)).toBe(true);
  });

  it("ignores disabled flags", () => {
    expect(isNonProductionFlagEnabled("development", false)).toBe(false);
  });

  it("ignores flags in production", () => {
    expect(isNonProductionFlagEnabled("production", true)).toBe(false);
  });
});
