import { describe, expect, it } from "bun:test";
import { ConfigService } from "@nestjs/config";
import { AuthConfig } from "./auth.config";

describe("Google provider configuration", () => {
  it.each([
    {},
    { GOOGLE_CLIENT_ID: "client" },
    { GOOGLE_CLIENT_SECRET: "secret" },
    { GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "  " },
    { GOOGLE_CLIENT_ID: "  ", GOOGLE_CLIENT_SECRET: "secret" },
  ])("disables Google when credentials are incomplete: %j", (values) => {
    const config = new AuthConfig(new ConfigService(values));
    expect(config.values).toBeUndefined();
    expect(config.socialProviders).toEqual([]);
  });

  it("advertises only the provider name when both credentials exist", () => {
    const config = new AuthConfig(new ConfigService({
      GOOGLE_CLIENT_ID: "client",
      GOOGLE_CLIENT_SECRET: "secret",
    }));
    expect(config.socialProviders).toEqual(["google"]);
    expect(config.values?.google).toEqual({ clientId: "client", clientSecret: "secret" });
  });
});


describe("signup configuration", () => {
  it.each([[undefined, true], ["true", true], ["false", false]])(
    "parses %s as %s", (value, expected) => {
      expect(new AuthConfig(new ConfigService({ SIGNUPS_ALLOWED: value })).signupsAllowed).toBe(expected);
    },
  );
  it("rejects invalid values instead of silently opening signup", () => {
    expect(() => new AuthConfig(new ConfigService({ SIGNUPS_ALLOWED: "no" }))).toThrow();
  });
});
