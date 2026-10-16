import { describe, expect, it } from "vitest";
import { validateDesktopProductionEnv } from "./production-env";

describe("validateDesktopProductionEnv", () => {
  it("uses default region discovery when no override is configured", () => {
    expect(() => validateDesktopProductionEnv({})).not.toThrow();
  });

  it("accepts a Lunaris region directory override", () => {
    expect(() =>
      validateDesktopProductionEnv({
        VITE_REGION_DIRECTORY_URL:
          "https://staging.lunaris.app/.well-known/lunaris-regions",
      })
    ).not.toThrow();
  });

  it.each([
    "http://lunaris.app/.well-known/lunaris-regions",
    "https://lunaris.app.evil.test/.well-known/lunaris-regions",
    "https://lunaris.app/not-regions",
    "https://user@lunaris.app/.well-known/lunaris-regions",
  ])("rejects unsafe directory override %s", (value) => {
    expect(() =>
      validateDesktopProductionEnv({ VITE_REGION_DIRECTORY_URL: value })
    ).toThrow("region directory must use HTTPS on a Lunaris domain");
  });
});
