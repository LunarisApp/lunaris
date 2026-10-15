import { describe, expect, it } from "bun:test";
import { isSessionAnonymous } from "./session-utils";

describe("isSessionAnonymous", () => {
  it("returns true when user.isAnonymous === true", () => {
    expect(isSessionAnonymous({ user: { isAnonymous: true } })).toBe(true);
  });

  it("returns false when user.isAnonymous === false", () => {
    expect(isSessionAnonymous({ user: { isAnonymous: false } })).toBe(false);
  });

  it("returns false when isAnonymous is missing", () => {
    expect(isSessionAnonymous({ user: { id: "u1" } })).toBe(false);
  });

  it("returns false when user is null", () => {
    expect(isSessionAnonymous({ user: null })).toBe(false);
  });

  it("returns false when user is not an object", () => {
    expect(isSessionAnonymous({ user: "not-an-object" })).toBe(false);
  });

  it("requires strict boolean true (rejects truthy strings/numbers)", () => {
    expect(isSessionAnonymous({ user: { isAnonymous: "true" } })).toBe(false);
    expect(isSessionAnonymous({ user: { isAnonymous: 1 } })).toBe(false);
  });

  it("returns false when session object has no `user` key at all", () => {
    // Defensive: upstream callers always supply `user`, but a runtime shape
    // drift shouldn't throw.
    expect(isSessionAnonymous({} as { user: unknown })).toBe(false);
  });
});
