import { describe, expect, test } from "bun:test";
import {
  appleSecretNames,
  selectSigningMode,
} from "./signing-mode";

describe("selectSigningMode", () => {
  test("selects ad-hoc mode when every Apple secret is absent", () => {
    expect(selectSigningMode({})).toBe("adhoc");
  });

  test("selects signed mode when every Apple secret is present", () => {
    const environment = Object.fromEntries(
      appleSecretNames.map((name) => [name, "configured"])
    );
    expect(selectSigningMode(environment)).toBe("signed");
  });

  test("rejects partial Apple secret configuration", () => {
    expect(() =>
      selectSigningMode({ APPLE_CERTIFICATE: "configured" })
    ).toThrow(
      "Partial Apple signing configuration. Missing: APPLE_CERTIFICATE_PASSWORD, APPLE_SIGNING_IDENTITY, APPLE_API_ISSUER, APPLE_API_KEY, APPLE_API_PRIVATE_KEY"
    );
  });
});
