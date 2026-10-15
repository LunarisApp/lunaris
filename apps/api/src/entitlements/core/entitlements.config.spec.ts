import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "bun:test";
import { EntitlementsConfig } from "./entitlements.config";

function makeConfig(
  nodeEnv: string,
  plan: string | null,
) {
  const config = new EntitlementsConfig(new ConfigService());
  Object.assign(config as unknown as Record<string, unknown>, {
    configuredDevelopmentPlan: plan,
    nodeEnv,
  });
  return config;
}

describe("EntitlementsConfig", () => {
  it("exposes configured development plan outside production", () => {
    expect(makeConfig("development", "business").developmentPlan).toBe(
      "business",
    );
  });

  it("ignores development plan in production", () => {
    expect(makeConfig("production", "business").developmentPlan).toBeNull();
  });

});

describe("self-hosted entitlements", () => {
  it("enables an explicit self-hosted plan in production", () => {
    const config = new EntitlementsConfig(new ConfigService({
      NODE_ENV: "production",
      DEPLOYMENT_MODE: "self-hosted",
      SELF_HOSTED_PLAN: "business",
    }));
    expect(config.developmentPlan).toBe("business");
  });

  it("does not enable self-hosted settings on hosted production", () => {
    const config = new EntitlementsConfig(new ConfigService({
      NODE_ENV: "production",
      SELF_HOSTED_PLAN: "enterprise",
      DEV_ENTITLEMENT_PLAN: "enterprise",
    }));
    expect(config.developmentPlan).toBeNull();
  });
});
