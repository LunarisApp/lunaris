import { describe, expect, it } from "vitest";
import { parseTwoFactorChallenge } from "./email-sign-in";

describe("parseTwoFactorChallenge", () => {
  it("accepts a two-factor redirect and validates its methods", () => {
    expect(
      parseTwoFactorChallenge({
        twoFactorMethods: ["totp", "backup-code"],
        twoFactorRedirect: true,
      })
    ).toEqual({ methods: ["totp", "backup-code"] });
    expect(
      parseTwoFactorChallenge({
        twoFactorMethods: ["totp", null],
        twoFactorRedirect: true,
      })
    ).toEqual({ methods: [] });
  });

  it.each([
    null,
    "invalid",
    {},
    { twoFactorRedirect: false },
    { twoFactorRedirect: "true" },
  ])("rejects a non-challenge response", (result) => {
    expect(parseTwoFactorChallenge(result)).toBeUndefined();
  });
});
