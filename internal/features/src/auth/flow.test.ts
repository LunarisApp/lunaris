import { describe, expect, it } from "vitest";
import {
  getEmailPrefill,
  parseEmailAuthContinuationState,
} from "./flow";

describe("parseEmailAuthContinuationState", () => {
  it.each([
    { kind: "password" },
    { kind: "register" },
    { kind: "social", provider: "google" },
  ])("accepts $kind resolutions", (resolution) => {
    const state = { email: "writer@example.com", resolution };

    expect(parseEmailAuthContinuationState(state)).toEqual(state);
  });

  it("rejects unsupported social providers", () => {
    expect(
      parseEmailAuthContinuationState({
        email: "writer@example.com",
        resolution: { kind: "social", provider: "github" },
      }),
    ).toBeNull();
  });

  it("rejects malformed state", () => {
    expect(parseEmailAuthContinuationState({ email: "invalid" })).toBeNull();
  });
});

describe("getEmailPrefill", () => {
  it("returns a valid email from navigation state", () => {
    expect(getEmailPrefill({ email: "writer@example.com" })).toBe(
      "writer@example.com",
    );
  });

  it.each([null, {}, { email: "invalid" }])(
    "returns an empty string for invalid state",
    (state) => {
      expect(getEmailPrefill(state)).toBe("");
    },
  );
});
