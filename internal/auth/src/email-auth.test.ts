import { describe, expect, it } from "bun:test";
import {
  emailAuthDiscovery,
  resolveEmailAuthMethod,
} from "./email-auth-server";
import { emailAuthResolutionSchema } from "./email-auth-shared";

describe("emailAuthResolutionSchema", () => {
  it.each([
    { kind: "password" },
    { kind: "register" },
    { kind: "social", provider: "google" },
  ])("accepts $kind resolutions", (resolution) => {
    expect(emailAuthResolutionSchema.parse(resolution)).toEqual(resolution);
  });

  it("rejects unsupported social providers", () => {
    expect(
      emailAuthResolutionSchema.safeParse({
        kind: "social",
        provider: "github",
      }).success,
    ).toBe(false);
  });
});

describe("resolveEmailAuthMethod", () => {
  it("registers an unknown email", () => {
    expect(resolveEmailAuthMethod(null, ["google"])).toEqual({
      kind: "register",
    });
  });

  it("uses password for a credential account", () => {
    expect(
      resolveEmailAuthMethod(
        { accounts: [{ providerId: "credential" }] },
        ["google"],
      ),
    ).toEqual({ kind: "password" });
  });

  it("prefers password for an account also linked to Google", () => {
    expect(
      resolveEmailAuthMethod(
        {
          accounts: [
            { providerId: "google" },
            { providerId: "credential" },
          ],
        },
        ["google"],
      ),
    ).toEqual({ kind: "password" });
  });

  it("uses Google for a Google-only account", () => {
    expect(
      resolveEmailAuthMethod(
        { accounts: [{ providerId: "google" }] },
        ["google"],
      ),
    ).toEqual({ kind: "social", provider: "google" });
  });

  it("rejects an account without a configured method", () => {
    expect(
      resolveEmailAuthMethod(
        { accounts: [{ providerId: "github" }] },
        ["google"],
      ),
    ).toBeNull();
  });
});

describe("emailAuthDiscovery", () => {
  it("keeps strict rate limiting on method discovery", () => {
    const rateLimit = emailAuthDiscovery({
      socialProviders: ["google"],
    }).rateLimit as {
      max: number;
      pathMatcher: (path: string) => boolean;
      window: number;
    }[];

    expect(rateLimit).toHaveLength(1);
    expect(rateLimit[0]?.max).toBe(10);
    expect(rateLimit[0]?.window).toBe(60);
    expect(rateLimit[0]?.pathMatcher("/resolve-email-method")).toBe(true);
    expect(rateLimit[0]?.pathMatcher("/sign-in/email")).toBe(false);
  });
});


describe("closed registration email discovery", () => {
  it("does not offer registration for unknown users", () => {
    expect(resolveEmailAuthMethod(null, ["google"], false)).toEqual({ kind: "password" });
  });
  it("retains existing password and Google login", () => {
    expect(resolveEmailAuthMethod({ accounts: [{ providerId: "credential" }] }, ["google"], false)).toEqual({ kind: "password" });
    expect(resolveEmailAuthMethod({ accounts: [{ providerId: "google" }] }, ["google"], false)).toEqual({ kind: "social", provider: "google" });
  });
});
