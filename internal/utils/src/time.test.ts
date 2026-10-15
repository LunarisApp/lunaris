import { describe, expect, it } from "bun:test";
import { parseUTCTimestamp } from "./time";

describe("parseUTCTimestamp", () => {
  it.each([
    ["2026-01-01 13:00:00", "2026-01-01T13:00:00.000Z"],
    ["2026-01-01T13:00:00", "2026-01-01T13:00:00.000Z"],
    ["2026-01-01 13:00:00.123456", "2026-01-01T13:00:00.123Z"],
    ["2026-01-01T13:00:00Z", "2026-01-01T13:00:00.000Z"],
    ["2026-01-01T13:00:00+02:00", "2026-01-01T11:00:00.000Z"],
    ["2026-01-01T13:00:00-0530", "2026-01-01T18:30:00.000Z"],
    ["2026-01-01", "2026-01-01T00:00:00.000Z"],
  ])("parses %s without assuming the viewer's timezone", (input, expected) => {
    expect(parseUTCTimestamp(input).toISOString()).toBe(expected);
  });
});
