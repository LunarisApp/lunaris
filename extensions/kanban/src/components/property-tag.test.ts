import { describe, expect, it } from "vitest";
import { getPropertyTagStyle } from "./property-tag";

describe("getPropertyTagStyle", () => {
  it("uses a muted background and theme-aware colored text", () => {
    const style = getPropertyTagStyle("#ef4444");

    expect(style.backgroundColor).toBe(
      "color-mix(in oklab, #ef4444 14%, transparent)"
    );
    expect(style.borderColor).toBe(
      "color-mix(in oklab, #ef4444 24%, transparent)"
    );
    expect(style.color).toBe(
      "color-mix(in oklab, #ef4444 72%, var(--foreground))"
    );
  });
});
