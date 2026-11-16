import { describe, expect, test } from "bun:test";
import { appleSecretNames, selectSigningMode } from "./signing-mode";

describe("selectSigningMode", () => {
  test("rejects stable releases when every Apple secret is absent", () => {
    expect(() => selectSigningMode({})).toThrow(
      "Stable releases require Apple Developer ID signing"
    );
  });

  test("selects signed mode when every Apple secret is present", () => {
    const environment = Object.fromEntries(
      appleSecretNames.map((name) => [name, "configured"])
    );
    environment.APPLE_SIGNING_IDENTITY =
      "Developer ID Application: Lunaris (TEAMID)";
    expect(selectSigningMode(environment)).toBe("signed");
  });

  test("rejects an ad-hoc signing identity", () => {
    const environment = Object.fromEntries(
      appleSecretNames.map((name) => [name, "configured"])
    );
    environment.APPLE_SIGNING_IDENTITY = "-";
    expect(() => selectSigningMode(environment)).toThrow(
      "must be a Developer ID Application identity"
    );
  });

  test("rejects partial Apple secret configuration", () => {
    expect(() =>
      selectSigningMode({ APPLE_CERTIFICATE: "configured" })
    ).toThrow(
      "Partial Apple signing configuration. Missing: APPLE_CERTIFICATE_PASSWORD, APPLE_SIGNING_IDENTITY, APPLE_API_ISSUER, APPLE_API_KEY, APPLE_API_PRIVATE_KEY"
    );
  });
});
